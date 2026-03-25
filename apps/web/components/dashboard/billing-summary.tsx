"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ProfileResponse } from "@/lib/api";
import { createBillingPortalSession, getProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface BillingSummaryProps {
  initialProfile: ProfileResponse | null;
  checkoutStatus?: string;
}

export function BillingSummary({ initialProfile, checkoutStatus }: BillingSummaryProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checkoutStatus !== "success") {
      return;
    }

    async function refreshProfile() {
      try {
        const refreshedProfile = await getProfile();
        setProfile(refreshedProfile);
      } catch {
        // Keep the server-rendered state if the immediate refresh lags behind the webhook.
      }
    }

    void refreshProfile();
  }, [checkoutStatus]);

  async function handleManageBilling() {
    setError(null);
    setIsPending(true);

    try {
      const portal = await createBillingPortalSession();
      window.location.assign(portal.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not open the billing portal.");
      setIsPending(false);
    }
  }

  const tier = profile?.subscription_tier ?? "free";
  const status = profile?.subscription_status ?? "inactive";

  return (
    <Card className="border-orange-400/15">
      <CardHeader>
        <CardTitle>Subscription status</CardTitle>
        <CardDescription>Billing, entitlements, and feature access for your profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {checkoutStatus === "success" ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Checkout returned successfully. If Stripe’s webhook is still processing, this card will refresh on the next page load.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Tier</p>
            <p className="mt-2 text-2xl capitalize text-white">{tier}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Status</p>
            <p className="mt-2 text-2xl capitalize text-white">{status.replace("_", " ")}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Daily remaining</p>
            <p className="mt-2 text-2xl text-white">{profile?.usage.daily_generation_remaining ?? "Unlimited"}</p>
          </div>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/pricing">View plans</Link>
          </Button>
          <Button disabled={!profile?.stripe_customer_id || isPending} onClick={handleManageBilling} type="button">
            {isPending ? "Opening..." : "Manage billing"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
