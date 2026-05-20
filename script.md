# Script thuyết trình demo TravelAssistant

> Mục tiêu file này: dùng để thuyết trình nhanh dự án từ thu thập dữ liệu, xử lý dữ liệu, RAG, voice, lịch trình, vận hành, API key, server, kiến trúc, tiêu chí đánh giá và hướng phát triển.
>
> Lưu ý bảo mật: khi thuyết trình không đọc giá trị API key thật. Chỉ nói loại key, vai trò và nơi cấu hình.

## 1. Mở đầu 30 giây

Xin chào, demo hôm nay là TravelAssistant: một trợ lý du lịch tiếng Việt chạy dạng web app thật, có đăng nhập, hỏi đáp, nguồn trích dẫn, giọng nói, tạo lịch trình, lưu lịch trình, quản trị nội dung và dashboard vận hành.

Điểm chính của hệ thống không phải chỉ gọi AI để trả lời, mà là xây một pipeline hoàn chỉnh:

- Thu thập và chuẩn hóa dữ liệu du lịch.
- Chia nhỏ nội dung thành chunk.
- Tạo embedding và lưu vào vector database.
- Khi người dùng hỏi, hệ thống truy xuất nguồn liên quan trước rồi mới gọi mô hình trả lời.
- Câu trả lời đi kèm citation, log, feedback và các chỉ số vận hành.

## 2. Demo flow đề xuất 8-12 phút

1. Mở trang web, đăng nhập.
2. Hỏi: "Ăn gì ở Hội An buổi tối?"
3. Chỉ phần câu trả lời, nguồn, nút copy/feedback/nguồn.
4. Dùng mic hỏi một câu ngắn, ví dụ: "Lên lịch trình Huế 2 ngày".
5. Mở trang Lịch trình, tạo lịch trình và lưu.
6. Mở trang Đã lưu, xem lại lịch trình.
7. Đăng nhập admin, mở Vận hành.
8. Chỉ dashboard log, bộ lọc 7 ngày, nguồn du lịch, tiêu chí đánh giá.
9. Mở tab Nội dung, nói đây là phần CMS mô phỏng CRUD.
10. Kết thúc bằng kiến trúc và hướng phát triển.

## 3. Kiến trúc tổng thể

TravelAssistant đang đi theo kiến trúc web production cơ bản:

```text
Người dùng
  -> Next.js Web App
  -> FastAPI API /api/v1
  -> PostgreSQL: user, chat, content, audit, analytics
  -> Redis/RQ: hàng đợi ingest/reindex
  -> Qdrant: vector search cho RAG
  -> OpenAI: LLM, embedding, STT, TTS
  -> Object storage local/R2: ảnh/audio upload và audio TTS
```

Các phần chính trong repo:

- `apps/web`: frontend Next.js/React.
- `apps/api`: backend FastAPI.
- `packages/shared`: type/API contract dùng chung.
- `infra/docker`: PostgreSQL, Redis, Qdrant, MinIO local.
- `render.yaml`: blueprint deploy backend lên Render.
- `.env.example`: danh sách biến môi trường cần có.

## 4. Server và dịch vụ đang dùng

