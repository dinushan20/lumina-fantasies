import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mic2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import { auth } from "@/auth";
import { BetaAccessForm } from "@/components/marketing/beta-access-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Lumina Fantasies | Ethical AI fantasy companions",
  description:
    "Private, consent-first AI fantasy companions and creator-approved digital twins with moderation, subscriptions, and voice narration.",
  openGraph: {
    title: "Lumina Fantasies",
    description: "Your private, ethical AI fantasy companions and creator twins.",
    type: "website"
  }
};

const productPillars = [
  {
    title: "Personalized fantasy engine",
    description: "Branching stories shaped by your saved preferences, tone, hard limits, and subscription entitlements.",
    icon: Sparkles
  },
  {
    title: "Voice-first companions",
    description: "Streaming chat, optional narration, and twin-specific voice styling for Premium and VIP members.",
    icon: Mic2
  },
  {
    title: "Creator-safe twins",
    description: "Metadata-only digital twins, explicit creator consent, admin review, and shared safety guardrails on every turn.",
    icon: UsersRound
  }
];

const trustPoints = [
  "No minors, coercion, or illegal content.",
  "No real-person deepfakes without explicit creator consent.",
  "Moderation before text or audio reaches the user.",
  "Minimal storage with privacy-first defaults."
];

const pricingTeaser = [
  { tier: "Basic", price: "$9", summary: "Regular fantasy sessions with profile persistence." },
  { tier: "Premium", price: "$19", summary: "Unlimited generations, voice mode, and richer companions." },
  { tier: "VIP", price: "$29", summary: "Priority handling, voice-first immersion, and early twin access." }
];

export default async function HomePage() {
  const session = await auth();
  const primaryHref = session ? "/dashboard" : "/sign-in";
  const primaryLabel = session ? "Enter your dashboard" : "Enter the platform";

  return (
    <main className="overflow-hidden">
      <section className="soft-grid">
        <div className="page-shell min-h-screen py-8 sm:py-10">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Badge>Lumina Fantasies</Badge>
              <p className="mt-3 max-w-xl text-sm leading-7 text-orange-50/72">
                Private, ethical AI fantasy companions and creator-approved twins designed for adults, guided by consent, and reviewed with care.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button asChild>
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
            </div>
          </header>

          <div className="grid items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
            <div className="space-y-8">
              <div className="space-y-5">
                <p className="section-kicker">Closed beta spring 2026</p>
                <h1 className="max-w-4xl font-display text-5xl leading-tight text-white sm:text-6xl lg:text-7xl">
                  Your private, ethical AI fantasy companions and creator twins.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-orange-50/78 sm:text-lg">
                  Lumina combines branching stories, real-time companion chat, voice narration, subscriptions, and creator-owned digital twins while keeping consent, privacy, and moderation at the center.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href={primaryHref}>
                    {primaryLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/twins">Browse approved twins</Link>
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {trustPoints.map((point) => (
                  <div key={point} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-orange-50/80">
                    <ShieldCheck className="mb-3 h-5 w-5 text-emerald-300" />
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <Card className="overflow-hidden border-orange-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LockKeyhole className="h-5 w-5 text-orange-300" />
                    What beta users get
                  </CardTitle>
                  <CardDescription>One polished platform for ethical adult storytelling, chat, audio, and creator monetization.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {productPillars.map(({ icon: Icon, title, description }) => (
                    <div key={title} className="rounded-[28px] border border-white/10 bg-black/15 p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-2 text-orange-100">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="font-medium text-white">{title}</p>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                {pricingTeaser.map((plan) => (
                  <Card key={plan.tier} className={plan.tier === "Premium" ? "border-orange-400/25" : "border-white/10"}>
                    <CardContent className="p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{plan.tier}</p>
                      <p className="mt-3 font-display text-4xl text-white">{plan.price}</p>
                      <p className="mt-3 text-sm leading-6 text-orange-50/78">{plan.summary}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-8 pb-16 xl:grid-cols-[1.15fr_0.85fr]">
            <BetaAccessForm />

            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Why closed beta first</CardTitle>
                <CardDescription>We’re onboarding slowly so moderation, creator review, and billing all feel trustworthy from day one.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-orange-50/78">
                <p>Early users help us refine onboarding comfort, mobile chat flow, and how clearly the platform explains boundaries and consent scoring.</p>
                <p>Early creators help us validate twin approval, safer monetization, and premium fan interactions before broad launch.</p>
                <Button asChild className="w-full" variant="outline">
                  <Link href="/pricing">See subscription plans</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
