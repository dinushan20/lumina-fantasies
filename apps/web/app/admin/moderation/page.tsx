import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminBetaOperations } from "@/components/admin/beta-operations";
import { ModerationQueueClient } from "@/components/admin/moderation-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchBackendAsCurrentUser, getServerProfileOrNull } from "@/lib/server/backend";
import type { AnalyticsOverviewResponse, CreatorInviteResponse, ModerationQueueSummary } from "@/lib/api";

export default async function AdminModerationPage() {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    redirect("/onboarding");
  }

  const profile = await getServerProfileOrNull();
  const isAdmin = session.user.role === "admin" || profile?.role === "admin";

  if (!isAdmin) {
    redirect("/dashboard");
  }

  let initialItems: ModerationQueueSummary[] = [];
  let initialAnalytics: AnalyticsOverviewResponse | null = null;
  let initialInvites: CreatorInviteResponse[] = [];

  try {
    const [queueResponse, analyticsResponse, invitesResponse] = await Promise.all([
      fetchBackendAsCurrentUser("/api/moderation/queue?status=pending&limit=50"),
      fetchBackendAsCurrentUser("/api/admin/analytics/overview?days=14"),
      fetchBackendAsCurrentUser("/api/admin/creator-invites")
    ]);
    if (queueResponse.ok) {
      initialItems = (await queueResponse.json()) as ModerationQueueSummary[];
    }
    if (analyticsResponse.ok) {
      initialAnalytics = (await analyticsResponse.json()) as AnalyticsOverviewResponse;
    }
    if (invitesResponse.ok) {
      initialInvites = (await invitesResponse.json()) as CreatorInviteResponse[];
    }
  } catch {
    initialItems = [];
    initialAnalytics = null;
    initialInvites = [];
  }

  return (
    <main className="page-shell min-h-screen py-8">
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-orange-400/15">
          <CardHeader>
            <CardTitle>Safety operations</CardTitle>
            <CardDescription>Admin-only review queue for any story, chat reply, or digital twin that falls below the live release threshold.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-orange-50/78">
            Human moderation is the final safety layer before beta. Reviewers can approve, reject, or escalate queued outputs and the
            decision immediately updates the underlying story, chat, or digital twin record.
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle>Release policy</CardTitle>
            <CardDescription>End users never receive queued raw content until a moderator approves it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Stories under review return a guarded placeholder.</p>
            <p>Chat replies under review stream a gentle “reviewing” message instead of the original text.</p>
            <p>Items older than 24 hours can be escalated with a single admin action.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <AdminBetaOperations initialAnalytics={initialAnalytics} initialInvites={initialInvites} />
      </div>

      <ModerationQueueClient initialItems={initialItems} />
    </main>
  );
}
