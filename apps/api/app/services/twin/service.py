from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.db.models.identity import AuthUser, Profile
from app.db.models.twin import DigitalTwin
from app.schemas.twin import (
    DigitalTwinCreateRequest,
    DigitalTwinResponse,
    DigitalTwinUpdateRequest,
    TwinAccessSummary,
    TwinConsentAttestation,
    TwinReferenceData,
)
from app.services.audit import AuditLogService
from app.services.moderation import ModerationQueueService, ModerationService
from app.services.profile import ProfileService, subscription_has_access


@dataclass(slots=True)
class DigitalTwinServiceError(Exception):
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class DigitalTwinService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.profile_service = ProfileService(session)
        self.moderation_service = ModerationService()
        self.queue_service = ModerationQueueService(session)
        self.audit_service = AuditLogService(session)

    async def upload_twin(
        self,
        *,
        payload: DigitalTwinCreateRequest,
        current_user: AuthenticatedUserContext,
    ) -> DigitalTwinResponse:
        profile = await self._require_creator_profile(current_user)
        decision = self.moderation_service.screen_twin_profile(
            name=payload.name,
            description=payload.description,
            reference_data=payload.reference_data,
            consent=payload.consent,
        )

        if not decision.allowed:
            reason_list = ", ".join(decision.blocked_reasons)
            raise DigitalTwinServiceError(
                f"Digital twin upload blocked by Lumina safety policy: {reason_list}.",
                status_code=403,
            )

        twin = DigitalTwin(
            creator_id=current_user.id,
            name=payload.name,
            description=payload.description,
            consent_status="pending",
            consent_attestation=payload.consent.model_dump(),
            reference_data=payload.reference_data.model_dump(),
            preferred_voice_id=payload.preferred_voice_id,
            status="training",
            required_subscription_tier=payload.required_subscription_tier,
            moderation_score=float(decision.consent_score),
        )
        self.session.add(twin)
        await self.session.flush()

        await self.queue_service.enqueue_digital_twin(
            twin=twin,
            raw_twin_payload=self._build_raw_payload(twin=twin),
            decision=decision,
            user_id=current_user.id,
        )
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="digital_twin.created",
            target_type="digital_twin",
            target_id=twin.id,
            metadata={
                "required_subscription_tier": twin.required_subscription_tier,
                "moderation_score": decision.consent_score,
                "status": twin.status,
            },
        )

        await self.session.commit()
        await self.session.refresh(twin)
        return await self._serialize_twin(twin=twin, viewer_profile=profile, viewer=current_user, creator_email=current_user.email)

    async def list_creator_twins(self, *, current_user: AuthenticatedUserContext) -> list[DigitalTwinResponse]:
        profile = await self._require_creator_profile(current_user)
        result = await self.session.execute(
            select(DigitalTwin)
            .where(DigitalTwin.creator_id == current_user.id)
            .order_by(DigitalTwin.updated_at.desc())
        )
        twins = result.scalars().all()
        return [
            await self._serialize_twin(twin=twin, viewer_profile=profile, viewer=current_user, creator_email=current_user.email)
            for twin in twins
        ]

    async def list_public_twins(self, *, current_user: AuthenticatedUserContext) -> list[DigitalTwinResponse]:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        result = await self.session.execute(
            select(DigitalTwin, AuthUser.email)
            .join(AuthUser, AuthUser.id == DigitalTwin.creator_id)
            .where(
                DigitalTwin.status == "active",
                DigitalTwin.consent_status == "approved",
            )
            .order_by(DigitalTwin.updated_at.desc())
        )
        rows = result.all()
        return [
            await self._serialize_twin(twin=row[0], viewer_profile=profile, viewer=current_user, creator_email=row[1])
            for row in rows
        ]

    async def get_twin(self, *, twin_id: UUID, current_user: AuthenticatedUserContext) -> DigitalTwinResponse:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        twin = await self._get_twin_or_raise(twin_id)
        creator_email = await self._lookup_creator_email(twin.creator_id)

        if not self._viewer_can_view_twin(twin=twin, viewer=current_user):
            raise DigitalTwinServiceError("Digital twin not found or unavailable.", status_code=404)

        return await self._serialize_twin(twin=twin, viewer_profile=profile, viewer=current_user, creator_email=creator_email)

    async def update_twin(
        self,
        *,
        twin_id: UUID,
        payload: DigitalTwinUpdateRequest,
        current_user: AuthenticatedUserContext,
    ) -> DigitalTwinResponse:
        twin = await self._get_owned_twin_or_raise(twin_id=twin_id, current_user=current_user)
        viewer_profile = await self.profile_service.get_or_create_profile(current_user, commit=False)

        reference_data = payload.reference_data or TwinReferenceData.model_validate(twin.reference_data or {})
        consent = payload.consent or TwinConsentAttestation.model_validate(twin.consent_attestation or {})
        next_name = payload.name or twin.name
        next_description = payload.description or twin.description
        next_required_tier = payload.required_subscription_tier or twin.required_subscription_tier
        next_preferred_voice_id = payload.preferred_voice_id if payload.preferred_voice_id is not None else twin.preferred_voice_id

        decision = self.moderation_service.screen_twin_profile(
            name=next_name,
            description=next_description,
            reference_data=reference_data,
            consent=consent,
        )
        if not decision.allowed:
            reason_list = ", ".join(decision.blocked_reasons)
            raise DigitalTwinServiceError(
                f"Digital twin update blocked by Lumina safety policy: {reason_list}.",
                status_code=403,
            )

        twin.name = next_name
        twin.description = next_description
        twin.reference_data = reference_data.model_dump()
        twin.consent_attestation = consent.model_dump()
        twin.preferred_voice_id = next_preferred_voice_id
        twin.required_subscription_tier = next_required_tier
        twin.consent_status = "pending"
        twin.status = "training"
        twin.moderation_score = float(decision.consent_score)

        await self.session.flush()
        await self.queue_service.enqueue_digital_twin(
            twin=twin,
            raw_twin_payload=self._build_raw_payload(twin=twin),
            decision=decision,
            user_id=current_user.id,
        )
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="digital_twin.updated",
            target_type="digital_twin",
            target_id=twin.id,
            metadata={
                "required_subscription_tier": twin.required_subscription_tier,
                "moderation_score": decision.consent_score,
                "status": twin.status,
            },
        )

        await self.session.commit()
        await self.session.refresh(twin)
        return await self._serialize_twin(twin=twin, viewer_profile=viewer_profile, viewer=current_user)

    async def delete_twin(self, *, twin_id: UUID, current_user: AuthenticatedUserContext) -> DigitalTwinResponse:
        twin = await self._get_owned_twin_or_raise(twin_id=twin_id, current_user=current_user)
        viewer_profile = await self.profile_service.get_or_create_profile(current_user, commit=False)

        twin.status = "suspended"
        await self.audit_service.record(
            actor_user_id=current_user.id,
            action="digital_twin.deleted",
            target_type="digital_twin",
            target_id=twin.id,
            metadata={"status": twin.status},
        )

        await self.session.commit()
        await self.session.refresh(twin)
        return await self._serialize_twin(twin=twin, viewer_profile=viewer_profile, viewer=current_user)

    async def get_twin_for_chat(
        self,
        *,
        twin_id: UUID,
        current_user: AuthenticatedUserContext,
        viewer_profile: Profile,
    ) -> DigitalTwin:
        twin = await self._get_twin_or_raise(twin_id)
        if twin.status != "active" or twin.consent_status != "approved":
            raise DigitalTwinServiceError("This digital twin is still under review and cannot be used in chat yet.", status_code=403)

        is_owner_or_admin = self._is_owner_or_admin(twin=twin, viewer=current_user)
        if not is_owner_or_admin and not subscription_has_access(
            subscription_tier=viewer_profile.subscription_tier,
            subscription_status=viewer_profile.subscription_status,
            required_tier=twin.required_subscription_tier,
        ):
            raise DigitalTwinServiceError(
                f"This digital twin requires the {twin.required_subscription_tier} plan before chat is available.",
                status_code=403,
            )

        return twin

    async def _serialize_twin(
        self,
        *,
        twin: DigitalTwin,
        viewer_profile: Profile,
        viewer: AuthenticatedUserContext,
        creator_email: str | None = None,
    ) -> DigitalTwinResponse:
        creator_email = creator_email or await self._lookup_creator_email(twin.creator_id)
        return DigitalTwinResponse(
            id=twin.id,
            creator_id=twin.creator_id,
            creator_email=creator_email,
            name=twin.name,
            description=twin.description,
            consent_status=twin.consent_status,
            reference_data=TwinReferenceData.model_validate(twin.reference_data or {}),
            preferred_voice_id=twin.preferred_voice_id,
            status=twin.status,
            required_subscription_tier=twin.required_subscription_tier,
            moderation_score=twin.moderation_score,
            access=self._build_access_summary(twin=twin, viewer_profile=viewer_profile, viewer=viewer),
            created_at=twin.created_at,
            updated_at=twin.updated_at,
        )

    def _build_access_summary(
        self,
        *,
        twin: DigitalTwin,
        viewer_profile: Profile,
        viewer: AuthenticatedUserContext,
    ) -> TwinAccessSummary:
        is_owner_or_admin = self._is_owner_or_admin(twin=twin, viewer=viewer)

        if twin.status != "active" or twin.consent_status != "approved":
            return TwinAccessSummary(
                required_subscription_tier=twin.required_subscription_tier,
                viewer_subscription_tier=viewer_profile.subscription_tier,
                viewer_subscription_status=viewer_profile.subscription_status,
                can_chat=False,
                access_message="This digital twin is still under human review.",
            )

        if is_owner_or_admin:
            return TwinAccessSummary(
                required_subscription_tier=twin.required_subscription_tier,
                viewer_subscription_tier=viewer_profile.subscription_tier,
                viewer_subscription_status=viewer_profile.subscription_status,
                can_chat=True,
                access_message="Approved twin access is available for the creator or admin reviewer.",
            )

        if subscription_has_access(
            subscription_tier=viewer_profile.subscription_tier,
            subscription_status=viewer_profile.subscription_status,
            required_tier=twin.required_subscription_tier,
        ):
            return TwinAccessSummary(
                required_subscription_tier=twin.required_subscription_tier,
                viewer_subscription_tier=viewer_profile.subscription_tier,
                viewer_subscription_status=viewer_profile.subscription_status,
                can_chat=True,
                access_message=None,
            )

        if twin.required_subscription_tier == "free":
            access_message = None
        elif viewer_profile.subscription_status != "active":
            access_message = (
                f"Activate a {twin.required_subscription_tier} subscription to chat with this twin and unlock voice mode, "
                "higher limits, and premium access."
            )
        else:
            access_message = (
                f"Upgrade to {twin.required_subscription_tier} to chat with this twin and unlock voice mode, higher limits, "
                "and premium access."
            )

        return TwinAccessSummary(
            required_subscription_tier=twin.required_subscription_tier,
            viewer_subscription_tier=viewer_profile.subscription_tier,
            viewer_subscription_status=viewer_profile.subscription_status,
            can_chat=False,
            access_message=access_message,
        )

    async def _require_creator_profile(self, current_user: AuthenticatedUserContext) -> Profile:
        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        if not profile.is_creator:
            raise DigitalTwinServiceError("Creator access is required for digital twin management.", status_code=403)
        return profile

    async def _get_twin_or_raise(self, twin_id: UUID) -> DigitalTwin:
        twin = await self.session.get(DigitalTwin, twin_id)
        if twin is None:
            raise DigitalTwinServiceError("Digital twin not found.", status_code=404)
        return twin

    async def _get_owned_twin_or_raise(self, *, twin_id: UUID, current_user: AuthenticatedUserContext) -> DigitalTwin:
        twin = await self._get_twin_or_raise(twin_id)
        if not self._is_owner_or_admin(twin=twin, viewer=current_user):
            raise DigitalTwinServiceError("You do not have access to modify this digital twin.", status_code=403)
        return twin

    async def _lookup_creator_email(self, creator_id: UUID) -> str:
        creator = await self.session.get(AuthUser, creator_id)
        return creator.email if creator is not None else "Unknown creator"

    def _viewer_can_view_twin(self, *, twin: DigitalTwin, viewer: AuthenticatedUserContext) -> bool:
        if self._is_owner_or_admin(twin=twin, viewer=viewer):
            return True
        return twin.status == "active" and twin.consent_status == "approved"

    def _is_owner_or_admin(self, *, twin: DigitalTwin, viewer: AuthenticatedUserContext) -> bool:
        return twin.creator_id == viewer.id or viewer.role == "admin"

    def _build_raw_payload(self, *, twin: DigitalTwin) -> dict[str, Any]:
        return {
            "id": str(twin.id),
            "creator_id": str(twin.creator_id),
            "name": twin.name,
            "description": twin.description,
            "consent_status": twin.consent_status,
            "consent_attestation": twin.consent_attestation,
            "reference_data": twin.reference_data,
            "preferred_voice_id": twin.preferred_voice_id,
            "status": twin.status,
            "required_subscription_tier": twin.required_subscription_tier,
            "moderation_score": twin.moderation_score,
        }
