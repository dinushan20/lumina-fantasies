"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCcw, ShieldCheck, Trash2, WandSparkles } from "lucide-react";

import {
  deleteTwin,
  getMyTwins,
  type DigitalTwinCreatePayload,
  type DigitalTwinResponse,
  type ProfileResponse,
  type SubscriptionTier,
  type TwinConsentAttestation,
  type TwinReferenceData,
  updateTwin,
  uploadTwin
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreatorTwinDashboardProps {
  initialProfile: ProfileResponse | null;
}

const tierOptions: SubscriptionTier[] = ["free", "basic", "premium", "vip"];

interface FormState {
  name: string;
  description: string;
  voiceStyle: string;
  preferredVoiceId: string;
  personalityTraits: string;
  allowedKinks: string;
  hardLimits: string;
  examplePrompts: string;
  requiredTier: SubscriptionTier;
  signatureName: string;
  creatorIsAdult: boolean;
  rightsHolderConfirmed: boolean;
  likenessUseConsentConfirmed: boolean;
  noRawLikenessStorageAcknowledged: boolean;
  audienceIsAdultOnlyConfirmed: boolean;
}

const defaultFormState: FormState = {
  name: "",
  description: "",
  voiceStyle: "",
  preferredVoiceId: "",
  personalityTraits: "confident\nwarm\nconsent-forward",
  allowedKinks: "teasing\nslow-burn\npower exchange",
  hardLimits: "No minors\nNo coercion\nNo violence\nNo incest\nNo stalking",
  examplePrompts: "Invite the user to steer the mood while reaffirming consent.",
  requiredTier: "premium",
  signatureName: "",
  creatorIsAdult: false,
  rightsHolderConfirmed: false,
  likenessUseConsentConfirmed: false,
  noRawLikenessStorageAcknowledged: false,
  audienceIsAdultOnlyConfirmed: false
};

export function CreatorTwinDashboard({ initialProfile }: CreatorTwinDashboardProps) {
  const [profile] = useState(initialProfile);
  const [twins, setTwins] = useState<DigitalTwinResponse[]>([]);
  const [editingTwinId, setEditingTwinId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (initialProfile?.is_creator) {
      void refreshTwins({ silent: false });
      return;
    }

    setIsLoading(false);
  }, [initialProfile?.is_creator]);

  const activeCount = useMemo(() => twins.filter((twin) => twin.status === "active").length, [twins]);
  const pendingCount = useMemo(
    () => twins.filter((twin) => twin.status === "training" || twin.consent_status === "pending").length,
    [twins]
  );

  async function refreshTwins(options?: { silent?: boolean }) {
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const nextTwins = await getMyTwins();
      setTwins(nextTwins);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your digital twins.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingTwinId(null);
    setFormState(defaultFormState);
  }

  function hydrateFormFromTwin(twin: DigitalTwinResponse) {
    setEditingTwinId(twin.id);
    setFormState({
      name: twin.name,
      description: twin.description,
      voiceStyle: twin.reference_data.voice_style ?? "",
      preferredVoiceId: twin.preferred_voice_id ?? "",
      personalityTraits: twin.reference_data.personality_traits.join("\n"),
      allowedKinks: twin.reference_data.allowed_kinks.join("\n"),
      hardLimits: twin.reference_data.hard_limits.join("\n"),
      examplePrompts: twin.reference_data.example_prompts.join("\n"),
      requiredTier: twin.required_subscription_tier,
      signatureName: "",
      creatorIsAdult: true,
      rightsHolderConfirmed: true,
      likenessUseConsentConfirmed: true,
      noRawLikenessStorageAcknowledged: true,
      audienceIsAdultOnlyConfirmed: true
    });
    setFeedback("Editing an existing twin will send it back through human review before it goes live again.");
  }

  function buildReferenceData(): TwinReferenceData {
    return {
      voice_style: formState.voiceStyle.trim() || null,
      personality_traits: splitLines(formState.personalityTraits),
      allowed_kinks: splitLines(formState.allowedKinks),
      hard_limits: splitLines(formState.hardLimits),
      example_prompts: splitLines(formState.examplePrompts)
    };
  }

  function buildConsent(): TwinConsentAttestation {
    return {
      creator_is_adult: formState.creatorIsAdult,
      rights_holder_confirmed: formState.rightsHolderConfirmed,
      likeness_use_consent_confirmed: formState.likenessUseConsentConfirmed,
      no_raw_likeness_storage_acknowledged: formState.noRawLikenessStorageAcknowledged,
      audience_is_adult_only_confirmed: formState.audienceIsAdultOnlyConfirmed,
      signature_name: formState.signatureName.trim()
    };
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    const payload: DigitalTwinCreatePayload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      reference_data: buildReferenceData(),
      consent: buildConsent(),
      preferred_voice_id: formState.preferredVoiceId.trim() || null,
      required_subscription_tier: formState.requiredTier
    };

    try {
      const savedTwin = editingTwinId ? await updateTwin(editingTwinId, payload) : await uploadTwin(payload);

      setFeedback(
        savedTwin.status === "training"
          ? "Submitted for review. The twin will stay hidden until an admin approves the creator-approved persona and boundaries."
          : "Digital twin saved."
      );
      resetForm();
      await refreshTwins({ silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this digital twin.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchive(twinId: string) {
    setError(null);
    setFeedback(null);

    try {
      await deleteTwin(twinId);
      setFeedback("Twin archived. It will no longer appear in the public browse catalog.");
      await refreshTwins({ silent: true });
      if (editingTwinId === twinId) {
        resetForm();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not archive this digital twin.");
    }
  }

  if (!profile?.is_creator) {
    return (
      <Card className="border-orange-400/15">
        <CardHeader>
          <CardTitle>Creator access required</CardTitle>
          <CardDescription>This workspace opens once your profile has the creator flag enabled in the database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7 text-orange-50/80">
          <p>For local testing, set `profiles.is_creator = true` for your demo account.</p>
          <p>Once enabled, you can upload a consent-attested digital twin, track review status, and update approved boundaries safely.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="My twins" value={twins.length} />
        <StatCard label="Pending review" value={pendingCount} />
        <StatCard label="Active twins" value={activeCount} />
      </div>

      {activeCount ? (
        <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
          One or more twins are live. Fans on the right subscription tier can open `/twins` and start chatting with them immediately.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-orange-400/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WandSparkles className="h-5 w-5 text-orange-300" />
              {editingTwinId ? "Update digital twin" : "Create a digital twin"}
            </CardTitle>
            <CardDescription>
              Store only creator-approved metadata. Raw likeness files are intentionally excluded from this MVP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="twin-name">
                  Twin name
                </label>
                <Input
                  id="twin-name"
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Luna's Twin"
                  value={formState.name}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="required-tier">
                  Required tier
                </label>
                <select
                  className="flex h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition focus:border-orange-300/40"
                  id="required-tier"
                  onChange={(event) => updateField("requiredTier", event.target.value as SubscriptionTier)}
                  value={formState.requiredTier}
                >
                  {tierOptions.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="twin-description">
                Description
              </label>
              <Textarea
                id="twin-description"
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Describe the twin's sensual tone, emotional style, and creator-approved interaction frame."
                rows={5}
                value={formState.description}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="voice-style">
                  Voice style
                </label>
                <Textarea
                  id="voice-style"
                  onChange={(event) => updateField("voiceStyle", event.target.value)}
                  placeholder="Low, playful, luxurious, aftercare-forward..."
                  rows={3}
                  value={formState.voiceStyle}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="preferred-voice-id">
                  Preferred voice ID
                </label>
                <Input
                  id="preferred-voice-id"
                  onChange={(event) => updateField("preferredVoiceId", event.target.value)}
                  placeholder="Optional ElevenLabs voice ID"
                  value={formState.preferredVoiceId}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor="signature-name">
                  Consent signature
                </label>
                <Input
                  id="signature-name"
                  onChange={(event) => updateField("signatureName", event.target.value)}
                  placeholder="Creator legal or stage name"
                  value={formState.signatureName}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LabeledTextarea
                id="personality-traits"
                label="Personality traits"
                onChange={(value) => updateField("personalityTraits", value)}
                value={formState.personalityTraits}
              />
              <LabeledTextarea
                id="allowed-kinks"
                label="Allowed kinks"
                onChange={(value) => updateField("allowedKinks", value)}
                value={formState.allowedKinks}
              />
              <LabeledTextarea
                id="hard-limits"
                label="Hard limits"
                onChange={(value) => updateField("hardLimits", value)}
                value={formState.hardLimits}
              />
              <LabeledTextarea
                id="example-prompts"
                label="Example prompts"
                onChange={(value) => updateField("examplePrompts", value)}
                value={formState.examplePrompts}
              />
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Consent and rights attestation</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ConsentCheckbox
                  checked={formState.creatorIsAdult}
                  label="I confirm I am 18+."
                  onChange={(checked) => updateField("creatorIsAdult", checked)}
                />
                <ConsentCheckbox
                  checked={formState.audienceIsAdultOnlyConfirmed}
                  label="This twin is for adult audiences only."
                  onChange={(checked) => updateField("audienceIsAdultOnlyConfirmed", checked)}
                />
                <ConsentCheckbox
                  checked={formState.rightsHolderConfirmed}
                  label="I own or control the rights to this likeness/persona."
                  onChange={(checked) => updateField("rightsHolderConfirmed", checked)}
                />
                <ConsentCheckbox
                  checked={formState.likenessUseConsentConfirmed}
                  label="I explicitly consent to likeness use for this twin."
                  onChange={(checked) => updateField("likenessUseConsentConfirmed", checked)}
                />
                <ConsentCheckbox
                  checked={formState.noRawLikenessStorageAcknowledged}
                  label="I understand the MVP stores metadata only, not raw likeness files."
                  onChange={(checked) => updateField("noRawLikenessStorageAcknowledged", checked)}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button disabled={isSubmitting} onClick={() => void handleSubmit()} type="button">
                {isSubmitting ? "Submitting..." : editingTwinId ? "Save and resubmit" : "Submit for review"}
              </Button>
              <Button onClick={resetForm} type="button" variant="outline">
                Reset form
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                My digital twins
              </CardTitle>
              <CardDescription>Every twin stays in review until an admin approves the creator-approved persona and hard limits.</CardDescription>
            </div>
            <Button disabled={isRefreshing} onClick={() => void refreshTwins({ silent: true })} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                <LoaderCircle className="mr-3 h-4 w-4 animate-spin text-orange-200" />
                Loading your twins...
              </div>
            ) : twins.length ? (
              twins.map((twin) => (
                <div key={twin.id} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-white">{twin.name}</h3>
                        <Badge className="border-white/10 bg-white/5 text-orange-50/75">{twin.required_subscription_tier}</Badge>
                        <StatusBadge label={twin.status} />
                        <StatusBadge label={twin.consent_status} variant="secondary" />
                      </div>
                      <p className="text-sm leading-6 text-orange-50/78">{twin.description}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Score {twin.moderation_score.toFixed(0)} · updated {formatTimestamp(twin.updated_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => hydrateFormFromTwin(twin)} size="sm" type="button" variant="outline">
                        Edit
                      </Button>
                      <Button onClick={() => void handleArchive(twin.id)} size="sm" type="button" variant="outline">
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Archive
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-muted-foreground">
                No digital twins yet. Submit your first consent-attested twin to start the review pipeline.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-orange-400/15">
      <CardContent className="p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <p className="mt-3 font-display text-4xl text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

function LabeledTextarea({
  id,
  label,
  onChange,
  value
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Textarea id={id} onChange={(event) => onChange(event.target.value)} rows={5} value={value} />
    </div>
  );
}

function ConsentCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/80">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 rounded border-white/10 bg-black/20"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function StatusBadge({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  return (
    <Badge className={variant === "primary" ? "border-orange-400/20 bg-orange-500/10 text-orange-100" : "border-white/10 bg-white/5 text-orange-50/75"}>
      {label.replace("_", " ")}
    </Badge>
  );
}
