from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, get_current_user_context
from app.db.session import get_db_session
from app.schemas.chat import ChatMessageAudioResponse, ChatSessionDetail, ChatSessionSummary, ChatStreamRequest
from app.services.chat import ChatService, ChatServiceError

router = APIRouter()


def get_chat_service(session: AsyncSession = Depends(get_db_session)) -> ChatService:
    return ChatService(session=session)


@router.get("/chat/sessions", response_model=list[ChatSessionSummary])
async def list_chat_sessions(
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    chat_service: ChatService = Depends(get_chat_service),
) -> list[ChatSessionSummary]:
    return await chat_service.list_sessions(current_user)


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_chat_session(
    session_id: UUID,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatSessionDetail:
    try:
        return await chat_service.get_session_detail(current_user, session_id)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/chat/stream")
async def stream_chat(
    payload: ChatStreamRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    chat_service: ChatService = Depends(get_chat_service),
) -> StreamingResponse:
    try:
        prepared_turn = await chat_service.prepare_chat_turn(payload, current_user)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return StreamingResponse(
        chat_service.stream_prepared_turn(prepared_turn),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/messages/{message_id}/audio", response_model=ChatMessageAudioResponse)
async def regenerate_chat_audio(
    message_id: UUID,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatMessageAudioResponse:
    try:
        return await chat_service.generate_message_audio(current_user, message_id)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
