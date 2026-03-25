"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Volume2 } from "lucide-react";

import { generateStory, getProfile, getStoryRequest, type GenerateStoryResponse, type ProfileResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface StoryGeneratorProps {
  initialProfile: ProfileResponse | null;
  checkoutStatus?: string;
}

export function StoryGenerator({ initialProfile, checkoutStatus }: StoryGeneratorProps) {
  const [prompt, setPrompt] = useState("Create a luxurious, slow-burn encounter between two clearly consenting adults in a candlelit penthouse suite.");
  const [style, setStyle] = useState<"romantic" | "sensual" | "dominant" | "playful" | "explicit">("sensual");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateStoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile);
  const [narrationRequested, setNarrationRequested] = useState(
    Boolean(initialProfile?.features.audio_enabled && initialProfile.preferences.narration_opt_in)
  );
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (profile) {
      return;
    }

    async function hydrateProfile() {
      try {
        const refreshedProfile = await getProfile();
        setProfile(refreshedProfile);
        setNarrationRequested(refreshedProfile.features.audio_enabled && refreshedProfile.preferences.narration_opt_in);
      } catch {
        // Leave the last known profile in place if the refresh fails.
      }
    }

    void hydrateProfile();
  }, [profile]);

  useEffect(() => {
    if (checkoutStatus !== "success") {
      return;
    }

    async function refreshAfterCheckout() {
      try {
        const refreshedProfile = await getProfile();
        setProfile(refreshedProfile);
        setNarrationRequested(refreshedProfile.features.audio_enabled && refreshedProfile.preferences.narration_opt_in);
      } catch {
        // Keep current state if webhook processing is still catching up.
      }
    }

    void refreshAfterCheckout();
  }, [checkoutStatus]);

  useEffect(() => {
    if (!result?.moderation.review_required) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshPendingStory(result.request_id);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [result?.moderation.review_required, result?.request_id]);

  const consentSummary = useMemo(
    () =>
      profile
        ? `${profile.preferences.kinks.length} kinks · ${profile.preferences.hard_limits.length} hard limits · ${profile.subscription_tier} tier`
        : "Loading stored preferences...",
    [profile]
  );
  const moderationToneClass = result?.moderation.review_required
    ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
    : result && !result.moderation.allowed
      ? "border-red-300/20 bg-red-500/10 text-red-100"
      : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";

  async function handleGenerate() {
    if (!profile) {
      setError("Your profile is still loading. Try again in a moment.");
      return;
    }

    if (profile.usage.daily_generation_remaining === 0) {
      setError("Your daily generation limit has been reached. Upgrade to Premium or VIP for unlimited generations, voice narration, and premium twin access.");
      return;
    }

    if (narrationRequested && !profile.features.audio_enabled) {
      setError("Audio narration is unlocked on Premium and VIP tiers, which also include unlimited generations and premium twin access.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateStory({
        prompt,
        preference_tags: profile.preferences.kinks,
        freeform_preferences: profile.preferences.custom_boundaries ?? undefined,
        boundaries: profile.preferences.hard_limits,
        content_style: style,
        branching_depth: 3,
        narration_requested: narrationRequested,
        consent: {
          user_is_adult: true,
          roleplay_consent_confirmed: true,
          prohibited_topics_acknowledged: true,
          wants_boundary_respect: true
        }
      });
      setResult(response);
      const refreshedProfile = await getProfile();
      setProfile(refreshedProfile);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Story generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPendingStory(requestId: string) {
    try {
      const refreshedResult = await getStoryRequest(requestId);
      setResult(refreshedResult);
    } catch {
      // Keep the last known state if the story is still unavailable.
    }
  }

  async function handlePlayNarration() {
    if (!result) {
      return;
    }

    if (!profile?.features.audio_enabled) {
      setError("Audio narration is unlocked on Premium and VIP tiers, which also include unlimited generations and premium twin access.");
      return;
    }

    setIsLoadingAudio(true);
    setError(null);

    try {
      const nextResult = result.audio_url ? result : await getStoryRequest(result.request_id, { audio: true });
      setResult(nextResult);

      if (!nextResult.audio_url) {
        throw new Error(nextResult.audio_error || "Narration audio is not available for this story yet.");
      }

      audioRef.current?.pause();
      const audio = new Audio(nextResult.audio_url);
      audio.playbackRate = 1;
      audioRef.current = audio;
      await audio.play();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not play narration audio.");
    } finally {
      setIsLoadingAudio(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Interactive fantasy engine</CardTitle>
          <CardDescription>Starter UI for `POST /api/generate-story` with consent signals and moderation trace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">{consentSummary}</div>
          <div className="space-y-2">
            <label className="text-sm text-orange-50/80" htmlFor="prompt">
              Prompt
            </label>
            <Textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-orange-50/80" htmlFor="style">
              Story mode
            </label>
            <select
              id="style"
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              value={style}
              onChange={(event) => setStyle(event.target.value as typeof style)}
            >
              <option value="romantic">romantic</option>
              <option value="sensual">sensual</option>
              <option value="dominant">dominant</option>
              <option value="playful">playful</option>
              <option value="explicit">explicit</option>
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
            <input
              checked={narrationRequested}
              className="mt-1 h-4 w-4 accent-orange-500"
              disabled={!profile?.features.audio_enabled}
              onChange={(event) => setNarrationRequested(event.target.checked)}
              type="checkbox"
            />
            <span>
              Pre-render audio narration.{" "}
              {profile?.features.audio_enabled
                ? "If moderation clears the story, Lumina will prepare a voice clip right away."
                : "Upgrade to Premium or VIP to unlock voice, unlimited generations, and premium twin access."}
            </span>
          </label>
          {profile?.subscription_tier === "free" || profile?.subscription_tier === "basic" ? (
            <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100">
              Premium features are gated by plan. <Link className="underline" href="/pricing">Upgrade here</Link> to unlock voice narration,
              unlimited generations, and premium twin access.
            </div>
          ) : null}
          <Button className="w-full" disabled={loading} onClick={handleGenerate} type="button">
            {loading ? "Generating..." : "Generate safeguarded opening scene"}
          </Button>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{result?.title ?? "Awaiting first generation"}</CardTitle>
          <CardDescription>
            {result
              ? `Consent score ${result.moderation.consent_score} · Provider ${result.provider}`
              : "Responses appear here after moderation and consent scoring."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-orange-50/88">
            {result?.story ?? "No story generated yet."}
          </div>

          {result ? (
            <>
              {result.moderation.review_required ? (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                  This generation is in human review. Use the refresh button below after moderation approval.
                </div>
              ) : null}
              <div className={`rounded-2xl border p-4 text-sm ${moderationToneClass}`}>
                Allowed: {String(result.moderation.allowed)} · Review required: {String(result.moderation.review_required)} · Audio:{" "}
                {String(result.audio_available)}
              </div>
              {!result.moderation.review_required && result.audio_available ? (
                <Button disabled={isLoadingAudio} onClick={() => void handlePlayNarration()} type="button" variant="outline">
                  {isLoadingAudio ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
                  {isLoadingAudio ? "Generating narration..." : "Play narration"}
                </Button>
              ) : null}
              {result.audio_error ? <p className="text-sm text-orange-200">{result.audio_error}</p> : null}
              {result.moderation.review_required ? (
                <Button onClick={() => void refreshPendingStory(result.request_id)} type="button" variant="outline">
                  Refresh review status
                </Button>
              ) : null}
              <div className="space-y-3">
                {result.branches.map((branch) => (
                  <div key={branch.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">{branch.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{branch.direction}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
