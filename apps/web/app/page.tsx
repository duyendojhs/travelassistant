"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import type {
  AdminContentSummary,
  AdminDashboardSummary,
  AuditLog,
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

import { createAdminClient } from "../lib/admin-client";
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

function canUseOperations(role: string | null | undefined): boolean {
  return role === "editor" || role === "admin" || role === "root";
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
            {active === "plan" && <PlannerWorkspace accessToken={accessToken} onAuthNeeded={() => setActive("account")} />}
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

function PlannerWorkspace({ accessToken, onAuthNeeded }: Readonly<{ accessToken?: string; onAuthNeeded: () => void }>) {
  const [destination, setDestination] = useState("Đà Nẵng");
  const [days, setDays] = useState(3);
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState("mid-range");
  const [interests, setInterests] = useState("biển, ẩm thực, gia đình");
  const [itinerary, setItinerary] = useState<SavedItinerary | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

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
      setState("ready");
    } catch (caught) {
      setError(toErrorMessage(caught));
      setState("error");
    }
  }

  return (
    <section className="planner-grid" aria-label="Tạo lịch trình">
      <form className="planner-form" onSubmit={generate}>
        <div className="panel-head">
          <div>
            <h2>Tạo lịch trình</h2>
            <p>Nhập vài thông tin chính, hệ thống sẽ tạo và lưu chuyến đi.</p>
          </div>
          <ConnectionPill active={Boolean(accessToken)} />
        </div>

        <label>
          <span>Điểm đến</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} />
        </label>
        <div className="form-pair">
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
        <label>
          <span>Sở thích</span>
          <input value={interests} onChange={(event) => setInterests(event.target.value)} />
        </label>
        <button className="primary-button wide" type="submit" disabled={state === "loading"}>
          <Icon name="spark" />
          {state === "loading" ? "Đang tạo" : "Tạo lịch trình"}
        </button>
        {error && <ErrorNote message={error} />}
      </form>

      <div className="timeline-panel">
        {!itinerary && state !== "loading" && (
          <EmptyState title="Chưa có lịch trình" text="Kết quả thật sẽ xuất hiện ở đây sau khi tạo." />
        )}
        {state === "loading" && <LoadingRoute />}
        {itinerary && (
          <>
            <div className="timeline-head">
              <div>
                <h2>{itinerary.plan_json.title}</h2>
                <p>
                  {itinerary.destination} · {itinerary.days} ngày · {itinerary.citations.length} nguồn
                </p>
              </div>
              <span className="state-pill">Đã lưu</span>
            </div>
            <div className="timeline-list">
              {itinerary.plan_json.days.map((day) => (
                <article key={day.day} className="day-card">
                  <span>Ngày {day.day}</span>
                  <h3>{day.theme}</h3>
                  {day.blocks.map((block) => (
                    <div key={`${day.day}-${block.time}-${block.title}`} className="time-block">
                      <strong>{block.time}</strong>
                      <div>
                        <h4>{block.title}</h4>
                        <p>{block.description}</p>
                        <small>{block.route_hint}</small>
                      </div>
                    </div>
                  ))}
                </article>
              ))}
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
  const [tab, setTab] = useState<"dashboard" | "content" | "audit">("dashboard");
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [summary, setSummary] = useState<AdminContentSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const canUseAdmin = userRole === "editor" || userRole === "admin" || userRole === "root";

  useEffect(() => {
    if (!accessToken || !canUseAdmin) {
      return;
    }
    const client = createAdminClient(accessToken);
    let active = true;

    async function loadAdmin() {
      setState("loading");
      try {
        const [nextDashboard, nextSummary, nextAudit, nextDestinations] = await Promise.all([
          client.dashboard(),
          client.contentSummary(),
          client.auditLogs(30),
          client.listDestinations()
        ]);
        if (!active) {
          return;
        }
        setDashboard(nextDashboard);
        setSummary(nextSummary);
        setAuditLogs(nextAudit);
        setDestinations(nextDestinations);
        setState("ready");
      } catch (caught) {
        if (!active) {
          return;
        }
        setError(toErrorMessage(caught));
        setState("error");
      }
    }

    void loadAdmin();
    return () => {
      active = false;
    };
  }, [accessToken, canUseAdmin]);

  if (!accessToken) {
    return <AuthRequired title="Đăng nhập để mở vận hành" onAuthNeeded={onAuthNeeded} />;
  }

  if (!canUseAdmin) {
    return <EmptyState title="Không đủ quyền" text="Tài khoản cần quyền editor, admin hoặc root." />;
  }

  return (
    <section className="admin-shell" aria-label="Vận hành">
      <div className="panel-head">
        <div>
          <h2>Vận hành</h2>
          <p>Dữ liệu lấy trực tiếp từ hệ thống.</p>
        </div>
        <div className="segmented">
          {[
            ["dashboard", "BI"],
            ["content", "Nội dung"],
            ["audit", "Audit"]
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "is-active" : ""} type="button" onClick={() => setTab(id as "dashboard" | "content" | "audit")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {state === "loading" && <LoadingRows />}
      {error && <ErrorNote message={error} />}
      {tab === "dashboard" && dashboard && (
        <>
          <div className="admin-metrics">
            {dashboard.metrics.map((metric) => (
              <Metric key={metric.label} label={metric.label} value={`${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`} />
            ))}
          </div>
          <div className="bi-grid">
            <BIBlock title="Điểm đến" rows={dashboard.top_destinations.map((item) => `${item.key}: ${item.count}`)} />
            <BIBlock title="Intent" rows={dashboard.top_intents.map((item) => `${item.key}: ${item.count}`)} />
            <BIBlock title="RAG" rows={dashboard.rag_quality.map((item) => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`)} />
            <BIBlock title="Chi phí" rows={dashboard.cost_latency.map((item) => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`)} />
          </div>
        </>
      )}
      {tab === "content" && (
        <div className="content-admin">
          {summary && (
            <div className="summary-strip">
              <Metric label="Tags" value={String(summary.tag_count)} />
              <Metric label="Destinations" value={sumMetrics(summary.destinations_by_status)} />
              <Metric label="Places" value={sumMetrics(summary.places_by_status)} />
              <Metric label="Articles" value={sumMetrics(summary.articles_by_status)} />
            </div>
          )}
          <div className="responsive-table" role="table" aria-label="Destination table">
            <div className="table-row table-head" role="row">
              <span>Tên</span>
              <span>Vùng</span>
              <span>Trạng thái</span>
              <span>Slug</span>
            </div>
            {destinations.map((item) => (
              <div className="table-row" role="row" key={item.id}>
                <strong data-label="Tên">{item.name}</strong>
                <span data-label="Vùng">{item.region ?? "--"}</span>
                <span data-label="Trạng thái" className={`workflow-status ${item.status}`}>
                  {item.status}
                </span>
                <span data-label="Slug">{item.slug}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "audit" && (
        <div className="audit-panel">
          {auditLogs.length === 0 && <EmptyState title="Chưa có audit log" text="Các thao tác sẽ được ghi ở đây." />}
          {auditLogs.map((log) => (
            <article key={log.id}>
              <span>{new Date(log.created_at).toLocaleString("vi-VN")}</span>
              <strong>{log.action}</strong>
              <p>
                {log.actor_user_id ?? "system"} · {log.target_type}:{log.target_id ?? "--"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
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


