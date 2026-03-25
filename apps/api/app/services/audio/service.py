from __future__ import annotations

import base64
import hashlib
import logging
from dataclasses import dataclass

import httpx
from redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger("lumina.audio")

AUDIO_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
AUDIO_MIME_TYPE = "audio/mpeg"
AUDIO_OUTPUT_FORMAT = "mp3_22050_32"


@dataclass(slots=True)
class AudioClip:
    audio_bytes: bytes
    cached: bool
    voice_id: str
    mime_type: str = AUDIO_MIME_TYPE

    @property
    def data_url(self) -> str:
        encoded = base64.b64encode(self.audio_bytes).decode("ascii")
        return f"data:{self.mime_type};base64,{encoded}"


@dataclass(slots=True)
class AudioServiceError(Exception):
    message: str
    status_code: int = 503

    def __str__(self) -> str:
        return self.message


class AudioService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._redis: Redis | None = None

    async def generate_audio(self, text: str, voice_id: str | None = None) -> bytes:
        clip = await self.generate_audio_clip(text=text, voice_id=voice_id)
        return clip.audio_bytes

    async def generate_audio_clip(self, text: str, voice_id: str | None = None) -> AudioClip:
        normalized_text = self._normalize_text(text)
        resolved_voice_id = self._resolve_voice_id(voice_id)
        cache_key = self._cache_key(text=normalized_text, voice_id=resolved_voice_id)
        cached_audio = await self.get_cached_audio(text=normalized_text, voice_id=resolved_voice_id)
        if cached_audio is not None:
            return cached_audio

        if not self.settings.elevenlabs_api_key:
            raise AudioServiceError("ELEVENLABS_API_KEY is required to generate narration audio.")

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{resolved_voice_id}",
                    params={"output_format": AUDIO_OUTPUT_FORMAT},
                    headers={
                        "xi-api-key": self.settings.elevenlabs_api_key,
                        "Accept": AUDIO_MIME_TYPE,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": normalized_text,
                        "model_id": self.settings.elevenlabs_model_id,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise AudioServiceError(
                f"ElevenLabs audio generation failed with status {exc.response.status_code}.",
                status_code=502,
            ) from exc
        except httpx.HTTPError as exc:
            raise AudioServiceError("Could not reach ElevenLabs to generate narration audio.") from exc

        audio_bytes = response.content
        await self._set_cached_audio(cache_key=cache_key, audio_bytes=audio_bytes)
        return AudioClip(audio_bytes=audio_bytes, cached=False, voice_id=resolved_voice_id)

    async def get_cached_audio(self, *, text: str, voice_id: str | None = None) -> AudioClip | None:
        normalized_text = self._normalize_text(text)
        resolved_voice_id = self._resolve_voice_id(voice_id)
        cache_key = self._cache_key(text=normalized_text, voice_id=resolved_voice_id)
        redis = await self._get_redis()
        if redis is None:
            return None

        try:
            cached = await redis.get(cache_key)
        except Exception:
            logger.warning("Audio cache read failed; continuing without cache hit.", exc_info=True)
            return None

        if not cached:
            return None

        if isinstance(cached, memoryview):
            cached = cached.tobytes()
        elif isinstance(cached, str):
            cached = cached.encode("utf-8")

        return AudioClip(audio_bytes=bytes(cached), cached=True, voice_id=resolved_voice_id)

    def _resolve_voice_id(self, voice_id: str | None) -> str:
        resolved_voice_id = (voice_id or self.settings.elevenlabs_voice_id or "").strip()
        if not resolved_voice_id:
            raise AudioServiceError("ELEVENLABS_VOICE_ID is required to generate narration audio.")
        return resolved_voice_id

    def _normalize_text(self, text: str) -> str:
        normalized_text = " ".join(text.split()).strip()
        if not normalized_text:
            raise AudioServiceError("Narration audio requires non-empty text.", status_code=400)
        return normalized_text[:5000]

    def _cache_key(self, *, text: str, voice_id: str) -> str:
        digest = hashlib.sha256(f"{voice_id}|{self.settings.elevenlabs_model_id}|{AUDIO_OUTPUT_FORMAT}|{text}".encode("utf-8")).hexdigest()
        return f"lumina:audio:{digest}"

    async def _get_redis(self) -> Redis | None:
        if self._redis is None:
            self._redis = Redis.from_url(self.settings.redis_url, decode_responses=False)
        return self._redis

    async def _set_cached_audio(self, *, cache_key: str, audio_bytes: bytes) -> None:
        redis = await self._get_redis()
        if redis is None:
            return

        try:
            await redis.set(cache_key, audio_bytes, ex=AUDIO_CACHE_TTL_SECONDS)
        except Exception:
            logger.warning("Audio cache write failed; continuing without Redis durability.", exc_info=True)
