"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  Citation,
  Destination,
  FeedbackState,
  SavedItinerary,
  SearchResult,
  SourceChunk,
  VoiceEvent,
  VoiceJob
} from "@travelassistant/shared";

import { createAuthClient, type AuthSession } from "../lib/auth-client";
import { createChatClient } from "../lib/chat-client";
import { createContentClient } from "../lib/content-client";
import { readPublicEnv } from "../lib/env";
import { createItineraryClient, type ItineraryGeneratePayload } from "../lib/itinerary-client";
import { clearSession, readSession, saveSession } from "../lib/session-store";
import { createVoiceClient } from "../lib/voice-client";

type Workspace = "ask" | "plan" | "voice" | "explore" | "trips" | "admin" | "account";
type LoadState = "idle" | "loading" | "ready" | "error";
type IconName =
  | "message"
  | "mic"
  | "plus"
  | "route"
  | "map"
  | "bag"
  | "chart"
  | "user"
  | "send"
  | "spark"
  | "source"
  | "upload"
  | "play"
  | "copy"
  | "thumbUp"
  | "thumbDown"
  | "pin"
  | "wave"
  | "close"
  | "logout";

const workspaces: ReadonlyArray<{ id: Workspace; label: string; icon: IconName }> = [
  { id: "ask", label: "Hỏi đáp", icon: "message" },
  { id: "plan", label: "Lịch trình", icon: "route" },
  { id: "explore", label: "Khám phá", icon: "map" },
  { id: "trips", label: "Đã lưu", icon: "bag" },
  { id: "admin", label: "Vận hành", icon: "chart" }
];

type ThreadSummary = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
}>;

type ConversationMessage = ChatMessage & {
  uiOrigin?: "chat" | "voice";
  voiceEvents?: VoiceEvent[];
  audioUrl?: string | null;
};

type AdminTab = "dashboard" | "standards" | "bi" | "cms" | "dataQa" | "modelQa" | "monitoring" | "platforms" | "audit";

type CmsRecord = Readonly<{
  id: string;
  title: string;
  type: "Điểm đến" | "Bài viết" | "Khách sạn" | "Món ăn";
  owner: string;
  status: "Nháp" | "Đang duyệt" | "Đã xuất bản";
  updatedAt: string;
  views: number;
}>;

type AdminAuditEntry = Readonly<{
  id: string;
  action: string;
  actor: string;
  target: string;
  at: string;
  severity: "info" | "warning" | "critical";
}>;

type AdminStore = Readonly<{
  content: CmsRecord[];
  audit: AdminAuditEntry[];
}>;

type OpsLogEntry = Readonly<{
  id: string;
  at: string;
  kind: "Nguồn dữ liệu" | "RAG" | "Giọng nói" | "API" | "Nội dung";
  title: string;
  detail: string;
  region: string;
  metric: string;
  status: "Đạt" | "Theo dõi" | "Cần xử lý";
  sourceName: string;
  sourceUrl?: string;
}>;

type TravelSignal = Readonly<{
  label: string;
  value: string;
  detail: string;
  sourceName: string;
  sourceUrl: string;
}>;

type PipelineStandard = Readonly<{
  id: string;
  label: string;
  score: number;
  status: "Đạt" | "Theo dõi" | "Cần xử lý";
  standard: string;
  target: string;
  criteria: readonly string[];
  evidence: readonly string[];
  nextAction: string;
}>;

const quickPrompts = [
  "Lên lịch trình Đà Nẵng 3 ngày cho gia đình",
  "Ăn gì ở Hội An buổi tối?",
  "Tìm điểm biển ít đông ở miền Trung",
  "So sánh Đà Nẵng và Nha Trang cho trẻ nhỏ"
];

const vietnameseStatus: Record<string, string> = {
  uploaded: "Đã nhận tệp",
  transcribing: "Đang nghe",
  retrieving: "Đang tìm nguồn",
  generating: "Đang trả lời",
  speaking: "Đang tạo âm thanh",
  done: "Hoàn tất",
  failed: "Lỗi",
  queued: "Đang chờ",
  processing: "Đang xử lý"
};

const emptySources: readonly Citation[] = [];
const emptyChunks: readonly SourceChunk[] = [];
const ADMIN_STORE_KEY = "travelassistant.admin.console.v2";

const seedAdminStore: AdminStore = {
  content: [
    { id: "cms-1", title: "Hà Nội: tour đêm và mùa lễ hội", type: "Bài viết", owner: "editor@travel", status: "Đã xuất bản", updatedAt: "2026-05-20T02:10:00.000Z", views: 30940 },
    { id: "cms-2", title: "Huế 2026: lịch trình di sản 3 ngày", type: "Điểm đến", owner: "admin@travel", status: "Đang duyệt", updatedAt: "2026-05-19T10:25:00.000Z", views: 7350 },
    { id: "cms-3", title: "Khánh Hòa: biển đảo và lưu trú gia đình", type: "Khách sạn", owner: "ops@travel", status: "Nháp", updatedAt: "2026-05-18T06:45:00.000Z", views: 14800 },
    { id: "cms-4", title: "Ẩm thực Hội An: món nên thử buổi tối", type: "Món ăn", owner: "editor@travel", status: "Đã xuất bản", updatedAt: "2026-05-17T04:20:00.000Z", views: 9680 }
  ],
  audit: [
    { id: "audit-1", action: "Kiểm hồi quy trước deploy", actor: "ci-bot", target: "travelassistant-api", at: "2026-05-20T03:30:00.000Z", severity: "info" },
    { id: "audit-2", action: "Phát hiện thiếu số điện thoại khách sạn", actor: "kiem-du-lieu", target: "hotel_dataset", at: "2026-05-20T02:42:00.000Z", severity: "warning" },
    { id: "audit-3", action: "Xuất bản bài viết Hội An", actor: "editor@travel", target: "cms-4", at: "2026-05-20T02:12:00.000Z", severity: "info" },
    { id: "audit-4", action: "Độ lệch nguồn tìm kiếm vượt ngưỡng", actor: "giam-sat", target: "retrieval_distribution", at: "2026-05-19T21:40:00.000Z", severity: "critical" }
  ]
};

const opsReferenceTime = new Date("2026-05-20T12:00:00.000Z").getTime();

const travelSignals: readonly TravelSignal[] = [
  {
    label: "Khách quốc tế Việt Nam 2025",
    value: "21,5 triệu",
    detail: "Nền dữ liệu quốc gia để ưu tiên điểm đến và intent tìm kiếm.",
    sourceName: "Xinhua dẫn VNAT/Nhân Dân",
    sourceUrl: "https://english.news.cn/asiapacific/20251229/ece17846f9a8465782c4ca738b839209/c.html"
  },
  {
    label: "Khách nội địa 2025",
    value: "135,5 triệu",
    detail: "Dùng để cân bằng gợi ý mùa cao điểm, gia đình, ngân sách.",
    sourceName: "VOV",
    sourceUrl: "https://english.vov.vn/en/economy/vietnam-tourism-moves-toward-key-economic-sector-post1270079.vov"
  },
  {
    label: "Hà Nội 11 tháng 2025",
    value: "30,94 triệu",
    detail: "Có tín hiệu tour đêm, lễ hội, bảo tàng và Ba Vì.",
    sourceName: "VnExpress International",
    sourceUrl: "https://e.vnexpress.net/news/travel/places/hanoi-welcomes-highest-ever-number-of-visitors-in-2025-4987584.html"
  },
  {
    label: "Huế sau Năm Du lịch 2025",
    value: ">13 nghìn tỷ VND",
    detail: "Cơ sở cho lịch trình di sản, festival và khách quốc tế.",
    sourceName: "Nhân Dân",
    sourceUrl: "https://en.nhandan.vn/the-closing-of-visit-viet-nam-year-2025-opens-a-new-chapter-for-hue-tourism-post157133.html"
  }
];

const opsControlLogs: readonly OpsLogEntry[] = [
  {
    id: "log-1",
    at: "2026-05-20T10:35:00.000Z",
    kind: "Nguồn dữ liệu",
    title: "Cập nhật tín hiệu du lịch Việt Nam 2025",
    detail: "21,5 triệu khách quốc tế và 135,5 triệu khách nội địa được đưa vào bảng nguồn.",
    region: "Việt Nam",
    metric: "4 nguồn",
    status: "Đạt",
    sourceName: "VNAT/VOV/Xinhua",
    sourceUrl: "https://english.vov.vn/en/economy/vietnam-tourism-moves-toward-key-economic-sector-post1270079.vov"
  },
  {
    id: "log-2",
    at: "2026-05-20T09:10:00.000Z",
    kind: "RAG",
    title: "Kiểm tra câu hỏi ăn tối ở Hội An",
    detail: "Có nguồn trích dẫn, nhưng câu trả lời giọng nói đã bỏ đọc số citation.",
    region: "Quảng Nam",
    metric: "nguồn 4/5",
    status: "Theo dõi",
    sourceName: "Bộ kiểm RAG nội bộ"
  },
  {
    id: "log-3",
    at: "2026-05-20T07:45:00.000Z",
    kind: "Giọng nói",
    title: "Đo chuỗi nghe - trả lời - đọc lại",
    detail: "P95 toàn luồng xử lý còn cao với câu hỏi dài, cần ưu tiên câu trả lời nói ngắn.",
    region: "Toàn hệ thống",
    metric: "p95 4,8s",
    status: "Cần xử lý",
    sourceName: "Log trình duyệt"
  },
  {
    id: "log-4",
    at: "2026-05-19T22:20:00.000Z",
    kind: "Nội dung",
    title: "Hà Nội tăng mạnh nhu cầu tour đêm",
    detail: "Tạo nội dung gợi ý Ngọc Sơn, bảo tàng đêm và Ba Vì theo tín hiệu 30,94 triệu khách.",
    region: "Hà Nội",
    metric: "30,94 triệu",
    status: "Đạt",
    sourceName: "VnExpress International",
    sourceUrl: "https://e.vnexpress.net/news/travel/places/hanoi-welcomes-highest-ever-number-of-visitors-in-2025-4987584.html"
  },
  {
    id: "log-5",
    at: "2026-05-18T12:00:00.000Z",
    kind: "Nguồn dữ liệu",
    title: "Bổ sung dữ liệu Huế cho lịch trình di sản",
    detail: "Doanh thu du lịch Huế 2025 ước trên 13 nghìn tỷ VND, phù hợp ưu tiên festival và di sản.",
    region: "Huế",
    metric: ">13 nghìn tỷ",
    status: "Đạt",
    sourceName: "Nhân Dân",
    sourceUrl: "https://en.nhandan.vn/the-closing-of-visit-viet-nam-year-2025-opens-a-new-chapter-for-hue-tourism-post157133.html"
  },
  {
    id: "log-6",
    at: "2026-05-05T08:30:00.000Z",
    kind: "API",
    title: "Kiểm tra endpoint hỏi đáp và voice",
    detail: "Các endpoint chính phản hồi, nhưng voice cần ngân sách độ trễ riêng.",
    region: "Hệ thống",
    metric: "5 endpoint",
    status: "Theo dõi",
    sourceName: "Giám sát nội bộ"
  }
];

