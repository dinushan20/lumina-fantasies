from __future__ import annotations

import logging
from dataclasses import dataclass

from redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger("lumina.rate_limit")


@dataclass(frozen=True, slots=True)
class RateLimitWindow:
    limit: int
    window_seconds: int


@dataclass(slots=True)
class RateLimitExceededError(Exception):
    message: str
    retry_after_seconds: int

    def __str__(self) -> str:
        return self.message


RATE_LIMITS: dict[str, dict[str, RateLimitWindow]] = {
    "story.generate": {
        "free": RateLimitWindow(limit=4, window_seconds=60),
        "basic": RateLimitWindow(limit=10, window_seconds=60),
        "premium": RateLimitWindow(limit=18, window_seconds=60),
        "vip": RateLimitWindow(limit=24, window_seconds=60),
    },
    "chat.stream": {
        "free": RateLimitWindow(limit=12, window_seconds=60),
        "basic": RateLimitWindow(limit=30, window_seconds=60),
        "premium": RateLimitWindow(limit=60, window_seconds=60),
        "vip": RateLimitWindow(limit=90, window_seconds=60),
    },
}


class RequestRateLimitService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._redis: Redis | None = None

    async def enforce(self, *, action: str, subscription_tier: str, user_id: str) -> None:
        tier_limits = RATE_LIMITS.get(action)
        if tier_limits is None:
            return

        window = tier_limits.get(subscription_tier, tier_limits["free"])
        redis = await self._get_redis()
        if redis is None:
            return

        cache_key = f"lumina:ratelimit:{action}:{subscription_tier}:{user_id}"

        try:
            current = await redis.incr(cache_key)
            if current == 1:
                await redis.expire(cache_key, window.window_seconds)

            if current > window.limit:
                retry_after = await redis.ttl(cache_key)
                raise RateLimitExceededError(
                    message=(
                        "You’re moving a little too fast. Please pause for a moment before trying again."
                    ),
                    retry_after_seconds=max(retry_after, 1),
                )
        except RateLimitExceededError:
            raise
        except Exception:
            logger.warning("Rate-limit check failed; continuing without Redis enforcement.", exc_info=True)

    async def _get_redis(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(self.settings.redis_url, decode_responses=True)
        return self._redis
