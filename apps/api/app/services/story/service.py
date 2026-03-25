from __future__ import annotations

import logging
from dataclasses import dataclass
from itertools import chain
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.db.models.story import StoryGeneration
from app.schemas.profile import ProfilePreferences
from app.schemas.story import StoryBranch, StoryGenerateRequest, StoryGenerateResponse, StoryModerationSummary
from app.services.ai import get_story_provider
from app.services.audio import AudioService, AudioServiceError
from app.services.audit import AuditLogService
from app.services.moderation import ModerationDecision, ModerationQueueService, ModerationService
from app.services.prompt_builder import build_profile_boundaries, build_profile_preference_tags, dedupe_prompt_items
from app.services.profile import ProfileService, get_subscription_features
from app.services.rate_limit import RateLimitExceededError, RequestRateLimitService

logger = logging.getLogger("lumina.story")
PROMPT_VERSION = "2026-03-24.v1"


@dataclass(slots=True)
class PolicyViolationError(Exception):
    message: str
    status_code: int = 403

    def __str__(self) -> str:
        return self.message


class StoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audio_service = AudioService()
        self.audit_service = AuditLogService(session)
        self.moderation_service = ModerationService()
        self.queue_service = ModerationQueueService(session)
        self.profile_service = ProfileService(session)
        self.rate_limit_service = RequestRateLimitService()
        self.provider = get_story_provider()

    async def generate(self, payload: StoryGenerateRequest, current_user: AuthenticatedUserContext) -> StoryGenerateResponse:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        profile_preferences = ProfilePreferences.model_validate(profile.preferences or {})
        features = get_subscription_features(profile.subscription_tier)

        try:
            await self.rate_limit_service.enforce(
                action="story.generate",
                subscription_tier=profile.subscription_tier,
                user_id=str(current_user.id),
            )
        except RateLimitExceededError as exc:
            raise PolicyViolationError(str(exc), status_code=429) from exc

        today_generation_count = await self.profile_service.get_today_generation_count(str(current_user.id))

        if features.daily_generation_limit is not None and today_generation_count >= features.daily_generation_limit:
            raise PolicyViolationError(
                f"The {profile.subscription_tier} tier has reached its daily generation limit of {features.daily_generation_limit}. "
                "Upgrade to Premium or VIP for unlimited generations, voice narration, and premium twin access."
            )

        if payload.narration_requested and not features.audio_enabled:
            raise PolicyViolationError(
                "Audio narration is available on Premium and VIP plans, which also include unlimited generations and premium twin access."
            )

        effective_payload = self._enrich_payload_with_profile(payload, profile_preferences)
        request_decision = self.moderation_service.screen_request(effective_payload)
        request_decision.consent_score = min(100, int((request_decision.consent_score + profile.consent_score) / 2))

        if not request_decision.allowed:
            await self._persist_blocked_attempt(effective_payload, request_decision, current_user)
            reason_list = ", ".join(request_decision.blocked_reasons)
            raise PolicyViolationError(
                f"Request blocked by Lumina safety policy: {reason_list}. Only consensual, legal adult fantasy content is permitted."
            )

        system_prompt = self._build_system_prompt(
            effective_payload,
            request_decision,
            profile_preferences,
            profile.subscription_tier,
        )
        user_prompt = self._build_user_prompt(effective_payload)
        provider_result = await self.provider.generate_story(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            branch_count=effective_payload.branching_depth,
        )

        response_decision = self.moderation_service.screen_response(provider_result.story, request_decision)
        if not response_decision.allowed:
            await self._persist_blocked_attempt(effective_payload, response_decision, current_user)
            raise PolicyViolationError("Generated output failed moderation and was withheld for safety review.")

        raw_story_payload = {
            "title": provider_result.title,
            "story": provider_result.story,
            "branches": provider_result.branches,
            "narration_requested": effective_payload.narration_requested and features.audio_enabled,
        }
        requires_review = self.queue_service.should_queue_for_review(response_decision)
        delivery_payload = (
            self.queue_service.build_story_placeholder_payload() if requires_review else raw_story_payload
        )

        generation = StoryGeneration(
            user_id=str(current_user.id),
            prompt=effective_payload.prompt,
            preference_tags=effective_payload.preference_tags,
            boundaries=effective_payload.boundaries,
            content_style=effective_payload.content_style,
            consent_score=response_decision.consent_score,
            moderation_status="pending" if requires_review else "approved",
            moderation_reasons=response_decision.blocked_reasons + response_decision.flags,
            review_required=requires_review,
            system_prompt_version=PROMPT_VERSION,
            provider_name=provider_result.provider_name,
            story_payload=delivery_payload,
        )

        await self._persist_generation(
            generation,
            response_decision,
            queue_payload=raw_story_payload if requires_review else None,
            queue_user_id=current_user.id if requires_review else None,
        )

        audio_url: str | None = None
        audio_error: str | None = None
        audio_available = not requires_review and features.audio_enabled

        if audio_available and effective_payload.narration_requested:
            audio_url, audio_error, audio_available = await self._maybe_render_audio(
                text=str(generation.story_payload["story"]),
                current_user=current_user,
                target_type="story",
                target_id=generation.id,
                subscription_tier=profile.subscription_tier,
                daily_audio_limit=features.daily_audio_generation_limit,
            )

        return StoryGenerateResponse(
            request_id=generation.id,
            title=str(generation.story_payload["title"]),
            story=str(generation.story_payload["story"]),
            branches=[StoryBranch(**branch) for branch in generation.story_payload.get("branches", [])],
            audio_available=audio_available,
            audio_url=audio_url,
            audio_error=audio_error,
            provider=provider_result.provider_name,
            moderation=StoryModerationSummary(
                allowed=True,
                blocked_reasons=response_decision.blocked_reasons,
                flags=response_decision.flags,
                review_required=requires_review,
                consent_score=response_decision.consent_score,
            ),
        )

    async def get_generation(
        self,
        request_id: UUID,
        current_user: AuthenticatedUserContext,
        *,
        include_audio: bool = False,
    ) -> StoryGenerateResponse:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        features = get_subscription_features(profile.subscription_tier)
        result = await self.session.execute(
            select(StoryGeneration).where(
                StoryGeneration.id == request_id,
                StoryGeneration.user_id == str(current_user.id),
            )
        )
        generation = result.scalar_one_or_none()
        if generation is None:
            raise PolicyViolationError("Story request not found.")

        payload = generation.story_payload or self.queue_service.build_story_placeholder_payload()
        audio_available = generation.moderation_status == "approved" and features.audio_enabled
        audio_url: str | None = None
        audio_error: str | None = None

        if include_audio:
            if not features.audio_enabled:
                audio_error = (
                    "Audio narration is available on Premium and VIP plans, which also include unlimited generations and premium twin access."
                )
                audio_available = False
            elif generation.moderation_status == "approved":
                audio_url, audio_error, audio_available = await self._maybe_render_audio(
                    text=str(payload.get("story", "")),
                    current_user=current_user,
                    target_type="story",
                    target_id=generation.id,
                    subscription_tier=profile.subscription_tier,
                    daily_audio_limit=features.daily_audio_generation_limit,
                )
            else:
                audio_available = False

        return StoryGenerateResponse(
            request_id=generation.id,
            title=str(payload.get("title", "Story unavailable")),
            story=str(payload.get("story", "This generation is not currently available.")),
            branches=[StoryBranch(**branch) for branch in payload.get("branches", [])],
            audio_available=audio_available,
            audio_url=audio_url,
            audio_error=audio_error,
            provider=generation.provider_name,
            moderation=StoryModerationSummary(
                allowed=generation.moderation_status not in {"blocked", "rejected"},
                blocked_reasons=[],
                flags=generation.moderation_reasons,
                review_required=generation.review_required,
                consent_score=generation.consent_score,
            ),
        )

    def _build_system_prompt(
        self,
        payload: StoryGenerateRequest,
        decision: ModerationDecision,
        profile_preferences: ProfilePreferences,
        subscription_tier: str,
    ) -> str:
        boundaries = ", ".join(payload.boundaries) if payload.boundaries else "No additional boundaries provided."
        preferences = ", ".join(payload.preference_tags) if payload.preference_tags else "No tag preferences provided."
        hard_limits_list = build_profile_boundaries(profile_preferences)
        hard_limits = ", ".join(hard_limits_list) if hard_limits_list else "No stored hard limits provided."
        stored_preferences = build_profile_preference_tags(profile_preferences)
        stored_preference_summary = ", ".join(stored_preferences) if stored_preferences else "No stored preferences provided."
        custom_boundaries = profile_preferences.custom_boundaries or "No custom profile boundary text provided."

        return f"""
You are Lumina Fantasies, a premium adult fantasy writing model.

Hard rules:
- Only write about clearly consenting adults.
- Never include minors, age ambiguity, coercion, incest, bestiality, violence, exploitation, or real-person likeness imitation.
- Respect every user boundary exactly. If the prompt attempts to cross a boundary, refuse that direction and redirect.
- Keep the interaction fictional, ethical, and aligned with a consent-first tone.
- If intensity increases, include clear check-ins, permission, and mutual enthusiasm.
- Return a title, a single opening scene, and branching choices for what could happen next.

Context:
- Consent score: {decision.consent_score}
- User subscription tier: {subscription_tier}
- Style: {payload.content_style}
- Boundaries: {boundaries}
- Preference tags: {preferences}
- Stored hard limits: {hard_limits}
- Stored profile preferences: {stored_preference_summary}
- Stored custom boundaries: {custom_boundaries}
""".strip()

    def _build_user_prompt(self, payload: StoryGenerateRequest) -> str:
        details = [
            f"Story request: {payload.prompt}",
            f"Desired style: {payload.content_style}",
            f"Preference tags: {', '.join(payload.preference_tags) if payload.preference_tags else 'none provided'}",
            f"Freeform preferences: {payload.freeform_preferences or 'none provided'}",
            f"Boundaries to respect: {', '.join(payload.boundaries) if payload.boundaries else 'none provided'}",
        ]
        return "\n".join(details)

    def _enrich_payload_with_profile(
        self, payload: StoryGenerateRequest, profile_preferences: ProfilePreferences
    ) -> StoryGenerateRequest:
        merged_tags = dedupe_prompt_items(
            chain(
                payload.preference_tags,
                profile_preferences.kinks,
                profile_preferences.favorite_genres,
                profile_preferences.tone_preferences,
            )
        )
        merged_boundaries = dedupe_prompt_items(
            chain(payload.boundaries, profile_preferences.hard_limits, [profile_preferences.custom_boundaries or ""])
        )
        freeform_segments = [payload.freeform_preferences or ""]
        if profile_preferences.custom_boundaries:
            freeform_segments.append(f"Stored custom boundaries: {profile_preferences.custom_boundaries}")

        return payload.model_copy(
            update={
                "preference_tags": merged_tags,
                "boundaries": merged_boundaries,
                "freeform_preferences": "\n".join(segment for segment in freeform_segments if segment).strip() or None,
            }
        )

    async def _persist_blocked_attempt(
        self,
        payload: StoryGenerateRequest,
        decision: ModerationDecision,
        current_user: AuthenticatedUserContext,
    ) -> None:
        generation = StoryGeneration(
            user_id=str(current_user.id),
            prompt=payload.prompt,
            preference_tags=payload.preference_tags,
            boundaries=payload.boundaries,
            content_style=payload.content_style,
            consent_score=decision.consent_score,
            moderation_status="blocked",
            moderation_reasons=decision.blocked_reasons + decision.flags,
            review_required=True,
            system_prompt_version=PROMPT_VERSION,
            provider_name=getattr(self.provider, "name", "unknown"),
            story_payload=None,
        )
        await self._persist_generation(generation, decision)

    async def _persist_generation(
        self,
        generation: StoryGeneration,
        decision: ModerationDecision,
        *,
        queue_payload: dict[str, object] | None = None,
        queue_user_id: UUID | None = None,
    ) -> None:
        try:
            self.session.add(generation)
            await self.session.flush()

            if queue_payload is not None and queue_user_id is not None:
                await self.queue_service.enqueue_story_generation(
                    generation=generation,
                    raw_story_payload=queue_payload,
                    decision=decision,
                    user_id=queue_user_id,
                )

            await self.session.commit()
            await self.session.refresh(generation)
        except SQLAlchemyError:
            await self.session.rollback()
            logger.warning("Could not persist generation record; continuing without database durability.", exc_info=True)
            if not getattr(generation, "id", None):
                from uuid import uuid4

                generation.id = uuid4()

    async def _maybe_render_audio(
        self,
        *,
        text: str,
        current_user: AuthenticatedUserContext,
        target_type: str,
        target_id: UUID,
        subscription_tier: str,
        daily_audio_limit: int | None,
        voice_id: str | None = None,
    ) -> tuple[str | None, str | None, bool]:
        try:
            cached_clip = await self.audio_service.get_cached_audio(text=text, voice_id=voice_id)
            if cached_clip is None and daily_audio_limit is not None:
                today_audio_generation_count = await self.profile_service.get_today_audio_generation_count(current_user.id)
                if today_audio_generation_count >= daily_audio_limit:
                    return (
                        None,
                        f"The {subscription_tier} tier has reached its daily voice limit of {daily_audio_limit} fresh renders.",
                        False,
                    )

            clip = cached_clip or await self.audio_service.generate_audio_clip(text=text, voice_id=voice_id)
            if not clip.cached:
                try:
                    await self.audit_service.record(
                        actor_user_id=current_user.id,
                        action="audio.generated",
                        target_type=target_type,
                        target_id=target_id,
                        metadata={
                            "voice_id": clip.voice_id,
                            "text_length": len(text),
                        },
                    )
                    await self.session.commit()
                except Exception:
                    logger.warning("Could not persist audio audit log for %s %s.", target_type, target_id, exc_info=True)

            return clip.data_url, None, True
        except AudioServiceError as exc:
            logger.warning("Audio narration failed for %s %s: %s", target_type, target_id, exc, exc_info=True)
            return None, str(exc), False