Local/dev:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`
- PostgreSQL local qua Docker.
- Redis local qua Docker.
- Qdrant local qua Docker.
- MinIO local nếu cần mô phỏng object storage.

Deploy rẻ:

- Frontend: Vercel, domain dạng `*.vercel.app`.
- Backend API: Render web service Docker, ví dụ `travelassistant-api.onrender.com`.
- Database: Neon PostgreSQL.
- Redis: Upstash Redis.
- Vector DB: Qdrant Cloud.
- Object storage: hiện có local/R2 contract; production nên dùng Cloudflare R2 hoặc storage tương đương.

Lý do chọn:

- Vercel hợp Next.js, deploy nhanh, miễn phí/rẻ cho demo.
- Render chạy được FastAPI Docker đơn giản.
- Neon rẻ, hỗ trợ PostgreSQL managed.
- Upstash Redis rẻ, không phải tự vận hành Redis.
- Qdrant Cloud phù hợp vector search, dễ dùng với embedding.
- OpenAI dùng một provider chính để giảm lỗi cấu hình nhiều nhà cung cấp.

## 5. API key và biến môi trường cần dùng

Không đưa key thật vào slide. Chỉ nói:

| Nhóm | Env | Dùng để làm gì |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | Chat LLM, embedding, speech-to-text, text-to-speech |
| Bảo mật | `JWT_SECRET_KEY` | Ký access token/refresh token |
| Database | `DATABASE_URL` | Kết nối PostgreSQL/Neon |
| Redis | `REDIS_URL` | Queue ingest/reindex và rate limit |
| Vector DB | `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | Lưu và tìm vector chunks |
| Frontend | `NEXT_PUBLIC_API_BASE_URL` | Web gọi backend `/api/v1` |
| CORS | `CORS_ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, `API_BASE_URL` | Cho phép frontend gọi backend |
| Storage | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | Lưu ảnh/audio production |
| Map optional | `MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY` | Bản đồ nếu dùng provider ngoài OSM |
| Monitoring optional | `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST` | Error tracking và analytics |
| Email optional | `RESEND_API_KEY`, `EMAIL_FROM` | Email xác minh/reset password về sau |

Model mặc định hiện tại:

- LLM: `gpt-4.1-nano`
- Embedding: `text-embedding-3-small`, dimension `1536`
- STT: `whisper-1`
- TTS: `tts-1`
- Voice: `alloy`

## 6. Thu thập dữ liệu

Hệ thống có hai nguồn dữ liệu chính:

1. Dữ liệu CMS nội bộ:
   - `destinations`: điểm đến.
   - `places`: địa điểm, nhà hàng, khách sạn.
   - `articles`: bài viết.
   - `itinerary_templates`: mẫu lịch trình.
   - `images`: ảnh và metadata.

2. Dữ liệu bài viết ngoài đã xử lý sẵn:
   - Import bằng `npm run api:import-ivivu`.
   - Script thật nằm ở `apps/api/app/dataops/import_ivivu.py`.
   - Service xử lý nằm ở `apps/api/app/services/ivivu_import.py`.
   - Input là JSONL đã tiền xử lý, ví dụ `preprocessed_data.jsonl`, cấu hình qua `IVIVU_PROCESSED_DATA_PATH`.

Khi import iVIVU:

- Mỗi article được chuyển thành `rag_sources`.
- Mỗi keypoint/context được tách ảnh, làm sạch text, chia thành `rag_chunks`.
- Tạo ID ổn định bằng `uuid5`, tránh trùng khi import lại.
- Metadata giữ lại: destination, source_url, source_name, published_time, keypoint_title, evaluate_mean, images.

## 7. Xử lý dữ liệu trước RAG

Pipeline xử lý:

```text
Raw article/CMS
  -> clean_text
  -> chunk_text
  -> rag_sources
  -> rag_chunks
  -> embedding
  -> Qdrant collection travelassistant_chunks
```

Chunking:

- CMS content dùng chunk khoảng `900` ký tự, overlap `120`.
- iVIVU keypoint dùng chunk khoảng `1600` ký tự, overlap `180`.
- Lý do: bài viết du lịch thường có đoạn mô tả dài; overlap giúp không mất ngữ cảnh ở ranh giới chunk.

Bảng dữ liệu RAG:

- `rag_sources`: nguồn gốc tài liệu.
- `rag_chunks`: các đoạn dùng để retrieve.
- `embedding_jobs`: job reindex, trạng thái, tổng chunk, chunk đã index.

## 8. Reindex và embedding

Có hai cách chạy:

```powershell
npm run api:reindex-rag
```

hoặc gọi API admin:

```text
POST /api/v1/dataops/reindex
POST /api/v1/dataops/embedding-jobs
```

Nếu `run_inline=false`, job được đưa vào Redis/RQ queue.

Quy trình reindex:

1. Lấy tất cả nguồn published.
2. Xóa chunk cũ của nguồn.
3. Tạo chunk mới.
4. Gọi OpenAI embedding.
5. Recreate hoặc upsert vào Qdrant collection.
6. Lưu `embedding_model`, `vector_collection`, `embedded_at`.

Lý do dùng Qdrant:

- Có cosine similarity sẵn.
- Payload filter theo metadata.
- Dễ chạy local Docker và cloud.
- Hợp demo RAG vì triển khai nhanh hơn tự làm pgvector tuning.

## 9. Nguyên lý RAG khi hỏi đáp

Khi user hỏi:

```text
User question
  -> tạo embedding cho câu hỏi
  -> tìm vector gần nhất trong Qdrant
  -> thử filter theo destination nếu query có tên điểm đến
  -> nếu không có hit thì fallback lexical search trong PostgreSQL
  -> lấy top chunks
  -> tạo prompt có context và citation
  -> gọi LLM
  -> lưu message, citation, source_chunks, latency, model usage
