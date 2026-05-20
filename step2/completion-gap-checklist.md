# Checklist hoan thien

## Da co

- Dang ky va dang nhap bang email/mat khau.
- JWT access token va refresh token.
- Phan quyen theo role: user, editor, admin, root.
- Chat session rieng theo tung user va luu message.
- RAG tra loi co citation va luu chunk khi retrieval thanh cong.
- Feedback cho cau tra loi cua tro ly.
- Voice pipeline: ghi am tren trinh duyet, STT, RAG/LLM, TTS va phat audio.
- Tao lich trinh, luu, xem danh sach, xem chi tiet, sua, xoa va chia se cong khai.
- API noi dung cho destination, place, food, hotel, article va search.
- CMS/admin API cho destination, place, article, tag, image, itinerary template, publish va audit log.
- Upload anh va vision analysis.
- DataOps reindex, retrieval preview va endpoint kiem tra chat luong du lieu.
- BI/admin overview voi metrics, top destination, intent, RAG/cost summary va audit log.
- Dockerfile, Docker compose, Render blueprint, CI workflow va reverse proxy mau.

## Con thieu de thanh MVP manh

- Bo du lieu du lich that, lon hon seed data hien tai.
- RAG production on dinh cho cac cau hoi tieng Viet pho bien.
- Object storage/CDN ben vung cho anh upload va audio sinh ra.
- Tich hop map provider that va uoc tinh tuyen duong/khoang cach.
- Sua lich trinh bang ngon ngu tu nhien.
- Xuat lich trinh thanh PDF/anh.
- Trang chia se lich trinh cong khai can duoc cham chut hon.
- Wishlist va bo suu tap diem den da luu.
- Xac minh email va dat lai mat khau.
- Rate limit production dung Redis.
- PWA/mobile tot hon va truy cap lich trinh da luu khi offline.

## Con thieu de production day du

- Realtime voice hoac WebSocket voice co kha nang ngat khi user noi tiep.
- Tim anh tuong tu bang image embeddings.
- Pipeline tao thumbnail/WebP/AVIF cho bo anh lon.
- Tich hop Drupal hoac CMS ben ngoai.
- Dashboard Apache Superset.
- MLOps/evaluation: Recall@k, Precision@k, groundedness, prompt registry va benchmark dinh ky.
- OpenTelemetry/Prometheus/Grafana/Loki monitoring.
- Tu dong backup/restore cho DB, vector DB va metadata object storage.
- Knowledge graph hoac GraphRAG.
- OAuth provider, gom Google OAuth.
- WAF, alerting va quy trinh xu ly su co production.
