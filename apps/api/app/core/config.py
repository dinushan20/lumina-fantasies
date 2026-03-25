from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"
    api_prefix: str = "/api"
    api_log_level: str = "INFO"
    internal_api_shared_secret: str = "replace-with-a-long-shared-secret"
    web_app_url: str = "http://localhost:3000"

    database_url: str = "postgresql+asyncpg://lumina:lumina@localhost:5432/lumina"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    llm_provider: Literal["mock", "openai-compatible"] = "mock"
    llm_model: str = "qwen3.5-32b-instruct"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    moderation_provider: Literal["local-rules", "openai-compatible"] = "local-rules"
    moderation_model: str = "qwen3.5-moderation"

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_basic_id: str | None = None
    stripe_price_premium_id: str | None = None
    stripe_price_vip_id: str | None = None

    consent_score_threshold: int = 75
    human_review_threshold: int = 55
    moderation_queue_threshold: float = 92.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