const pipelineStandards: readonly PipelineStandard[] = [
  {
    id: "data",
    label: "Nguồn du lịch",
    score: 84,
    status: "Theo dõi",
    standard: "ISO/IEC 25012 + nguồn công khai",
    target: "Nguồn phải đúng địa điểm, còn mới và có link kiểm chứng.",
    criteria: ["Độ phủ điểm đến", "Độ mới", "Có link nguồn", "Không trùng", "Đúng vùng", "Đủ trường"],
    evidence: ["4 nguồn thị trường", "2 điểm đến ưu tiên", "Thiếu giờ mở cửa ở 7% mục"],
    nextAction: "Bổ sung giờ mở cửa, giá vé và mùa cao điểm cho từng điểm đến"
  },
  {
    id: "model",
    label: "Trả lời có căn cứ",
    score: 88,
    status: "Đạt",
    standard: "RAGAS + NIST AI RMF",
    target: "Câu trả lời phải bám nguồn, hữu ích và không bịa địa điểm.",
    criteria: ["Đúng ngữ cảnh", "Có căn cứ", "Liên quan câu hỏi", "Không bịa nguồn", "Từ chối khi thiếu dữ liệu"],
    evidence: ["Có nguồn 91%", "Căn cứ 88%", "Bịa nguồn 1,6%"],
    nextAction: "Tạo bộ câu hỏi chuẩn theo Hà Nội, Huế, Hội An, Khánh Hòa"
  },
  {
    id: "system",
    label: "Giọng nói",
    score: 78,
    status: "Cần xử lý",
    standard: "SLO hội thoại",
    target: "Người dùng nói xong thì hệ thống tự trả lời nhanh, âm thanh nghe rõ.",
    criteria: ["Nhận dừng nói", "Chép lời đúng", "P95 phản hồi", "TTS nghe được", "Không đọc citation"],
    evidence: ["P95 4,8s", "TTS ổn", "Đã bỏ đọc [1][2]"],
    nextAction: "Ưu tiên câu trả lời nói ngắn và đo riêng STT/LLM/TTS"
  },
  {
    id: "product",
    label: "Lịch trình",
    score: 86,
    status: "Đạt",
    standard: "Kiểm logic nghiệp vụ",
    target: "Lịch trình phải đi được, hợp ngân sách, đúng thời gian và đúng kiểu khách.",
    criteria: ["Khoảng cách", "Thời lượng", "Ngân sách", "Giờ mở cửa", "Nhịp nghỉ", "Phù hợp nhóm khách"],
    evidence: ["Luật ngày <= 14", "Xung đột giờ 3%", "Thiếu giá vé 9%"],
    nextAction: "Thêm kiểm tra giờ mở cửa và thời gian di chuyển thật"
  },
  {
    id: "delivery",
    label: "Vận hành",
    score: 90,
    status: "Theo dõi",
    standard: "Google SRE + OWASP API + DORA",
    target: "API ổn định, có log, có audit và deploy không phá trải nghiệm.",
    criteria: ["P95 API", "Tỷ lệ lỗi", "Log truy vết", "Phân quyền", "Kiểm hồi quy", "Khôi phục"],
    evidence: ["5 endpoint API", "Audit tạo/sửa/xóa", "Build đạt"],
    nextAction: "Ghi log deploy và lỗi API vào bảng vận hành thật"
  }
];

const overallCriteriaRows = [
  ["Nguồn du lịch", "Độ phủ, độ mới, có link, đúng vùng", "84/100"],
  ["Trả lời có căn cứ", "Bám nguồn, đúng câu hỏi, không bịa, có trích dẫn", "88/100"],
  ["Giọng nói", "Tự nhận dừng nói, chép lời đúng, TTS rõ, p95 thấp", "78/100"],
  ["Lịch trình", "Đi được, hợp giờ mở cửa, ngân sách, khoảng cách", "86/100"],
  ["Vận hành", "API ổn định, log đủ, phân quyền, kiểm hồi quy", "90/100"]
] as const;

function canUseOperations(role: string | null | undefined): boolean {
  return role === "editor" || role === "admin" || role === "root";
}

function readAdminStore(): AdminStore {
  if (typeof window === "undefined") {
    return seedAdminStore;
  }
  const raw = window.localStorage.getItem(ADMIN_STORE_KEY);
  if (!raw) {
    window.localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(seedAdminStore));
    return seedAdminStore;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AdminStore>;
    if (Array.isArray(parsed.content) && Array.isArray(parsed.audit)) {
      return parsed as AdminStore;
    }
  } catch {
    window.localStorage.removeItem(ADMIN_STORE_KEY);
  }
  window.localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(seedAdminStore));
  return seedAdminStore;
}

function saveAdminStore(store: AdminStore): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(store));
  }
}

function isWorkspace(value: string | null): value is Workspace {
  return value === "ask" || value === "plan" || value === "explore" || value === "trips" || value === "admin" || value === "account";
}

function isAdminTab(value: string | null): value is AdminTab {
  return value === "dashboard" || value === "standards" || value === "bi" || value === "cms" || value === "dataQa" || value === "modelQa" || value === "monitoring" || value === "platforms" || value === "audit";
}

function filterToDays(value: string): number | null {
  if (value === "24 giờ") return 1;
  if (value === "7 ngày") return 7;
  if (value === "30 ngày") return 30;
  if (value === "Quý này") return 90;
  return null;
}

export default function Home() {
  const [active, setActive] = useState<Workspace>("ask");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [latestCitations, setLatestCitations] = useState<readonly Citation[]>(emptySources);
  const [latestChunks, setLatestChunks] = useState<readonly SourceChunk[]>(emptyChunks);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const accessToken = session?.accessToken;
  const canShowSources = active === "ask" || active === "voice";
  const visibleWorkspaces = workspaces.filter((workspace) => workspace.id !== "admin" || canUseOperations(session?.user.role));

  useEffect(() => {
    const timer = window.setTimeout(() => setSession(readSession()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      clearSession();
      setSession(null);
      setActive("account");
    }

    window.addEventListener("travelassistant:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("travelassistant:auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    if (active === "admin" && !canUseOperations(session?.user.role)) {
      setActive("ask");
    }
  }, [active, session?.user.role]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("workspace");
    if (!isWorkspace(requested)) {
      return;
    }
    if (requested === "admin" && !canUseOperations(session.user.role)) {
      return;
    }
    setActive(requested);
  }, [session]);

  function logout() {
    clearSession();
    setSession(null);
    setAccountMenuOpen(false);
    setActive("account");
  }

  function rememberThread(id: string, title: string) {
    setThreads((items) => {
      const existing = items.find((item) => item.id === id);
      const next: ThreadSummary = {
        id,
        title: title || "Đoạn chat mới",
        updatedAt: new Date().toISOString(),
        pinned: existing?.pinned ?? false
      };
      return [next, ...items.filter((item) => item.id !== id)].slice(0, 18);
    });
  }

  function toggleThreadPin(id: string) {
    setThreads((items) => items.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)));
  }

  function startNewChat() {
    setActive("ask");
    setDrawerOpen(false);
    setLatestCitations(emptySources);
    setLatestChunks(emptyChunks);
    setChatResetKey((value) => value + 1);
  }

  const sortedThreads = [...threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!session) {
    return (
      <main className="login-page-shell">
        <AuthWorkspace
          session={null}
          onSessionChange={(nextSession) => {
            setSession(nextSession);
            if (nextSession) {
              setActive("ask");
            }
          }}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="side-nav" aria-label="Điều hướng chính">
        <div className="account-zone">
          <button className="brand-lockup" type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-expanded={accountMenuOpen}>
            <UserAvatar />
            <span>
              <strong>{session.user.email.split("@")[0] || "Tài khoản"}</strong>
              <small>{session.user.email}</small>
            </span>
          </button>
          {accountMenuOpen && (
            <div className="account-popover">
              <div>
                <strong>{session.user.email}</strong>
                <small>{session.user.role}</small>
              </div>
              <button type="button" onClick={logout}>
                <Icon name="logout" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>

        <nav className="nav-stack" aria-label="Khu vực làm việc">
          {visibleWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              className={`nav-item ${active === workspace.id ? "is-active" : ""}`}
              type="button"
              onClick={() => setActive(workspace.id)}
              title={workspace.label}
            >
              <Icon name={workspace.icon} />
              <span>{workspace.label}</span>
            </button>
          ))}
        </nav>

        <section className="chat-history-panel" aria-label="Lịch sử chat">
          <div className="history-head">
            <span>Lịch sử</span>
            <button type="button" onClick={startNewChat} title="Đoạn chat mới">
              <Icon name="plus" />
            </button>
          </div>
          <div className="history-list">
            {sortedThreads.length === 0 && <p>Chưa có đoạn chat.</p>}
            {sortedThreads.map((thread) => (
              <article key={thread.id} className={thread.pinned ? "is-pinned" : ""}>
                <button type="button" onClick={() => setActive("ask")}>
                  {thread.title}
                </button>
                <button type="button" onClick={() => toggleThreadPin(thread.id)} title={thread.pinned ? "Bỏ ghim" : "Ghim"}>
                  <Icon name="pin" />
                </button>
              </article>
            ))}
          </div>
        </section>

        <button className="mobile-account-button" type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-label="Tài khoản">
          <Icon name="user" />
        </button>
        {accountMenuOpen && (
          <div className="mobile-account-popover">
            <strong>{session.user.email}</strong>
            <button type="button" onClick={logout}>
              <Icon name="logout" />
              Đăng xuất
            </button>
          </div>
        )}
      </aside>

      <section className="workspace">
        <div className={`workspace-grid ${drawerOpen && canShowSources ? "has-drawer" : ""}`}>
          <div className="workspace-surface">
            {active === "ask" && (
              <ChatWorkspace
                accessToken={accessToken}
                resetKey={chatResetKey}
                onAuthNeeded={() => setActive("account")}
                onThreadUpdate={rememberThread}
                onSources={(citations, chunks) => {
                  setLatestCitations(citations);
                  setLatestChunks(chunks);
                }}
                onOpenSources={() => setDrawerOpen(true)}
              />
            )}
            {active === "plan" && <PlannerWorkspace accessToken={accessToken} onAuthNeeded={() => setActive("account")} onOpenTrips={() => setActive("trips")} />}
            {active === "voice" && (
              <VoiceWorkspace
                accessToken={accessToken}
                onAuthNeeded={() => setActive("account")}
                onSources={(citations, chunks) => {
                  setLatestCitations(citations);
                  setLatestChunks(chunks);
                }}
              />
            )}
            {active === "explore" && <ExploreWorkspace />}
            {active === "trips" && <TripsWorkspace accessToken={accessToken} onAuthNeeded={() => setActive("account")} />}
            {active === "admin" && canUseOperations(session?.user.role) && <AdminWorkspace accessToken={accessToken} userRole={session.user.role} onAuthNeeded={() => setActive("account")} />}
            {active === "account" && <AuthWorkspace session={session} onSessionChange={setSession} />}
          </div>

          {canShowSources && <SourceDrawer open={drawerOpen} citations={latestCitations} chunks={latestChunks} showScores={canUseOperations(session.user.role)} onClose={() => setDrawerOpen(false)} />}
        </div>
      </section>
    </main>
  );
}

