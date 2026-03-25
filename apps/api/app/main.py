from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.beta import router as beta_router
from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.api.routes.moderation import router as moderation_router
from app.api.routes.payments import router as payments_router
from app.api.routes.profile import router as profile_router
from app.api.routes.story import router as story_router
from app.api.routes.twins import router as twins_router
from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.api_log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    logging.getLogger("lumina.startup").info("API booted with environment=%s", get_settings().environment)
    yield


settings = get_settings()
app = FastAPI(
    title="Lumina Fantasies API",
    version=settings.app_version,
    description="Consent-first AI storytelling API with moderation and auditability.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(beta_router, prefix=settings.api_prefix, tags=["beta"])
app.include_router(chat_router, prefix=settings.api_prefix, tags=["chat"])
app.include_router(health_router, prefix=settings.api_prefix, tags=["health"])
app.include_router(moderation_router, prefix=settings.api_prefix, tags=["moderation"])
app.include_router(payments_router, prefix=settings.api_prefix, tags=["payments"])
app.include_router(profile_router, prefix=settings.api_prefix, tags=["profile"])
app.include_router(story_router, prefix=settings.api_prefix, tags=["story"])
app.include_router(twins_router, prefix=settings.api_prefix, tags=["twins"])
