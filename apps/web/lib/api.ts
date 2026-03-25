export type SubscriptionTier = "free" | "basic" | "premium" | "vip";

export interface ProfilePreferences {
  kinks: string[];
  hard_limits: string[];
  favorite_genres: string[];
  custom_boundaries: string | null;
  tone_preferences: string[];
  narration_opt_in: boolean;
  digital_twin_interest: boolean;
}

export interface ProfileResponse {
  id: string;
  user_id: string;
  email: string;
  role: string;
  preferences: ProfilePreferences;
  consent_score: number;
  stripe_customer_id: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status: string;
  is_creator: boolean;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  updated_at: string;
  features: {
    daily_generation_limit: number | null;
    daily_audio_generation_limit: number | null;
    audio_enabled: boolean;
    priority_generation: boolean;
    early_digital_twin_access: boolean;
  };
  usage: {
    daily_generation_count: number;
    daily_generation_limit: number | null;
    daily_generation_remaining: number | null;
    daily_audio_generation_count: number;
    daily_audio_generation_limit: number | null;
    daily_audio_generation_remaining: number | null;
  };
}

export interface GenerateStoryPayload {
  prompt: string;
  preference_tags: string[];
  freeform_preferences?: string;
  boundaries: string[];
  content_style: "romantic" | "sensual" | "dominant" | "playful" | "explicit";
  branching_depth: number;
  narration_requested: boolean;
  consent: {
    user_is_adult: boolean;
    roleplay_consent_confirmed: boolean;
    prohibited_topics_acknowledged: boolean;
    wants_boundary_respect: boolean;
  };
}

export interface ProfileOnboardingPayload {
  preferences: ProfilePreferences;
}

export interface CheckoutSessionResponse {
  url: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessageResponse {
  id: string;
  role: ChatRole;
  content: string;
  audio_url?: string | null;
  created_at: string;
}

export interface ChatMessageAudioResponse {
  message_id: string;
  audio_url: string;
  cached: boolean;
}

export interface ChatSessionSummary {
  id: string;
  twin_id: string | null;
  character_name: string;
  last_message_preview: string | null;
  updated_at: string;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessageResponse[];
}

export type ModerationQueueStatus = "pending" | "approved" | "rejected" | "escalated";
export type ModerationContentType = "story" | "chat_message" | "digital_twin";

export interface ModerationQueueSummary {
  id: string;
  content_type: ModerationContentType;
  content_id: string;
  user_id: string;
  user_email: string;
  preview: string;
  moderation_score: number;
  flags: string[];
  status: ModerationQueueStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface ModerationQueueDetail extends ModerationQueueSummary {
  raw_output: string;
  display_output: string;
  reviewer_id: string | null;
  reviewer_email: string | null;
  review_notes: string | null;
}

export interface ModerationQueueReviewPayload {
  status: Exclude<ModerationQueueStatus, "pending">;
  notes?: string;
  final_score: number;
}

export interface ModerationEscalationResponse {
  escalated_count: number;
}

export interface ChatStreamPayload {
  message: string;
  session_id?: string;
  twin_id?: string;
  audio_requested?: boolean;
  character_name?: string;
}

export interface TwinReferenceData {
  voice_style: string | null;
  personality_traits: string[];
  allowed_kinks: string[];
  hard_limits: string[];
  example_prompts: string[];
}

export interface TwinConsentAttestation {
  creator_is_adult: boolean;
  rights_holder_confirmed: boolean;
  likeness_use_consent_confirmed: boolean;
  no_raw_likeness_storage_acknowledged: boolean;
  audience_is_adult_only_confirmed: boolean;
  signature_name: string;
}

export interface TwinAccessSummary {
  required_subscription_tier: SubscriptionTier;
  viewer_subscription_tier: SubscriptionTier;
  viewer_subscription_status: string;
  can_chat: boolean;
  access_message: string | null;
}

export interface DigitalTwinResponse {
  id: string;
  creator_id: string;
  creator_email: string;
  name: string;
  description: string;
  consent_status: "pending" | "approved" | "rejected";
  reference_data: TwinReferenceData;
  preferred_voice_id: string | null;
  status: "draft" | "training" | "active" | "suspended";
  required_subscription_tier: SubscriptionTier;
  moderation_score: number;
  access: TwinAccessSummary;
  created_at: string;
  updated_at: string;
}

export interface DigitalTwinCreatePayload {
  name: string;
  description: string;
  reference_data: TwinReferenceData;
  consent: TwinConsentAttestation;
  preferred_voice_id?: string | null;
  required_subscription_tier: SubscriptionTier;
}

export interface DigitalTwinUpdatePayload {
  name?: string;
  description?: string;
  reference_data?: TwinReferenceData;
  consent?: TwinConsentAttestation;
  preferred_voice_id?: string | null;
  required_subscription_tier?: SubscriptionTier;
}

export type ChatStreamEvent =
  | {
      type: "session";
      session_id: string;
      character_name: string;
    }
  | {
      type: "assistant_message";
      message_id: string;
    }
  | {
      type: "chunk";
      content: string;
    }
  | {
      type: "done";
      session: ChatSessionSummary;
      message: ChatMessageResponse;
    }
  | {
      type: "audio_pending";
      message_id: string;
    }
  | {
      type: "audio";
      message_id: string;
      audio_url: string | null;
      error: string | null;
    };

export interface GenerateStoryResponse {
  request_id: string;
  title: string;
  story: string;
  branches: Array<{
    id: string;
    label: string;
    direction: string;
  }>;
  audio_available: boolean;
  audio_url: string | null;
  audio_error: string | null;
  provider: string;
  moderation: {
    allowed: boolean;
    blocked_reasons: string[];
    flags: string[];
    review_required: boolean;
    consent_score: number;
  };
}

export interface FeedbackPayload {
  category: string;
  message: string;
  page_context?: string;
}

export interface FeedbackResponse {
  id: string;
  user_id: string | null;
  email: string | null;
  category: string;
  message: string;
  page_context: string | null;
  status: string;
  created_at: string;
}

export interface BetaAccessPayload {
  email: string;
  interest?: string;
  requested_creator_access?: boolean;
  source?: string;
}

export interface BetaAccessResponse {
  id: string;
  email: string;
  interest: string | null;
  requested_creator_access: boolean;
  source: string;
  status: string;
  created_at: string;
}

export interface CreatorInvitePayload {
  email: string;
  expires_in_days?: number;
}

export interface CreatorInviteResponse {
  id: string;
  email: string;
  invite_token: string;
  invite_url: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  claimed_at: string | null;
}

export interface DailyUsageMetricResponse {
  metric_date: string;
  active_users: number;
  story_generations: number;
  audio_renders: number;
  twin_chat_messages: number;
  feedback_submissions: number;
  beta_access_requests: number;
  updated_at: string;
}

export interface AnalyticsOverviewResponse {
  summary: {
    active_users: number;
    story_generations: number;
    audio_renders: number;
    twin_chat_messages: number;
    feedback_submissions: number;
    beta_access_requests: number;
    pending_beta_requests: number;
    pending_feedback_items: number;
    active_creator_invites: number;
  };
  series: DailyUsageMetricResponse[];
}

async function parseErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  if (response.status >= 500) {
    return fallbackMessage;
  }