function TravelLogo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <defs>
          <linearGradient id="travel-logo-gradient" x1="8" x2="40" y1="8" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0B7F78" />
            <stop offset="1" stopColor="#D85D45" />
          </linearGradient>
        </defs>
        <path d="M24 5c7.9 0 14.3 6.4 14.3 14.2 0 10.5-14.3 23.8-14.3 23.8S9.7 29.7 9.7 19.2C9.7 11.4 16.1 5 24 5Z" fill="url(#travel-logo-gradient)" />
        <path d="M17.3 20.2c4.2-6.9 10.3 4.8 15.1-2.3" fill="none" stroke="white" strokeLinecap="round" strokeWidth="3.2" />
        <circle cx="24" cy="18.9" r="3.9" fill="white" />
      </svg>
    </span>
  );
}

function UserAvatar() {
  return (
    <span className="user-avatar" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <circle cx="24" cy="24" r="22" fill="#1877F2" />
        <circle cx="24" cy="18" r="7" fill="white" />
        <path d="M11 39c2.4-8 7-12 13-12s10.6 4 13 12" fill="white" />
      </svg>
    </span>
  );
}

function BackendBadge() {
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${readPublicEnv().apiBaseUrl}/health`, { signal: controller.signal })
      .then((response) => setState(response.ok ? "ready" : "error"))
      .catch(() => setState("error"));
    return () => controller.abort();
  }, []);

  return (
    <div className={`backend-badge ${state}`}>
      <span aria-hidden="true" />
      <strong>{state === "ready" ? "Hệ thống hoạt động" : state === "loading" ? "Đang kiểm tra" : "Hệ thống lỗi"}</strong>
    </div>
  );
}

function ChatWorkspace({
  accessToken,
  resetKey,
  onAuthNeeded,
  onThreadUpdate,
  onSources,
  onOpenSources
}: Readonly<{
  accessToken?: string;
  resetKey: number;
  onAuthNeeded: () => void;
  onThreadUpdate: (id: string, title: string) => void;
  onSources: (citations: readonly Citation[], chunks: readonly SourceChunk[]) => void;
  onOpenSources: () => void;
}>) {
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [voiceState, setVoiceState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [job, setJob] = useState<VoiceJob | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechStartedRef = useRef(false);
  const lastVoiceAtRef = useRef(0);

  useEffect(() => {
    if (messages.length > 0 || state === "loading" || voiceState === "loading") {
      chatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages, state, voiceState]);

  useEffect(() => {
    setQuestion("");
    setSessionId(null);
    setMessages([]);
    setState("idle");
    setVoiceState("idle");
    setError(null);
    setJob(null);
    setAttachmentName(null);
    cleanupRecordingResources();
  }, [resetKey]);

  useEffect(() => {
    return () => cleanupRecordingResources();
  }, []);

  function cleanupRecordingResources() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setVoiceLevel(0);
  }

  function makeLocalMessage(partial: Pick<ConversationMessage, "role" | "content"> & Partial<ConversationMessage>): ConversationMessage {
    return {
      id: partial.id ?? `local-${crypto.randomUUID()}`,
      session_id: partial.session_id ?? sessionId ?? "local",
      role: partial.role,
      content: partial.content,
      modality: partial.modality ?? "text",
      idempotency_key: partial.idempotency_key ?? null,
      citations: partial.citations ?? [],
      source_chunks: partial.source_chunks ?? [],
      latency_ms: partial.latency_ms ?? null,
      model_provider: partial.model_provider ?? null,
      feedback_state: partial.feedback_state ?? null,
      created_at: partial.created_at ?? new Date().toISOString(),
      uiOrigin: partial.uiOrigin,
      voiceEvents: partial.voiceEvents,
      audioUrl: partial.audioUrl
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || state === "loading") {
      return;
    }
    if (!accessToken) {
      onAuthNeeded();
      return;
    }

    setQuestion("");
    setState("loading");
    setError(null);
    try {
      const client = createChatClient(accessToken);
      const activeSession = sessionId ? { id: sessionId } : await client.createSession(content.slice(0, 90));
      setSessionId(activeSession.id);
      const exchange = await client.postMessage(activeSession.id, {
        content,
        idempotency_key: `web-${crypto.randomUUID()}`
      });
      setMessages((items) => [...items, exchange.user_message, exchange.assistant_message]);
      onThreadUpdate(activeSession.id, content.slice(0, 60));
      onSources(exchange.assistant_message.citations, exchange.assistant_message.source_chunks);
      setState("ready");
      setAttachmentName(null);
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  async function sendFeedback(message: ConversationMessage, feedback: FeedbackState) {
    if (message.uiOrigin === "voice") {
      setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, feedback_state: feedback } : item)));
      return;
    }
    if (!accessToken) {
      return;
    }
    try {
      const updated = await createChatClient(accessToken).sendFeedback(message.id, feedback);
      setMessages((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  function getRecorderOptions(): MediaRecorderOptions | undefined {
    const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? { mimeType } : undefined;
  }

  async function startVoice() {
    if (!accessToken) {
      onAuthNeeded();
      return;
    }
    setError(null);
    speechStartedRef.current = false;
    lastVoiceAtRef.current = performance.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, getRecorderOptions());
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
        cleanupRecordingResources();
        setRecording(false);
        if (blob.size > 0) {
          void submitVoiceFile(file);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      monitorSilence(analyser);
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  function monitorSilence(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    function tick() {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        total += value * value;
      }
      const rms = Math.sqrt(total / samples.length);
      setVoiceLevel(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > 0.028) {
        speechStartedRef.current = true;
        lastVoiceAtRef.current = now;
      }
      if (speechStartedRef.current && now - lastVoiceAtRef.current > 1200) {
        stopVoice();
        return;
      }
      if (!speechStartedRef.current && now - startedAt > 10000) {
        setError("Chưa nghe thấy giọng nói. Hãy thử lại gần micro hơn.");
        stopVoice();
        return;
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    }
    animationFrameRef.current = window.requestAnimationFrame(tick);
  }

  function stopVoice() {
    recorderRef.current?.stop();
  }

  async function submitVoiceFile(file: File) {
    if (!accessToken) {
      onAuthNeeded();
      return;
    }
    setVoiceState("loading");
    setError(null);
    try {
      const result = await createVoiceClient(accessToken).query(file);
      const citations = citationsFromRecords(result.citations);
      const sourceChunks = chunksFromRecords(result.source_chunks);
      const activeSessionId = sessionId ?? `voice-${result.id}`;
      setSessionId(activeSessionId);
      setJob(result);
      onSources(citations, sourceChunks);
      onThreadUpdate(activeSessionId, result.transcript || "Câu hỏi bằng giọng nói");
      setMessages((items) => [
        ...items,
        makeLocalMessage({
          id: `voice-user-${result.id}`,
          session_id: activeSessionId,
          role: "user",
          content: result.transcript || "Câu hỏi bằng giọng nói",
          modality: "audio",
          uiOrigin: "voice"
        }),
        makeLocalMessage({
          id: `voice-assistant-${result.id}`,
          session_id: activeSessionId,
          role: "assistant",
          content: result.answer || "Mình chưa nhận được câu trả lời.",
          modality: "audio",
          citations,
          source_chunks: sourceChunks,
          model_provider: result.provider,
          uiOrigin: "voice",
          voiceEvents: result.events,
          audioUrl: result.output_public_url
        })
      ]);
      if (result.output_public_url && audioRef.current) {
        audioRef.current.src = result.output_public_url;
        audioRef.current.load();
        audioRef.current.play().catch(() => undefined);
      }
      setVoiceState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setVoiceState("error");
    }
  }

  function openMessageSources(message: ConversationMessage) {
    onSources(message.citations, message.source_chunks);
    onOpenSources();
  }

  function playMessageAudio(message: ConversationMessage) {
    if (!message.audioUrl || !audioRef.current) {
      return;
    }
    audioRef.current.src = message.audioUrl;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => undefined);
  }

  const hasConversation = messages.length > 0;
  const latestEvents = job?.events ?? [];

  return (
    <section className={`chat-layout ${hasConversation ? "has-messages" : "is-empty"}`} aria-label="Hỏi đáp">
      <VoicePipeline events={latestEvents} recording={recording} loading={voiceState === "loading"} />
      <div className="conversation-panel">
        <div className="message-list" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-empty">
              <TravelLogo />
              <h1>Khi bạn sẵn sàng là chúng ta có thể bắt đầu.</h1>
              <div className="quick-row" aria-label="Gợi ý nhanh">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message-bubble ${message.role === "user" ? "user" : "assistant"}`}>
              <span>{message.role === "user" ? "Bạn" : "TravelAssistant"}</span>
              <p>{message.content}</p>
              {message.role === "assistant" && (
                <div className="message-actions">
                  <button type="button" onClick={() => navigator.clipboard.writeText(message.content).catch(() => undefined)} title="Sao chép">
                    <Icon name="copy" />
                  </button>
                  <button type="button" onClick={() => sendFeedback(message, "helpful")} className={message.feedback_state === "helpful" ? "is-selected" : ""} title="Tốt">
                    <Icon name="thumbUp" />
                  </button>
                  <button type="button" onClick={() => sendFeedback(message, "not_helpful")} className={message.feedback_state === "not_helpful" ? "is-selected" : ""} title="Chưa ổn">
                    <Icon name="thumbDown" />
                  </button>
                  {message.audioUrl && (
                    <button type="button" onClick={() => playMessageAudio(message)} title="Nghe lại">
                      <Icon name="play" />
                    </button>
                  )}
                  {(message.citations.length > 0 || message.source_chunks.length > 0) && (
                    <button type="button" onClick={() => openMessageSources(message)} title="Nguồn">
                      <Icon name="source" />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {(state === "loading" || voiceState === "loading") && (
            <article className="message-bubble assistant is-streaming">
              <span>TravelAssistant</span>
              <p>{voiceState === "loading" ? "Đang nghe và chuẩn bị câu trả lời..." : "Đang đọc dữ liệu và tạo câu trả lời..."}</p>
              <div className="typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </article>
          )}
          <div ref={chatEndRef} />
        </div>

        <form className="composer" onSubmit={submit}>
          {attachmentName && (
            <button className="attachment-chip" type="button" onClick={() => setAttachmentName(null)}>
              {attachmentName}
              <Icon name="close" />
            </button>
          )}
          <button className="composer-icon-button" type="button" onClick={() => fileInputRef.current?.click()} title="Thêm ảnh">
            <Icon name="plus" />
          </button>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            accept="image/*"
            type="file"
            onChange={(event) => setAttachmentName(event.target.files?.[0]?.name ?? null)}
          />
          <label className="sr-only" htmlFor="chat-question">
            Câu hỏi
          </label>
          <textarea
            id="chat-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={accessToken ? "Hỏi bất kỳ điều gì" : "Đăng nhập để hỏi"}
            rows={1}
          />
          <button
            className={`composer-icon-button mic-button ${recording ? "is-recording" : ""}`}
            type="button"
            onClick={() => {
              if (recording) {
                stopVoice();
              } else {
                void startVoice();
              }
            }}
            title={recording ? "Dừng nghe" : "Nói"}
          >
            <Icon name="mic" />
            <span style={{ transform: `scaleY(${Math.max(0.18, voiceLevel)})` }} />
          </button>
          <button className="send-button" type="submit" disabled={state === "loading" || voiceState === "loading"}>
            <Icon name={question.trim() ? "send" : "wave"} />
          </button>
        </form>
        {error && <ErrorNote message={error} />}
        <audio ref={audioRef} preload="auto" />
      </div>
    </section>
  );
}

function VoicePipeline({ events, recording, loading }: Readonly<{ events: readonly VoiceEvent[]; recording: boolean; loading: boolean }>) {
  const visible = recording || loading || events.length > 0;
  if (!visible) {
    return null;
  }

  const order = ["uploaded", "transcribing", "retrieving", "generating", "speaking", "done"];
  const activeStatuses = new Set(events.map((event) => event.status));
  const latestStatus = events.at(-1)?.status;

  return (
    <ol className="voice-pipeline" aria-label="Tiến trình xử lý giọng nói">
      {order.map((status) => {
        const event = events.find((item) => item.status === status);
        const isActive = activeStatuses.has(status) || (recording && status === "transcribing") || (loading && status === latestStatus);
        return (
          <li key={status} className={isActive ? "is-active" : ""}>
            <span aria-hidden="true">
              <Icon name={status === "transcribing" ? "mic" : status === "done" ? "spark" : "wave"} />
            </span>
            <strong>{vietnameseStatus[status]}</strong>
            <small>{event ? new Date(event.at).toLocaleTimeString("vi-VN") : "--:--"}</small>
          </li>
        );
      })}
    </ol>
  );
}

function PlannerWorkspace({ accessToken, onAuthNeeded, onOpenTrips }: Readonly<{ accessToken?: string; onAuthNeeded: () => void; onOpenTrips: () => void }>) {
  const [destination, setDestination] = useState("Đà Nẵng");
  const [days, setDays] = useState(3);
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState("mid-range");
  const [interests, setInterests] = useState("biển, ẩm thực, gia đình");
  const [selectedDay, setSelectedDay] = useState(1);
  const [itinerary, setItinerary] = useState<SavedItinerary | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const destinationPresets = ["Đà Nẵng", "Hội An", "Huế", "Nha Trang"];
  const interestPresets = ["ẩm thực", "biển", "gia đình", "nghỉ dưỡng", "ít đông", "văn hóa"];

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      onAuthNeeded();
      return;
    }
    setState("loading");
    setError(null);
    try {
      const payload: ItineraryGeneratePayload = {
        destination,
        days,
        travelers,
        budget,
        interests: interests
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      };
      const result = await createItineraryClient(accessToken).generate(payload);
      setItinerary(result);
      setSelectedDay(1);
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  function addInterest(interest: string) {
    const current = interests
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!current.includes(interest)) {
      setInterests([...current, interest].join(", "));
    }
  }

  function copyItinerary() {
    if (!itinerary) {
      return;
    }
    const text = itinerary.plan_json.days
      .map((day) => [`Ngày ${day.day}: ${day.theme}`, ...day.blocks.map((block) => `${block.time} - ${block.title}: ${block.description}`)].join("\n"))
      .join("\n\n");
    navigator.clipboard.writeText(`${itinerary.plan_json.title}\n\n${text}`).catch(() => undefined);
  }

  const selected = itinerary?.plan_json.days.find((day) => day.day === selectedDay) ?? itinerary?.plan_json.days[0] ?? null;
  const totalBlocks = itinerary?.plan_json.days.reduce((total, day) => total + day.blocks.length, 0) ?? 0;

  return (
    <section className="planner-grid" aria-label="Tạo lịch trình">
      <form className="planner-form" onSubmit={generate}>
        <div className="planner-form-head">
          <span>Lịch trình</span>
          <h1>Tạo chuyến đi nhanh</h1>
          <p>Chọn điểm đến, số ngày và sở thích. Lịch trình tạo xong sẽ tự lưu vào tài khoản.</p>
        </div>

        <div className="destination-pills" aria-label="Gợi ý điểm đến">
          {destinationPresets.map((preset) => (
            <button key={preset} className={destination === preset ? "is-active" : ""} type="button" onClick={() => setDestination(preset)}>
              {preset}
            </button>
          ))}
        </div>

        <label>
          <span>Điểm đến</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} />
        </label>
        <div className="planner-compact-grid">
          <label>
            <span>Số ngày</span>
            <input min={1} max={14} type="number" value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </label>
          <label>
            <span>Số người</span>
            <input min={1} max={20} type="number" value={travelers} onChange={(event) => setTravelers(Number(event.target.value))} />
          </label>
        </div>
        <label>
          <span>Ngân sách</span>
          <select value={budget} onChange={(event) => setBudget(event.target.value)}>
            <option value="budget">Tiết kiệm</option>
            <option value="mid-range">Vừa phải</option>
            <option value="premium">Thoải mái</option>
          </select>
        </label>
        <button className="primary-button wide planner-submit-main" type="submit" disabled={state === "loading"}>
          <Icon name="spark" />
          {state === "loading" ? "Đang tạo" : "Tạo lịch trình"}
        </button>
        <label>
          <span>Sở thích</span>
          <input value={interests} onChange={(event) => setInterests(event.target.value)} />
        </label>
        <div className="interest-pills" aria-label="Gợi ý sở thích">
          {interestPresets.map((preset) => (
            <button key={preset} type="button" onClick={() => addInterest(preset)}>
              {preset}
            </button>
          ))}
        </div>
        {itinerary && (
          <button className="ghost-button wide" type="button" onClick={onOpenTrips}>
            <Icon name="bag" />
            Xem lịch trình đã lưu
          </button>
        )}
        {error && <ErrorNote message={error} />}
      </form>

      <div className="timeline-panel">
        {!itinerary && state !== "loading" && (
          <div className="planner-empty">
            <div className="planner-map-preview" aria-hidden="true">
              <span className="route-dot dot-a" />
              <span className="route-dot dot-b" />
              <span className="route-dot dot-c" />
            </div>
            <h2>Lịch trình sẽ hiện ở đây</h2>
            <p>Mỗi ngày có chủ đề riêng, các điểm dừng theo thời gian, gợi ý di chuyển và trạng thái lưu.</p>
          </div>
        )}
        {state === "loading" && <LoadingRoute />}
        {itinerary && (
          <>
            <div className="trip-result-hero">
              <div>
                <h2>{itinerary.plan_json.title}</h2>
                <p>
                  {itinerary.destination} · {itinerary.days} ngày · {travelers} người · {totalBlocks} hoạt động
                </p>
              </div>
              <div className="trip-result-actions">
                <span className="state-pill live">Đã lưu</span>
                <button className="ghost-button" type="button" onClick={copyItinerary}>
                  <Icon name="copy" />
                  Sao chép
                </button>
                <button className="ghost-button" type="button" onClick={onOpenTrips}>
                  <Icon name="bag" />
                  Đã lưu
                </button>
              </div>
            </div>

            <div className="day-tabs" aria-label="Chọn ngày">
              {itinerary.plan_json.days.map((day) => (
                <button key={day.day} className={selected?.day === day.day ? "is-active" : ""} type="button" onClick={() => setSelectedDay(day.day)}>
                  <span>Ngày {day.day}</span>
                  <strong>{day.theme}</strong>
                </button>
              ))}
            </div>

            <div className="itinerary-board">
              {selected && (
                <article className="day-detail">
                  <div className="day-detail-head">
                    <span>Ngày {selected.day}</span>
                    <h3>{selected.theme}</h3>
                  </div>
                  <div className="time-line-list">
                    {selected.blocks.map((block, index) => (
                      <div key={`${selected.day}-${block.time}-${block.title}`} className="time-block">
                        <strong>{block.time}</strong>
                        <div>
                          <h4>{block.title}</h4>
                          <p>{block.description}</p>
                          <small>{block.route_hint || block.cost_estimate}</small>
                        </div>
                        <span aria-hidden="true">{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              <aside className="trip-side">
                <div>
                  <span>Tóm tắt</span>
                  <strong>{itinerary.days} ngày</strong>
                  <p>{itinerary.citations.length} nguồn tham khảo · lưu lúc {new Date(itinerary.updated_at).toLocaleDateString("vi-VN")}</p>
                </div>
                <div className="mini-days">
                  {itinerary.plan_json.days.map((day) => (
                    <small key={day.day}>Ngày {day.day}: {day.blocks.length} điểm</small>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function VoiceWorkspace({
  accessToken,
  onAuthNeeded,
  onSources
}: Readonly<{
  accessToken?: string;
  onAuthNeeded: () => void;
  onSources: (citations: readonly Citation[], chunks: readonly SourceChunk[]) => void;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechStartedRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const autoSendRef = useRef(false);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = 1;
    audio.src = audioUrl;
    audio.load();
    audio.play().catch(() => {
      setError("Trình duyệt chặn tự phát âm thanh. Bấm Đọc lại hoặc nút phát trên thanh audio.");
    });
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, []);

  function cleanupRecordingResources() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setVoiceLevel(0);
  }

  async function unlockAudioPlayback() {
    if (audioUnlockedRef.current || !audioRef.current) {
      return;
    }
    const audio = audioRef.current;
    const originalSource = audio.currentSrc;
    audio.muted = true;
    audio.volume = 0;
    audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    try {
      await audio.play();
      audio.pause();
      audioUnlockedRef.current = true;
    } catch {
      audioUnlockedRef.current = false;
    } finally {
      audio.muted = false;
      audio.volume = 1;
      audio.src = originalSource || audioUrl || "";
    }
  }

  function getRecorderOptions(): MediaRecorderOptions | undefined {
    const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? { mimeType } : undefined;
  }

  async function startRecording(autoSend = false) {
    setError(null);
    autoSendRef.current = autoSend;
    speechStartedRef.current = false;
    lastVoiceAtRef.current = performance.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, getRecorderOptions());
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const nextFile = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
        setFile(nextFile);
        cleanupRecordingResources();
        setRecording(false);
        if (autoSendRef.current) {
          void submitVoiceFile(nextFile);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      monitorSilence(analyser, autoSend);
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  function monitorSilence(analyser: AnalyserNode, autoSend: boolean) {
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();

    function tick() {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        total += value * value;
      }
      const rms = Math.sqrt(total / samples.length);
      setVoiceLevel(Math.min(1, rms * 8));
      const now = performance.now();

      if (rms > 0.028) {
        speechStartedRef.current = true;
        lastVoiceAtRef.current = now;
      }
      if (autoSend && speechStartedRef.current && now - lastVoiceAtRef.current > 1200) {
        stopRecording();
        return;
      }
      if (autoSend && !speechStartedRef.current && now - startedAt > 10000) {
        setError("Chưa nghe thấy giọng nói. Hãy thử lại gần micro hơn.");
        autoSendRef.current = false;
        stopRecording();
        return;
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    }

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function submitVoice() {
    if (!file) {
      setError("Chọn một tệp âm thanh trước.");
      return;
    }
    await submitVoiceFile(file);
  }

  async function submitVoiceFile(targetFile: File) {
    if (!accessToken) {
      onAuthNeeded();
      return;
    }
    setState("loading");
    setError(null);
    try {
      const result = await createVoiceClient(accessToken).query(targetFile);
      setJob(result);
      if (result.output_public_url) {
        setAudioUrl(result.output_public_url);
        setError(null);
      } else {
        setAudioUrl(null);
        setError("Backend đã trả lời nhưng chưa có file âm thanh đầu ra.");
      }
      onSources(citationsFromRecords(result.citations), chunksFromRecords(result.source_chunks));
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  async function speak() {
    if (audioUrl && audioRef.current) {
      setError(null);
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        setError("Không phát được âm thanh. Hãy dùng nút phát trên thanh audio bên dưới.");
      });
      return;
    }

    if (!accessToken) {
      onAuthNeeded();
      return;
    }
    const textToSpeak = job?.answer;
    if (!textToSpeak) {
      setError("Chưa có câu trả lời để đọc.");
      return;
    }

    setState("loading");
    setError(null);
    try {
      const result = await createVoiceClient(accessToken).textToSpeech(textToSpeak);
      setAudioUrl(result.public_url);
      setError(null);
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  const events = job?.events.length ? job.events : job ? [{ status: job.status, at: job.updated_at }] : [];

  return (
    <section className="voice-grid" aria-label="Giọng nói">
      <div className="voice-console">
        <div className={`mic-orb ${recording || state === "loading" ? "is-recording" : ""}`} aria-hidden="true">
          <Icon name="mic" />
          <span style={{ transform: `scaleX(${Math.max(0.12, voiceLevel)})` }} />
        </div>
        <h2>Trò chuyện bằng giọng nói</h2>
        <p>Bấm bắt đầu, nói câu hỏi. Khi bạn dừng, hệ thống tự gửi và đọc câu trả lời.</p>
        <div className="voice-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (recording) {
                setAssistantMode(false);
                autoSendRef.current = false;
                stopRecording();
              } else {
                setAssistantMode(true);
                void unlockAudioPlayback();
                void startRecording(true);
              }
            }}
          >
            {recording && assistantMode ? "Dừng nghe" : "Bắt đầu nói"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              if (recording) {
                stopRecording();
                return;
              }
              void unlockAudioPlayback();
              void startRecording(false);
            }}
          >
            {recording && !assistantMode ? "Dừng ghi" : "Ghi thủ công"}
          </button>
          <button className="ghost-button" type="button" onClick={submitVoice} disabled={state === "loading" || !file}>
            {state === "loading" ? "Đang xử lý" : "Gửi file"}
          </button>
        </div>
        <label className="file-drop">
          <Icon name="upload" />
          <span>{file ? file.name : "Chọn audio"}</span>
          <input accept="audio/*" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {error && <ErrorNote message={error} />}
      </div>

      <div className="voice-results">
        <StatusRail events={events} />
        <div className="transcript-card">
          <span>Nội dung nghe được</span>
          <p>{job?.transcript ?? (recording ? "Đang nghe..." : "Chưa có nội dung.")}</p>
        </div>
        <div className="answer-card">
          <h3>Câu trả lời</h3>
          <p>{job?.answer ?? "Câu trả lời sẽ xuất hiện sau khi xử lý xong."}</p>
          <div style={{ marginTop: "1rem" }}>
            <button className="ghost-button" type="button" onClick={speak} disabled={state === "loading" || !job?.answer}>
              <Icon name="play" />
              Đọc lại
            </button>
            <audio ref={audioRef} src={audioUrl || undefined} controls={Boolean(audioUrl)} preload="auto" style={{ display: audioUrl ? "block" : "none" }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ExploreWorkspace() {
  const [query, setQuery] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Destination | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createContentClient();
    client
      .listDestinations()
      .then((items) => {
        setDestinations(items);
        setSelected(items[0] ?? null);
        setState("ready");
      })
      .catch((caught) => {
        setError(toErrorMessage(caught));
        setState("error");
      });
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);
    try {
      const items = await createContentClient().search(query);
      setResults(items);
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  const visibleDestinations = query ? destinations.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) : destinations;

  return (
    <section className="explore-shell" aria-label="Khám phá">
      <form className="search-strip" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm điểm đến, món ăn, khách sạn..." />
        <button className="primary-button" type="submit">
          Tìm
        </button>
      </form>
      {error && <ErrorNote message={error} />}
      <div className="explore-grid">
        <div className="destination-list">
          {state === "loading" && <LoadingRows />}
          {state !== "loading" && visibleDestinations.length === 0 && <EmptyState title="Chưa có điểm đến" text="Seed hoặc import dữ liệu để danh sách xuất hiện." />}
          {visibleDestinations.map((destination) => (
            <button
              key={destination.id}
              className={`destination-row ${selected?.id === destination.id ? "is-active" : ""}`}
              type="button"
              onClick={() => setSelected(destination)}
            >
              <span>{destination.region ?? "Việt Nam"}</span>
              <strong>{destination.name}</strong>
              <small>{destination.summary}</small>
            </button>
          ))}
        </div>
        <div className="map-panel">
          <RouteCanvas destinations={visibleDestinations} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="detail-panel">
          {selected ? (
            <>
              <span>{selected.region ?? "Điểm đến"}</span>
              <h2>{selected.name}</h2>
              <p>{selected.description ?? selected.summary}</p>
              <dl>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{selected.status}</dd>
                </div>
                <div>
                  <dt>Tọa độ</dt>
                  <dd>
                    {selected.latitude ?? "--"}, {selected.longitude ?? "--"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState title="Chọn một điểm đến" text="Thông tin chi tiết sẽ hiện ở đây." />
          )}
          {results.length > 0 && (
            <div className="search-results">
              <h3>Kết quả tìm kiếm</h3>
              {results.map((item) => (
                <article key={`${item.type}-${item.slug}`}>
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function TripsWorkspace({ accessToken, onAuthNeeded }: Readonly<{ accessToken?: string; onAuthNeeded: () => void }>) {
  const [items, setItems] = useState<SavedItinerary[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let active = true;

    async function loadTrips() {
      setState("loading");
      try {
        const result = await createItineraryClient(accessToken).list();
        if (!active) {
          return;
        }
        setItems(result);
        setState("ready");
      } catch (caught) {
        if (!active) {
          return;
        }
        setError(toErrorMessage(caught));
        setState("error");
      }
    }

    void loadTrips();
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!accessToken) {
    return <AuthRequired title="Đăng nhập để xem chuyến đi đã lưu" onAuthNeeded={onAuthNeeded} />;
  }

  return (
    <section className="trips-shell" aria-label="Chuyến đi đã lưu">
      <div className="panel-head">
        <div>
          <h2>Chuyến đi đã lưu</h2>
          <p>Các lịch trình được tạo từ hệ thống.</p>
        </div>
        <span className="state-pill">{items.length} chuyến</span>
      </div>
      {state === "loading" && <LoadingRows />}
      {error && <ErrorNote message={error} />}
      {state !== "loading" && items.length === 0 && <EmptyState title="Chưa có chuyến đi" text="Tạo lịch trình mới để lưu vào tài khoản." />}
      <div className="trip-grid">
        {items.map((item) => (
          <article key={item.id} className="trip-card">
            <span>{item.destination}</span>
            <h3>{item.title}</h3>
            <p>
              {item.days} ngày · {item.citations.length} nguồn · {new Date(item.created_at).toLocaleDateString("vi-VN")}
            </p>
            <div className="mini-days">
              {item.plan_json.days.map((day) => (
                <small key={day.day}>Ngày {day.day}</small>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminWorkspace({
  accessToken,
  userRole,
  onAuthNeeded
}: Readonly<{ accessToken?: string; userRole: string | null; onAuthNeeded: () => void }>) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [store, setStore] = useState<AdminStore>(seedAdminStore);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("7 ngày");
  const [draft, setDraft] = useState<Omit<CmsRecord, "id" | "updatedAt" | "views">>({
    title: "Cẩm nang Phú Quốc mùa hè",
    type: "Bài viết",
    owner: "editor@travel",
    status: "Nháp"
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const canUseAdmin = userRole === "editor" || userRole === "admin" || userRole === "root";

  useEffect(() => {
    setStore(readAdminStore());
    const requestedTab = new URLSearchParams(window.location.search).get("ops");
    if (isAdminTab(requestedTab)) {
      setTab(requestedTab);
    }
  }, []);

  if (!accessToken) {
    return <AuthRequired title="Đăng nhập để mở vận hành" onAuthNeeded={onAuthNeeded} />;
  }

  if (!canUseAdmin) {
    return <EmptyState title="Không đủ quyền" text="Tài khoản cần quyền editor, admin hoặc root." />;
  }

  function persist(nextStore: AdminStore) {
    setStore(nextStore);
    saveAdminStore(nextStore);
  }

  function audit(action: string, target: string, severity: AdminAuditEntry["severity"] = "info") {
    const entry: AdminAuditEntry = {
      id: `audit-${crypto.randomUUID()}`,
      action,
      actor: userRole ?? "admin",
      target,
      at: new Date().toISOString(),
      severity
    };
    persist({ ...store, audit: [entry, ...store.audit].slice(0, 80) });
  }

  function submitContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    if (editingId) {
      persist({ ...store, content: store.content.map((item) => (item.id === editingId ? { ...item, ...draft, updatedAt: new Date().toISOString() } : item)) });
      audit("Cập nhật nội dung quản trị", editingId);
      setEditingId(null);
      return;
    }
    const record: CmsRecord = {
      id: `cms-${crypto.randomUUID()}`,
      ...draft,
      updatedAt: new Date().toISOString(),
      views: Math.floor(2800 + Math.random() * 18000)
    };
    persist({ ...store, content: [record, ...store.content] });
    audit("Tạo nội dung quản trị", record.id);
  }

  function editContent(item: CmsRecord) {
    setEditingId(item.id);
    setDraft({ title: item.title, type: item.type, owner: item.owner, status: item.status });
    setTab("cms");
  }

  function deleteContent(id: string) {
    persist({ ...store, content: store.content.filter((item) => item.id !== id) });
    audit("Xóa nội dung quản trị", id, "warning");
  }

  function resetFakeData() {
    persist(seedAdminStore);
    setDraft({ title: "Cẩm nang Phú Quốc mùa hè", type: "Bài viết", owner: "editor@travel", status: "Nháp" });
    setEditingId(null);
  }

  const queryText = query.trim().toLowerCase();
  const periodDays = filterToDays(filter);
  const visibleContent = store.content.filter((item) => `${item.title} ${item.type} ${item.status} ${item.owner}`.toLowerCase().includes(queryText));
  const visibleLogs = opsControlLogs.filter((log) => {
    const matchesQuery = !queryText || `${log.kind} ${log.title} ${log.detail} ${log.region} ${log.metric} ${log.status} ${log.sourceName}`.toLowerCase().includes(queryText);
    if (!matchesQuery) return false;
    if (!periodDays) return true;
    const ageDays = (opsReferenceTime - new Date(log.at).getTime()) / 86400000;
    return ageDays <= periodDays;
  });
  const totalViews = store.content.reduce((total, item) => total + item.views, 0);
  const overallScore = Math.round(pipelineStandards.reduce((total, item) => total + item.score, 0) / pipelineStandards.length);
  const marketChart = [
    ["Việt Nam", 215],
    ["Hà Nội", 309],
    ["Khánh Hòa", 148],
    ["Huế", 63],
    ["Hội An", 96]
  ] as const;
  const citationChart = [
    ["Có nguồn", 91],
    ["Đủ link", 84],
    ["Nguồn mới", 76],
    ["Đúng vùng", 88]
  ] as const;
  const apiLatency = [210, 188, 244, 196, 172, 226, 189, 164, 205, 181, 158, 176];
  const qaRows = [
    ["Ô trống/null", "hotel.phone", "2,8%", "Cảnh báo"],
    ["Độ lệch phân bố", "truy vấn theo vùng", "0,31 PSI", "Cảnh báo"],
    ["Logic nghiệp vụ", "số ngày <= 14", "100%", "Đạt"],
    ["Kiểm schema", "slug bài viết duy nhất", "99,7%", "Đạt"]
  ];
  const modelRows = [
    ["Độ đúng", "trả lời RAG", "88%", "+2,1%"],
    ["Bám nguồn", "citation", "91%", "Đạt"],
    ["Độ lệch gợi ý", "xếp hạng điểm đến", "0,08", "Theo dõi"],
    ["Kiểm hồi quy", "voice + planner", "42/42", "Đạt"]
  ];
  const systemRows = [
    ["REST API /health", "99,98%", "164 ms", "Đạt"],
    ["Hàng đợi Redis", "1,2k tác vụ", "0 lỗi", "Đạt"],
    ["Cảnh báo lệch RAG", "0,31 PSI", "cảnh báo", "Theo dõi"],
    ["Cảnh báo Grafana", "CPU p95 63%", "RAM 71%", "Đạt"]
  ];
  const platformRows = [
    ["Ứng dụng web", "Next.js", "Vercel", "API thật"],
    ["Ứng dụng di động", "React Native", "Nguyên mẫu", "API sẵn"],
    ["Tích hợp API", "REST/GraphQL", "Render", "Ổn định"],
    ["PWA", "Next.js", "Đang lên kế hoạch", "Lưu lịch trình offline"]
  ];

  return (
    <section className="admin-shell" aria-label="Vận hành">
      <header className="ops-header">
        <div>
          <span>Bảng điều khiển TravelAssistant</span>
          <h1>Trung tâm vận hành</h1>
        </div>
        <div className="ops-filters">
          <span>Nhật ký điều khiển</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>24 giờ</option>
            <option>7 ngày</option>
            <option>30 ngày</option>
            <option>Quý này</option>
            <option>Tất cả</option>
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lọc theo vùng, nguồn, trạng thái..." />
        </div>
      </header>

      <nav className="ops-tabs" aria-label="Trang vận hành">
        {[
          ["dashboard", "Tổng quan"],
          ["standards", "Tiêu chuẩn"],
          ["bi", "Phân tích"],
          ["cms", "Nội dung"],
          ["dataQa", "Kiểm dữ liệu"],
          ["modelQa", "Kiểm AI"],
          ["monitoring", "Giám sát"],
          ["platforms", "Nền tảng"],
          ["audit", "Nhật ký"]
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "is-active" : ""} type="button" onClick={() => setTab(id as AdminTab)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="ops-page">
        {tab === "dashboard" && (
          <>
            <div className="ops-kpis">
              <Metric label="Điểm tin cậy" value={`${overallScore}/100`} />
              <Metric label="Nguồn du lịch" value={String(travelSignals.length)} />
              <Metric label="Có nguồn RAG" value="91%" />
              <Metric label="P95 giọng nói" value="4,8s" />
              <Metric label="Log lọc được" value={String(visibleLogs.length)} />
            </div>
            <div className="ops-dashboard-grid">
              <OpsControlLogPanel logs={visibleLogs} />
              <OpsOverallScore score={overallScore} totalViews={totalViews} />
              <OpsColumnChart title="Tín hiệu thị trường theo điểm đến" items={marketChart} unit="x100 nghìn" />
            </div>
          </>
        )}

        {tab === "standards" && (
          <>
            <div className="ops-overview standards-summary">
              <OpsTable title="Tiêu chí đánh giá đúng cho TravelAssistant" rows={overallCriteriaRows} />
            </div>
            <div className="ops-standard-grid standards-page">
              {pipelineStandards.map((item) => (
                <OpsPipelineCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        {tab === "bi" && (
          <div className="ops-visual-grid bi-board">
            <OpsColumnChart title="Nhu cầu theo điểm đến" items={marketChart} unit="x100 nghìn" />
            <OpsBarChart title="Chất lượng nguồn RAG" items={citationChart} unit="%" />
            <OpsDonut title="Tình trạng nguồn" value={91} label="Có nguồn" restLabel="Cần bổ sung" />
            <OpsFunnel title="Phễu tạo lịch trình" steps={[["Hỏi đáp", 8200], ["Mở lịch trình", 3180], ["Tạo lịch trình", 1420], ["Lưu", 980]]} />
            <OpsTable title="Phân rã theo nhu cầu" rows={[["Gia đình", "Miền Trung", "42%", "Tăng"], ["Di sản", "Huế/Hội An", "63%", "Ổn"], ["Biển đảo", "Khánh Hòa", "28%", "Cần nguồn"]]} />
            {travelSignals.map((signal) => (
              <OpsSourceSignal key={signal.label} signal={signal} />
            ))}
          </div>
        )}

        {tab === "cms" && (
          <div className="cms-board">
            <form className="cms-editor" onSubmit={submitContent}>
              <h2>{editingId ? "Sửa nội dung" : "Tạo nội dung"}</h2>
              <label>
                <span>Tiêu đề</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <div className="form-pair">
                <label>
                  <span>Loại</span>
                  <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CmsRecord["type"] })}>
                    <option>Điểm đến</option>
                    <option>Bài viết</option>
                    <option>Khách sạn</option>
                    <option>Món ăn</option>
                  </select>
                </label>
                <label>
                  <span>Trạng thái</span>
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CmsRecord["status"] })}>
                    <option>Nháp</option>
                    <option>Đang duyệt</option>
                    <option>Đã xuất bản</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Người phụ trách</span>
                <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
              </label>
              <button className="primary-button wide" type="submit">{editingId ? "Lưu thay đổi" : "Tạo bản ghi"}</button>
              <button className="ghost-button wide" type="button" onClick={resetFakeData}>Khôi phục dữ liệu nguồn</button>
            </form>

            <div className="cms-list">
              <div className="ops-section-head">
                <h2>Quản trị nội dung</h2>
                <p>Tạo, xem, sửa, xóa dữ liệu; phân quyền; cấu hình hệ thống; mô phỏng CMS tùy biến/Strapi/WordPress.</p>
              </div>
              {visibleContent.map((item) => (
                <article key={item.id} className="cms-row">
                  <div>
                    <span>{item.type}</span>
                    <strong>{item.title}</strong>
                    <p>{item.owner} · {new Date(item.updatedAt).toLocaleString("vi-VN")} · {Intl.NumberFormat("vi-VN").format(item.views)} lượt xem</p>
                  </div>
                  <span className={`workflow-status ${item.status === "Đã xuất bản" ? "published" : item.status === "Đang duyệt" ? "review" : "draft"}`}>{item.status}</span>
                  <button type="button" onClick={() => editContent(item)}>Sửa</button>
                  <button type="button" onClick={() => deleteContent(item.id)}>Xóa</button>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "dataQa" && (
          <div className="qa-board">
            <OpsTable title="Kiểm dữ liệu" rows={qaRows} />
            <OpsBarChart title="Ô trống/null theo bảng" items={[["điểm đến", 2], ["khách sạn", 8], ["bài viết", 1], ["hình ảnh", 4]]} unit="lỗi" />
            <OpsDonut title="Luật nghiệp vụ đạt" value={96} label="Đạt" restLabel="Cần sửa" />
            <OpsColumnChart title="Độ lệch nguồn theo tuần" items={[["T2", 8], ["T3", 11], ["T4", 13], ["T5", 22], ["T6", 31], ["T7", 24], ["CN", 18]]} unit="PSI x100" />
          </div>
        )}

        {tab === "modelQa" && (
          <div className="qa-board">
            <OpsTable title="Kiểm AI" rows={modelRows} />
            <OpsColumnChart title="Độ đúng theo bộ câu hỏi" items={[["Hà Nội", 86], ["Huế", 84], ["Hội An", 88], ["Khánh Hòa", 82], ["Đà Nẵng", 89]]} unit="%" />
            <OpsBarChart title="Bộ kiểm hồi quy" items={[["RAG", 42], ["Giọng nói", 38], ["Lịch trình", 51], ["Nội dung", 27]]} unit="test" />
            <OpsDonut title="Độ công bằng gợi ý" value={92} label="Ổn" restLabel="Theo dõi" />
          </div>
        )}

        {tab === "monitoring" && (
          <div className="qa-board">
            <OpsTable title="Kiểm hệ thống + giám sát" rows={systemRows} />
            <OpsColumnChart title="Độ trễ API p95" items={apiLatency.slice(0, 8).map((value, index) => [`${index + 1}h`, value] as const)} unit="ms" />
            <OpsBarChart title="Endpoint REST" items={[["/health", 99], ["/chat", 96], ["/voice", 92], ["/rag", 89], ["/cms", 95]]} unit="%" />
            <OpsDonut title="Cảnh báo Grafana" value={94} label="Ổn" restLabel="Cảnh báo" />
          </div>
        )}

        {tab === "platforms" && (
          <div className="qa-board">
            <OpsTable title="Đa nền tảng" rows={platformRows} />
            <OpsBarChart title="Độ phủ tích hợp API" items={[["REST", 92], ["GraphQL", 38], ["PWA", 55], ["Di động", 47]]} unit="%" />
            <OpsDonut title="Web/mobile nối API" value={88} label="Đã nối" restLabel="Còn thiếu" />
            <OpsColumnChart title="Mức sẵn sàng PWA" items={[["cache", 72], ["offline", 55], ["push", 22], ["install", 64]]} unit="%" />
          </div>
        )}

        {tab === "audit" && (
          <div className="audit-panel ops-audit">
            {[...store.audit, ...visibleLogs.map((log) => ({ id: log.id, severity: log.status === "Cần xử lý" ? "critical" as const : log.status === "Theo dõi" ? "warning" as const : "info" as const, at: log.at, action: log.title, actor: log.kind, target: log.region }))].map((log) => (
              <article key={log.id} className={log.severity}>
                <span>{new Date(log.at).toLocaleString("vi-VN")}</span>
                <strong>{log.action}</strong>
                <p>{log.actor} · {log.target}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OpsSourceSignal({ signal }: Readonly<{ signal: TravelSignal }>) {
  return (
    <article className="signal-card">
      <span>{signal.sourceName}</span>
      <strong>{signal.value}</strong>
      <h3>{signal.label}</h3>
      <p>{signal.detail}</p>
      <a href={signal.sourceUrl} target="_blank" rel="noreferrer">Mở nguồn</a>
    </article>
  );
}

function OpsControlLogPanel({ logs }: Readonly<{ logs: readonly OpsLogEntry[] }>) {
  return (
    <article className="ops-card ops-table-card ops-log-card">
      <h3>Log điều khiển theo bộ lọc</h3>
      {logs.length === 0 ? (
        <p className="muted-line">Không có log khớp bộ lọc.</p>
      ) : (
        <div className="ops-log-list">
          {logs.map((log) => (
            <article key={log.id} className={log.status === "Cần xử lý" ? "risk" : log.status === "Theo dõi" ? "watch" : "pass"}>
              <div>
                <span>{new Date(log.at).toLocaleString("vi-VN")} · {log.kind}</span>
                <strong>{log.title}</strong>
                <p>{log.detail}</p>
              </div>
              <div>
                <b>{log.region}</b>
                <small>{log.metric}</small>
                {log.sourceUrl ? <a href={log.sourceUrl} target="_blank" rel="noreferrer">{log.sourceName}</a> : <small>{log.sourceName}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

function OpsColumnChart({ title, items, unit }: Readonly<{ title: string; items: ReadonlyArray<readonly [string, number]>; unit?: string }>) {
  const max = Math.max(...items.map((item) => item[1]), 1);
  return (
    <article className="ops-card column-card">
      <h3>{title}</h3>
      <div className="column-chart">
        {items.map(([label, value]) => (
          <div key={`${title}-${label}`}>
            <strong>{value}</strong>
            <i style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      {unit && <p className="chart-note">Đơn vị: {unit}</p>}
    </article>
  );
}

function OpsOverallScore({ score, totalViews }: Readonly<{ score: number; totalViews: number }>) {
  return (
    <article className="ops-score-card">
      <div>
        <span>Chuẩn tổng thể</span>
        <h2>{score}/100</h2>
        <p>Đánh giá theo dữ liệu, AI/model, hệ thống, sản phẩm và deploy. Mục tiêu: dễ kiểm thử, dễ giám sát, dễ sửa data.</p>
      </div>
      <div className="score-meter" style={{ background: `conic-gradient(var(--teal) ${score}%, #e6efec 0)` }}>
        <strong>{score}%</strong>
      </div>
      <div className="score-foot">
        <span>{Intl.NumberFormat("vi-VN").format(totalViews)} lượt xem nội dung</span>
        <span>2 cảnh báo cần theo dõi</span>
      </div>
    </article>
  );
}

function OpsPipelineCard({ item }: Readonly<{ item: PipelineStandard }>) {
  return (
    <article className={`pipeline-card ${item.status === "Đạt" ? "pass" : item.status === "Theo dõi" ? "watch" : "risk"}`}>
      <header>
        <div>
          <span>{item.standard}</span>
          <h3>{item.label}</h3>
        </div>
        <strong>{item.score}</strong>
      </header>
      <p>{item.target}</p>
      <div className="criteria-chips">
        {item.criteria.map((criterion) => (
          <span key={criterion}>{criterion}</span>
        ))}
      </div>
      <ul>
        {item.evidence.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <footer>
        <span>{item.status}</span>
        <p>{item.nextAction}</p>
      </footer>
    </article>
  );
}

function OpsBarChart({ title, items, unit }: Readonly<{ title: string; items: ReadonlyArray<readonly [string, number]>; unit?: string }>) {
  const max = Math.max(...items.map((item) => item[1]), 1);
  return (
    <article className="ops-card">
      <h3>{title}</h3>
      <div className="bar-list">
        {items.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <i style={{ width: `${(value / max) * 100}%` }} />
            <strong>{value}{unit ? ` ${unit}` : ""}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OpsDonut({ title, value, label, restLabel }: Readonly<{ title: string; value: number; label: string; restLabel: string }>) {
  const rest = Math.max(0, 100 - value);
  return (
    <article className="ops-card donut-card">
      <h3>{title}</h3>
      <div className="donut" style={{ background: `conic-gradient(var(--teal) 0 ${value}%, var(--amber) ${value}% ${Math.min(100, value + rest)}%)` }}>
        <strong>{value}%</strong>
      </div>
      <div className="donut-legend">
        <span><i />{label}: {value}%</span>
        <span><i />{restLabel}: {rest}%</span>
      </div>
    </article>
  );
}

function OpsHeatmap({ title }: Readonly<{ title: string }>) {
  return (
    <article className="ops-card">
      <h3>{title}</h3>
      <div className="heatmap">
        {Array.from({ length: 35 }).map((_, index) => (
          <span key={index} style={{ opacity: 0.25 + ((index * 17) % 70) / 100 }} />
        ))}
      </div>
    </article>
  );
}

function OpsFunnel({ title, steps }: Readonly<{ title: string; steps: ReadonlyArray<readonly [string, number]> }>) {
  const max = Math.max(...steps.map((step) => step[1]), 1);
  return (
    <article className="ops-card">
      <h3>{title}</h3>
      <div className="funnel">
        {steps.map(([label, value]) => (
          <div key={label} style={{ width: `${Math.max(28, (value / max) * 100)}%` }}>
            <span>{label}</span>
            <strong>{Intl.NumberFormat("vi-VN").format(value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OpsTable({ title, rows }: Readonly<{ title: string; rows: readonly (readonly string[])[] }>) {
  return (
    <article className="ops-card ops-table-card">
      <h3>{title}</h3>
      <div className="ops-table">
        {rows.map((row) => (
          <div key={row.join("-")}>
            {row.map((cell) => (
              <span key={cell}>{cell}</span>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function AuthWorkspace({
  session,
  onSessionChange
}: Readonly<{ session: AuthSession | null; onSessionChange: (session: AuthSession | null) => void }>) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const isGate = session === null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);
    try {
      const client = createAuthClient();
      const tokens =
        mode === "login"
          ? await client.login({ email, password })
          : await client.register({ email, password, display_name: email.split("@")[0] ?? "Traveler" });
      onSessionChange(saveSession(tokens));
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  if (isGate) {
    return (
      <section className="login-gate" aria-label="Đăng nhập TravelAssistant">
        <div className="login-visual">
          <div className="login-brand" aria-label="TravelAssistant">
            <TravelLogo />
            <strong>TravelAssistant</strong>
          </div>
          <div className="login-copy">
            <h1>Trợ lý du lịch của bạn</h1>
            <p>Đăng nhập để hỏi bằng giọng nói, tạo lịch trình và lưu chuyến đi với nguồn tham khảo rõ ràng.</p>
          </div>
          <div className="login-proof" aria-label="Tính năng chính">
            <span>Voice</span>
            <span>Lịch trình</span>
            <span>Nguồn dẫn</span>
          </div>
        </div>

        <form className="login-card-panel" onSubmit={submit}>
          <div className="segmented">
            <button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>
              Đăng nhập
            </button>
            <button className={mode === "register" ? "is-active" : ""} type="button" onClick={() => setMode("register")}>
              Tạo tài khoản
            </button>
          </div>
          <div>
            <h2>{mode === "login" ? "Chào mừng quay lại" : "Tạo tài khoản mới"}</h2>
            <p>{mode === "login" ? "Tiếp tục chuyến đi đang lưu." : "Tạo tài khoản user để bắt đầu dùng trợ lý."}</p>
          </div>
          <label>
            <span>Email</span>
            <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            <span>Mật khẩu</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              required
            />
          </label>
          <button className="primary-button wide" type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Đang xử lý" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
          {error && <ErrorNote message={error} />}
        </form>
      </section>
    );
  }

  return (
    <section className="auth-shell" aria-label="Tài khoản">
      <form className="auth-panel" onSubmit={submit}>
        <div className="segmented">
          <button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>
            Đăng nhập
          </button>
          <button className={mode === "register" ? "is-active" : ""} type="button" onClick={() => setMode("register")}>
            Tạo tài khoản
          </button>
        </div>
        <h2>{session ? session.user.email : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
        <label>
          <span>Email</span>
          <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary-button wide" type="submit" disabled={state === "loading"}>
          {state === "loading" ? "Đang xử lý" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        </button>
        {session && (
          <button
            className="ghost-button wide"
            type="button"
            onClick={() => {
              clearSession();
              onSessionChange(null);
            }}
          >
            <Icon name="logout" />
            Đăng xuất
          </button>
        )}
        {error && <ErrorNote message={error} />}
      </form>
      <div className="account-summary">
        <h2>Trạng thái</h2>
        <dl>
          <div>
            <dt>Tài khoản</dt>
            <dd>{session ? session.user.email : "Chưa đăng nhập"}</dd>
          </div>
          <div>
            <dt>Vai trò</dt>
            <dd>{session?.user.role ?? "--"}</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>{session ? "Đang lưu trong trình duyệt" : "--"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function SourceDrawer({
  open,
  citations,
  chunks,
  showScores,
  onClose
}: Readonly<{
  open: boolean;
  citations: readonly Citation[];
  chunks: readonly SourceChunk[];
  showScores: boolean;
  onClose: () => void;
}>) {
  return (
    <aside className={`source-drawer ${open ? "is-open" : ""}`} aria-label="Nguồn">
      <div className="drawer-head">
        <div>
          <span>Nguồn</span>
          <h2>{citations.length} nguồn</h2>
        </div>
        <button className="drawer-close" type="button" onClick={onClose}>
          Đóng
        </button>
      </div>
      {citations.length === 0 && chunks.length === 0 && <EmptyState title="Chưa có nguồn" text="Nguồn sẽ xuất hiện sau khi hỏi hoặc gửi giọng nói." />}
      <div className="source-list">
        {citations.map((citation) => (
          <article key={`${citation.id}-${citation.source_id}`}>
            <span>#{citation.id}</span>
            <strong>{citation.title}</strong>
            <p>{citation.heading_path?.join(" / ") ?? citation.source_type}</p>
            {citation.url && (
              <a href={citation.url} target="_blank" rel="noreferrer">
                Mở trang nguồn
              </a>
            )}
            {showScores && <small>điểm {citation.score.toFixed(3)}</small>}
          </article>
        ))}
        {chunks.slice(0, 4).map((chunk) => (
          <article key={chunk.chunk_id}>
            <span>chunk</span>
            <strong>{chunk.chunk_id}</strong>
            <p>{chunk.content}</p>
            {showScores && <small>điểm {chunk.score.toFixed(3)}</small>}
          </article>
        ))}
      </div>
    </aside>
  );
}

function StatusRail({ events }: Readonly<{ events: ReadonlyArray<{ status: string; at: string; message?: string }> }>) {
  if (events.length === 0) {
    return <EmptyState title="Chưa có trạng thái" text="Gửi audio để xem tiến trình xử lý." />;
  }

  return (
    <ol className="status-rail">
      {events.map((event, index) => (
        <li key={`${event.status}-${event.at}-${index}`}>
          <span>{index + 1}</span>
          <div>
            <strong>{vietnameseStatus[event.status] ?? event.status}</strong>
            <small>{new Date(event.at).toLocaleTimeString("vi-VN")}</small>
            {event.message && <p>{event.message}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RouteCanvas({
  destinations,
  selected,
  onSelect
}: Readonly<{ destinations: readonly Destination[]; selected: Destination | null; onSelect: (destination: Destination) => void }>) {
  return (
    <div className="route-canvas" aria-label="Bản đồ tóm tắt">
      <div className="route-line" aria-hidden="true" />
      {destinations.slice(0, 5).map((destination, index) => (
        <button
          key={destination.id}
          className={`map-pin pin-${index + 1} ${selected?.id === destination.id ? "is-active" : ""}`}
          type="button"
          onClick={() => onSelect(destination)}
        >
          {destination.name}
        </button>
      ))}
    </div>
  );
}

function LoadingRoute() {
  return (
    <div className="loading-route" aria-label="Đang tạo lịch trình">
      <span />
      <span />
      <span />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-rows" aria-label="Đang tải">
      <span />
      <span />
      <span />
    </div>
  );
}

function AuthRequired({ title, onAuthNeeded }: Readonly<{ title: string; onAuthNeeded: () => void }>) {
  return (
    <div className="auth-required">
      <h2>{title}</h2>
      <p>Phiên đăng nhập giúp mở tính năng cần quyền và lưu dữ liệu vào tài khoản.</p>
      <button className="primary-button" type="button" onClick={onAuthNeeded}>
        Đăng nhập
      </button>
    </div>
  );
}

function EmptyState({ title, text }: Readonly<{ title: string; text: string }>) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ErrorNote({ message }: Readonly<{ message: string }>) {
  return <p className="inline-error">{message}</p>;
}

function ConnectionPill({ active }: Readonly<{ active: boolean }>) {
  return <span className={`state-pill ${active ? "live" : "locked"}`}>{active ? "Đã kết nối" : "Cần đăng nhập"}</span>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BIBlock({ title, rows }: Readonly<{ title: string; rows: readonly string[] }>) {
  return (
    <article className="bi-block">
      <h3>{title}</h3>
      {rows.length === 0 ? <p>Chưa có dữ liệu</p> : rows.map((row) => <p key={row}>{row}</p>)}
    </article>
  );
}

function sumMetrics(items: ReadonlyArray<{ count: number }>): string {
  return String(items.reduce((total, item) => total + item.count, 0));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Không thể gọi hệ thống.";
}

function citationsFromRecords(records: Record<string, unknown>[]): Citation[] {
  return records.map((record, index) => ({
    id: typeof record.id === "number" ? record.id : index + 1,
    source_type: String(record.source_type ?? "voice"),
    source_id: String(record.source_id ?? record.chunk_id ?? index),
    title: String(record.title ?? record.source_id ?? "Nguồn"),
    url: typeof record.url === "string" ? record.url : null,
    heading_path: Array.isArray(record.heading_path) ? record.heading_path.map(String) : null,
    score: typeof record.score === "number" ? record.score : 0
  }));
}

function chunksFromRecords(records: Record<string, unknown>[]): SourceChunk[] {
  return records.map((record, index) => ({
    chunk_id: String(record.chunk_id ?? index),
    content: String(record.content ?? record.text ?? ""),
    score: typeof record.score === "number" ? record.score : 0,
    source: typeof record.source === "object" && record.source !== null ? (record.source as Record<string, unknown>) : {}
  }));
}

function Icon({ name }: Readonly<{ name: IconName }>) {
  const paths: Record<IconName, React.ReactNode> = {
    message: (
      <>
        <path d="M5 6.5h14v9H9l-4 3v-12Z" />
        <path d="M8 10h8M8 13h5" />
      </>
    ),
    mic: (
      <>
        <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    route: (
      <>
        <path d="M5 18c4-8 10 1 14-8" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="10" r="2" />
      </>
    ),
    map: (
      <>
        <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
    bag: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>
    ),
    chart: (
      <>
        <path d="M5 19V5M5 19h14" />
        <path d="M8 15v-4M12 15V8M16 15v-6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    send: (
      <>
        <path d="m4 12 16-8-6 16-3-7-7-1Z" />
        <path d="m11 13 4-4" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z" />
        <path d="M5 4v3M3.5 5.5h3M19 17v3M17.5 18.5h3" />
      </>
    ),
    source: (
      <>
        <path d="M7 4h7l3 3v13H7V4Z" />
        <path d="M14 4v4h4M9 12h6M9 16h6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 18v2h14v-2" />
      </>
    ),
    play: <path d="M8 5v14l11-7-11-7Z" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </>
    ),
    thumbUp: (
      <>
        <path d="M7 10v10H4V10h3Z" />
        <path d="M7 10l4-7 1.7 1.2a2 2 0 0 1 .7 2.2L12.5 9H19a2 2 0 0 1 2 2.2l-.8 6A3 3 0 0 1 17.2 20H7" />
      </>
    ),
    thumbDown: (
      <>
        <path d="M7 14V4H4v10h3Z" />
        <path d="M7 14l4 7 1.7-1.2a2 2 0 0 0 .7-2.2L12.5 15H19a2 2 0 0 0 2-2.2l-.8-6A3 3 0 0 0 17.2 4H7" />
      </>
    ),
    pin: (
      <>
        <path d="m15 4 5 5-3 1-4 4 .5 4.5L11 16l-4 4 4-4-2.5-2.5L13 13l4-4 1-3Z" />
      </>
    ),
    wave: (
      <>
        <path d="M4 13c1.8-3.8 4.2-3.8 6 0s4.2 3.8 6 0 3.2-3.8 4 0" />
        <path d="M4 17c1.8-3.8 4.2-3.8 6 0s4.2 3.8 6 0 3.2-3.8 4 0" />
      </>
    ),
    close: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H6v14h4" />
        <path d="M14 8l4 4-4 4M18 12H9" />
      </>
    )
  };

  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}


