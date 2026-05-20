from __future__ import annotations

from dataclasses import dataclass

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.itinerary import GeneratedItinerary, ItineraryBlock, ItineraryDay
from app.services.llm import LLMProvider
from app.services.rag_answer import citations_from_chunks, source_chunk_payload
from app.services.retrieval import RetrievalService


@dataclass(frozen=True)
class ItineraryGenerationResult:
    itinerary: GeneratedItinerary
    citations: list[dict[str, object]]
    source_chunks: list[dict[str, object]]


class ItineraryGenerationService:
    def __init__(self, retrieval_service: RetrievalService, llm_provider: LLMProvider) -> None:
        self.retrieval_service = retrieval_service
        self.llm_provider = llm_provider

    def generate(
        self,
        db: Session,
        *,
        destination: str,
        days: int,
        interests: list[str],
        budget: str | None,
        travelers: int,
    ) -> ItineraryGenerationResult:
        query = (
            f"Lập lịch trình {days} ngày ở {destination}. "
            f"Sở thích: {', '.join(interests) if interests else 'linh hoạt'}. "
            f"Ngân sách: {budget or 'chưa rõ'}. Số khách: {travelers}."
        )
        chunks = self.retrieval_service.retrieve(db, query, limit=8)
        citations = citations_from_chunks(chunks)
        source_chunks = source_chunk_payload(chunks)
        context = "\n\n".join(
            f"[{index}] {chunk.source.get('source_title')}\n{chunk.content}"
            for index, chunk in enumerate(chunks, start=1)
        )
        system_prompt = (
            "Bạn tạo lịch trình du lịch dạng JSON hợp lệ. Chỉ dùng dữ liệu trong nguồn tham khảo. "
            "Nếu thiếu chi phí hoặc route cụ thể, dùng chuỗi 'not_available'."
        )
        user_prompt = (
            f"Nguồn tham khảo:\n{context or 'Không có nguồn phù hợp.'}\n\n"
            f"Yêu cầu: {query}\n\n"
            "Trả về JSON object với schema: "
            "{title:string,destination:string,days:[{day:int,theme:string,blocks:[{time:string,title:string,"
            "description:string,place_ids:string[],cost_estimate:string,route_hint:string,citation_ids:int[]}]}]}."
        )
        raw = self.llm_provider.generate_json(system_prompt, user_prompt)
        raw.setdefault("destination", destination)
        try:
            itinerary = GeneratedItinerary.model_validate(raw)
        except ValidationError:
            itinerary = GeneratedItinerary(
                title=f"Lịch trình {destination} {days} ngày",
                destination=destination,
                days=[
                    ItineraryDay(
                        day=day,
                        theme="Gợi ý dựa trên nguồn hiện có",
                        blocks=[
                            ItineraryBlock(
                                time="day",
                                title="Hoạt động chính",
                                description=(
                                    "Nguồn hiện có chưa đủ để tạo lịch trình chi tiết tự động; "
                                    "hãy dùng các citations để đối chiếu và bổ sung thủ công."
                                ),
                                place_ids=[],
                                cost_estimate="not_available",
                                route_hint="not_available",
                                citation_ids=[
                                    citation_id
                                    for citation in citations[:2]
                                    if isinstance((citation_id := citation.get("id")), int)
                                ],
                            )
                        ],
                    )
                    for day in range(1, days + 1)
                ],
            )
        return ItineraryGenerationResult(
            itinerary=itinerary,
            citations=citations,
            source_chunks=source_chunks,
        )
