from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.db.models.chat import ChatMessage, ChatSession
from app.db.models.twin import DigitalTwin
from app.schemas.chat import ChatMessageAudioResponse, ChatMessageResponse, ChatSessionDetail, ChatSessionSummary, ChatStreamRequest
from app.schemas.profile import ProfilePreferences
from app.schemas.twin import TwinReferenceData
from app.services.ai import get_story_provider
from app.services.audio import AudioService, AudioServiceError
from app.services.audit import AuditLogService
from app.services.moderation import ModerationQueueService, ModerationService
from app.services.prompt_builder import (
    build_profile_boundaries,
    build_profile_preference_tags,
    build_twin_allowed_kinks,
    build_twin_hard_limits,
    build_twin_prompt_profile,
    dedupe_prompt_items,
)
from app.services.profile import ProfileService, get_subscription_features
from app.services.rate_limit import RateLimitExceededError, RequestRateLimitService
from app.services.twin import DigitalTwinService, DigitalTwinServiceError

CHAT_MESSAGE_LIMITS_PER_HOUR: dict[str, int | None] = {
    "free": 20,
    "basic": 80,
    "premium": None,
    "vip": None,
}

CHAT_RESPONSE_STYLE: dict[str, str] = {
    "free": "free",
    "basic": "basic",
    "premium": "premium",
    "vip": "vip",
}

CHAT_HISTORY_WINDOW: dict[str, int] = {
    "free": 10,
    "basic": 14,
    "premium": 18,
    "vip": 20,
}

logger = logging.getLogger("lumina.chat")


@dataclass(slots=True)
class ChatServiceError(Exception):
    message: str
    status_code: int = 403

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class PreparedChatTurn:
    chat_session: ChatSession
    assistant_message: ChatMessage
    content: str
    audio_requested: bool = False
    audio_voice_id: str | None = None
    audio_cached_data_url: str | None = None
    audio_error: str | None = None
    user_id: UUID | None = None


