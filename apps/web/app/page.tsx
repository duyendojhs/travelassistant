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
const ADMIN_STORE_KEY = "travelassistant.admin.console.v1";

const seedAdminStore: AdminStore = {
  content: [
    { id: "cms-1", title: "Ăn tối ở Hội An", type: "Bài viết", owner: "editor@travel", status: "Đã xuất bản", updatedAt: "2026-05-20T02:10:00.000Z", views: 18420 },
    { id: "cms-2", title: "Lịch trình Đà Nẵng 3 ngày", type: "Điểm đến", owner: "admin@travel", status: "Đang duyệt", updatedAt: "2026-05-19T10:25:00.000Z", views: 12100 },
    { id: "cms-3", title: "Khách sạn gần biển Mỹ Khê", type: "Khách sạn", owner: "ops@travel", status: "Nháp", updatedAt: "2026-05-18T06:45:00.000Z", views: 7350 },
    { id: "cms-4", title: "Bún bò Huế cho khách lần đầu", type: "Món ăn", owner: "editor@travel", status: "Đã xuất bản", updatedAt: "2026-05-17T04:20:00.000Z", views: 9680 }
  ],
  audit: [
    { id: "audit-1", action: "Regression test trước deploy", actor: "ci-bot", target: "travelassistant-api", at: "2026-05-20T03:30:00.000Z", severity: "info" },
    { id: "audit-2", action: "Phát hiện null trong hotel.phone", actor: "data-qa", target: "hotel_dataset", at: "2026-05-20T02:42:00.000Z", severity: "warning" },
    { id: "audit-3", action: "Publish bài viết Hội An", actor: "editor@travel", target: "cms-1", at: "2026-05-20T02:12:00.000Z", severity: "info" },
    { id: "audit-4", action: "Drift score vượt ngưỡng", actor: "prometheus", target: "embedding_distribution", at: "2026-05-19T21:40:00.000Z", severity: "critical" }
  ]
};

const pipelineStandards: readonly PipelineStandard[] = [
  {
    id: "data",
    label: "Dữ liệu & RAG",
    score: 87,
    status: "Theo dõi",
    standard: "ISO/IEC 25012",
    target: "Độ tin cậy dữ liệu trước khi đưa vào RAG",
    criteria: ["Đầy đủ", "Chính xác", "Nhất quán", "Cập nhật", "Không trùng lặp", "Có nguồn gốc"],
    evidence: ["Null hotel.phone 2.8%", "PSI embedding 0.31", "Schema pass 99.7%"],
    nextAction: "Giảm missing value và đặt cảnh báo drift < 0.2 PSI"
  },
  {
    id: "model",
    label: "Model QA",
    score: 86,
    status: "Đạt",
    standard: "NIST AI RMF",
    target: "AI đáng tin, trả lời đúng và có kiểm soát rủi ro",
    criteria: ["Valid/reliable", "An toàn", "Bảo mật", "Minh bạch", "Giải thích được", "Fairness"],
    evidence: ["Accuracy 86.4%", "Regression 42/42", "Bias gap 0.08"],
    nextAction: "Tách benchmark du lịch Việt Nam và test citation hallucination"
  },
  {
    id: "system",
    label: "API & Hệ thống",
    score: 94,
    status: "Đạt",
    standard: "Google SRE + OWASP API",
    target: "Dịch vụ ổn định, an toàn, dễ phát hiện sự cố",
    criteria: ["Latency", "Traffic", "Errors", "Saturation", "Auth/RBAC", "Rate limit"],
    evidence: ["Uptime 99.98%", "p95 184 ms", "0 failed queue jobs"],
    nextAction: "Thêm alert cho voice p95 và kiểm tra OWASP API auth theo endpoint"
  },
  {
    id: "product",
    label: "CMS / BI / UX",
    score: 90,
    status: "Đạt",
    standard: "ISO/IEC 25010 + WCAG 2.2",
    target: "Người vận hành hiểu nhanh, sửa được dữ liệu, không lạc luồng",
    criteria: ["Phù hợp chức năng", "Usability", "Accessibility", "Security", "Maintainability", "Traceability"],
    evidence: ["CRUD local", "Audit log", "Mobile spacing pass"],
    nextAction: "Nối CRUD thật với backend khi API admin ổn định"
  },
  {
    id: "delivery",
    label: "Deploy pipeline",
    score: 82,
    status: "Theo dõi",
    standard: "DORA metrics",
    target: "Ra phiên bản nhanh nhưng không làm hỏng production",
    criteria: ["Deploy frequency", "Lead time", "Change failure rate", "Time to restore"],
    evidence: ["Render/Vercel live", "Manual deploy", "Build pass"],
    nextAction: "Ghi thời gian deploy và lỗi deploy vào audit tự động"
  }
];

