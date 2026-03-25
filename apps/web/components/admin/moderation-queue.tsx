"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCcw, ShieldAlert } from "lucide-react";

import {
  escalateStaleModerationItems,
  getModerationQueue,
  getModerationQueueItem,
  reviewModerationQueueItem,
  type ModerationQueueDetail,
  type ModerationQueueStatus,
  type ModerationQueueSummary
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const statusOptions: Array<ModerationQueueStatus | "all"> = ["pending", "approved", "rejected", "escalated", "all"];

interface ModerationQueueClientProps {
  initialItems: ModerationQueueSummary[];
}

export function ModerationQueueClient({ initialItems }: ModerationQueueClientProps) {
  const [statusFilter, setStatusFilter] = useState<ModerationQueueStatus | "all">("pending");
  const [items, setItems] = useState<ModerationQueueSummary[]>(initialItems);
  const [pendingCount, setPendingCount] = useState(initialItems.length);
  const [selectedItem, setSelectedItem] = useState<ModerationQueueDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [finalScore, setFinalScore] = useState("85");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);

  useEffect(() => {
    void refreshQueue(statusFilter, { silent: true });

    const interval = window.setInterval(() => {
      void refreshQueue(statusFilter, { silent: true });
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [statusFilter]);

  const stats = useMemo(
    () => [
      {
        label: "Pending review",
        value: pendingCount,
        icon: Clock3
      },
      {
        label: "Showing",
        value: items.length,
        icon: ShieldAlert
      }
    ],
    [items.length, pendingCount]
  );

  async function refreshQueue(nextStatus: ModerationQueueStatus | "all", options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const requests = [
        getModerationQueue(nextStatus, 50),
        nextStatus === "pending" ? Promise.resolve<ModerationQueueSummary[] | null>(null) : getModerationQueue("pending", 50)
      ] as const;
      const [queueItems, pendingItems] = await Promise.all(requests);

      setItems(queueItems);
      setPendingCount(nextStatus === "pending" ? queueItems.length : pendingItems?.length ?? 0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not refresh the moderation queue.");
    } finally {
      setIsLoading(false);
    }
  }

  async function openItem(itemId: string) {
    setError(null);

    try {
      const detail = await getModerationQueueItem(itemId);
      setSelectedItem(detail);
      setNotes(detail.review_notes ?? "");
      setFinalScore(String(Math.round(detail.moderation_score)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load the moderation item.");
    }
  }

  async function handleReview(nextStatus: Exclude<ModerationQueueStatus, "pending">) {
    if (!selectedItem) {
      return;
    }

    const numericScore = Number(finalScore);
    if (Number.isNaN(numericScore)) {
      setError("Enter a valid final moderation score between 0 and 100.");
      return;
    }

    setIsReviewing(true);
    setError(null);

    try {
      const reviewedItem = await reviewModerationQueueItem(selectedItem.id, {
        status: nextStatus,
        notes: notes.trim() || undefined,
        final_score: numericScore
      });

      setSelectedItem(reviewedItem);
      await refreshQueue(statusFilter, { silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the moderation review.");
    } finally {
      setIsReviewing(false);
    }
  }

  async function handleEscalateStale() {
    setIsEscalating(true);
    setError(null);

    try {
      await escalateStaleModerationItems();
      await refreshQueue(statusFilter, { silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not escalate stale moderation items.");
    } finally {
      setIsEscalating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="border-orange-400/15">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
                <p className="mt-3 font-display text-4xl text-white">{value}</p>
              </div>
              <div className="rounded-full border border-orange-400/20 bg-orange-500/10 p-3 text-orange-200">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-white/10">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Admin moderation queue</CardTitle>
            <CardDescription>Review flagged stories, chat replies, and digital twin submissions before they can surface to end users.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={isEscalating} onClick={() => void handleEscalateStale()} type="button" variant="outline">
              {isEscalating ? "Escalating..." : "Escalate stale"}
            </Button>
            <Button disabled={isLoading} onClick={() => void refreshQueue(statusFilter)} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option}
                className={`rounded-full border px-4 py-2 text-sm capitalize transition ${
                  statusFilter === option
                    ? "border-orange-300/40 bg-orange-500/10 text-white"
                    : "border-white/10 bg-white/5 text-orange-50/75 hover:bg-white/10"
                }`}
                onClick={() => setStatusFilter(option)}
                type="button"
              >
                {option.replace("_", " ")}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="overflow-hidden rounded-[28px] border border-white/10">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length ? (
                    items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => void openItem(item.id)}
                      >
                        <TableCell>
                          <div className="space-y-2">
                            <p className="font-medium capitalize text-white">{item.content_type.replace("_", " ")}</p>
                            <StatusBadge status={item.status} />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-orange-50/80">{item.user_email}</TableCell>
                        <TableCell>
                          <div className="flex max-w-xs flex-wrap gap-2">
                            {item.flags.length ? (
                              item.flags.map((flag) => (
                                <Badge key={flag} className="border-white/10 bg-white/5 text-orange-50/75">
                                  {flag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No flags</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-white">{item.moderation_score.toFixed(1)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatTimestamp(item.created_at)}</TableCell>
                        <TableCell className="max-w-md text-sm leading-6 text-orange-50/80">{item.preview}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={6}>
                        {isLoading ? (
                          <span className="inline-flex items-center">
                            <LoaderCircle className="mr-3 h-4 w-4 animate-spin" />
                            Loading moderation items...
                          </span>
                        ) : (
                          "No moderation items match the current filter."
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
          }
        }}
      >
        <DialogContent>
          {selectedItem ? (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle>Review moderation item</DialogTitle>
                <DialogDescription>
                  {selectedItem.content_type.replace("_", " ")} · {selectedItem.user_email} · queued {formatTimestamp(selectedItem.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Current status</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <StatusBadge status={selectedItem.status} />
                    <span className="text-sm text-orange-50/80">Score {selectedItem.moderation_score.toFixed(1)}</span>
                  </div>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Flags</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedItem.flags.length ? (
                      selectedItem.flags.map((flag) => (
                        <Badge key={flag} className="border-white/10 bg-white/5 text-orange-50/75">
                          {flag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No flags captured</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Queued content</label>
                <div className="max-h-[36vh] overflow-y-auto rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <pre className="whitespace-pre-wrap font-body text-sm leading-7 text-orange-50/88">{selectedItem.display_output}</pre>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="review-notes">
                    Reviewer notes
                  </label>
                  <Textarea
                    id="review-notes"
                    onChange={(event) => setNotes(event.target.value)}
                    rows={5}
                    value={notes}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="final-score">
                    Final score
                  </label>
                  <Input
                    id="final-score"
                    max="100"
                    min="0"
                    onChange={(event) => setFinalScore(event.target.value)}
                    type="number"
                    value={finalScore}
                  />
                </div>
              </div>

              {selectedItem.reviewer_email ? (
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-muted-foreground">
                  Last review by {selectedItem.reviewer_email}
                  {selectedItem.reviewed_at ? ` on ${formatTimestamp(selectedItem.reviewed_at)}` : ""}.
                </div>
              ) : null}

              <DialogFooter>
                <Button disabled={isReviewing} onClick={() => void handleReview("escalated")} type="button" variant="outline">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Escalate
                </Button>
                <Button disabled={isReviewing} onClick={() => void handleReview("rejected")} type="button" variant="outline">
                  Reject
                </Button>
                <Button disabled={isReviewing} onClick={() => void handleReview("approved")} type="button">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ModerationQueueStatus }) {
  const className = {
    pending: "border-amber-300/20 bg-amber-500/10 text-amber-100",
    approved: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
    rejected: "border-red-300/20 bg-red-500/10 text-red-100",
    escalated: "border-orange-300/20 bg-orange-500/10 text-orange-100"
  }[status];

  return (
    <Badge className={className}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
