import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ClerkSignOutButton } from "@/components/auth/clerk-sign-out-button";
import { BillingSummary } from "@/components/dashboard/billing-summary";
import { FeedbackButton } from "@/components/dashboard/feedback-button";
import { StoryGenerator } from "@/components/story/story-generator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerProfileOrNull } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    redirect("/onboarding");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const checkoutStatus = typeof resolvedSearchParams.checkout === "string" ? resolvedSearchParams.checkout : undefined;
  const profile = await getServerProfileOrNull();
  const isAdmin = session.user.role === "admin" || profile?.role === "admin";

  return (
    <main className="page-shell min-h-screen py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-orange-200/70">Authenticated preview</p>
          <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">Welcome, {session.user.name ?? session.user.email}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <FeedbackButton pageContext="dashboard" />
          <Button asChild variant="outline">
            <Link href="/twins">Browse twins</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">Open chat</Link>
          </Button>
          <ClerkSignOutButton />
        </div>
      </div>
      <div className="space-y-6">
        {isAdmin ? (
          <Card className="border-orange-400/15">
            <CardHeader>
              <CardTitle>Admin</CardTitle>
              <CardDescription>Safety operations, beta analytics, creator invites, and human review tooling for flagged outputs.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/admin/moderation">Open moderation queue</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {profile?.is_creator ? (
          <Card className="border-emerald-400/15">
            <CardHeader>
              <CardTitle>Creator studio</CardTitle>
              <CardDescription>Upload and manage consent-attested digital twins for admin review and fan subscriptions.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/dashboard/creators/onboard">Guided onboarding</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/creators">Open creator workspace</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <BillingSummary checkoutStatus={checkoutStatus} initialProfile={profile} />
        <StoryGenerator checkoutStatus={checkoutStatus} initialProfile={profile} />
      </div>
    </main>
  );
}