const overallCriteriaRows = [
  ["Dữ liệu", "ISO/IEC 25012", "Completeness, accuracy, consistency, freshness, lineage", "87/100"],
  ["AI/model", "NIST AI RMF", "Validity, reliability, safety, explainability, fairness", "86/100"],
  ["Hệ thống", "SRE/OWASP", "Latency, traffic, errors, saturation, API security", "94/100"],
  ["Sản phẩm", "ISO 25010/WCAG", "Usability, accessibility, security, maintainability", "90/100"],
  ["Deploy", "DORA", "Frequency, lead time, failure rate, restore time", "82/100"]
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
      audit("Cập nhật nội dung CMS", editingId);
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
    audit("Tạo nội dung CMS", record.id);
  }

  function editContent(item: CmsRecord) {
    setEditingId(item.id);
    setDraft({ title: item.title, type: item.type, owner: item.owner, status: item.status });
    setTab("cms");
  }

  function deleteContent(id: string) {
    persist({ ...store, content: store.content.filter((item) => item.id !== id) });
    audit("Xóa nội dung CMS", id, "warning");
  }

  function resetFakeData() {
    persist(seedAdminStore);
    setDraft({ title: "Cẩm nang Phú Quốc mùa hè", type: "Bài viết", owner: "editor@travel", status: "Nháp" });
    setEditingId(null);
  }

  const visibleContent = store.content.filter((item) => `${item.title} ${item.type} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const totalViews = store.content.reduce((total, item) => total + item.views, 0);
  const published = store.content.filter((item) => item.status === "Đã xuất bản").length;
  const overallScore = Math.round(pipelineStandards.reduce((total, item) => total + item.score, 0) / pipelineStandards.length);
  const conversionSeries = [18, 26, 33, 29, 42, 51, 57, 63];
  const apiLatency = [210, 188, 244, 196, 172, 226, 189, 164, 205, 181, 158, 176];
  const qaRows = [
    ["Missing values/null", "hotel.phone", "2.8%", "Cảnh báo"],
    ["Distribution shift", "embedding_vector", "0.31 PSI", "Cảnh báo"],
    ["Logic nghiệp vụ", "itinerary.days <= 14", "100%", "Đạt"],
    ["Schema validate", "article.slug unique", "99.7%", "Đạt"]
  ];
  const modelRows = [
    ["Accuracy", "RAG answer", "86.4%", "+2.1%"],
    ["Overfitting", "planner prompt", "Low", "Ổn định"],
    ["Bias/fairness", "destination ranking", "0.08 gap", "Theo dõi"],
    ["Regression before deploy", "voice pipeline", "42/42", "Đạt"]
  ];
  const systemRows = [
    ["REST API /health", "99.98%", "164 ms", "Đạt"],
    ["Redis queue", "1.2k jobs", "0 failed", "Đạt"],
    ["Prometheus drift", "0.31 PSI", "warning", "Theo dõi"],
    ["Grafana alert", "CPU p95 63%", "RAM 71%", "Đạt"]
  ];
  const platformRows = [
    ["Web App", "Next.js", "Vercel", "Live API"],
    ["Mobile App", "React Native", "Prototype", "API sẵn"],
    ["API Integration", "REST/GraphQL", "Render", "Ổn định"],
    ["PWA", "Next.js", "Planned", "Offline trips"]
  ];

  return (
    <section className="admin-shell" aria-label="Vận hành">
      <header className="ops-header">
        <div>
          <span>TravelAssistant Ops</span>
          <h1>Trung tâm vận hành</h1>
        </div>
        <div className="ops-filters">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>24 giờ</option>
            <option>7 ngày</option>
            <option>30 ngày</option>
            <option>Quý này</option>
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lọc CMS, audit..." />
        </div>
      </header>

      <nav className="ops-tabs" aria-label="Trang vận hành">
        {[
          ["dashboard", "Tổng quan"],
          ["standards", "Tiêu chuẩn"],
          ["bi", "BI"],
          ["cms", "Nội dung"],
          ["dataQa", "Data QA"],
          ["modelQa", "Model QA"],
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
              <Metric label="Điểm tổng thể" value={`${overallScore}/100`} />
              <Metric label="API uptime" value="99.98%" />
              <Metric label="Latency p95" value="184 ms" />
              <Metric label="Nội dung" value={String(store.content.length)} />
              <Metric label="Đã xuất bản" value={String(published)} />
            </div>
            <div className="ops-overview">
              <OpsOverallScore score={overallScore} totalViews={totalViews} />
              <OpsTable title="Tiêu chí đánh giá tổng thể" rows={overallCriteriaRows} />
            </div>
          </>
        )}

        {tab === "standards" && (
          <div className="ops-standard-grid standards-page">
            {pipelineStandards.map((item) => (
              <OpsPipelineCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {tab === "bi" && (
          <div className="ops-visual-grid bi-board">
            <OpsLineChart title="Doanh thu/usage giả lập" values={[12, 18, 16, 28, 34, 31, 44, 52]} />
            <OpsBarChart title="Destination drill-down" items={[["Đà Nẵng", 64], ["Hội An", 53], ["Huế", 37], ["Nha Trang", 42], ["Phú Quốc", 29]]} />
            <OpsDonut title="Tỷ lệ có nguồn RAG" value={91} />
            <OpsFunnel title="Phễu tạo lịch trình" steps={[["Hỏi đáp", 8200], ["Mở planner", 3180], ["Tạo lịch trình", 1420], ["Lưu", 980]]} />
            <OpsTable title="Drill-down theo phân khúc" rows={[["Executive", "North", "42%", "Tăng"], ["Operational", "Central", "63%", "Ổn"], ["Analytical", "South", "28%", "Giảm"]]} />
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
              <button className="primary-button wide" type="submit">{editingId ? "Lưu thay đổi" : "Tạo record"}</button>
              <button className="ghost-button wide" type="button" onClick={resetFakeData}>Reset dữ liệu mẫu</button>
            </form>

            <div className="cms-list">
              <div className="ops-section-head">
                <h2>Quản trị nội dung</h2>
                <p>CRUD dữ liệu, phân quyền, cấu hình hệ thống, mô phỏng custom CMS/Strapi/WordPress.</p>
              </div>
              {visibleContent.map((item) => (
                <article key={item.id} className="cms-row">
                  <div>
                    <span>{item.type}</span>
                    <strong>{item.title}</strong>
                    <p>{item.owner} · {new Date(item.updatedAt).toLocaleString("vi-VN")} · {Intl.NumberFormat("vi-VN").format(item.views)} views</p>
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
            <OpsTable title="Data QA" rows={qaRows} />
            <OpsBarChart title="Missing/null theo bảng" items={[["places", 2], ["hotels", 8], ["articles", 1], ["images", 4]]} />
            <OpsDonut title="Business rules pass" value={96} />
            <OpsLineChart title="Distribution shift PSI" values={[8, 11, 13, 22, 31, 24, 18, 16]} />
          </div>
        )}

        {tab === "modelQa" && (
          <div className="qa-board">
            <OpsTable title="Model QA" rows={modelRows} />
            <OpsLineChart title="Accuracy theo benchmark" values={[71, 74, 76, 79, 81, 83, 86, 86]} />
            <OpsBarChart title="Regression suite" items={[["RAG", 42], ["Voice", 38], ["Planner", 51], ["CMS", 27]]} />
            <OpsDonut title="Bias/fairness pass" value={92} />
          </div>
        )}

        {tab === "monitoring" && (
          <div className="qa-board">
            <OpsTable title="System QA + Giám sát" rows={systemRows} />
            <OpsLineChart title="API latency p95" values={apiLatency.map((value) => Math.round(value / 4))} />
            <OpsBarChart title="Endpoint REST API" items={[["/health", 99], ["/chat", 96], ["/voice", 92], ["/rag", 89], ["/cms", 95]]} />
            <OpsDonut title="Grafana alert OK" value={94} />
          </div>
        )}

        {tab === "platforms" && (
          <div className="qa-board">
            <OpsTable title="Đa nền tảng" rows={platformRows} />
            <OpsBarChart title="API integration coverage" items={[["REST", 92], ["GraphQL", 38], ["PWA", 55], ["Mobile", 47]]} />
            <OpsDonut title="Web/mobile kết nối API" value={88} />
            <OpsLineChart title="PWA readiness" values={[18, 24, 33, 42, 49, 57, 64, 72]} />
          </div>
        )}

        {tab === "audit" && (
          <div className="audit-panel ops-audit">
            {store.audit.map((log) => (
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

function OpsLineChart({ title, values }: Readonly<{ title: string; values: readonly number[] }>) {
  const max = Math.max(...values, 1);
  return (
    <article className="ops-card line-card">
      <h3>{title}</h3>
      <div className="line-bars">
        {values.map((value, index) => (
          <span key={`${title}-${index}`} style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
        ))}
      </div>
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
        <span>{Intl.NumberFormat("vi-VN").format(totalViews)} lượt xem CMS</span>
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

function OpsBarChart({ title, items }: Readonly<{ title: string; items: ReadonlyArray<readonly [string, number]> }>) {
  const max = Math.max(...items.map((item) => item[1]), 1);
  return (
    <article className="ops-card">
      <h3>{title}</h3>
      <div className="bar-list">
        {items.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <i style={{ width: `${(value / max) * 100}%` }} />
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OpsDonut({ title, value }: Readonly<{ title: string; value: number }>) {
  return (
    <article className="ops-card donut-card">
      <h3>{title}</h3>
      <div className="donut" style={{ background: `conic-gradient(var(--teal) ${value}%, #edf2f0 0)` }}>
        <strong>{value}%</strong>
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


