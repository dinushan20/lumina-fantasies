from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AuthenticatedUserContext,
    get_current_user_context,
    require_admin_user_context,
)
from app.db.session import get_db_session
from app.schemas.beta import (
    AnalyticsOverviewResponse,
    BetaAccessCreateRequest,
    BetaAccessResponse,
    CreatorInviteCreateRequest,
    CreatorInviteResponse,
    FeedbackCreateRequest,
    FeedbackResponse,
)
from app.services.beta import BetaService, BetaServiceError

router = APIRouter()


def get_beta_service(session: AsyncSession = Depends(get_db_session)) -> BetaService:
    return BetaService(session=session)


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackCreateRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    beta_service: BetaService = Depends(get_beta_service),
) -> FeedbackResponse:
    try:
        return await beta_service.submit_feedback(current_user, payload)
    except BetaServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/beta-access/request", response_model=BetaAccessResponse)
async def request_beta_access(
    payload: BetaAccessCreateRequest,
    beta_service: BetaService = Depends(get_beta_service),
) -> BetaAccessResponse:
    try:
        return await beta_service.request_beta_access(payload)
    except BetaServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/admin/creator-invites", response_model=list[CreatorInviteResponse])
async def list_creator_invites(
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    beta_service: BetaService = Depends(get_beta_service),
) -> list[CreatorInviteResponse]:
    return await beta_service.list_creator_invites()


@router.post("/admin/creator-invites", response_model=CreatorInviteResponse)
async def create_creator_invite(
    payload: CreatorInviteCreateRequest,
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    beta_service: BetaService = Depends(get_beta_service),
) -> CreatorInviteResponse:
    try:
        return await beta_service.create_creator_invite(current_user, payload)
    except BetaServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/creator-invites/{invite_token}/accept", response_model=CreatorInviteResponse)
async def accept_creator_invite(
    invite_token: str,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    beta_service: BetaService = Depends(get_beta_service),
) -> CreatorInviteResponse:
    try:
        return await beta_service.accept_creator_invite(current_user, invite_token)
    except BetaServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/admin/analytics/overview", response_model=AnalyticsOverviewResponse)
async def get_analytics_overview(
    days: Annotated[int, Query(ge=1, le=30)] = 14,
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    beta_service: BetaService = Depends(get_beta_service),
) -> AnalyticsOverviewResponse:
    return await beta_service.get_analytics_overview(days=days)
