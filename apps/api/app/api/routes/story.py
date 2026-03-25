from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, get_current_user_context
from app.db.session import get_db_session
from app.schemas.story import StoryGenerateRequest, StoryGenerateResponse
from app.services.story.service import PolicyViolationError, StoryService

router = APIRouter()


def get_story_service(session: AsyncSession = Depends(get_db_session)) -> StoryService:
    return StoryService(session=session)


@router.post("/generate-story", response_model=StoryGenerateResponse)
async def generate_story(
    payload: StoryGenerateRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    story_service: StoryService = Depends(get_story_service),
) -> StoryGenerateResponse:
    try:
        return await story_service.generate(payload, current_user)
    except PolicyViolationError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc


@router.get("/story/{request_id}", response_model=StoryGenerateResponse)
async def get_story(
    request_id: UUID,
    audio: bool = Query(default=False),
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    story_service: StoryService = Depends(get_story_service),
) -> StoryGenerateResponse:
    try:
        return await story_service.get_generation(request_id, current_user, include_audio=audio)
    except PolicyViolationError as exc:
        raise HTTPException(
            status_code=exc.status_code if exc.status_code != status.HTTP_403_FORBIDDEN else status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