class ChatService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audio_service = AudioService()
        self.audit_service = AuditLogService(session)
        self.profile_service = ProfileService(session)
        self.twin_service = DigitalTwinService(session)
        self.moderation_service = ModerationService()
        self.queue_service = ModerationQueueService(session)
        self.rate_limit_service = RequestRateLimitService()
        self.provider = get_story_provider()

    async def list_sessions(self, current_user: AuthenticatedUserContext) -> list[ChatSessionSummary]:
        await self.profile_service.get_or_create_profile(current_user, commit=False)
        result = await self.session.execute(
            select(ChatSession)
            .where(ChatSession.user_id == current_user.id)
            .order_by(ChatSession.updated_at.desc())
        )
        sessions = result.scalars().all()
        return [self._serialize_session(session) for session in sessions]

    async def get_session_detail(self, current_user: AuthenticatedUserContext, session_id: UUID) -> ChatSessionDetail:
        chat_session = await self._get_session_or_raise(current_user, session_id)
        result = await self.session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == chat_session.id)
            .order_by(ChatMessage.created_at.asc())
        )
        messages = result.scalars().all()
        return ChatSessionDetail(
            session=self._serialize_session(chat_session),
            messages=[self._serialize_message(message) for message in messages],
        )

    async def generate_message_audio(
        self,
        current_user: AuthenticatedUserContext,
        message_id: UUID,
    ) -> ChatMessageAudioResponse:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        features = get_subscription_features(profile.subscription_tier)
        if not features.audio_enabled:
            raise ChatServiceError(
                "Voice mode is available on Premium and VIP plans, which also include unlimited generations and premium twin access.",
                status_code=403,
            )

        result = await self.session.execute(
            select(ChatMessage, ChatSession)
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(
                ChatMessage.id == message_id,
                ChatSession.user_id == current_user.id,
            )
        )
        row = result.one_or_none()
        if row is None:
            raise ChatServiceError("That message could not be found.", status_code=404)

        message, chat_session = row
        if message.role != "assistant":
            raise ChatServiceError("Voice playback is only available for assistant replies.", status_code=400)
        if message.moderation_status != "approved" or message.review_required:
            raise ChatServiceError("Voice cannot be generated for content still under review.", status_code=403)

        voice_id: str | None = None
        if chat_session.twin_id is not None:
            twin_result = await self.session.execute(select(DigitalTwin).where(DigitalTwin.id == chat_session.twin_id))
            twin = twin_result.scalar_one_or_none()
            voice_id = twin.preferred_voice_id if twin is not None else None

        clip = await self.audio_service.get_cached_audio(text=message.content, voice_id=voice_id)
        if clip is None and features.daily_audio_generation_limit is not None:
            today_audio_generation_count = await self.profile_service.get_today_audio_generation_count(current_user.id)
            if today_audio_generation_count >= features.daily_audio_generation_limit:
                raise ChatServiceError(
                    f"The {profile.subscription_tier} tier has reached its daily voice limit of {features.daily_audio_generation_limit} fresh renders.",
                    status_code=403,
                )

        try:
            rendered_clip = clip or await self.audio_service.generate_audio_clip(text=message.content, voice_id=voice_id)
        except AudioServiceError as exc:
            raise ChatServiceError(str(exc), status_code=503) from exc

        if not rendered_clip.cached:
            try:
                await self.audit_service.record(
                    actor_user_id=current_user.id,
                    action="audio.generated",
                    target_type="chat_message",
                    target_id=message.id,
                    metadata={
                        "voice_id": rendered_clip.voice_id,
                        "text_length": len(message.content),
                        "source": "manual-regenerate",
                    },
                )
                await self.session.commit()
            except Exception:
                logger.warning("Could not persist audio audit log for chat message %s.", message.id, exc_info=True)

        return ChatMessageAudioResponse(
            message_id=message.id,
            audio_url=rendered_clip.data_url,
            cached=rendered_clip.cached,
        )

    async def prepare_chat_turn(
        self,
        payload: ChatStreamRequest,
        current_user: AuthenticatedUserContext,
    ) -> PreparedChatTurn:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        profile_preferences = ProfilePreferences.model_validate(profile.preferences or {})
        features = get_subscription_features(profile.subscription_tier)

        try:
            await self.rate_limit_service.enforce(
                action="chat.stream",
                subscription_tier=profile.subscription_tier,
                user_id=str(current_user.id),
            )
        except RateLimitExceededError as exc:
            raise ChatServiceError(str(exc), status_code=429) from exc

        message_limit = CHAT_MESSAGE_LIMITS_PER_HOUR.get(profile.subscription_tier)
        current_hour_count = await self._count_messages_last_hour(current_user)

        if message_limit is not None and current_hour_count >= message_limit:
            raise ChatServiceError(
                f"The {profile.subscription_tier} tier has reached its hourly chat limit of {message_limit}. "
                "Upgrade to Premium or VIP for longer sessions, voice mode, and premium twin access.",
                status_code=403,
            )

        twin = await self._resolve_twin_for_turn(current_user=current_user, payload=payload, profile=profile)
        preference_tags = self._build_combined_preference_tags(profile_preferences, twin)
        boundaries = self._build_combined_boundaries(profile_preferences, twin)
        consent_score = self._build_chat_consent_score(profile.consent_score, twin)

        request_decision = self.moderation_service.screen_chat_message(
            message=payload.message,
            preference_tags=preference_tags,
            boundaries=boundaries,
            consent_score=consent_score,
        )
        if not request_decision.allowed:
            reason_list = ", ".join(request_decision.blocked_reasons)
            raise ChatServiceError(
                f"Chat request blocked by Lumina safety policy: {reason_list}.",
                status_code=403,
            )

        chat_session = await self._get_or_create_session(current_user=current_user, payload=payload, twin=twin)
        history = await self._load_recent_history(chat_session.id, profile.subscription_tier)
        conversation = [*history, {"role": "user", "content": payload.message}]
        system_prompt = self._build_system_prompt(
            character_name=chat_session.character_name,
            profile_preferences=profile_preferences,
            subscription_tier=profile.subscription_tier,
            consent_score=consent_score,
            twin=twin,
        )
        response_style = CHAT_RESPONSE_STYLE.get(profile.subscription_tier, "free")

        preview = await self.provider.generate_chat_preview(
            system_prompt=system_prompt,
            conversation=conversation,
            character_name=chat_session.character_name,
            response_style=response_style,
        )
        preview_decision = self.moderation_service.screen_response(preview, request_decision)
        if not preview_decision.allowed:
            raise ChatServiceError("The planned chat response failed moderation and was withheld.", status_code=403)

        # We generate and moderate the full assistant turn before streaming so no unreviewed text reaches the client.
        full_response = await self.provider.generate_chat_response(
            system_prompt=system_prompt,
            conversation=conversation,
            character_name=chat_session.character_name,
            response_style=response_style,
        )
        response_decision = self.moderation_service.screen_response(full_response.content, request_decision)
        if not response_decision.allowed:
            raise ChatServiceError("The generated chat response failed moderation and was withheld.", status_code=403)

        requires_review = self.queue_service.should_queue_for_review(response_decision)
        user_message = ChatMessage(session_id=chat_session.id, role="user", content=payload.message)
        assistant_message = ChatMessage(
            session_id=chat_session.id,
            role="assistant",
            content=full_response.content,
            moderation_status="approved",
            review_required=False,
        )

        self.session.add(user_message)
        self.session.add(assistant_message)
        await self.session.flush()

        if requires_review:
            await self.queue_service.enqueue_chat_message(
                assistant_message=assistant_message,
                raw_output=full_response.content,
                decision=response_decision,
                user_id=current_user.id,
            )

        chat_session.last_message_preview = assistant_message.content[:180]
        await self.session.commit()
        await self.session.refresh(chat_session)
        await self.session.refresh(user_message)
        await self.session.refresh(assistant_message)

        audio_requested = bool(payload.audio_requested and features.audio_enabled and not requires_review)
        audio_voice_id = twin.preferred_voice_id if twin is not None else None
        audio_cached_data_url: str | None = None
        audio_error: str | None = None

        if audio_requested:
            try:
                cached_clip = await self.audio_service.get_cached_audio(text=full_response.content, voice_id=audio_voice_id)
                if cached_clip is not None:
                    audio_cached_data_url = cached_clip.data_url
                elif features.daily_audio_generation_limit is not None:
                    today_audio_generation_count = await self.profile_service.get_today_audio_generation_count(current_user.id)
                    if today_audio_generation_count >= features.daily_audio_generation_limit:
                        audio_requested = False
                        audio_error = (
                            f"The {profile.subscription_tier} tier has reached its daily voice limit of "
                            f"{features.daily_audio_generation_limit} fresh renders."
                        )
            except AudioServiceError as exc:
                audio_requested = False
                audio_error = str(exc)

        return PreparedChatTurn(
            chat_session=chat_session,
            assistant_message=assistant_message,
            content=assistant_message.content,
            audio_requested=audio_requested,
            audio_voice_id=audio_voice_id,
            audio_cached_data_url=audio_cached_data_url,
            audio_error=audio_error,
            user_id=current_user.id,
        )

    async def stream_prepared_turn(self, prepared_turn: PreparedChatTurn) -> AsyncIterator[str]:
        chat_session = prepared_turn.chat_session
        assistant_message = prepared_turn.assistant_message

        yield self._sse({"type": "session", "session_id": str(chat_session.id), "character_name": chat_session.character_name})
        yield self._sse({"type": "assistant_message", "message_id": str(assistant_message.id)})

        # Once moderation has cleared the turn, we chunk it into small SSE frames for a live typing effect in the UI.
        for chunk in self._chunk_text(prepared_turn.content):
            yield self._sse({"type": "chunk", "content": chunk})
            await asyncio.sleep(0.015)

        yield self._sse(
            {"type": "done", "session": self._serialize_session(chat_session).model_dump(mode="json"), "message": self._serialize_message(assistant_message).model_dump(mode="json")}
        )

        if prepared_turn.audio_cached_data_url is not None:
            yield self._sse(
                {
                    "type": "audio",
                    "message_id": str(assistant_message.id),
                    "audio_url": prepared_turn.audio_cached_data_url,
                    "error": None,
                }
            )
            return

        if prepared_turn.audio_error is not None:
            yield self._sse(
                {
                    "type": "audio",
                    "message_id": str(assistant_message.id),
                    "audio_url": None,
                    "error": prepared_turn.audio_error,
                }
            )
            return

        if not prepared_turn.audio_requested:
            return

        yield self._sse({"type": "audio_pending", "message_id": str(assistant_message.id)})

        try:
            clip = await self.audio_service.generate_audio_clip(
                text=prepared_turn.content,
                voice_id=prepared_turn.audio_voice_id,
            )
            if not clip.cached and prepared_turn.user_id is not None:
                try:
                    await self.audit_service.record(
                        actor_user_id=prepared_turn.user_id,
                        action="audio.generated",
                        target_type="chat_message",
                        target_id=assistant_message.id,
                        metadata={
                            "voice_id": clip.voice_id,
                            "text_length": len(prepared_turn.content),
                        },
                    )
                    await self.session.commit()
                except Exception:
                    logger.warning("Could not persist audio audit log for chat message %s.", assistant_message.id, exc_info=True)

            yield self._sse(
                {
                    "type": "audio",
                    "message_id": str(assistant_message.id),
                    "audio_url": clip.data_url,
                    "error": None,
                }
            )
        except AudioServiceError as exc:
            yield self._sse(
                {
                    "type": "audio",
                    "message_id": str(assistant_message.id),
                    "audio_url": None,
                    "error": str(exc),
                }
            )

    async def _get_or_create_session(
        self,
        *,
        current_user: AuthenticatedUserContext,
        payload: ChatStreamRequest,
        twin: DigitalTwin | None,
    ) -> ChatSession:
        if payload.session_id is not None:
            chat_session = await self._get_session_or_raise(current_user, payload.session_id)
            if payload.twin_id is not None and payload.twin_id != chat_session.twin_id:
                raise ChatServiceError("Start a new chat session to switch digital twins.", status_code=400)
            return chat_session

        chat_session = ChatSession(
            user_id=current_user.id,
            twin_id=twin.id if twin is not None else None,
            character_name=twin.name if twin is not None else (payload.character_name or "Lumina Muse"),
            last_message_preview=None,
        )
        self.session.add(chat_session)
        await self.session.commit()
        await self.session.refresh(chat_session)
        return chat_session

    async def _get_session_or_raise(self, current_user: AuthenticatedUserContext, session_id: UUID) -> ChatSession:
        result = await self.session.execute(
            select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            raise ChatServiceError("Chat session not found.", status_code=404)
        return chat_session

    async def _load_recent_history(self, session_id: UUID, subscription_tier: str) -> list[dict[str, str]]:
        history_limit = CHAT_HISTORY_WINDOW.get(subscription_tier, 10)
        result = await self.session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(history_limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()
        return [{"role": message.role, "content": message.content} for message in messages]

    async def _count_messages_last_hour(self, current_user: AuthenticatedUserContext) -> int:
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        result = await self.session.execute(
            select(func.count(ChatMessage.id))
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(
                ChatSession.user_id == current_user.id,
                ChatMessage.role == "user",
                ChatMessage.created_at >= since,
            )
        )
        return int(result.scalar_one() or 0)

    def _build_system_prompt(
        self,
        *,
        character_name: str,
        profile_preferences: ProfilePreferences,
        subscription_tier: str,
        consent_score: int,
        twin: DigitalTwin | None,
    ) -> str:
        preference_tags = ", ".join(self._build_preference_tags(profile_preferences)) or "No explicit preference tags stored."
        boundaries = ", ".join(self._build_boundaries(profile_preferences)) or "No profile boundaries stored."
        response_length_guidance = {
            "free": "Keep responses concise, around 90-140 words.",
            "basic": "Keep responses moderately detailed, around 140-220 words.",
            "premium": "Keep responses immersive and emotionally layered, around 220-320 words.",
            "vip": "Keep responses deeply immersive and richly personalized, around 260-380 words.",
        }.get(subscription_tier, "Keep responses concise and boundary-aware.")

        twin_section = ""
        likeness_rule = "Never include minors, age ambiguity, coercion, incest, bestiality, violence, or real-person likeness imitation."
        if twin is not None:
            twin_prompt_profile = build_twin_prompt_profile(
                TwinReferenceData.model_validate(twin.reference_data or {})
            )
            likeness_rule = (
                "Never include minors, age ambiguity, coercion, incest, bestiality, violence, or any unconsented real-person imitation. "
                "Only portray the approved digital twin persona below, using creator-approved metadata and no invented private real-world facts."
            )
            twin_section = f"""
Approved digital twin context:
- Twin description: {twin.description}
- Voice style: {twin_prompt_profile["voice_style"]}
- Personality traits: {twin_prompt_profile["personality_traits"]}
- Creator-approved kinks: {twin_prompt_profile["allowed_kinks"]}
- Twin hard limits: {twin_prompt_profile["hard_limits"]}
- Example prompts:
{twin_prompt_profile["example_prompts"]}
- Treat this as a consented creator-approved persona. Do not claim off-platform memories, surveillance, or private biography beyond the metadata above.
""".strip()

        twin_section_block = f"\n\n{twin_section}" if twin_section else ""

        return f"""
You are {character_name}, an adult fictional AI chat companion inside Lumina Fantasies.

Hard rules:
- Only engage in clearly consensual adult fantasy roleplay.
- {likeness_rule}
- Respect every hard limit exactly and redirect gracefully if the user tries to cross one.
- Keep consent explicit, mutual, and easy to reaffirm.
- Stay privacy-conscious and do not claim real-world surveillance, stalking, or non-consensual behavior.

User profile context:
- Consent score baseline: {consent_score}
- Subscription tier: {subscription_tier}
- Stored preferences: {preference_tags}
- Stored hard limits: {boundaries}

Response guidance:
- {response_length_guidance}
- Stay emotionally responsive and continue the scene conversationally.
- Invite user feedback or direction changes when helpful.
{twin_section_block}
""".strip()

    def _build_preference_tags(self, profile_preferences: ProfilePreferences) -> list[str]:
        return build_profile_preference_tags(profile_preferences)

    def _build_boundaries(self, profile_preferences: ProfilePreferences) -> list[str]:
        return build_profile_boundaries(profile_preferences)

    def _dedupe_items(self, values: Iterable[str | None]) -> list[str]:
        return dedupe_prompt_items(values)

    def _chunk_text(self, text: str, chunk_size: int = 36) -> Iterable[str]:
        words = text.split(" ")
        current = ""

        for word in words:
            next_value = f"{current} {word}".strip()
            if len(next_value) <= chunk_size:
                current = next_value
                continue

            if current:
                yield f"{current} "
            current = word

        if current:
            yield current

    def _serialize_session(self, session: ChatSession) -> ChatSessionSummary:
        return ChatSessionSummary(
            id=session.id,
            twin_id=session.twin_id,
            character_name=session.character_name,
            last_message_preview=session.last_message_preview,
            updated_at=session.updated_at,
        )

    def _serialize_message(self, message: ChatMessage) -> ChatMessageResponse:
        return ChatMessageResponse(
            id=message.id,
            role=message.role,
            content=message.content,
            audio_url=None,
            created_at=message.created_at,
        )

    def _sse(self, payload: dict[str, object]) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    async def _resolve_twin_for_turn(
        self,
        *,
        current_user: AuthenticatedUserContext,
        payload: ChatStreamRequest,
        profile,
    ) -> DigitalTwin | None:
        twin_id = payload.twin_id
        if payload.session_id is not None:
            existing_session = await self._get_session_or_raise(current_user, payload.session_id)
            if payload.twin_id is not None and payload.twin_id != existing_session.twin_id:
                raise ChatServiceError("Start a new chat session to switch digital twins.", status_code=400)
            twin_id = existing_session.twin_id

        if twin_id is None:
            return None

        try:
            return await self.twin_service.get_twin_for_chat(
                twin_id=twin_id,
                current_user=current_user,
                viewer_profile=profile,
            )
        except DigitalTwinServiceError as exc:
            raise ChatServiceError(str(exc), status_code=exc.status_code) from exc

    def _build_combined_preference_tags(
        self,
        profile_preferences: ProfilePreferences,
        twin: DigitalTwin | None,
    ) -> list[str]:
        items = list(self._build_preference_tags(profile_preferences))
        if twin is not None:
            items.extend(build_twin_allowed_kinks(TwinReferenceData.model_validate(twin.reference_data or {})))
        return self._dedupe_items(items)

    def _build_combined_boundaries(
        self,
        profile_preferences: ProfilePreferences,
        twin: DigitalTwin | None,
    ) -> list[str]:
        items = list(self._build_boundaries(profile_preferences))
        if twin is not None:
            items.extend(build_twin_hard_limits(TwinReferenceData.model_validate(twin.reference_data or {})))
        return self._dedupe_items(items)

    def _build_chat_consent_score(self, profile_consent_score: int, twin: DigitalTwin | None) -> int:
        if twin is None:
            return profile_consent_score
        twin_score = int(round(twin.moderation_score))
        return min(100, int(round((profile_consent_score + twin_score) / 2)))