```

Code chính:

- Retrieval: `apps/api/app/services/retrieval.py`
- RAG answer: `apps/api/app/services/rag_answer.py`
- Chat API: `apps/api/app/api/v1/routes/chat.py`

Điểm quan trọng:

- Không để LLM tự bịa nguồn.
- System prompt yêu cầu chỉ trả lời dựa trên nguồn khi có RAG.
- Nếu thiếu thông tin như giá, giờ mở cửa, địa chỉ, hệ thống phải nói rõ chưa có dữ liệu.
- Nếu RAG lỗi hoặc chưa có nguồn, fallback trả lời bằng kiến thức tổng quát nhưng phải nhắc kiểm tra lại thông tin dễ thay đổi.

## 10. Voice pipeline

Voice query đi theo pipeline:

```text
Ghi âm trên trình duyệt
  -> upload file audio
  -> lưu audio input
  -> STT bằng OpenAI
  -> RAG retrieval
  -> LLM generate answer
  -> TTS bằng OpenAI
  -> lưu audio output
  -> trả về job gồm transcript, answer, citations, events, audio URL
```

Endpoint chính:

- `POST /api/v1/voice/stt`
- `POST /api/v1/voice/tts`
- `POST /api/v1/voice/query`
- `GET /api/v1/voice/status/{job_id}`

Frontend có nhận biết người nói dừng:

- Khi mic nghe thấy tiếng, bắt đầu ghi.
- Nếu đã có giọng nói và im lặng khoảng `1200ms`, frontend tự dừng và gửi.

Backend có event pipeline:

- `uploaded`
- `transcribing`
- `retrieving`
- `generating`
- `speaking`
- `done`
- `failed`

Điểm đã xử lý:

- TTS không đọc citation dạng `[1] [2]`.
- Có validate audio size/duration.
- Nếu audio decode lỗi, trả lỗi rõ ràng.

## 11. Lịch trình tương tác

Tạo lịch trình dùng cùng nguyên lý RAG:

```text
Destination + số ngày + sở thích + ngân sách + số khách
  -> tạo query tổng hợp
  -> retrieve top chunks
  -> gọi LLM yêu cầu trả JSON
  -> validate bằng Pydantic schema
  -> nếu JSON lỗi, fallback lịch trình an toàn
  -> lưu itinerary nếu user chọn lưu