  const rawBody = await response.text().catch(() => "");
  if (!rawBody) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(rawBody) as { detail?: string };
    return parsed.detail ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
}

export async function getProfile(): Promise<ProfileResponse> {
  const response = await fetch("/api/profile/me", {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<ProfileResponse>(response, "Could not load your profile.");
}

export async function saveOnboardingProfile(payload: ProfileOnboardingPayload): Promise<ProfileResponse> {
  const response = await fetch("/api/profile/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<ProfileResponse>(response, "Could not save onboarding preferences.");
}

export async function generateStory(payload: GenerateStoryPayload): Promise<GenerateStoryResponse> {
  const response = await fetch("/api/story/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<GenerateStoryResponse>(response, "Story generation failed.");
}

export async function getStoryRequest(requestId: string, options?: { audio?: boolean }): Promise<GenerateStoryResponse> {
  const searchParams = new URLSearchParams();
  if (options?.audio) {
    searchParams.set("audio", "true");
  }

  const response = await fetch(`/api/story/${requestId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<GenerateStoryResponse>(response, "Could not load this story request.");
}

export async function createCheckoutSession(tier: Exclude<SubscriptionTier, "free">): Promise<CheckoutSessionResponse> {
  const response = await fetch("/api/payments/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ tier })
  });

  return parseResponse<CheckoutSessionResponse>(response, "Could not create the Stripe checkout session.");
}

export async function createBillingPortalSession(): Promise<CheckoutSessionResponse> {
  const response = await fetch("/api/payments/portal", {
    method: "POST"
  });

  return parseResponse<CheckoutSessionResponse>(response, "Could not open the billing portal.");
}

export async function getChatSessions(): Promise<ChatSessionSummary[]> {
  const response = await fetch("/api/chat/sessions", {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<ChatSessionSummary[]>(response, "Could not load your chat sessions.");
}

export async function getChatSessionDetail(sessionId: string): Promise<ChatSessionDetail> {
  const response = await fetch(`/api/chat/sessions/${sessionId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<ChatSessionDetail>(response, "Could not load this chat session.");
}

export async function streamChat(
  payload: ChatStreamPayload,
  options: {
    signal?: AbortSignal;
    onEvent: (event: ChatStreamEvent) => void;
  }
): Promise<void> {
  // This endpoint is an authenticated POST, so we stream with fetch + ReadableStream instead of EventSource.
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Chat streaming failed."));
  }

  if (!response.body) {
    throw new Error("Chat streaming is not available in this browser session.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  async function flushBuffer(final = false) {
    const boundary = "\n\n";

    while (buffer.includes(boundary) || (final && buffer.trim())) {
      const boundaryIndex = buffer.indexOf(boundary);
      const rawEvent = boundaryIndex >= 0 ? buffer.slice(0, boundaryIndex) : buffer;
      buffer = boundaryIndex >= 0 ? buffer.slice(boundaryIndex + boundary.length) : "";

      const eventLines = rawEvent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      if (!eventLines.length) {
        continue;
      }

      const payloadText = eventLines.map((line) => line.slice(5).trimStart()).join("\n");
      const parsed = JSON.parse(payloadText) as ChatStreamEvent;
      options.onEvent(parsed);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    await flushBuffer(done);

    if (done) {
      break;
    }
  }
}

export async function regenerateChatMessageAudio(messageId: string): Promise<ChatMessageAudioResponse> {
  const response = await fetch(`/api/chat/messages/${messageId}/audio`, {
    method: "POST"
  });

  return parseResponse<ChatMessageAudioResponse>(response, "Could not generate voice for this message.");
}

export async function getModerationQueue(
  status: ModerationQueueStatus | "all" = "pending",
  limit = 50
): Promise<ModerationQueueSummary[]> {
  const searchParams = new URLSearchParams({
    status,
    limit: String(limit)
  });
  const response = await fetch(`/api/moderation/queue?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<ModerationQueueSummary[]>(response, "Could not load the moderation queue.");
}

export async function getModerationQueueItem(itemId: string): Promise<ModerationQueueDetail> {
  const response = await fetch(`/api/moderation/queue/${itemId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<ModerationQueueDetail>(response, "Could not load the moderation item.");
}

export async function reviewModerationQueueItem(
  itemId: string,
  payload: ModerationQueueReviewPayload
): Promise<ModerationQueueDetail> {
  const response = await fetch(`/api/moderation/queue/${itemId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<ModerationQueueDetail>(response, "Could not submit the moderation review.");
}

export async function escalateStaleModerationItems(): Promise<ModerationEscalationResponse> {
  const response = await fetch("/api/moderation/queue/escalate-stale", {
    method: "POST"
  });

  return parseResponse<ModerationEscalationResponse>(response, "Could not escalate stale moderation items.");
}

export async function uploadTwin(payload: DigitalTwinCreatePayload): Promise<DigitalTwinResponse> {
  const response = await fetch("/api/twins/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<DigitalTwinResponse>(response, "Could not submit the digital twin.");
}

export async function getMyTwins(): Promise<DigitalTwinResponse[]> {
  const response = await fetch("/api/twins/my-twins", {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<DigitalTwinResponse[]>(response, "Could not load your digital twins.");
}

export async function getPublicTwins(): Promise<DigitalTwinResponse[]> {
  const response = await fetch("/api/twins/public", {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<DigitalTwinResponse[]>(response, "Could not load the public digital twins.");
}

export async function getTwin(twinId: string): Promise<DigitalTwinResponse> {
  const response = await fetch(`/api/twins/${twinId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<DigitalTwinResponse>(response, "Could not load this digital twin.");
}

export async function updateTwin(twinId: string, payload: DigitalTwinUpdatePayload): Promise<DigitalTwinResponse> {
  const response = await fetch(`/api/twins/${twinId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<DigitalTwinResponse>(response, "Could not update this digital twin.");
}

export async function deleteTwin(twinId: string): Promise<DigitalTwinResponse> {
  const response = await fetch(`/api/twins/${twinId}`, {
    method: "DELETE"
  });

  return parseResponse<DigitalTwinResponse>(response, "Could not archive this digital twin.");
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<FeedbackResponse>(response, "Could not send your feedback right now.");
}

export async function requestBetaAccess(payload: BetaAccessPayload): Promise<BetaAccessResponse> {
  const response = await fetch("/api/beta-access/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<BetaAccessResponse>(response, "Could not save your beta access request.");
}

export async function getCreatorInvites(): Promise<CreatorInviteResponse[]> {
  const response = await fetch("/api/admin/creator-invites", {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<CreatorInviteResponse[]>(response, "Could not load creator invites.");
}

export async function createCreatorInvite(payload: CreatorInvitePayload): Promise<CreatorInviteResponse> {
  const response = await fetch("/api/admin/creator-invites", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<CreatorInviteResponse>(response, "Could not create the creator invite.");
}

export async function acceptCreatorInvite(inviteToken: string): Promise<CreatorInviteResponse> {
  const response = await fetch(`/api/creator-invites/${inviteToken}/accept`, {
    method: "POST"
  });

  return parseResponse<CreatorInviteResponse>(response, "Could not accept this creator invite.");
}

export async function getAnalyticsOverview(days = 14): Promise<AnalyticsOverviewResponse> {
  const searchParams = new URLSearchParams({ days: String(days) });
  const response = await fetch(`/api/admin/analytics/overview?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseResponse<AnalyticsOverviewResponse>(response, "Could not load beta analytics.");
}
