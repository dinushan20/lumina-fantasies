"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AgeGateCard() {
  const router = useRouter();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/age-gate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          age_confirmed: isConfirmed
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Could not confirm your age yet.");
      }

      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not confirm your age yet.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl border-orange-400/20">
      <CardHeader>
        <CardTitle>Adult access confirmation</CardTitle>
        <CardDescription>
          Before profile setup begins, confirm that you are at least 18 years old and understand Lumina only supports consensual, legal adult fantasy content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-orange-50/82">
          <input
            checked={isConfirmed}
            className="mt-1 h-4 w-4 accent-orange-500"
            onChange={(event) => setIsConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>I confirm I am 18+ and will only use Lumina for consensual, legal adult experiences that respect platform boundaries.</span>
        </label>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100">
          This confirmation is required before the app can save profile preferences, start chats, process subscriptions, or call the backend generation APIs.
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <Button className="w-full" disabled={!isConfirmed || isPending} onClick={() => void handleContinue()} type="button">
          {isPending ? "Confirming..." : "Continue to safe onboarding"}
        </Button>
      </CardContent>
    </Card>
  );
}
