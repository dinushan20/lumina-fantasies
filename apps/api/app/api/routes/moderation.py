from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, require_admin_user_context
from app.db.session import get_db_session
from app.schemas.moderation import (
    ModerationEscalationResponse,
    ModerationQueueDetail,
    ModerationQueueReviewRequest,
    ModerationQueueSummary,
)
from app.services.moderation import ModerationQueueService, ModerationQueueServiceError

router = APIRouter()


def get_moderation_queue_service(session: AsyncSession = Depends(get_db_session)) -> ModerationQueueService:
    return ModerationQueueService(session=session)


@router.get("/moderation/queue", response_model=list[ModerationQueueSummary])
async def list_moderation_queue_items(
    status: Literal["pending", "approved", "rejected", "escalated", "all"] = Query(default="pending"),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    queue_service: ModerationQueueService = Depends(get_moderation_queue_service),
) -> list[ModerationQueueSummary]:
    try:
        return await queue_service.list_queue_items(current_user=current_user, status=status, limit=limit)
    except ModerationQueueServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/moderation/queue/escalate-stale", response_model=ModerationEscalationResponse)
async def escalate_stale_queue_items(
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    queue_service: ModerationQueueService = Depends(get_moderation_queue_service),
) -> ModerationEscalationResponse:
    try:
        escalated_count = await queue_service.escalate_stale_items(current_user=current_user)
    except ModerationQueueServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return ModerationEscalationResponse(escalated_count=escalated_count)


@router.get("/moderation/queue/{item_id}", response_model=ModerationQueueDetail)
async def get_moderation_queue_item(
    item_id: UUID,
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    queue_service: ModerationQueueService = Depends(get_moderation_queue_service),
) -> ModerationQueueDetail:
    try:
        return await queue_service.get_queue_item(item_id=item_id, current_user=current_user)
    except ModerationQueueServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/moderation/queue/{item_id}/review", response_model=ModerationQueueDetail)
async def review_moderation_queue_item(
    item_id: UUID,
    payload: ModerationQueueReviewRequest,
    current_user: AuthenticatedUserContext = Depends(require_admin_user_context),
    queue_service: ModerationQueueService = Depends(get_moderation_queue_service),
) -> ModerationQueueDetail:
    try:
        return await queue_service.review_queue_item(
            item_id=item_id,
            status=payload.status,
            notes=payload.notes,
            final_score=payload.final_score,
            current_user=current_user,
        )
    except ModerationQueueServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
