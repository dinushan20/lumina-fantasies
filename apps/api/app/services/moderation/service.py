from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.schemas.story import StoryGenerateRequest
from app.schemas.twin import TwinConsentAttestation, TwinReferenceData


@dataclass(slots=True)
class ModerationDecision:
    allowed: bool
    blocked_reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    review_required: bool = False
    consent_score: int = 0


class ModerationService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.block_rules: dict[str, str] = {
            "minor_or_age_ambiguity": r"\b(minor|underage|teen|schoolgirl|schoolboy|child|kid|young-looking|barely legal)\b",
            "non_consent_or_coercion": r"\b(non-consensual|rape|forced|force her|force him|without consent|drugged|unconscious|blackmail|kidnap)\b",
            "violence_or_injury": r"\b(torture|maim|knife play|snuff|gore|bloodplay|break bones)\b",
            "familial_or_incest": r"\b(mother|father|brother|sister|daughter|son|stepbrother|stepsister)\b",
            "bestiality": r"\b(animal|dog|horse|bestiality)\b",
            "real_person_likeness": r"\b(real person|deepfake|celebrity|my coworker|my boss|my ex|instagram model|streamer)\b",
        }
        self.high_risk_review_terms = re.compile(r"\b(teacher|boss|coworker|client|public figure|celebrity)\b", re.IGNORECASE)
        self.consent_language = re.compile(r"\b(consent|agreed|asked|yes|permission|safeword|check-in)\b", re.IGNORECASE)

    def compute_consent_score(self, payload: StoryGenerateRequest) -> int:
        score = 0

        if payload.consent.user_is_adult:
            score += 35
        if payload.consent.roleplay_consent_confirmed:
            score += 25
        if payload.consent.prohibited_topics_acknowledged:
            score += 20
        if payload.consent.wants_boundary_respect:
            score += 10
        if payload.boundaries:
            score += 10
        if payload.preference_tags:
            score += 5

        return min(score, 100)

    def _screen_text_bundle(
        self,
        *,
        prompt: str,
        extra_text: str = "",
        preference_tags: list[str] | None = None,
        boundaries: list[str] | None = None,
        consent_score: int = 100,
        user_is_adult: bool = True,
        explicit_style: bool = False,
        allow_consented_likeness: bool = False,
    ) -> ModerationDecision:
        combined_text = " ".join(
            [
                prompt,
                extra_text,
                " ".join(preference_tags or []),
                " ".join(boundaries or []),
            ]
        ).lower()

        blocked_reasons: list[str] = []
        for reason, pattern in self.block_rules.items():
            if not re.search(pattern, combined_text, re.IGNORECASE):
                continue

            if reason == "real_person_likeness" and allow_consented_likeness:
                continue

            blocked_reasons.append(reason)

        flags: list[str] = []
        if not boundaries:
            flags.append("missing_boundaries")
        if explicit_style:
            flags.append("explicit_style")
        if self.high_risk_review_terms.search(combined_text):
            flags.append("real_world_power_dynamic")
        if allow_consented_likeness:
            flags.append("consented_likeness_review")

        if not user_is_adult:
            blocked_reasons.append("adult_confirmation_missing")

        review_required = bool(flags) or consent_score < self.settings.human_review_threshold

        return ModerationDecision(
            allowed=not blocked_reasons,
            blocked_reasons=sorted(set(blocked_reasons)),
            flags=sorted(set(flags)),
            review_required=review_required,
            consent_score=consent_score,
        )

    def screen_request(self, payload: StoryGenerateRequest) -> ModerationDecision:
        consent_score = self.compute_consent_score(payload)
        return self._screen_text_bundle(
            prompt=payload.prompt,
            extra_text=payload.freeform_preferences or "",
            preference_tags=payload.preference_tags,
            boundaries=payload.boundaries,
            consent_score=consent_score,
            user_is_adult=payload.consent.user_is_adult,
            explicit_style=payload.content_style == "explicit",
        )

    def screen_chat_message(
        self,
        *,
        message: str,
        preference_tags: list[str],
        boundaries: list[str],
        consent_score: int,
    ) -> ModerationDecision:
        return self._screen_text_bundle(
            prompt=message,
            preference_tags=preference_tags,
            boundaries=boundaries,
            consent_score=consent_score,
            user_is_adult=True,
            explicit_style=False,
        )

    def screen_response(self, text: str, initial_decision: ModerationDecision) -> ModerationDecision:
        blocked_reasons = [
            reason for reason, pattern in self.block_rules.items() if re.search(pattern, text, re.IGNORECASE)
        ]
        flags = list(initial_decision.flags)

        if not self.consent_language.search(text):
            flags.append("consent_language_light")

        return ModerationDecision(
            allowed=not blocked_reasons,
            blocked_reasons=sorted(set(blocked_reasons)),
            flags=sorted(set(flags)),
            review_required=initial_decision.review_required or "consent_language_light" in flags,
            consent_score=initial_decision.consent_score,
        )

    def compute_twin_consent_score(self, consent: TwinConsentAttestation) -> int:
        score = 0
        if consent.creator_is_adult:
            score += 20
        if consent.audience_is_adult_only_confirmed:
            score += 15
        if consent.rights_holder_confirmed:
            score += 25
        if consent.likeness_use_consent_confirmed:
            score += 25
        if consent.no_raw_likeness_storage_acknowledged:
            score += 15
        return min(score, 100)

    def screen_twin_profile(
        self,
        *,
        name: str,
        description: str,
        reference_data: TwinReferenceData,
        consent: TwinConsentAttestation,
    ) -> ModerationDecision:
        consent_score = self.compute_twin_consent_score(consent)
        prompt_parts = [name, description, reference_data.voice_style or ""]
        extra_parts = [
            " ".join(reference_data.personality_traits),
            " ".join(reference_data.example_prompts),
        ]
        decision = self._screen_text_bundle(
            prompt=" ".join(prompt_parts),
            extra_text=" ".join(extra_parts),
            preference_tags=reference_data.allowed_kinks,
            boundaries=reference_data.hard_limits,
            consent_score=consent_score,
            user_is_adult=consent.creator_is_adult and consent.audience_is_adult_only_confirmed,
            explicit_style=False,
            allow_consented_likeness=consent.rights_holder_confirmed and consent.likeness_use_consent_confirmed,
        )

        if not consent.rights_holder_confirmed:
            decision.blocked_reasons.append("creator_rights_unconfirmed")
        if not consent.likeness_use_consent_confirmed:
            decision.blocked_reasons.append("likeness_consent_unconfirmed")
        if not consent.no_raw_likeness_storage_acknowledged:
            decision.blocked_reasons.append("raw_likeness_storage_unacknowledged")
        if not reference_data.hard_limits:
            decision.flags.append("twin_missing_hard_limits")

        decision.blocked_reasons = sorted(set(decision.blocked_reasons))
        decision.flags = sorted(set(decision.flags))
        decision.allowed = not decision.blocked_reasons
        decision.review_required = True
        decision.consent_score = consent_score
        return decision
