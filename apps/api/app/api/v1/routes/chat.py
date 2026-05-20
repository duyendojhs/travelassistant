from __future__ import annotations

import json
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import get_db
from app.models.auth import User
from app.models.chat import ChatMessage, ChatSession
from app.schemas.chat import (
    ChatExchangeResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    FeedbackRequest,
)
from app.services.embeddings import MissingEmbeddingProviderKey, get_embedding_provider
from app.services.analytics import record_model_usage, record_product_event
from app.services.llm import MissingLLMProviderKey, get_llm_provider
from app.services.rag_answer import RAGAnswerService
from app.services.retrieval import RetrievalService
from app.services.vector_store import QdrantVectorStore

router = APIRouter(prefix="/chat", tags=["chat"])


def _owned_session(db: Session, session_id: str, user: User) -> ChatSession:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return session


def _answer_service(settings: Settings) -> RAGAnswerService:
    return RAGAnswerService(
        retrieval_service=RetrievalService(
            embedding_provider=get_embedding_provider(settings),
            vector_store=QdrantVectorStore(settings),
        ),
        llm_provider=get_llm_provider(settings),
    )


def _recent_history(session: ChatSession) -> list[dict[str, str]]:
    return [{"role": message.role, "content": message.content} for message in session.messages[-10:]]


def _existing_exchange(db: Session, session_id: str, idempotency_key: str) -> ChatExchangeResponse | None:
    user_message = db.scalar(
        select(ChatMessage).where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "user",
            ChatMessage.idempotency_key == idempotency_key,
        )
    )
    if user_message is None:
        return None
    assistant_message = db.scalar(
        select(ChatMessage)
        .where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "assistant",
            ChatMessage.created_at >= user_message.created_at,
        )
        .order_by(ChatMessage.created_at)
        .limit(1)
    )
    if assistant_message is None:
        return None
    return ChatExchangeResponse(
        user_message=ChatMessageResponse.model_validate(user_message),
        assistant_message=ChatMessageResponse.model_validate(assistant_message),
    )


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSessionResponse:
    session = ChatSession(user_id=current_user.id, title=payload.title or "Chuyến đi mới")
    db.add(session)
    db.commit()
    db.refresh(session)
    return ChatSessionResponse.model_validate(session)


@router.get("/sessions", response_model=list[ChatSessionResponse])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatSessionResponse]:
    sessions = db.scalars(
        select(ChatSession).where(ChatSession.user_id == current_user.id).order_by(ChatSession.updated_at.desc())
    ).all()
    return [ChatSessionResponse.model_validate(session) for session in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSessionResponse:
    return ChatSessionResponse.model_validate(_owned_session(db, session_id, current_user))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    session = _owned_session(db, session_id, current_user)
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
def list_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatMessageResponse]:
    _owned_session(db, session_id, current_user)
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)
    ).all()
    return [ChatMessageResponse.model_validate(message) for message in messages]


@router.post("/sessions/{session_id}/messages", response_model=ChatExchangeResponse, status_code=status.HTTP_201_CREATED)
def post_message(
    session_id: str,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ChatExchangeResponse:
    session = _owned_session(db, session_id, current_user)
    if payload.idempotency_key:
        existing = _existing_exchange(db, session_id, payload.idempotency_key)
        if existing is not None:
            return existing

    started = perf_counter()
    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=payload.content,
        modality=payload.modality,
        idempotency_key=payload.idempotency_key,
    )
    db.add(user_message)
    db.flush()
    try:
        answer = _answer_service(settings).answer(db, payload.content, history=_recent_history(session))
    except (MissingEmbeddingProviderKey, MissingLLMProviderKey) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    assistant_message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer.answer,
        modality="text",
        citations=answer.citations,
        source_chunks=answer.source_chunks,
        latency_ms=int((perf_counter() - started) * 1000),
        model_provider=answer.model_provider,
    )
    db.add(assistant_message)
    record_model_usage(
        db,
        user_id=current_user.id,
        model_provider=answer.model_provider,
        feature="chat",
        prompt_text=payload.content,
        completion_text=answer.answer,
        latency_ms=assistant_message.latency_ms,
        metadata={"session_id": session.id, "citation_count": len(answer.citations)},
    )
    record_product_event(
        db,
        user_id=current_user.id,
        event_name="chat_message",
        intent="travel_question",
        latency_ms=assistant_message.latency_ms,
        metadata={"session_id": session.id, "source_chunk_count": len(answer.source_chunks)},
    )
    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
    return ChatExchangeResponse(
        user_message=ChatMessageResponse.model_validate(user_message),
        assistant_message=ChatMessageResponse.model_validate(assistant_message),
    )


@router.post("/sessions/{session_id}/stream")
def stream_message(
    session_id: str,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    exchange = post_message(session_id, payload, db, settings, current_user)
    assistant = exchange.assistant_message

    def events():
        yield "event: metadata\n"
        yield f"data: {json.dumps({'message_id': assistant.id, 'citations': assistant.citations})}\n\n"
        for token in assistant.content.split(" "):
            yield "event: delta\n"
            yield f"data: {json.dumps({'text': token + ' '}, ensure_ascii=False)}\n\n"
        yield "event: done\n"
        yield f"data: {json.dumps({'message_id': assistant.id})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@router.post("/feedback", response_model=ChatMessageResponse)
def feedback(
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessageResponse:
    message = db.scalar(
        select(ChatMessage)
        .join(ChatSession)
        .where(ChatMessage.id == payload.message_id, ChatSession.user_id == current_user.id)
    )
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    message.feedback_state = payload.feedback_state
    db.commit()
    db.refresh(message)
    return ChatMessageResponse.model_validate(message)
