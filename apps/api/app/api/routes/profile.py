from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, get_current_user_context
from app.db.session import get_db_session
from app.schemas.profile import ProfileOnboardingRequest, ProfileResponse
from app.services.profile import ProfileService

router = APIRouter()


def get_profile_service(session: AsyncSession = Depends(get_db_session)) -> ProfileService:
    return ProfileService(session=session)


@router.get("/profile/me", response_model=ProfileResponse)
async def get_my_profile(
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    return await profile_service.get_profile_response(current_user)


@router.post("/profile/onboarding", response_model=ProfileResponse)
async def save_profile_onboarding(
    payload: ProfileOnboardingRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    return await profile_service.save_onboarding(current_user, payload)

