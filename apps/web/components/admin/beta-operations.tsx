"use client";

import { useState } from "react";
import { BarChart3, Copy, LoaderCircle, MailPlus, RefreshCcw } from "lucide-react";

import {
  createCreatorInvite,
  getAnalyticsOverview,
  getCreatorInvites,
  type AnalyticsOverviewResponse,
  type CreatorInviteResponse
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface AdminBetaOperationsProps {
  initialAnalytics: AnalyticsOverviewResponse | null;
  initialInvites: CreatorInviteResponse[];
}

export function AdminBetaOperations({ initialAnalytics, initialInvites }: AdminBetaOperationsProps) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshPanels() {
    setIsRefreshing(true);
    setError(null);

    try {
      const [nextAnalytics, nextInvites] = await Promise.all([getAnalyticsOverview(14), getCreatorInvites()]);
      setAnalytics(nextAnalytics);
      setInvites(nextInvites);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not refresh beta operations data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateInvite() {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      const invite = await createCreatorInvite({ email, expires_in_days: 21 });
      setInvites((current) => [invite, ...current.filter((item) => item.email !== invite.email)]);
      setFeedback(`Invite ready for ${invite.email}. Copy the link and send it through your preferred creator outreach channel.`);
      setEmail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the creator invite.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyInvite(inviteUrl: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setFeedback("Invite link copied.");
    } catch {
      setFeedback("Copy failed. You can still select the link manually.");
    }
  }

  const summary = analytics?.summary;
  const stats = summary
    ? [
        { label: "Active users (14d)", value: summary.active_users },
        { label: "Story generations", value: summary.story_generations },
        { label: "Audio renders", value: summary.audio_renders },
        { label: "Twin chat turns", value: summary.twin_chat_messages }
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="border-orange-400/15">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-300" />
                Beta analytics
              </CardTitle>
              <CardDescription>Lightweight anonymized usage metrics for the beta cohort.</CardDescription>
            </div>
            <Button disabled={isRefreshing} onClick={() => void refreshPanels()} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {summary ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((stat) => (
                    <div key={stat.label} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</p>
                      <p className="mt-3 font-display text-3xl text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <InlineMetric label="Pending beta requests" value={summary.pending_beta_requests} />
                  <InlineMetric label="New feedback items" value={summary.pending_feedback_items} />
                  <InlineMetric label="Active creator invites" value={summary.active_creator_invites} />
                </div>
              </>
            ) : (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-muted-foreground">
                Analytics will appear here once the beta services are online.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailPlus className="h-5 w-5 text-emerald-300" />
              Invite creators
            </CardTitle>
            <CardDescription>Generate a unique onboarding link for a vetted creator.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="creator-email">
                Creator email
              </label>
              <Input
                id="creator-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="creator@example.com"
                value={email}
              />
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/78">
              Invites expire after 21 days and unlock the creator onboarding wizard once claimed.
            </div>
            <Button disabled={isSubmitting || email.trim().length < 5} onClick={() => void handleCreateInvite()} type="button">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Creating
                </>
              ) : (
                "Generate invite link"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle>Recent creator invites</CardTitle>
          <CardDescription>Newest invite links, claim status, and expiration windows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {invites.length ? (
            invites.slice(0, 8).map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{invite.email}</p>
                    <Badge className="border-white/10 bg-white/5 text-orange-50/70">{invite.status}</Badge>
                  </div>
                  <p className="break-all text-sm leading-6 text-muted-foreground">{invite.invite_url}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-orange-100/55">
                    Created {formatTimestamp(invite.created_at)}
                    {invite.expires_at ? ` · expires ${formatTimestamp(invite.expires_at)}` : ""}
                  </p>
                </div>
                <Button onClick={() => void handleCopyInvite(invite.invite_url)} size="sm" type="button" variant="outline">
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy link
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-muted-foreground">
              No creator invites yet. Generate the first link when you are ready to onboard a vetted creator.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl text-white">{value}</p>
    </div>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
