"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

import {
  acceptCreatorInvite,
  uploadTwin,
  type DigitalTwinCreatePayload,
  type ProfileResponse,
  type SubscriptionTier,
  type TwinConsentAttestation,
  type TwinReferenceData
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreatorOnboardingWizardProps {
  initialProfile: ProfileResponse | null;
  inviteToken: string | null;
}

const tierOptions: SubscriptionTier[] = ["free", "basic", "premium", "vip"];

export function CreatorOnboardingWizard({ initialProfile, inviteToken }: CreatorOnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [isCreator, setIsCreator] = useState(Boolean(initialProfile?.is_creator));
  const [isClaimingInvite, setIsClaimingInvite] = useState(false);
  const [isSubmittingTwin, setIsSubmittingTwin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [createdTwinName, setCreatedTwinName] = useState<string | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState({
    consent: false,
    adultOnly: false,
    rights: false
  });
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    voiceStyle: "Velvet, low, attentive, reassuring, luxurious.",
    preferredVoiceId: "",
    personalityTraits: "warm\nconfident\nconsent-forward\nplayfully observant",
    allowedKinks: "slow-burn\nteasing\naftercare\npower exchange",
    hardLimits: "No minors\nNo coercion\nNo real-person imitation outside this consented twin\nNo violence\nNo incest",
    examplePrompts: "Invite the user to guide pace and tone while reaffirming consent.",
    requiredTier: "premium" as SubscriptionTier,
    signatureName: initialProfile?.email ?? "",
    creatorIsAdult: false,
    rightsHolderConfirmed: false,
    likenessUseConsentConfirmed: false,
    noRawLikenessStorageAcknowledged: true,
    audienceIsAdultOnlyConfirmed: false
  });

  const canAdvanceRules = useMemo(
    () => Object.values(rulesAccepted).every(Boolean) && isCreator,
    [isCreator, rulesAccepted]
  );

  function updateField<K extends keyof typeof formState>(key: K, value: (typeof formState)[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleClaimInvite() {
    if (!inviteToken) {
      return;
    }

    setIsClaimingInvite(true);
    setError(null);
    setFeedback(null);

    try {
      await acceptCreatorInvite(inviteToken);
      setIsCreator(true);
      setFeedback("Creator access unlocked. You can finish the onboarding checklist and submit your first twin now.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not claim this creator invite.");
    } finally {
      setIsClaimingInvite(false);
    }
  }

  async function handleSubmitTwin() {
    setIsSubmittingTwin(true);
    setError(null);
    setFeedback(null);

    const payload: DigitalTwinCreatePayload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      reference_data: buildReferenceData(formState),
      consent: buildConsent(formState),
      preferred_voice_id: formState.preferredVoiceId.trim() || null,
      required_subscription_tier: formState.requiredTier
    };

    try {
      const twin = await uploadTwin(payload);
      setCreatedTwinName(twin.name);
      setStep(2);
      setFeedback("Twin submitted for admin review.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit your twin.");
    } finally {
      setIsSubmittingTwin(false);
    }
  }

  if (!isCreator && !inviteToken) {
    return (
      <Card className="border-orange-400/15">
        <CardHeader>
          <CardTitle>Creator invite required</CardTitle>
          <CardDescription>This guided flow opens after an admin issues a creator invite or marks your profile as a creator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-orange-50/80">
          <p>For local testing, either claim a creator invite link or set `profiles.is_creator = true` for your account.</p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { index: 0, label: "Rules" },
          { index: 1, label: "First twin" },
          { index: 2, label: "Review" }
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-[28px] border p-4 ${
              step === item.index
                ? "border-orange-300/35 bg-orange-500/10"
                : step > item.index
                  ? "border-emerald-400/20 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Step {item.index + 1}</p>
            <p className="mt-2 font-medium text-white">{item.label}</p>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <Card className="border-orange-400/15">
          <CardHeader>
            <Badge>Creator onboarding</Badge>
            <CardTitle className="mt-3 text-4xl text-white sm:text-5xl">Start safely, then make your first twin feel alive.</CardTitle>
            <CardDescription className="max-w-3xl leading-7">
              This wizard walks through the platform rules, verifies creator consent, and guides your first twin submission into the review queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isCreator && inviteToken ? (
              <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5">
                <p className="text-sm leading-7 text-emerald-100">
                  A creator invite was detected for your account. Claim it first, then continue to the onboarding checklist.
                </p>
                <Button className="mt-4" disabled={isClaimingInvite} onClick={() => void handleClaimInvite()} type="button">
                  {isClaimingInvite ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Claiming invite
                    </>
                  ) : (
                    "Claim creator invite"
                  )}
                </Button>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <RuleCard
                  checked={rulesAccepted.consent}
                  copy="I will only submit creator-owned, consented metadata and understand unconsented likeness cloning is prohibited."
                  label="Consent and ownership"
                  onChange={(checked) => setRulesAccepted((current) => ({ ...current, consent: checked }))}
                />
                <RuleCard
                  checked={rulesAccepted.adultOnly}
                  copy="I understand every twin is adult-only, consent-forward, and barred from minors, coercion, or illegal content."
                  label="Adult-only content rules"
                  onChange={(checked) => setRulesAccepted((current) => ({ ...current, adultOnly: checked }))}
                />
                <RuleCard
                  checked={rulesAccepted.rights}
                  copy="I understand the platform fee is 15%, twins stay hidden until approved, and all interactions continue through live moderation."
                  label="Review and earnings"
                  onChange={(checked) => setRulesAccepted((current) => ({ ...current, rights: checked }))}
                />
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <p className="section-kicker">What happens next</p>
                <div className="mt-4 space-y-4 text-sm leading-7 text-orange-50/78">
                  <p>1. Submit one metadata-only twin with clear allowed kinks, hard limits, and tone.</p>
                  <p>2. Admin review checks consent, safety, and creator boundary clarity.</p>
                  <p>3. Once approved, fans can discover the twin and chat within the subscription tier you set.</p>
                </div>
              </div>
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button disabled={!canAdvanceRules} onClick={() => setStep(1)} type="button">
                Continue to twin setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard/creators">Open creator studio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="border-orange-400/15">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-300" />
                Create your first twin
              </CardTitle>
              <CardDescription>Store safe persona metadata only. Raw likeness assets stay out of this MVP.</CardDescription>
            </div>
            <Button onClick={() => setStep(0)} type="button" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Twin name">
                <Input onChange={(event) => updateField("name", event.target.value)} placeholder="Velvet Luna" value={formState.name} />
              </Field>
              <Field label="Required tier">
                <select
                  className="flex h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition focus:border-orange-300/40"
                  onChange={(event) => updateField("requiredTier", event.target.value as SubscriptionTier)}
                  value={formState.requiredTier}
                >
                  {tierOptions.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Describe the twin’s emotional style, boundaries, and creator-approved atmosphere."
                rows={5}
                value={formState.description}
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Voice style">
                <Textarea
                  onChange={(event) => updateField("voiceStyle", event.target.value)}
                  placeholder="Soft, smoky, teasing, aftercare-forward..."
                  rows={4}
                  value={formState.voiceStyle}
                />
              </Field>
              <Field label="Preferred voice ID">
                <Input
                  onChange={(event) => updateField("preferredVoiceId", event.target.value)}
                  placeholder="Optional ElevenLabs voice ID"
                  value={formState.preferredVoiceId}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Personality traits">
                <Textarea onChange={(event) => updateField("personalityTraits", event.target.value)} rows={5} value={formState.personalityTraits} />
              </Field>
              <Field label="Allowed kinks">
                <Textarea onChange={(event) => updateField("allowedKinks", event.target.value)} rows={5} value={formState.allowedKinks} />
              </Field>
              <Field label="Hard limits">
                <Textarea onChange={(event) => updateField("hardLimits", event.target.value)} rows={5} value={formState.hardLimits} />
              </Field>
              <Field label="Example prompts">
                <Textarea onChange={(event) => updateField("examplePrompts", event.target.value)} rows={5} value={formState.examplePrompts} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Consent signature">
                <Input onChange={(event) => updateField("signatureName", event.target.value)} value={formState.signatureName} />
              </Field>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/78">
                Creator fee reminder: approved fan subscriptions pay out with a 15% platform fee, while moderation and billing remain handled by Lumina.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ConsentRow
                checked={formState.creatorIsAdult}
                label="I confirm I am 18+."
                onChange={(checked) => updateField("creatorIsAdult", checked)}
              />
              <ConsentRow
                checked={formState.rightsHolderConfirmed}
                label="I own or control the rights to this persona."
                onChange={(checked) => updateField("rightsHolderConfirmed", checked)}
              />
              <ConsentRow
                checked={formState.likenessUseConsentConfirmed}
                label="I explicitly consent to this likeness/persona use."
                onChange={(checked) => updateField("likenessUseConsentConfirmed", checked)}
              />
              <ConsentRow
                checked={formState.audienceIsAdultOnlyConfirmed}
                label="This twin is intended only for adult audiences."
                onChange={(checked) => updateField("audienceIsAdultOnlyConfirmed", checked)}
              />
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isSubmittingTwin || !isTwinReady(formState)}
                onClick={() => void handleSubmitTwin()}
                type="button"
              >
                {isSubmittingTwin ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Submitting
                  </>
                ) : (
                  "Submit first twin"
                )}
              </Button>
              <Button onClick={() => setStep(0)} type="button" variant="outline">
                Review rules again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="border-emerald-400/20">
          <CardHeader>
            <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100">Submitted for review</Badge>
            <CardTitle className="mt-3 flex items-center gap-2 text-4xl text-white sm:text-5xl">
              <CheckCircle2 className="h-6 w-6 text-emerald-300" />
              {createdTwinName ?? "Your twin"} is in the queue
            </CardTitle>
            <CardDescription className="max-w-3xl leading-7">
              Admin review checks consent, safety, and clarity. Once approved, the twin will appear in the public catalog and can start earning with a 15% platform fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-orange-50/78">
              <p className="font-medium text-white">What happens now</p>
              <p className="mt-3">You can return to the creator studio anytime to monitor review status, edit boundaries, or prepare additional twins.</p>
            </div>
            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm leading-7 text-emerald-100">
              We’ll surface approval status inside the creator dashboard. For this MVP, review updates are shown in-app rather than email.
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button asChild>
                <Link href="/dashboard/creators">Open creator studio</Link>
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/twins">Preview public catalog</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function buildReferenceData(formState: CreatorFormState): TwinReferenceData {
  return {
    voice_style: formState.voiceStyle.trim() || null,
    personality_traits: splitLines(formState.personalityTraits),
    allowed_kinks: splitLines(formState.allowedKinks),
    hard_limits: splitLines(formState.hardLimits),
    example_prompts: splitLines(formState.examplePrompts)
  };
}

function buildConsent(formState: CreatorFormState): TwinConsentAttestation {
  return {
    creator_is_adult: formState.creatorIsAdult,
    rights_holder_confirmed: formState.rightsHolderConfirmed,
    likeness_use_consent_confirmed: formState.likenessUseConsentConfirmed,
    no_raw_likeness_storage_acknowledged: formState.noRawLikenessStorageAcknowledged,
    audience_is_adult_only_confirmed: formState.audienceIsAdultOnlyConfirmed,
    signature_name: formState.signatureName.trim()
  };
}

type CreatorFormState = {
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
};

function isTwinReady(formState: CreatorFormState) {
  return Boolean(
    formState.name.trim() &&
      formState.description.trim() &&
      formState.signatureName.trim() &&
      formState.creatorIsAdult &&
      formState.rightsHolderConfirmed &&
      formState.likenessUseConsentConfirmed &&
      formState.audienceIsAdultOnlyConfirmed
  );
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function RuleCard({
  checked,
  label,
  copy,
  onChange
}: {
  checked: boolean;
  label: string;
  copy: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/80">
      <input checked={checked} className="mt-1 h-4 w-4" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>
        <span className="block font-medium text-white">{label}</span>
        <span className="mt-1 block">{copy}</span>
      </span>
    </label>
  );
}

function ConsentRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-orange-50/80">
      <input checked={checked} className="mt-1 h-4 w-4" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
