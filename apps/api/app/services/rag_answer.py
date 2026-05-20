from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.services.llm import LLMProvider
from app.services.retrieval import RetrievalService, RetrievedChunk


@dataclass(frozen=True)
class RAGAnswer:
    answer: str
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]
    model_provider: str


def citations_from_chunks(chunks: list[RetrievedChunk]) -> list[dict[str, object]]:
    citations: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for chunk in chunks:
        source = chunk.source
        key = (str(source.get("source_type", "")), str(source.get("source_id", "")))
        if key in seen:
            continue
        seen.add(key)
        citations.append(
            {
                "id": len(citations) + 1,
                "source_type": source.get("source_type"),
                "source_id": source.get("source_id"),
                "title": source.get("source_title"),
                "url": source.get("canonical_url"),
                "heading_path": source.get("heading_path"),
                "score": chunk.score,
            }
        )
    return citations


def source_chunk_payload(chunks: list[RetrievedChunk]) -> list[dict[str, object]]:
    return [
        {
            "chunk_id": chunk.chunk_id,
            "content": chunk.content,
            "score": chunk.score,
            "source": chunk.source,
        }
        for chunk in chunks
    ]


class RAGAnswerService:
    def __init__(self, retrieval_service: RetrievalService, llm_provider: LLMProvider) -> None:
        self.retrieval_service = retrieval_service
        self.llm_provider = llm_provider

    def answer(self, db: Session, query: str, *, history: list[dict[str, str]] | None = None) -> RAGAnswer:
        try:
            chunks = self.retrieval_service.retrieve(db, query, limit=6)
        except Exception:
            chunks = []

        if not chunks:
            return self._general_answer(query, history=history)

        citations = citations_from_chunks(chunks)
        source_chunks = source_chunk_payload(chunks)
        context = "\n\n".join(
            f"[{index}] {chunk.source.get('source_title')}\n{chunk.content}"
            for index, chunk in enumerate(chunks, start=1)
        )
        history_text = _history_text(history)
        system_prompt = (
            "Bạn là trợ lý du lịch TravelAssistant. Chỉ trả lời dựa trên nguồn tham khảo được cung cấp. "
            "Nếu nguồn không có dữ kiện như giá, giờ mở cửa, địa chỉ hoặc lịch cụ thể, hãy nói rõ là chưa có dữ liệu. "
            "Không bịa thông tin và không viết như quảng cáo."
        )
        user_prompt = (
            f"Lịch sử gần đây:\n{history_text or 'Không có'}\n\n"
            f"Nguồn tham khảo:\n{context}\n\n"
            f"Câu hỏi người dùng: {query}\n\n"
            "Trả lời bằng tiếng Việt, ngắn gọn, tự nhiên. Khi nêu thông tin quan trọng từ nguồn, nhắc nguồn bằng [1], [2]."
        )
        answer = self.llm_provider.generate_text(system_prompt, user_prompt).strip()
        return RAGAnswer(
            answer=answer,
            citations=citations,
            source_chunks=source_chunks,
            model_provider=f"{self.llm_provider.provider}:{self.llm_provider.model}",
        )

    def _general_answer(self, query: str, *, history: list[dict[str, str]] | None = None) -> RAGAnswer:
        history_text = _history_text(history)
        system_prompt = (
            "Bạn là trợ lý du lịch TravelAssistant. Khi kho RAG hoặc nguồn nội bộ không sẵn sàng, "
            "hãy vẫn giúp người dùng bằng kiến thức du lịch tổng quát. "
            "Không nói lỗi kỹ thuật. Không giả vờ đã tra cứu nguồn nội bộ hay web theo thời gian thực. "
            "Với thông tin có thể thay đổi như giá vé, giờ mở cửa, lịch tàu xe, thời tiết, visa, hãy nhắc người dùng kiểm tra lại trước khi đi. "
            "Trả lời thực dụng, ngắn gọn, ưu tiên hành động tiếp theo."
        )
        user_prompt = (
            f"Lịch sử gần đây:\n{history_text or 'Không có'}\n\n"
            f"Câu hỏi người dùng: {query}\n\n"
            "Trả lời bằng tiếng Việt. Nếu câu hỏi cần dữ liệu mới nhất, hãy đưa khuyến nghị an toàn và nói rõ nên kiểm tra lại thông tin mới nhất."
        )
        answer = self.llm_provider.generate_text(system_prompt, user_prompt).strip()
        if not answer:
            answer = "Mình chưa có đủ dữ liệu để trả lời chắc chắn. Bạn hãy nói rõ điểm đến, số ngày và nhu cầu chính để mình gợi ý tiếp."
        return RAGAnswer(
            answer=answer,
            citations=[],
            source_chunks=[],
            model_provider=f"{self.llm_provider.provider}:{self.llm_provider.model}",
        )


def _history_text(history: list[dict[str, str]] | None) -> str:
    return "\n".join(f"{item['role']}: {item['content']}" for item in (history or [])[-8:])
