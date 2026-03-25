"use client";

import { useState } from "react";
import { LifeBuoy, LoaderCircle, MessageSquareHeart } from "lucide-react";

import { submitFeedback } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FeedbackButtonProps {
  pageContext: string;
}

export function FeedbackButton({ pageContext }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("product");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await submitFeedback({
        category,
        message,
        page_context: pageContext
      });
      setSuccess("Thanks. Your note is in the beta feedback queue.");
      setMessage("");
      setCategory("product");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send feedback right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        <LifeBuoy className="mr-2 h-4 w-4" />
        Feedback
      </Button>

      <Dialog
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setError(null);
            setSuccess(null);
          }
        }}
        open={open}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share beta feedback</DialogTitle>
            <DialogDescription>
              Send quick product notes, bugs, or feature requests. We store only the message, category, and page context.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="feedback-category">
                  Category
                </label>
                <Input id="feedback-category" onChange={(event) => setCategory(event.target.value)} value={category} />
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/78">
                We especially want notes on onboarding clarity, chat comfort on mobile, and any moment where the safety UX feels
                confusing.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="feedback-message">
                Your note
              </label>
              <Textarea
                id="feedback-message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What felt great, rough, confusing, or unexpectedly delightful?"
                rows={6}
                value={message}
              />
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {success ? (
              <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
                {success}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Close
            </Button>
            <Button disabled={isSubmitting || message.trim().length < 10} onClick={() => void handleSubmit()} type="button">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Sending
                </>
              ) : (
                <>
                  <MessageSquareHeart className="mr-2 h-4 w-4" />
                  Send feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
