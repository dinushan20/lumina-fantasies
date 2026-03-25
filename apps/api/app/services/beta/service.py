from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.core.config import get_settings
from app.db.models.audit import AuditLog
from app.db.models.beta import BetaAccessRequest, CreatorInvite, DailyUsageMetric, FeedbackItem
from app.db.models.chat import ChatMessage, ChatSession
from app.db.models.story import StoryGeneration
from app.schemas.beta import (
    AnalyticsOverviewResponse,
    AnalyticsSummary,
    BetaAccessCreateRequest,
    BetaAccessResponse,
    CreatorInviteCreateRequest,
    CreatorInviteResponse,
    DailyUsageMetricResponse,
    FeedbackCreateRequest,
    FeedbackResponse,
)
from app.services.audit import AuditLogService
from app.services.profile import ProfileService


@dataclass(slots=True)
class BetaServiceError(Exception):
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class BetaService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit_service = AuditLogService(session)
        self.profile_service = ProfileService(session)
        self.settings = get_settings()

    async def submit_feedback(
        self,
        current_user: AuthenticatedUserContext,
        payload: FeedbackCreateRequest,
    ) -> FeedbackResponse:
        feedback = FeedbackItem(
            user_id=current_user.id,
            email=current_user.email.lower(),
            category=payload.category.lower(),
            message=payload.message,
            page_context=payload.page_context,
            status="new",
        )
        self.session.add(feedback)
        await self.session.flush()
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="feedback.submitted",
            target_type="feedback_item",
            target_id=feedback.id,
            metadata={"category": feedback.category, "page_context": feedback.page_context},
        )
        await self.session.commit()
        await self.session.refresh(feedback)
        return self._serialize_feedback(feedback)

    async def request_beta_access(self, payload: BetaAccessCreateRequest) -> BetaAccessResponse:
        email = self._normalize_email(payload.email)
        result = await self.session.execute(
            select(BetaAccessRequest)
            .where(BetaAccessRequest.email == email)
            .order_by(BetaAccessRequest.created_at.desc())
            .limit(1)
        )
        request = result.scalar_one_or_none()

        if request is None:
            request = BetaAccessRequest(
                email=email,
                interest=payload.interest,
                requested_creator_access=payload.requested_creator_access,
                source=payload.source,
                status="pending",
            )
            self.session.add(request)
            await self.session.flush()
        else:
            request.interest = payload.interest
            request.requested_creator_access = payload.requested_creator_access
            request.source = payload.source
            request.status = "pending"
            await self.session.flush()

        await self.audit_service.record(
            actor_user_id=None,
            action="beta_access.requested",
            target_type="beta_access_request",
            target_id=request.id,
            metadata={
                "requested_creator_access": request.requested_creator_access,
                "source": request.source,
            },
        )
        await self.session.commit()
        await self.session.refresh(request)
        return self._serialize_beta_access_request(request)

    async def list_creator_invites(self) -> list[CreatorInviteResponse]:
        await self._expire_stale_invites()
        result = await self.session.execute(
            select(CreatorInvite).order_by(CreatorInvite.created_at.desc()).limit(50)
        )
        return [self._serialize_creator_invite(invite) for invite in result.scalars().all()]

    async def create_creator_invite(
        self,
        current_user: AuthenticatedUserContext,
        payload: CreatorInviteCreateRequest,
    ) -> CreatorInviteResponse:
        await self._expire_stale_invites()
        email = self._normalize_email(payload.email)

        pending_invites = await self.session.execute(
            select(CreatorInvite).where(CreatorInvite.email == email, CreatorInvite.status == "pending")
        )
        now = datetime.now(UTC)
        for invite in pending_invites.scalars().all():
            invite.status = "revoked"

        invite_token = secrets.token_urlsafe(24)
        invite_url = f"{self.settings.web_app_url.rstrip('/')}/dashboard/creators/onboard?invite={invite_token}"
        invite = CreatorInvite(
            email=email,
            invite_token=invite_token,
            invite_url=invite_url,
            status="pending",
            invited_by=current_user.id,
            expires_at=now + timedelta(days=payload.expires_in_days),
        )
        self.session.add(invite)
        await self.session.flush()
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="creator_invite.created",
            target_type="creator_invite",
            target_id=invite.id,
            metadata={"email": email, "expires_at": invite.expires_at.isoformat() if invite.expires_at else None},
        )
        await self.session.commit()
        await self.session.refresh(invite)
        return self._serialize_creator_invite(invite)

    async def accept_creator_invite(
        self,
        current_user: AuthenticatedUserContext,
        invite_token: str,
    ) -> CreatorInviteResponse:
        await self._expire_stale_invites()
        result = await self.session.execute(select(CreatorInvite).where(CreatorInvite.invite_token == invite_token))
        invite = result.scalar_one_or_none()
        if invite is None:
            raise BetaServiceError("This creator invite link is not valid.", status_code=404)

        if invite.status == "claimed":
            if invite.claimed_by == current_user.id:
                profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
                if not profile.is_creator:
                    profile.is_creator = True
                    await self.session.commit()
                return self._serialize_creator_invite(invite)
            raise BetaServiceError("This creator invite has already been claimed.", status_code=409)

        if invite.status != "pending":
            raise BetaServiceError("This creator invite is no longer active.", status_code=409)

        if invite.email != self._normalize_email(current_user.email):
            raise BetaServiceError("This creator invite was issued for a different email address.", status_code=403)

        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        profile.is_creator = True
        invite.status = "claimed"
        invite.claimed_by = current_user.id
        invite.claimed_at = datetime.now(UTC)
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="creator_invite.accepted",
            target_type="creator_invite",
            target_id=invite.id,
            metadata={"email": invite.email},
        )
        await self.session.commit()
        await self.session.refresh(invite)
        return self._serialize_creator_invite(invite)

    async def get_analytics_overview(self, *, days: int = 14) -> AnalyticsOverviewResponse:
        bounded_days = max(1, min(days, 30))
        series: list[DailyUsageMetricResponse] = []

        for offset in range(bounded_days - 1, -1, -1):
            metric_date = (datetime.now(UTC) - timedelta(days=offset)).date()
            series.append(await self._refresh_daily_metric(metric_date))

        pending_feedback_items = await self._count_feedback_by_status("new")
        pending_beta_requests = await self._count_beta_requests_by_status("pending")
        active_creator_invites = await self._count_active_invites()

        summary = AnalyticsSummary(
            active_users=sum(item.active_users for item in series),
            story_generations=sum(item.story_generations for item in series),
            audio_renders=sum(item.audio_renders for item in series),
            twin_chat_messages=sum(item.twin_chat_messages for item in series),
            feedback_submissions=sum(item.feedback_submissions for item in series),
            beta_access_requests=sum(item.beta_access_requests for item in series),
            pending_beta_requests=pending_beta_requests,
            pending_feedback_items=pending_feedback_items,
            active_creator_invites=active_creator_invites,
        )

        return AnalyticsOverviewResponse(summary=summary, series=series)

    async def _refresh_daily_metric(self, metric_date: date) -> DailyUsageMetricResponse:
        start = datetime.combine(metric_date, time.min, tzinfo=UTC)
        end = start + timedelta(days=1)

        story_generations = await self._count_scalar(
            select(func.count(StoryGeneration.id)).where(
                StoryGeneration.created_at >= start,
                StoryGeneration.created_at < end,
            )
        )
        audio_renders = await self._count_scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.action == "audio.generated",
                AuditLog.created_at >= start,
                AuditLog.created_at < end,
            )
        )
        twin_chat_messages = await self._count_scalar(
            select(func.count(ChatMessage.id))
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(
                ChatMessage.created_at >= start,
                ChatMessage.created_at < end,
                ChatSession.twin_id.is_not(None),
                ChatMessage.role == "assistant",
            )
        )
        feedback_submissions = await self._count_scalar(
            select(func.count(FeedbackItem.id)).where(
                FeedbackItem.created_at >= start,
                FeedbackItem.created_at < end,
            )
        )
        beta_access_requests = await self._count_scalar(
            select(func.count(BetaAccessRequest.id)).where(
                BetaAccessRequest.created_at >= start,
                BetaAccessRequest.created_at < end,
            )
        )

        active_users = await self._count_active_users(start=start, end=end)

        result = await self.session.execute(select(DailyUsageMetric).where(DailyUsageMetric.metric_date == metric_date))
        metric = result.scalar_one_or_none()
        if metric is None:
            metric = DailyUsageMetric(metric_date=metric_date)
            self.session.add(metric)

        metric.active_users = active_users
        metric.story_generations = story_generations
        metric.audio_renders = audio_renders
        metric.twin_chat_messages = twin_chat_messages
        metric.feedback_submissions = feedback_submissions
        metric.beta_access_requests = beta_access_requests

        await self.session.commit()
        await self.session.refresh(metric)
        return self._serialize_daily_metric(metric)

    async def _count_active_users(self, *, start: datetime, end: datetime) -> int:
        active_user_ids: set[str] = set()

        story_users = await self.session.execute(
            select(StoryGeneration.user_id).where(
                StoryGeneration.created_at >= start,
                StoryGeneration.created_at < end,
                StoryGeneration.user_id.is_not(None),
            )
        )
        active_user_ids.update(str(user_id) for user_id in story_users.scalars().all() if user_id)

        chat_users = await self.session.execute(
            select(ChatSession.user_id)
            .join(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .where(ChatMessage.created_at >= start, ChatMessage.created_at < end)
            .distinct()
        )
        active_user_ids.update(str(user_id) for user_id in chat_users.scalars().all() if user_id)

        audio_users = await self.session.execute(
            select(AuditLog.actor_user_id).where(
                AuditLog.created_at >= start,
                AuditLog.created_at < end,
                AuditLog.actor_user_id.is_not(None),
            )
        )
        active_user_ids.update(str(user_id) for user_id in audio_users.scalars().all() if user_id)

        feedback_users = await self.session.execute(
            select(FeedbackItem.user_id).where(
                FeedbackItem.created_at >= start,
                FeedbackItem.created_at < end,
                FeedbackItem.user_id.is_not(None),
            )
        )
        active_user_ids.update(str(user_id) for user_id in feedback_users.scalars().all() if user_id)

        return len(active_user_ids)

    async def _count_feedback_by_status(self, status: str) -> int:
        return await self._count_scalar(select(func.count(FeedbackItem.id)).where(FeedbackItem.status == status))

    async def _count_beta_requests_by_status(self, status: str) -> int:
        return await self._count_scalar(select(func.count(BetaAccessRequest.id)).where(BetaAccessRequest.status == status))

    async def _count_active_invites(self) -> int:
        now = datetime.now(UTC)
        return await self._count_scalar(
            select(func.count(CreatorInvite.id)).where(
                CreatorInvite.status == "pending",
                (CreatorInvite.expires_at.is_(None) | (CreatorInvite.expires_at >= now)),
            )
        )

    async def _count_scalar(self, statement) -> int:
        result = await self.session.execute(statement)
        return int(result.scalar_one() or 0)

    async def _expire_stale_invites(self) -> None:
        now = datetime.now(UTC)
        result = await self.session.execute(
            select(CreatorInvite).where(CreatorInvite.status == "pending", CreatorInvite.expires_at.is_not(None))
        )
        updated = False
        for invite in result.scalars().all():
            if invite.expires_at is not None and invite.expires_at < now:
                invite.status = "expired"
                updated = True
        if updated:
            await self.session.commit()

    def _normalize_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if "@" not in normalized or "." not in normalized.split("@")[-1]:
            raise BetaServiceError("Please enter a valid email address.", status_code=422)
        return normalized

    def _serialize_feedback(self, feedback: FeedbackItem) -> FeedbackResponse:
        return FeedbackResponse(
            id=feedback.id,
            user_id=feedback.user_id,
            email=feedback.email,
            category=feedback.category,
            message=feedback.message,
            page_context=feedback.page_context,
            status=feedback.status,
            created_at=feedback.created_at,
        )

    def _serialize_beta_access_request(self, request: BetaAccessRequest) -> BetaAccessResponse:
        return BetaAccessResponse(
            id=request.id,
            email=request.email,
            interest=request.interest,
            requested_creator_access=request.requested_creator_access,
            source=request.source,
            status=request.status,
            created_at=request.created_at,
        )

    def _serialize_creator_invite(self, invite: CreatorInvite) -> CreatorInviteResponse:
        return CreatorInviteResponse(
            id=invite.id,
            email=invite.email,
            invite_token=invite.invite_token,
            invite_url=invite.invite_url,
            status=invite.status,
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            claimed_at=invite.claimed_at,
        )

    def _serialize_daily_metric(self, metric: DailyUsageMetric) -> DailyUsageMetricResponse:
        return DailyUsageMetricResponse(
            metric_date=metric.metric_date,
            active_users=metric.active_users,
            story_generations=metric.story_generations,
            audio_renders=metric.audio_renders,
            twin_chat_messages=metric.twin_chat_messages,
            feedback_submissions=metric.feedback_submissions,
            beta_access_requests=metric.beta_access_requests,
            updated_at=metric.updated_at,
        )
