"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Crown, LoaderCircle, MessageSquareText, Plus, RotateCcw, Sparkles, UserRoundSearch, Volume2, VolumeX } from "lucide-react";

import {
  getChatSessionDetail,
  getChatSessions,
  getProfile,
  getPublicTwins,
  regenerateChatMessageAudio,
  streamChat,
  type ChatMessageResponse,
  type ChatSessionSummary,
  type DigitalTwinResponse,
  type ProfileResponse
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface ChatShellProps {
  initialProfile: ProfileResponse | null;
  initialTwinId: string | null;
}

interface UiChatMessage extends ChatMessageResponse {
  pending?: boolean;
  audioPending?: boolean;
  audioError?: string | null;
}

const DEFAULT_CHARACTER_NAME = "Lumina Muse";

export function ChatShell({ initialProfile, initialTwinId }: ChatShellProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [twins, setTwins] = useState<DigitalTwinResponse[]>([]);
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedTwinId, setSelectedTwinId] = useState<string | null>(initialTwinId);
  const [characterName, setCharacterName] = useState(DEFAULT_CHARACTER_NAME);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionLoadingId, setSessionLoadingId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1");
  const [audioActionMessageId, setAudioActionMessageId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  const playbackRateRef = useRef(playbackRate);

  const characterSuggestions = useMemo(() => buildCharacterSuggestions(profile), [profile]);
  const selectedTwin = twins.find((twin) => twin.id === selectedTwinId) ?? null;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const canUseVoice = Boolean(profile?.features.audio_enabled);
  const personalizedGreeting = useMemo(() => {
    if (selectedTwin) {
      const firstTrait = selectedTwin.reference_data.personality_traits[0];
      return `Chat with ${selectedTwin.name}${firstTrait ? ` in a ${firstTrait.toLowerCase()}` : ""} voice while preserving both your profile boundaries and the creator's hard limits.`;
    }

    if (!profile) {
      return "Your chat companion will adapt to your saved preferences and boundaries once your profile finishes loading.";
    }

    const firstGenre = profile.preferences.favorite_genres[0];
    const firstTone = profile.preferences.tone_preferences[0];
    const firstKink = profile.preferences.kinks[0];

    if (firstGenre && firstTone) {
      return `Ready to explore a ${firstTone.toLowerCase()} ${firstGenre.toLowerCase()} thread while holding every stored limit.`;
    }

    if (firstKink) {
      return `Your companion can lean into ${firstKink.toLowerCase()} while keeping consent explicit and your hard limits intact.`;
    }

    return "Every reply stays adult, consensual, and grounded in the hard limits stored on your profile.";
  }, [profile, selectedTwin]);

  useEffect(() => {
    async function hydrateChat() {
      setIsHydrating(true);

      try {
        const [resolvedProfile, resolvedSessions, resolvedTwins] = await Promise.all([
          initialProfile ? Promise.resolve(initialProfile) : getProfile().catch(() => null),
          getChatSessions(),
          getPublicTwins().catch(() => [])
        ]);

        startTransition(() => {
          if (resolvedProfile) {
            setProfile(resolvedProfile);
          }
          setSessions(resolvedSessions);
          setTwins(resolvedTwins);
        });

        if (resolvedSessions[0]) {
          await loadSession(resolvedSessions[0].id);
        } else if (initialTwinId) {
          const initialTwin = resolvedTwins.find((twin) => twin.id === initialTwinId) ?? null;
          setSelectedTwinId(initialTwin?.id ?? null);
          setCharacterName(initialTwin?.name ?? DEFAULT_CHARACTER_NAME);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not load your chat workspace.");
      } finally {
        setIsHydrating(false);
      }
    }

    void hydrateChat();
  }, [initialProfile, initialTwinId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  async function loadSession(sessionId: string) {
    setError(null);
    setShowUpgradePrompt(false);
    setSessionLoadingId(sessionId);

    try {
      const detail = await getChatSessionDetail(sessionId);

      startTransition(() => {
        setActiveSessionId(detail.session.id);
        setSelectedTwinId(detail.session.twin_id ?? null);
        setCharacterName(detail.session.character_name);
        setMessages(detail.messages);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load this conversation.");
    } finally {
      setSessionLoadingId(null);
    }
  }

  function handleNewChat(options?: { nextCharacterName?: string; nextTwinId?: string | null }) {
    const nextTwin = twins.find((twin) => twin.id === options?.nextTwinId) ?? null;

    setActiveSessionId(null);
    setMessages([]);
    setComposer("");
    setError(null);
    setShowUpgradePrompt(false);
    setSelectedTwinId(nextTwin?.id ?? null);
    setCharacterName(nextTwin?.name ?? options?.nextCharacterName ?? characterSuggestions[0] ?? DEFAULT_CHARACTER_NAME);
  }

  function handleTwinSelection(nextValue: string) {
    if (nextValue === "generic") {
      handleNewChat({ nextTwinId: null });
      return;
    }

    const twin = twins.find((candidate) => candidate.id === nextValue);
    if (!twin) {
      return;
    }

    handleNewChat({ nextTwinId: twin.id });
  }

  async function handleSendMessage(messageOverride?: string) {
    const outgoingMessage = (messageOverride ?? composer).trim();

    if (!outgoingMessage || isStreaming) {
      return;
    }

    if (selectedTwin && !selectedTwin.access.can_chat) {
      setError(
        selectedTwin.access.access_message ??
          "Upgrade to Premium or VIP for voice mode, richer sessions, and premium twin access."
      );
      setShowUpgradePrompt(true);
      return;
    }

    const previousMessages = messages;
    const previousSessionId = activeSessionId;
    const now = new Date().toISOString();
    const optimisticUserMessage: UiChatMessage = {
      id: `user-temp-${Date.now()}`,
      role: "user",
      content: outgoingMessage,
      created_at: now,
      pending: true
    };
    const optimisticAssistantMessage: UiChatMessage = {
      id: `assistant-temp-${Date.now()}`,
      role: "assistant",
      content: "",
      created_at: now,
      pending: true
    };

    let assistantMessageId = optimisticAssistantMessage.id;

    setComposer("");
    setError(null);
    setShowUpgradePrompt(false);
    setIsStreaming(true);
    setMessages([...previousMessages, optimisticUserMessage, optimisticAssistantMessage]);

    try {
      await streamChat(
        {
          message: outgoingMessage,
          session_id: previousSessionId ?? undefined,
          twin_id: selectedTwinId ?? undefined,
          audio_requested: voiceEnabled && canUseVoice,
          character_name: previousSessionId || selectedTwinId ? undefined : characterName.trim() || DEFAULT_CHARACTER_NAME
        },
        {
          onEvent: (event) => {
            if (event.type === "session") {
              startTransition(() => {
                setActiveSessionId(event.session_id);
                setCharacterName(event.character_name);
              });
              return;
            }

            if (event.type === "assistant_message") {
              assistantMessageId = event.message_id;
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === optimisticAssistantMessage.id ? { ...message, id: event.message_id } : message
                )
              );
              return;
            }

            if (event.type === "chunk") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessageId ? { ...message, content: `${message.content}${event.content}` } : message
                )
              );
              return;
            }

            if (event.type === "audio_pending") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === event.message_id ? { ...message, audioPending: true, audioError: null } : message
                )
              );
              return;
            }

            if (event.type === "audio") {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === event.message_id
                    ? {
                        ...message,
                        audio_url: event.audio_url,
                        audioPending: false,
                        audioError: event.error
                      }
                    : message
                )
              );

              if (event.audio_url && voiceEnabledRef.current) {
                void playAudioClip(event.audio_url).catch((requestError) => {
                  setError(requestError instanceof Error ? requestError.message : "Could not auto-play this voice clip.");
                });
              }

              if (event.error) {
                setError(event.error);
              }
              return;
            }

            setIsStreaming(false);
            startTransition(() => {
              setActiveSessionId(event.session.id);
              setSelectedTwinId(event.session.twin_id ?? null);
              setCharacterName(event.session.character_name);
              setMessages((currentMessages) =>
                currentMessages.map((message) => {
                  if (message.id === optimisticUserMessage.id) {
                    return { ...message, pending: false };
                  }
                  if (message.id === assistantMessageId) {
                    return { ...event.message, pending: false, audioPending: false, audioError: null };
                  }
                  return message;
                })
              );
              setSessions((currentSessions) => {
                const filteredSessions = currentSessions.filter((session) => session.id !== event.session.id);
                return [event.session, ...filteredSessions];
              });
            });
          }
        }
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Chat request failed.";
      setMessages(previousMessages);
      setError(message);
      setShowUpgradePrompt(looksLikeUpgradePrompt(message) || Boolean(selectedTwin?.access.access_message));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleRegenerate() {
    void handleSendMessage("Please respond to my last message again with a different but still consent-first direction.");
  }

  function handleChangeDirection() {
    setComposer("Let's change direction while staying inside my saved limits. Shift the mood toward ");
  }

  function handleToggleVoice() {
    if (!canUseVoice) {
      setError("Voice mode is unlocked on Premium and VIP tiers, which also include unlimited generations and premium twin access.");
      setShowUpgradePrompt(true);
      return;
    }

    setVoiceEnabled((current) => {
      if (current) {
        audioRef.current?.pause();
      }
      return !current;
    });
  }

  async function playAudioClip(audioUrl: string) {
    audioRef.current?.pause();
    const audio = new Audio(audioUrl);
    audio.playbackRate = Number(playbackRateRef.current);
    audioRef.current = audio;
    await audio.play();
  }

  async function handlePlayMessageAudio(message: UiChatMessage, options?: { regenerate?: boolean }) {
    if (!options?.regenerate && message.audio_url) {
      try {
        await playAudioClip(message.audio_url);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not play this voice clip.");
      }
      return;
    }

    if (!canUseVoice) {
      setError("Voice mode is unlocked on Premium and VIP tiers, which also include unlimited generations and premium twin access.");
      setShowUpgradePrompt(true);
      return;
    }

    setAudioActionMessageId(message.id);
    setError(null);
    setMessages((currentMessages) =>
      currentMessages.map((candidate) =>
        candidate.id === message.id ? { ...candidate, audioPending: true, audioError: null } : candidate
      )
    );

    try {
      const response = await regenerateChatMessageAudio(message.id);
      setMessages((currentMessages) =>
        currentMessages.map((candidate) =>
          candidate.id === message.id
            ? {
                ...candidate,
                audio_url: response.audio_url,
                audioPending: false,
                audioError: null
              }
            : candidate
        )
      );
      await playAudioClip(response.audio_url);
    } catch (requestError) {
      const friendlyMessage = requestError instanceof Error ? requestError.message : "Could not generate voice for this message.";
      setMessages((currentMessages) =>
        currentMessages.map((candidate) =>
          candidate.id === message.id ? { ...candidate, audioPending: false, audioError: friendlyMessage } : candidate
        )
      );
      setError(friendlyMessage);
      setShowUpgradePrompt(looksLikeUpgradePrompt(friendlyMessage));
    } finally {
      setAudioActionMessageId(null);
    }
  }

  return (
    <main className="page-shell min-h-screen py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <Badge>Streaming companion mode</Badge>
          <div>
            <h1 className="font-display text-3xl text-white sm:text-5xl">Real-time companion chat</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-50/72">{personalizedGreeting}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/twins">Browse twins</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button onClick={() => handleNewChat()} type="button">
            <Plus className="mr-2 h-4 w-4" />
            New chat
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="order-2 relative overflow-hidden border-orange-400/15 xl:order-1">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-orange-500/15 to-transparent" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-300" />
              Session lounge
            </CardTitle>
            <CardDescription>Choose a saved conversation, start a fresh chat, or jump into an approved creator twin.</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/[0.15] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Profile context</p>
              <div className="mt-3 space-y-2 text-sm text-orange-50/80">
                <p>
                  Tier: <span className="capitalize text-white">{profile?.subscription_tier ?? "free"}</span>
                </p>
                <p>
                  Hard limits: <span className="text-white">{profile?.preferences.hard_limits.length ?? 0}</span>
                </p>
                <p>
                  Approved twins: <span className="text-white">{twins.length}</span>
                </p>
                <p>
                  Voice renders left: <span className="text-white">{profile?.usage.daily_audio_generation_remaining ?? "n/a"}</span>
                </p>
                <p>
                  Consent score: <span className="text-white">{profile?.consent_score ?? 100}</span>
                </p>
              </div>
            </div>

            {profile?.subscription_tier === "free" || profile?.subscription_tier === "basic" ? (
              <div className="rounded-3xl border border-orange-400/25 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100">
                {profile?.subscription_tier === "free" ? "Free tier" : "Basic tier"} chat keeps responses lighter and does not include voice mode.{" "}
                <Link className="underline" href="/pricing">
                  Upgrade to Premium or VIP
                </Link>{" "}
                for richer exchanges, creator twin access, and voice mode.
              </div>
            ) : null}

            {selectedTwin ? (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
                <p className="font-medium text-white">{selectedTwin.name}</p>
                <p className="mt-1">{selectedTwin.description}</p>
                {selectedTwin.access.access_message ? <p className="mt-3">{selectedTwin.access.access_message}</p> : null}
              </div>
            ) : null}

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Suggested characters</p>
              <div className="flex flex-wrap gap-2">
                {characterSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-orange-50/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isStreaming}
                    onClick={() => handleNewChat({ nextCharacterName: suggestion, nextTwinId: null })}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Approved twins</p>
                <Button asChild size="sm" type="button" variant="ghost">
                  <Link href="/twins">Browse all</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {twins.length ? (
                  twins.slice(0, 4).map((twin) => (
                    <button
                      key={twin.id}
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        twin.id === selectedTwinId
                          ? "border-emerald-300/30 bg-emerald-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      disabled={isStreaming}
                      onClick={() => handleNewChat({ nextTwinId: twin.id })}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{twin.name}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{twin.description}</p>
                        </div>
                        <Badge className="border-white/10 bg-white/5 text-orange-50/70">{twin.required_subscription_tier}</Badge>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
                    No admin-approved twins are available for this account yet.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Recent chats</p>
                <Button onClick={() => handleNewChat()} size="sm" type="button" variant="ghost">
                  Reset
                </Button>
              </div>
              <div className="space-y-2">
                {sessions.length ? (
                  sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isLoading = sessionLoadingId === session.id;
                    const sessionTwin = twins.find((twin) => twin.id === session.twin_id) ?? null;

                    return (
                      <button
                        key={session.id}
                        className={`w-full rounded-3xl border p-4 text-left transition ${
                          isActive
                            ? "border-orange-300/40 bg-orange-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        disabled={isStreaming}
                        onClick={() => void loadSession(session.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{session.character_name}</p>
                              {sessionTwin ? (
                                <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100">twin</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {session.last_message_preview ?? "Fresh session ready for a first message."}
                            </p>
                          </div>
                          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-orange-200" /> : null}
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-orange-100/55">
                          {formatSessionTimestamp(session.updated_at)}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
                    No saved chats yet. Start a new conversation and the session will appear here.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 border-white/10 xl:order-2">
          <CardHeader className="border-b border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-orange-300" />
                  {activeSession?.character_name ?? selectedTwin?.name ?? characterName}
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Profile boundaries are injected into every response before moderation approves it for streaming.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleToggleVoice} size="sm" type="button" variant="outline">
                  {voiceEnabled ? <Volume2 className="mr-2 h-3.5 w-3.5" /> : <VolumeX className="mr-2 h-3.5 w-3.5" />}
                  {voiceEnabled ? "Voice on" : "Voice off"}
                </Button>
                <select
                  className="h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-white outline-none transition focus:border-orange-300/40"
                  disabled={!canUseVoice}
                  onChange={(event) => setPlaybackRate(event.target.value)}
                  value={playbackRate}
                >
                  <option value="0.9">0.9x</option>
                  <option value="1">1.0x</option>
                  <option value="1.1">1.1x</option>
                  <option value="1.25">1.25x</option>
                </select>
                <Badge className="border-orange-400/20 bg-orange-500/10 text-orange-100">Consent-first</Badge>
                <Badge className="border-white/10 bg-white/5 text-orange-50/70">{profile?.subscription_tier ?? "free"} tier</Badge>
                {selectedTwin ? (
                  <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100">
                    <UserRoundSearch className="mr-1 h-3.5 w-3.5" />
                    twin
                  </Badge>
                ) : null}
                {profile?.features.priority_generation ? (
                  <Badge className="border-amber-300/25 bg-amber-500/10 text-amber-100">
                    <Crown className="mr-1 h-3.5 w-3.5" />
                    priority
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[68svh] flex-col p-0">
            <div className="relative flex-1 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.10),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(251,146,60,0.10),transparent_26%)]" />
              <div className="relative h-full space-y-5 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                {isHydrating ? (
                  <div className="space-y-4 py-6">
                    <Skeleton className="h-14 w-2/3 rounded-[28px]" />
                    <Skeleton className="ml-auto h-20 w-3/4 rounded-[28px]" />
                    <Skeleton className="h-16 w-1/2 rounded-[28px]" />
                  </div>
                ) : messages.length ? (
                  messages.map((message) => {
                    const isAssistant = message.role === "assistant";

                    return (
                      <div key={message.id} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[92%] space-y-3 sm:max-w-3xl ${isAssistant ? "" : "items-end text-right"}`}>
                          <div
                            className={`rounded-[28px] px-5 py-4 shadow-lg ${
                              isAssistant
                                ? "border border-white/10 bg-white/[0.06] text-orange-50/88"
                                : "border border-orange-300/20 bg-gradient-to-br from-orange-500/20 to-pink-500/10 text-white"
                            }`}
                          >
                            <p className="whitespace-pre-wrap text-sm leading-7">
                              {message.content || (message.pending ? "Streaming reply..." : "")}
                            </p>
                          </div>
                          <div className={`flex flex-wrap items-center gap-2 text-xs ${isAssistant ? "" : "justify-end"}`}>
                            <span className="uppercase tracking-[0.18em] text-muted-foreground">
                              {isAssistant ? activeSession?.character_name ?? selectedTwin?.name ?? characterName : "You"} ·{" "}
                              {formatMessageTimestamp(message.created_at)}
                            </span>
                            {message.pending ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-100/70">
                                streaming
                              </span>
                            ) : null}
                          </div>
                          {isAssistant && !message.pending ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => void handlePlayMessageAudio(message)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {message.audioPending ? (
                                  <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : message.audio_url ? (
                                  <Volume2 className="mr-2 h-3.5 w-3.5" />
                                ) : (
                                  <VolumeX className="mr-2 h-3.5 w-3.5" />
                                )}
                                {message.audioPending
                                  ? "Generating voice"
                                  : message.audio_url
                                    ? "Listen"
                                    : canUseVoice
                                      ? "No voice clip"
                                      : "Upgrade for voice"}
                              </Button>
                              <Button
                                disabled={message.audioPending || audioActionMessageId === message.id}
                                onClick={() => void handlePlayMessageAudio(message, { regenerate: true })}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {message.audioPending || audioActionMessageId === message.id ? (
                                  <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Volume2 className="mr-2 h-3.5 w-3.5" />
                                )}
                                Regenerate audio
                              </Button>
                              <Button onClick={handleRegenerate} size="sm" type="button" variant="ghost">
                                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                Regenerate
                              </Button>
                              <Button onClick={handleChangeDirection} size="sm" type="button" variant="ghost">
                                <Compass className="mr-2 h-3.5 w-3.5" />
                                Change direction
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-[32px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
                    <div className="rounded-full border border-orange-400/20 bg-orange-500/10 p-4 text-orange-200">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h2 className="mt-5 font-display text-3xl text-white">Start an immersive conversation</h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                      {selectedTwin
                        ? `Begin with ${selectedTwin.name} and Lumina will layer your profile preferences together with creator-approved twin boundaries before any reply streams.`
                        : "Choose a character mood, send a first prompt, and Lumina will stream a consent-first response shaped by your stored profile preferences and hard limits."}
                    </p>
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-white/10 bg-[rgba(9,12,20,0.92)] px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
              <div className="grid gap-4 xl:grid-cols-[220px_220px_1fr]">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="companion-mode">
                    Companion
                  </label>
                  <select
                    className="flex h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition focus:border-orange-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(activeSessionId) || isStreaming}
                    id="companion-mode"
                    onChange={(event) => handleTwinSelection(event.target.value)}
                    value={selectedTwinId && twins.some((twin) => twin.id === selectedTwinId) ? selectedTwinId : "generic"}
                  >
                    <option value="generic">Generic companion</option>
                    {twins.map((twin) => (
                      <option key={twin.id} value={twin.id}>
                        {twin.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {activeSessionId ? "Existing sessions keep their saved twin or character context." : "Pick an approved creator twin or stay with a generic companion."}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="character-name">
                    Character name
                  </label>
                  <Input
                    disabled={Boolean(activeSessionId) || Boolean(selectedTwinId)}
                    id="character-name"
                    onChange={(event) => setCharacterName(event.target.value)}
                    placeholder="Lumina Muse"
                    value={selectedTwin?.name ?? characterName}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {selectedTwinId
                      ? "Twin chats always use the approved twin name."
                      : activeSessionId
                        ? "Existing sessions keep their saved character name."
                        : "Used only when starting a brand-new generic conversation."}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="chat-message">
                    Your message
                  </label>
                  <Textarea
                    id="chat-message"
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder="Guide the mood, ask for a new scene, or steer the companion in a different direction..."
                    rows={4}
                    value={composer}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Hard limits are always enforced server-side before any response begins streaming.
                    </p>
                    <Button
                      disabled={!composer.trim() || isStreaming || isHydrating || Boolean(selectedTwin && !selectedTwin.access.can_chat)}
                      onClick={() => void handleSendMessage()}
                      type="button"
                    >
                      {isStreaming ? "Streaming..." : "Send message"}
                    </Button>
                  </div>
                </div>
              </div>

              {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

              {showUpgradePrompt ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-orange-400/25 bg-orange-500/10 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-orange-50">Your current plan cannot access this premium chat feature yet.</p>
                    <p className="text-sm text-orange-100/75">
                      Upgrade to Premium or VIP for voice mode, richer sessions, more hourly capacity, and premium creator twin access.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/pricing">View plans</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function buildCharacterSuggestions(profile: ProfileResponse | null): string[] {
  const curatedSeeds = [
    profile?.preferences.favorite_genres[0],
    profile?.preferences.tone_preferences[0],
    profile?.preferences.kinks[0]
  ].filter((value): value is string => Boolean(value?.trim()));

  const suggestions = curatedSeeds.map((seed, index) => {
    const prefix = ["Velvet", "Ember", "Midnight"][index] ?? "Lumina";
    return `${prefix} ${toTitleCase(seed)}`;
  });

  return dedupeStrings([DEFAULT_CHARACTER_NAME, ...suggestions, "Saffron Reverie", "Afterglow Muse"]).slice(0, 5);
}

function dedupeStrings(values: string[]) {
  return values.filter((value, index) => values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
}

function looksLikeUpgradePrompt(message: string) {
  return /upgrade|limit|tier|premium|vip|subscription/i.test(message);
}

function formatSessionTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMessageTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
