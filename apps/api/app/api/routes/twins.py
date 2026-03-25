from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, get_current_user_context
from app.db.session import get_db_session
from app.schemas.twin import DigitalTwinCreateRequest, DigitalTwinResponse, DigitalTwinUpdateRequest
from app.services.twin import DigitalTwinService, DigitalTwinServiceError

router = APIRouter()


def get_twin_service(session: AsyncSession = Depends(get_db_session)) -> DigitalTwinService:
    return DigitalTwinService(session=session)


@router.post("/twins/upload", response_model=DigitalTwinResponse)
async def upload_twin(
    payload: DigitalTwinCreateRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> DigitalTwinResponse:
    try:
        return await twin_service.upload_twin(payload=payload, current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/twins/my-twins", response_model=list[DigitalTwinResponse])
async def list_my_twins(
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> list[DigitalTwinResponse]:
    try:
        return await twin_service.list_creator_twins(current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/twins/public", response_model=list[DigitalTwinResponse])
async def list_public_twins(
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> list[DigitalTwinResponse]:
    try:
        return await twin_service.list_public_twins(current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/twins/{twin_id}", response_model=DigitalTwinResponse)
async def get_twin(
    twin_id: UUID,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> DigitalTwinResponse:
    try:
        return await twin_service.get_twin(twin_id=twin_id, current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.patch("/twins/{twin_id}", response_model=DigitalTwinResponse)
async def update_twin(
    twin_id: UUID,
    payload: DigitalTwinUpdateRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> DigitalTwinResponse:
    try:
        return await twin_service.update_twin(twin_id=twin_id, payload=payload, current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.delete("/twins/{twin_id}", response_model=DigitalTwinResponse)
async def delete_twin(
    twin_id: UUID,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    twin_service: DigitalTwinService = Depends(get_twin_service),
) -> DigitalTwinResponse:
    try:
        return await twin_service.delete_twin(twin_id=twin_id, current_user=current_user)
    except DigitalTwinServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
