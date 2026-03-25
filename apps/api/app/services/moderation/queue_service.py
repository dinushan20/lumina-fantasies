from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.core.config import get_settings
from app.db.models.chat import ChatMessage, ChatSession
from app.db.models.identity import AuthUser
from app.db.models.moderation import ModerationQueueEntry
from app.db.models.story import StoryGeneration
from app.db.models.twin import DigitalTwin
from app.schemas.moderation import ModerationQueueDetail, ModerationQueueStatus, ModerationQueueSummary
from app.services.audit import AuditLogService
from app.services.moderation.service import ModerationDecision

STORY_REVIEW_TITLE = "Reviewing your fantasy"
STORY_REVIEW_MESSAGE = (
    "Lumina is reviewing this generation to make sure it stays aligned with consent-first safety policies. "
    "Please check back after moderation is complete."
)
STORY_REJECTED_TITLE = "Generation unavailable"
STORY_REJECTED_MESSAGE = "This generation was not approved by the moderation team."
CHAT_REVIEW_PLACEHOLDER = (
    "Lumina is reviewing the last reply to keep the experience consensual, legal, and aligned with your boundaries."
)
CHAT_REJECTED_PLACEHOLDER = "Lumina could not release that reply after moderator review."


@dataclass(slots=True)
class ModerationQueueServiceError(Exception):
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class ModerationQueueService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()
        self.audit_service = AuditLogService(session)

    def ensure_admin(self, current_user: AuthenticatedUserContext) -> None:
        if current_user.role != "admin":
            raise ModerationQueueServiceError("Admin access is required.", status_code=403)

    def should_queue_for_review(self, decision: ModerationDecision) -> bool:
        return decision.review_required or float(decision.consent_score) < self.settings.moderation_queue_threshold

    async def enqueue_story_generation(
        self,
        *,
        generation: StoryGeneration,
        raw_story_payload: dict[str, object],
        decision: ModerationDecision,
        user_id: UUID,
    ) -> ModerationQueueEntry:
        generation.story_payload = self.build_story_placeholder_payload()
        generation.moderation_status = "pending"
        generation.review_required = True

        queue_entry = ModerationQueueEntry(
            content_type="story",
            content_id=generation.id,
            user_id=user_id,
            raw_output=json.dumps(raw_story_payload),
            moderation_score=float(decision.consent_score),
            flags=sorted(set([*decision.flags, *decision.blocked_reasons])),
            status="pending",
        )
        self.session.add(queue_entry)
        await self.session.flush()
        return queue_entry

    async def enqueue_chat_message(
        self,
        *,
        assistant_message: ChatMessage,
        raw_output: str,
        decision: ModerationDecision,
        user_id: UUID,
    ) -> ModerationQueueEntry:
        assistant_message.content = CHAT_REVIEW_PLACEHOLDER
        assistant_message.moderation_status = "pending"
        assistant_message.review_required = True

        queue_entry = ModerationQueueEntry(
            content_type="chat_message",
            content_id=assistant_message.id,
            user_id=user_id,
            raw_output=raw_output,
            moderation_score=float(decision.consent_score),
            flags=sorted(set([*decision.flags, *decision.blocked_reasons])),
            status="pending",
        )
        self.session.add(queue_entry)
        await self.session.flush()
        return queue_entry

    async def enqueue_digital_twin(
        self,
        *,
        twin: DigitalTwin,
        raw_twin_payload: dict[str, object],
        decision: ModerationDecision,
        user_id: UUID,
    ) -> ModerationQueueEntry:
        twin.status = "training"
        twin.consent_status = "pending"
        twin.moderation_score = float(decision.consent_score)

        queue_entry = ModerationQueueEntry(
            content_type="digital_twin",
            content_id=twin.id,
            user_id=user_id,
            raw_output=json.dumps(raw_twin_payload),
            moderation_score=float(decision.consent_score),
            flags=sorted(set([*decision.flags, *decision.blocked_reasons])),
            status="pending",
        )
        self.session.add(queue_entry)
        await self.session.flush()
        return queue_entry

    async def list_queue_items(
        self,
        *,
        current_user: AuthenticatedUserContext,
        status: ModerationQueueStatus | Literal["all"] = "pending",
        limit: int = 50,
    ) -> list[ModerationQueueSummary]:
        self.ensure_admin(current_user)

        query = (
            select(ModerationQueueEntry, AuthUser.email)
            .join(AuthUser, AuthUser.id == ModerationQueueEntry.user_id)
            .order_by(ModerationQueueEntry.created_at.desc())
            .limit(max(1, min(limit, 100)))
        )
        if status != "all":
            query = query.where(ModerationQueueEntry.status == status)

        result = await self.session.execute(query)
        rows = result.all()
        return [
            self._serialize_summary(queue_item=row[0], user_email=row[1])
            for row in rows
        ]

    async def get_queue_item(
        self,
        *,
        item_id: UUID,
        current_user: AuthenticatedUserContext,
    ) -> ModerationQueueDetail:
        self.ensure_admin(current_user)
        queue_item = await self._get_queue_entry(item_id)
        return await self._serialize_detail(queue_item)

    async def review_queue_item(
        self,
        *,
        item_id: UUID,
        status: ModerationQueueStatus,
        notes: str | None,
        final_score: float,
        current_user: AuthenticatedUserContext,
    ) -> ModerationQueueDetail:
        self.ensure_admin(current_user)
        queue_item = await self._get_queue_entry(item_id)

        queue_item.status = status
        queue_item.review_notes = notes
        queue_item.reviewer_id = current_user.id
        queue_item.reviewed_at = datetime.now(timezone.utc)
        queue_item.moderation_score = final_score

        if queue_item.content_type == "story":
            await self._apply_story_review(queue_item)
        elif queue_item.content_type == "chat_message":
            await self._apply_chat_review(queue_item)
        else:
            await self._apply_twin_review(queue_item, reviewer_id=current_user.id)

        await self.session.commit()
        return await self._serialize_detail(queue_item)

    async def escalate_stale_items(self, *, current_user: AuthenticatedUserContext) -> int:
        self.ensure_admin(current_user)
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        result = await self.session.execute(
            select(ModerationQueueEntry).where(
                ModerationQueueEntry.status == "pending",
                ModerationQueueEntry.created_at < cutoff,
            )
        )
        queue_items = result.scalars().all()

        if not queue_items:
            return 0

        now = datetime.now(timezone.utc)
        for item in queue_items:
            item.status = "escalated"
            item.review_notes = (
                f"{item.review_notes}\n\nAutomatically escalated after remaining pending for over 24 hours."
                if item.review_notes
                else "Automatically escalated after remaining pending for over 24 hours."
            )
            item.reviewed_at = now

            if item.content_type == "story":
                generation = await self.session.get(StoryGeneration, item.content_id)
                if generation is not None:
                    generation.moderation_status = "escalated"
                    generation.review_required = True
            elif item.content_type == "chat_message":
                message = await self.session.get(ChatMessage, item.content_id)
                if message is not None:
                    message.moderation_status = "escalated"
                    message.review_required = True
                    message.content = CHAT_REVIEW_PLACEHOLDER
                    await self._sync_chat_preview(message)
            else:
                twin = await self.session.get(DigitalTwin, item.content_id)
                if twin is not None:
                    twin.status = "training"
                    twin.consent_status = "pending"
                    twin.moderation_score = item.moderation_score

        await self.session.commit()
        return len(queue_items)

    def build_story_placeholder_payload(self) -> dict[str, object]:
        return {
            "title": STORY_REVIEW_TITLE,
            "story": STORY_REVIEW_MESSAGE,
            "branches": [],
            "narration_requested": False,
        }

    async def _apply_story_review(self, queue_item: ModerationQueueEntry) -> None:
        generation = await self.session.get(StoryGeneration, queue_item.content_id)
        if generation is None:
            raise ModerationQueueServiceError("Linked story generation not found.", status_code=404)

        generation.consent_score = int(round(queue_item.moderation_score))
        generation.review_required = queue_item.status == "escalated"
        generation.moderation_status = queue_item.status

        if queue_item.status == "approved":
            generation.story_payload = self._parse_story_payload(queue_item.raw_output)
            return

        if queue_item.status == "rejected":
            generation.story_payload = {
                "title": STORY_REJECTED_TITLE,
                "story": STORY_REJECTED_MESSAGE,
                "branches": [],
                "narration_requested": False,
            }
            return

        generation.story_payload = self.build_story_placeholder_payload()

    async def _apply_chat_review(self, queue_item: ModerationQueueEntry) -> None:
        message = await self.session.get(ChatMessage, queue_item.content_id)
        if message is None:
            raise ModerationQueueServiceError("Linked chat message not found.", status_code=404)

        message.review_required = queue_item.status == "escalated"
        message.moderation_status = queue_item.status

        if queue_item.status == "approved":
            message.content = queue_item.raw_output
        elif queue_item.status == "rejected":
            message.content = CHAT_REJECTED_PLACEHOLDER
        else:
            message.content = CHAT_REVIEW_PLACEHOLDER

        await self._sync_chat_preview(message)

    async def _apply_twin_review(self, queue_item: ModerationQueueEntry, reviewer_id: UUID) -> None:
        twin = await self.session.get(DigitalTwin, queue_item.content_id)
        if twin is None:
            raise ModerationQueueServiceError("Linked digital twin not found.", status_code=404)

        twin.moderation_score = queue_item.moderation_score

        if queue_item.status == "approved":
            twin.status = "active"
            twin.consent_status = "approved"
        elif queue_item.status == "rejected":
            twin.status = "suspended"
            twin.consent_status = "rejected"
        else:
            twin.status = "training"
            twin.consent_status = "pending"

        await self.audit_service.record(
            actor_user_id=reviewer_id,
            action=f"digital_twin.reviewed.{queue_item.status}",
            target_type="digital_twin",
            target_id=twin.id,
            metadata={
                "queue_item_id": str(queue_item.id),
                "review_status": queue_item.status,
                "moderation_score": queue_item.moderation_score,
                "flags": queue_item.flags,
            },
        )

    async def _sync_chat_preview(self, message: ChatMessage) -> None:
        session = await self.session.get(ChatSession, message.session_id)
        if session is not None and message.role == "assistant":
            session.last_message_preview = message.content[:180]

    async def _get_queue_entry(self, item_id: UUID) -> ModerationQueueEntry:
        queue_item = await self.session.get(ModerationQueueEntry, item_id)
        if queue_item is None:
            raise ModerationQueueServiceError("Moderation queue item not found.", status_code=404)
        return queue_item

    async def _serialize_detail(self, queue_item: ModerationQueueEntry) -> ModerationQueueDetail:
        user_email = await self._lookup_user_email(queue_item.user_id)
        reviewer_email = await self._lookup_user_email(queue_item.reviewer_id) if queue_item.reviewer_id else None
        display_output = self._format_display_output(queue_item)

        return ModerationQueueDetail(
            **self._serialize_summary(queue_item=queue_item, user_email=user_email).model_dump(),
            raw_output=queue_item.raw_output,
            display_output=display_output,
            reviewer_id=queue_item.reviewer_id,
            reviewer_email=reviewer_email,
            review_notes=queue_item.review_notes,
        )

    async def _lookup_user_email(self, user_id: UUID | None) -> str:
        if user_id is None:
            return "Unknown"
        user = await self.session.get(AuthUser, user_id)
        return user.email if user is not None else "Unknown"

    def _serialize_summary(self, *, queue_item: ModerationQueueEntry, user_email: str) -> ModerationQueueSummary:
        display_output = self._format_display_output(queue_item)
        preview = display_output.replace("\n", " ").strip()[:160] or "No content preview available."
        return ModerationQueueSummary(
            id=queue_item.id,
            content_type=queue_item.content_type,
            content_id=queue_item.content_id,
            user_id=queue_item.user_id,
            user_email=user_email,
            preview=preview,
            moderation_score=queue_item.moderation_score,
            flags=queue_item.flags,
            status=queue_item.status,
            created_at=queue_item.created_at,
            reviewed_at=queue_item.reviewed_at,
        )

    def _format_display_output(self, queue_item: ModerationQueueEntry) -> str:
        if queue_item.content_type == "chat_message":
            return queue_item.raw_output
        if queue_item.content_type == "digital_twin":
            payload = self._parse_json_output(queue_item.raw_output, label="digital twin payload")
            reference_data = payload.get("reference_data", {})
            consent = payload.get("consent_attestation", {})

            personality_traits = self._format_list(reference_data.get("personality_traits"))
            allowed_kinks = self._format_list(reference_data.get("allowed_kinks"))
            hard_limits = self._format_list(reference_data.get("hard_limits"))
            example_prompts = self._format_list(reference_data.get("example_prompts"))

            return (
                f"Name: {payload.get('name', 'Unnamed twin')}\n"
                f"Required tier: {payload.get('required_subscription_tier', 'premium')}\n"
                f"Current status: {payload.get('status', 'training')} / consent {payload.get('consent_status', 'pending')}\n\n"
                f"Description:\n{payload.get('description', '')}\n\n"
                f"Preferred voice id:\n{payload.get('preferred_voice_id') or 'Default platform voice'}\n\n"
                f"Voice style:\n{reference_data.get('voice_style') or 'No voice guidance provided.'}\n\n"
                f"Personality traits:\n{personality_traits}\n\n"
                f"Allowed kinks:\n{allowed_kinks}\n\n"
                f"Hard limits:\n{hard_limits}\n\n"
                f"Example prompts:\n{example_prompts}\n\n"
                "Consent attestation:\n"
                f"- Creator is adult: {consent.get('creator_is_adult')}\n"
                f"- Rights holder confirmed: {consent.get('rights_holder_confirmed')}\n"
                f"- Likeness consent confirmed: {consent.get('likeness_use_consent_confirmed')}\n"
                f"- No raw likeness storage acknowledged: {consent.get('no_raw_likeness_storage_acknowledged')}\n"
                f"- Audience adult-only confirmed: {consent.get('audience_is_adult_only_confirmed')}\n"
                f"- Signature name: {consent.get('signature_name', '')}"
            )

        parsed = self._parse_story_payload(queue_item.raw_output)
        title = str(parsed.get("title", "Untitled"))
        story = str(parsed.get("story", ""))
        branches = parsed.get("branches", [])
        formatted_branches: list[str] = []
        if isinstance(branches, list):
            for branch in branches:
                if isinstance(branch, dict):
                    formatted_branches.append(
                        f"- {branch.get('label', 'Branch')}: {branch.get('direction', '')}"
                    )

        branch_text = "\n".join(formatted_branches) if formatted_branches else "- No branches returned"
        return f"Title: {title}\n\nStory:\n{story}\n\nBranches:\n{branch_text}"

    def _parse_story_payload(self, raw_output: str) -> dict[str, object]:
        return self._parse_json_output(raw_output, label="story payload")

    def _parse_json_output(self, raw_output: str, *, label: str) -> dict[str, object]:
        try:
            parsed = json.loads(raw_output)
        except json.JSONDecodeError as exc:
            raise ModerationQueueServiceError(f"Stored {label} could not be parsed.", status_code=500) from exc

        if not isinstance(parsed, dict):
            raise ModerationQueueServiceError(f"Stored {label} is malformed.", status_code=500)

        return parsed

    def _format_list(self, value: object) -> str:
        if not isinstance(value, list) or not value:
            return "- None provided"
        return "\n".join(f"- {str(item)}" for item in value)
