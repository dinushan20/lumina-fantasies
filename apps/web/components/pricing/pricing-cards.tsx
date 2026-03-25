"use client";

import { useState } from "react";
import Link from "next/link";

import type { ProfileResponse, SubscriptionTier } from "@/lib/api";
import { createCheckoutSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PricingCardsProps {
  profile: ProfileResponse | null;
  signedIn: boolean;
}

const tiers: Array<{
  tier: Exclude<SubscriptionTier, "free">;
  price: string;
  summary: string;
  features: string[];
}> = [
  {
    tier: "basic",
    price: "$9 / month",
    summary: "Entry plan for regular fantasy sessions.",
    features: ["30 safeguarded generations per day", "Saved onboarding profile", "Subscription status synced to your dashboard"]
  },
  {
    tier: "premium",
    price: "$19 / month",
    summary: "Unlimited sessions and narration access.",
    features: ["Unlimited safeguarded generations", "Audio narration unlocked", "Best choice for daily companion use"]
  },
  {
    tier: "vip",
    price: "$29 / month",
    summary: "Highest-touch access for power users and creator fans.",
    features: ["Unlimited safeguarded generations", "Audio narration + priority handling", "Early digital twin access signals"]
  }
];

export function PricingCards({ profile, signedIn }: PricingCardsProps) {
  const [loadingTier, setLoadingTier] = useState<Exclude<SubscriptionTier, "free"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(tier: Exclude<SubscriptionTier, "free">) {
    setLoadingTier(tier);
    setError(null);

    try {
      const session = await createCheckoutSession(tier);
      window.location.assign(session.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start Stripe Checkout.");
      setLoadingTier(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        {tiers.map((entry) => {
          const isCurrentPlan = profile?.subscription_tier === entry.tier && profile.subscription_status === "active";

          return (
            <Card key={entry.tier} className={entry.tier === "premium" ? "border-orange-400/30" : ""}>
              <CardHeader>
                <CardTitle className="capitalize">{entry.tier}</CardTitle>
                <CardDescription>{entry.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-display text-4xl text-white">{entry.price}</p>
                <div className="space-y-3 text-sm text-muted-foreground">
                  {entry.features.map((feature) => (
                    <p key={feature} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      {feature}
                    </p>
                  ))}
                </div>
                {signedIn ? (
                  <Button
                    className="w-full"
                    disabled={loadingTier === entry.tier || isCurrentPlan}
                    onClick={() => handleSubscribe(entry.tier)}
                    type="button"
                    variant={entry.tier === "premium" ? "primary" : "outline"}
                  >
                    {isCurrentPlan ? "Current plan" : loadingTier === entry.tier ? "Redirecting..." : `Subscribe to ${entry.tier}`}
                  </Button>
                ) : (
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/sign-in">Sign in to subscribe</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