```

Code chính:

- `apps/api/app/services/itinerary_generation.py`
- `apps/api/app/api/v1/routes/itineraries.py`
- Frontend trong `apps/web/app/page.tsx`

Tiêu chí lịch trình:

- Đi được theo số ngày.
- Không nhồi quá nhiều điểm.
- Ưu tiên dữ liệu có nguồn.
- Nếu thiếu chi phí/route thì ghi `not_available` thay vì bịa.

## 12. Auth, RBAC và bảo mật

Hệ thống có:

- Đăng ký/đăng nhập email mật khẩu.
- Hash password bằng Argon2 qua `pwdlib[argon2]`.
- JWT access token và refresh token.
- Role: `user`, `editor`, `admin`, `root`.
- Admin/CMS/DataOps yêu cầu role editor trở lên.
- Audit log cho thao tác quản trị.

Các điểm production:

- `JWT_SECRET_KEY` bắt buộc thay trong production.
- CORS không được wildcard ngoài local/test.
- Database/Redis production không được trỏ localhost.
- Upload có giới hạn dung lượng.
- Admin endpoint có role guard.

## 13. CMS, BI và vận hành

Admin API có:

- Dashboard metrics.
- Content summary.
- Audit logs.
- CRUD tags, places, articles, itinerary templates.
- Publish content.
- Khi publish nội dung không phải image, hệ thống queue reindex RAG.

Dashboard frontend hiện có:

- Tổng quan log điều khiển.
- Tiêu chuẩn đánh giá đúng cho bài toán TravelAssistant.
- Phân tích nguồn và nhu cầu điểm đến.
- Kiểm dữ liệu.
- Kiểm AI.
- Giám sát hệ thống.
- Nền tảng.
- Nhật ký.

Các bảng vận hành trong DB:

- `product_events`: sự kiện sản phẩm, intent, latency.
- `model_usage`: provider, model, feature, token/cost/latency.
- `quality_metrics`: chỉ số chất lượng.
- `audit_logs`: thao tác admin.

## 14. Tiêu chí đánh giá dùng khi demo

Không đánh giá chung chung. Đánh giá đúng theo bài toán trợ lý du lịch:

1. Nguồn du lịch
   - Độ phủ điểm đến.
   - Độ mới.
   - Có URL nguồn.
   - Đúng vùng/đúng địa danh.
   - Không trùng.
   - Đủ trường quan trọng: giờ mở cửa, giá, địa chỉ, mùa cao điểm.

2. Retrieval/RAG
   - Recall@k: nguồn đúng có xuất hiện trong top-k không.
   - Precision@k: top-k có nhiễu không.
   - Context relevance: chunk có liên quan câu hỏi không.
   - Groundedness: câu trả lời có bám nguồn không.
   - Citation coverage: thông tin quan trọng có citation không.
   - Hallucination rate: tỷ lệ bịa nguồn/bịa chi tiết.

3. Chat answer
   - Đúng câu hỏi.
   - Ngắn gọn, tự nhiên.
   - Không nói kiểu quảng cáo.
   - Biết nói "chưa có dữ liệu" khi thiếu.
   - Có cảnh báo kiểm tra lại thông tin dễ thay đổi.

4. Voice
   - STT word error rate với tiếng Việt.
   - Thời gian từ lúc user ngừng nói đến lúc có audio.
   - TTS nghe rõ, không đọc citation.
   - Tỷ lệ file audio lỗi.

5. Lịch trình
   - Không vượt số ngày.
   - Không xung đột giờ mở cửa.
   - Thời lượng mỗi ngày hợp lý.
   - Khoảng cách di chuyển hợp lý.
   - Phù hợp ngân sách/số khách/sở thích.

6. Hệ thống
   - Uptime.
   - API p95 latency.
   - Error rate.
   - Queue failed jobs.
   - Cost theo feature.
   - Audit log đầy đủ.

## 15. Có fine-tune không?

Hiện tại không fine-tune.

Lý do:

- Dữ liệu du lịch thay đổi liên tục: giá, giờ mở cửa, sự kiện, tình trạng dịch vụ.
- Fine-tune không giải quyết tốt vấn đề "kiến thức mới".
- Với bài toán này, RAG phù hợp hơn vì có thể cập nhật nguồn, reindex và giữ citation.
- Chi phí và rủi ro thấp hơn: chỉ cần đổi dữ liệu/vector, không phải train lại model.

Khi nào cân nhắc fine-tune:

- Có nhiều hội thoại thật đã được gán nhãn chất lượng.
- Muốn chỉnh style trả lời ổn định hơn.
- Muốn model phân loại intent tốt hơn.
- Không dùng fine-tune để nhồi kiến thức du lịch mới.

Nói ngắn khi thuyết trình:

"Dự án hiện ưu tiên RAG thay vì fine-tune, vì TravelAssistant cần dữ liệu mới và có nguồn kiểm chứng. Fine-tune chỉ là hướng sau này cho style, intent hoặc routing khi đã có dữ liệu hội thoại thật."

## 16. Vì sao chọn kiến trúc này?

FastAPI:

- Nhanh, dễ viết API, hợp Python AI pipeline.
- Pydantic validate schema tốt.
- Dễ test bằng pytest.

Next.js:

- Hợp web app production.
- Dễ deploy Vercel.
- TypeScript giảm lỗi contract.

PostgreSQL:

- Lưu user, content, chat, audit, analytics ổn định.
- Dễ migrate bằng Alembic.

Qdrant:

- Vector search rõ ràng, hỗ trợ payload.
- Dễ chạy local và cloud.

Redis/RQ:

- Phù hợp job reindex/embedding chạy nền.
- Tránh block API khi ingest dữ liệu lớn.

OpenAI:

- Một provider cho LLM, embedding, STT, TTS giúp demo ổn định hơn.
- Giảm lỗi do nhiều API key/nhiều SDK.

## 17. Những gì đã có và còn thiếu

Đã có:

- Auth + JWT + role.
- Chat session theo user.
- RAG answer có citation/source chunks.
- Voice STT -> RAG -> TTS.
- Planner tạo/lưu/chia sẻ lịch trình.
- CMS/admin API.
- DataOps reindex/retrieval preview/data quality.
- Dashboard vận hành frontend.
- Docker Compose local.
- Render blueprint backend.
- Vercel frontend.

Còn thiếu để production mạnh:

- Bộ dữ liệu du lịch thật lớn hơn.
- Crawl/sync nguồn định kỳ.
- Route/distance thật bằng map provider.
- Object storage/CDN production cho audio và ảnh.
- Reset password/email verification.
- Monitoring thật bằng OpenTelemetry/Prometheus/Grafana/Loki.
- Benchmark RAG tự động định kỳ.
- Backup/restore PostgreSQL, Qdrant, object storage.
- Knowledge graph/GraphRAG nếu cần quan hệ điểm đến phức tạp.

## 18. Timeline phát triển đề xuất

Tuần 1:

- Cố định production env.
- Seed dữ liệu du lịch Việt Nam chất lượng hơn.
- Bổ sung nguồn có URL, giờ mở cửa, giá vé, địa chỉ.

Tuần 2:

- Tạo benchmark 100-200 câu hỏi tiếng Việt.
- Đo Recall@k, groundedness, citation coverage.
- Sửa prompt và retrieval filter.

Tuần 3:

- Nối dashboard vận hành với backend thật thay vì một phần local seed.
- Thêm log deploy/API/voice thật vào admin dashboard.

Tuần 4:

- Hoàn thiện object storage R2.
- Backup Neon/Qdrant.
- Thêm Sentry/PostHog.
- Test mobile, accessibility, performance.

Sau MVP:

- Realtime voice/WebSocket.
- Map routing thật.
- PWA offline saved trips.
- GraphRAG/knowledge graph.
- Fine-tune style/intent nếu có dataset hội thoại thật.

## 19. Câu kết demo

Kết luận: TravelAssistant không chỉ là chatbot du lịch. Đây là một hệ thống trợ lý du lịch có dữ liệu, có RAG, có voice, có lịch trình, có quản trị nội dung và có vận hành. Thiết kế ưu tiên cập nhật dữ liệu nhanh, có nguồn kiểm chứng, kiểm soát rủi ro hallucination và đủ nền tảng để triển khai public với chi phí thấp.

## 20. Lệnh demo nhanh

Local service:

```powershell
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres redis qdrant
```

Migrate và seed:

```powershell
npm run api:migrate
npm run api:seed
```

Import dữ liệu ngoài nếu có JSONL:

```powershell
npm run api:import-ivivu -- --input D:\path\preprocessed_data.jsonl
```

Reindex RAG:

```powershell
npm run api:reindex-rag
```

Chạy backend/frontend:

```powershell
npm run api:dev
npm run dev:web
```

Kiểm tra build:

```powershell
npm run typecheck
npm run build
```

