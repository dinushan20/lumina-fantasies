"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";

import { requestBetaAccess } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function BetaAccessForm() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("");
  const [accessTrack, setAccessTrack] = useState<"user" | "creator">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await requestBetaAccess({
        email,
        interest,
        requested_creator_access: accessTrack === "creator",
        source: "landing-page"
      });
      setSuccess(
        accessTrack === "creator"
          ? "You’re on the beta creator list. We’ll follow up with a creator invite when a review slot opens."
          : "You’re on the closed beta list. We’ll reach out as soon as a safe slot opens."
      );
      setInterest("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="glass-panel rounded-[32px] border border-orange-400/20 p-6 shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Closed beta access</p>
          <h3 className="mt-3 font-display text-3xl text-white sm:text-4xl">Request a private invite</h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-orange-50/78">
            We’re onboarding the first 20-30 users and creators carefully. Tell us whether you want to explore as a fan, a creator, or both.
          </p>
        </div>
        <div className="rounded-full border border-orange-400/20 bg-orange-500/10 p-3 text-orange-100">
          <Sparkles className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="beta-email">
            Email
          </label>
          <Input
            id="beta-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            value={email}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="beta-interest">
            Tell us your interest
          </label>
          <Textarea
            id="beta-interest"
            onChange={(event) => setInterest(event.target.value)}
            placeholder="Example: I want ethical voice-first companion chat with strong aftercare and creator-safe twins."
            rows={4}
            value={interest}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Request beta access as</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className={`rounded-[28px] border p-4 text-left transition ${
              accessTrack === "user" ? "border-orange-300/40 bg-orange-500/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
            }`}
            onClick={() => setAccessTrack("user")}
            type="button"
          >
            <p className="font-medium text-white">Beta user</p>
            <p className="mt-2 text-sm leading-6 text-orange-50/78">
              Explore stories, streaming chat, voice mode, and approved digital twins as a fan.
            </p>
          </button>
          <button
            className={`rounded-[28px] border p-4 text-left transition ${
              accessTrack === "creator" ? "border-emerald-300/35 bg-emerald-500/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
            }`}
            onClick={() => setAccessTrack("creator")}
            type="button"
          >
            <p className="font-medium text-white">Creator</p>
            <p className="mt-2 text-sm leading-6 text-orange-50/78">
              Join the creator waitlist for consent-attested twin onboarding, admin review, and invite-only access.
            </p>
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {success ? (
        <div className="mt-4 rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          We only store your email, interest note, and whether you requested user or creator beta access.
        </p>
        <Button disabled={isSubmitting || email.trim().length < 5} onClick={() => void handleSubmit()} type="button">
          {isSubmitting ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Saving request
            </>
          ) : (
            <>
              Request beta access
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
