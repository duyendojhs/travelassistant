from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.content import Article, ArticleChunk, Destination, ItineraryTemplate, Place, Tag


def seed_content(db: Session) -> None:
    existing = db.scalar(select(Destination).where(Destination.slug == "da-nang"))
    if existing is not None:
        return

    coast = Tag(slug="bien", name="Biển")
    culture = Tag(slug="van-hoa", name="Văn hóa")
    food = Tag(slug="am-thuc", name="Ẩm thực")
    db.add_all([coast, culture, food])
    db.flush()

    da_nang = Destination(
        slug="da-nang",
        name="Đà Nẵng",
        region="Miền Trung",
        summary="Thành phố biển năng động, thuận tiện để kết hợp Hội An và Huế.",
        description="Đà Nẵng phù hợp cho lịch trình ngắn ngày với bãi biển, ẩm thực địa phương và nhiều điểm ngắm cảnh.",
        status="published",
        latitude=16.0544,
        longitude=108.2022,
    )
    hoi_an = Destination(
        slug="hoi-an",
        name="Hội An",
        region="Miền Trung",
        summary="Phố cổ ven sông với nhịp sống chậm, đèn lồng và món ăn đặc trưng.",
        description="Hội An phù hợp cho du khách thích đi bộ, trải nghiệm di sản và nghỉ dưỡng gần biển.",
        status="published",
        latitude=15.8801,
        longitude=108.338,
    )
    da_nang.tags.extend([coast, food])
    hoi_an.tags.extend([culture, food])
    db.add_all([da_nang, hoi_an])
    db.flush()

    db.add_all(
        [
            Place(
                destination_id=da_nang.id,
                slug="ban-dao-son-tra",
                name="Bán đảo Sơn Trà",
                kind="attraction",
                summary="Điểm ngắm biển và rừng gần trung tâm Đà Nẵng.",
                status="published",
                metadata_json={"best_time": "sáng sớm hoặc chiều mát"},
            ),
            Place(
                destination_id=da_nang.id,
                slug="mi-quang-ba-mua",
                name="Mì Quảng Bà Mua",
                kind="restaurant",
                summary="Quán mì Quảng quen thuộc, dễ ghé trong lịch trình trung tâm.",
                status="published",
                price_level="mid-range",
                metadata_json={"note": "Giờ mở cửa và giá có thể thay đổi."},
            ),
            Place(
                destination_id=da_nang.id,
                slug="khach-san-ven-bien-my-khe",
                name="Khu khách sạn ven biển Mỹ Khê",
                kind="hotel",
                summary="Khu lưu trú thuận tiện cho du khách muốn tắm biển và di chuyển vào trung tâm.",
                status="published",
                price_level="varied",
                metadata_json={"note": "Tình trạng phòng và giá thay đổi theo mùa."},
            ),
        ]
    )

    article = Article(
        destination_id=da_nang.id,
        slug="goi-y-lich-trinh-da-nang-3-ngay",
        title="Gợi ý lịch trình Đà Nẵng 3 ngày",
        excerpt="Lịch trình ngắn ngày kết hợp biển, ẩm thực và điểm ngắm cảnh.",
        body="Ngày đầu nên nghỉ gần biển Mỹ Khê. Ngày hai đi Sơn Trà và ăn đặc sản địa phương. Ngày cuối có thể kết hợp Hội An nếu thời gian cho phép.",
        status="published",
    )
    article.tags.append(food)
    db.add(article)
    db.flush()
    db.add(
        ArticleChunk(
            article_id=article.id,
            chunk_index=0,
            content=article.body,
            metadata_json={"source": "seed"},
        )
    )
    db.add(
        ItineraryTemplate(
            destination_id=da_nang.id,
            slug="da-nang-3-ngay-co-ban",
            title="Đà Nẵng 3 ngày cơ bản",
            days=3,
            budget_level="mid-range",
            traveler_type="couple",
            plan_json={"days": [{"day": 1, "theme": "Biển Mỹ Khê"}]},
            status="published",
        )
    )
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed_content(db)


if __name__ == "__main__":
    main()
