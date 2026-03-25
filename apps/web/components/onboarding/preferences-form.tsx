"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ProfilePreferences } from "@/lib/api";
import { saveOnboardingProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

const starterTags = ["slow-burn", "romantic", "teasing", "dominant", "soft praise", "voyeur fantasy", "power exchange", "aftercare"];
const starterGenres = ["luxury romance", "power exchange", "masked strangers", "aftercare-heavy", "voyeur tension", "playful banter"];

interface PreferencesFormProps {
  initialPreferences: ProfilePreferences;
}

export function PreferencesForm({ initialPreferences }: PreferencesFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialPreferences.kinks.length ? initialPreferences.kinks : ["romantic", "aftercare"]);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(
    initialPreferences.favorite_genres.length ? initialPreferences.favorite_genres : ["luxury romance"]
  );
  const [customBoundaries, setCustomBoundaries] = useState(initialPreferences.custom_boundaries ?? "");
  const [hardLimits, setHardLimits] = useState(
    initialPreferences.hard_limits.length
      ? initialPreferences.hard_limits.join("\n")
      : "No coercion\nNo minors\nNo real-person likeness\nNo violence"
  );
  const [error, setError] = useState<string | null>(null);

  const boundaryCount = useMemo(() => hardLimits.split("\n").filter(Boolean).length, [hardLimits]);

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function toggleGenre(tag: string) {
    setFavoriteGenres((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function continueToDashboard() {
    setError(null);
    setIsPending(true);

    try {
      await saveOnboardingProfile({
        preferences: {
          kinks: selectedTags,
          hard_limits: hardLimits
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          favorite_genres: favoriteGenres,
          custom_boundaries: customBoundaries.trim() || null,
          tone_preferences: [],
          narration_opt_in: false,
          digital_twin_interest: false
        }
      });
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your preferences.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Consent-first onboarding</CardTitle>
        <CardDescription>
          Capture preferences, boundaries, and expectations before the first generation. These settings now persist to your profile and
          are injected into every safeguarded story prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-orange-50/80">Starter kink and tone tags</label>
            <div className="flex flex-wrap gap-3">
              {starterTags.map((tag) => (
                <button
                  key={tag}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    selectedTags.includes(tag)
                      ? "border-orange-300/50 bg-orange-400/15 text-orange-100"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  )}
                  onClick={() => toggleTag(tag)}
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-orange-50/80">Favorite scene genres</label>
            <div className="flex flex-wrap gap-3">
              {starterGenres.map((genre) => (
                <button
                  key={genre}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    favoriteGenres.includes(genre)
                      ? "border-orange-300/50 bg-orange-400/15 text-orange-100"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  )}
                  onClick={() => toggleGenre(genre)}
                  type="button"
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-orange-50/80" htmlFor="customBoundaries">
              Custom boundary notes
            </label>
            <Textarea
              id="customBoundaries"
              value={customBoundaries}
              onChange={(event) => setCustomBoundaries(event.target.value)}
              placeholder="Example: keep the tone emotionally intense, elegant, and verbally explicit about consent."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-orange-50/80" htmlFor="hardLimits">
              Hard boundaries, one per line
            </label>
            <Textarea id="hardLimits" value={hardLimits} onChange={(event) => setHardLimits(event.target.value)} />
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/10 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-orange-200/70">Transparency</p>
            <h3 className="mt-2 font-display text-3xl text-white">Consent profile preview</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-muted-foreground">Selected tags</p>
            <p className="mt-2 text-sm text-white">{selectedTags.join(", ") || "No tags selected yet"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-muted-foreground">Boundary count</p>
            <p className="mt-2 text-3xl text-white">{boundaryCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
            The backend stores these boundaries in your profile, surfaces subscription entitlements, and folds your hard limits into every
            generation request before the LLM sees it.
          </div>
          <div className="space-y-3">
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <Button className="w-full" disabled={isPending} onClick={continueToDashboard} type="button">
              {isPending ? "Saving profile..." : "Save profile and continue"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
