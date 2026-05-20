export type ApiEnvelope<TData> = Readonly<{
  data: TData;
  requestId?: string;
}>;

export type HealthStatus = Readonly<{
  name: "TravelAssistant";
  status: "ok";
  version: string;
}>;

export type UserRole = "guest" | "user" | "editor" | "admin" | "root";

export type User = Readonly<{
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}>;

export type TokenResponse = Readonly<{
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
}>;

export type Profile = Readonly<{
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}>;

export type Preferences = Readonly<{
  home_city: string | null;
  language: string;
  budget: string | null;
  travel_style: string | null;
  interests: string[];
  constraints: string[];
  wishlist: string[];
  saved_itinerary_refs: string[];
}>;

export type ContentStatus = "draft" | "review" | "published" | "archived";

export type Destination = Readonly<{
  id: string;
  slug: string;
  name: string;
  region: string | null;
  summary: string;
  description: string | null;
  status: ContentStatus;
  latitude: number | null;
  longitude: number | null;
}>;

export type Place = Readonly<{
  id: string;
  destination_id: string;
  slug: string;
  name: string;
  kind: string;
  summary: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  price_level: string | null;
  status: ContentStatus;
  metadata_json: Record<string, unknown>;
}>;

export type Article = Readonly<{
  id: string;
  destination_id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  source_url: string | null;
  status: ContentStatus;
}>;

export type MediaImage = Readonly<{
  id: string;
  object_key: string;
  public_url: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  status: ContentStatus;
}>;

export type ImageAnalyzeResponse = Readonly<{
  image_id: string;
  provider: string;
  model: string;
  analysis: Record<string, unknown>;
}>;

export type VoiceEvent = Readonly<{
  status: string;
  at: string;
  message?: string;
}>;

export type VoiceJob = Readonly<{
  id: string;
  user_id: string | null;
  status: string;
  provider: string;
  stt_model: string | null;
  tts_model: string | null;
  input_object_key: string | null;
  output_object_key: string | null;
  output_public_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  answer: string | null;
  citations: Record<string, unknown>[];
  source_chunks: Record<string, unknown>[];
  events: VoiceEvent[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}>;

export type STTResponse = Readonly<{
  job: VoiceJob;
  transcript: string;
}>;

export type TTSResponse = Readonly<{
  object_key: string;
  public_url: string;
  mime_type: string;
  byte_size: number;
}>;

export type RankedMetric = Readonly<{
  key: string;
  count: number;
}>;

export type DashboardMetric = Readonly<{
  label: string;
  value: number | string;
  unit: string | null;
}>;

export type AdminDashboardSummary = Readonly<{
  metrics: DashboardMetric[];
  top_destinations: RankedMetric[];
  top_intents: RankedMetric[];
  rag_quality: DashboardMetric[];
  data_quality: DashboardMetric[];
  cost_latency: DashboardMetric[];
  feedback: RankedMetric[];
  job_status: RankedMetric[];
}>;

export type AdminContentSummary = Readonly<{
  destinations_by_status: RankedMetric[];
  places_by_status: RankedMetric[];
  articles_by_status: RankedMetric[];
  images_by_status: RankedMetric[];
  itinerary_templates_by_status: RankedMetric[];
  tag_count: number;
}>;

export type AuditLog = Readonly<{
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}>;

export type ProductEvent = Readonly<{
  id: string;
  user_id: string | null;
  event_name: string;
  intent: string | null;
  destination_slug: string | null;
  session_id: string | null;
  latency_ms: number | null;
  cost_usd: number | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}>;

export type Tag = Readonly<{
  id: string;
  slug: string;
  name: string;
  created_at: string;
}>;

export type ItineraryTemplate = Readonly<{
  id: string;
  destination_id: string | null;
  slug: string;
  title: string;
  days: number;
  budget_level: string | null;
  traveler_type: string | null;
  plan_json: Record<string, unknown>;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}>;

export type SearchResult = Readonly<{
  type: string;
  slug: string;
  title: string;
  summary: string;
}>;

export type Citation = Readonly<{
  id: number;
  source_type: string;
  source_id: string;
  title: string;
  url: string | null;
  heading_path: string[] | null;
  score: number;
}>;

export type SourceChunk = Readonly<{
  chunk_id: string;
  content: string;
  score: number;
  source: Record<string, unknown>;
}>;

export type ChatSession = Readonly<{
  id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}>;

export type ChatMessage = Readonly<{
  id: string;
  session_id: string;
  role: string;
  content: string;
  modality: string;
  idempotency_key: string | null;
  citations: Citation[];
  source_chunks: SourceChunk[];
  latency_ms: number | null;
  model_provider: string | null;
  feedback_state: string | null;
  created_at: string;
}>;

export type ChatExchange = Readonly<{
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}>;

export type FeedbackState = "helpful" | "not_helpful" | "wrong_info" | "outdated_info";

export type ItineraryBlock = Readonly<{
  time: string;
  title: string;
  description: string;
  place_ids: string[];
  cost_estimate: string;
  route_hint: string;
  citation_ids: number[];
}>;

export type ItineraryDay = Readonly<{
  day: number;
  theme: string;
  blocks: ItineraryBlock[];
}>;

export type GeneratedItinerary = Readonly<{
  title: string;
  destination: string;
  days: ItineraryDay[];
}>;

export type SavedItinerary = Readonly<{
  id: string;
  owner_user_id: string;
  title: string;
  destination: string;
  days: number;
  request_json: Record<string, unknown>;
  plan_json: GeneratedItinerary;
  citations: Citation[];
  source_chunks: SourceChunk[];
  share_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}>;
