from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass

import httpx

from app.core.config import get_settings


@dataclass(slots=True)
class ProviderStoryResult:
    title: str
    story: str
    branches: list[dict[str, str]]
    provider_name: str


@dataclass(slots=True)
class ProviderChatResult:
    content: str
    provider_name: str


class MockStoryProvider:
    name = "mock"

    async def generate_story(self, system_prompt: str, user_prompt: str, branch_count: int) -> ProviderStoryResult:
        del system_prompt

        title = "Velvet Threshold"
        story = (
            "Two clearly consenting adults meet in a suite washed in amber light, where every new touch is preceded by a quiet check-in "
            "and every answer is invited rather than assumed. The tension builds through language, shared anticipation, and deliberate "
            "permission, creating a luxurious opening scene that stays inside the user's stated boundaries while preserving erotic heat.\n\n"
            f"Scene seed: {user_prompt[:260]}"
        )
        branches = [
            {
                "id": f"choice-{index + 1}",
                "label": label,
                "direction": direction,
            }
            for index, (label, direction) in enumerate(
                [
                    ("Lean into anticipation", "Extend the slow-burn dialogue and deepen the atmosphere before any physical escalation."),
                    ("Shift the power dynamic", "Introduce playful negotiation around control, explicit safewords, and mutual limits."),
                    ("Heighten tenderness", "Move toward softer praise, reassurance, and a more romantic emotional register."),
                    ("Reset the scene", "Pause and rewrite the setting or mood while keeping the same boundaries and consent signals."),
                ][:branch_count]
            )
        ]
        return ProviderStoryResult(title=title, story=story, branches=branches, provider_name=self.name)

    async def generate_chat_preview(
        self,
        system_prompt: str,
        conversation: Sequence[dict[str, str]],
        character_name: str,
        response_style: str,
    ) -> str:
        del system_prompt, response_style

        latest_user_message = conversation[-1]["content"] if conversation else "Say hello warmly."
        return (
            f"{character_name} will answer in a consent-forward, emotionally attuned direction that acknowledges the user's last message "
            f"and stays well inside stated boundaries. Prompt seed: {latest_user_message[:160]}"
        )

    async def generate_chat_response(
        self,
        system_prompt: str,
        conversation: Sequence[dict[str, str]],
        character_name: str,
        response_style: str,
    ) -> ProviderChatResult:
        del system_prompt

        latest_user_message = conversation[-1]["content"] if conversation else "Say hello warmly."
        tone_map = {
            "free": "Keep the reply concise and inviting.",
            "basic": "Keep the reply warm and moderately detailed.",
            "premium": "Make the reply lush, immersive, and emotionally layered.",
            "vip": "Make the reply luxuriously immersive with heightened personalization.",
        }
        content = (
            f"{character_name} leans closer through text, answering with clear consent, attentive curiosity, and a grounded awareness of the "
            f"user's stated preferences. {tone_map.get(response_style, tone_map['free'])} "
            f"They acknowledge the user's last direction, invite feedback, and keep the exchange fully adult, mutual, and boundary-aware.\n\n"
            f"Latest user cue: {latest_user_message[:220]}"
        )
        return ProviderChatResult(content=content, provider_name=self.name)


class OpenAICompatibleStoryProvider:
    name = "openai-compatible"

    def __init__(self) -> None:
        self.settings = get_settings()

    async def generate_story(self, system_prompt: str, user_prompt: str, branch_count: int) -> ProviderStoryResult:
        if not self.settings.llm_base_url or not self.settings.llm_api_key:
            raise RuntimeError("LLM_BASE_URL and LLM_API_KEY must be configured for openai-compatible mode.")

        request_payload = {
            "model": self.settings.llm_model,
            "temperature": 0.85,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"{user_prompt}\n\n"
                        f"Return JSON with keys title, story, and branches. Include exactly {branch_count} branches."
                    ),
                },
            ],
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json=request_payload,
            )
            response.raise_for_status()

        body = response.json()
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)

        branches = parsed.get("branches", [])
        return ProviderStoryResult(
            title=parsed["title"],
            story=parsed["story"],
            branches=branches[:branch_count],
            provider_name=self.name,
        )

    async def generate_chat_preview(
        self,
        system_prompt: str,
        conversation: Sequence[dict[str, str]],
        character_name: str,
        response_style: str,
    ) -> str:
        if not self.settings.llm_base_url or not self.settings.llm_api_key:
            raise RuntimeError("LLM_BASE_URL and LLM_API_KEY must be configured for openai-compatible mode.")

        preview_messages = [
            {"role": "system", "content": system_prompt},
            *conversation,
            {
                "role": "user",
                "content": (
                    f"Before answering as {character_name}, give a one-sentence safe response plan. "
                    f"Tier style: {response_style}. Mention consent and boundary respect."
                ),
            },
        ]

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json={"model": self.settings.llm_model, "temperature": 0.6, "messages": preview_messages},
            )
            response.raise_for_status()

        body = response.json()
        return body["choices"][0]["message"]["content"]

    async def generate_chat_response(
        self,
        system_prompt: str,
        conversation: Sequence[dict[str, str]],
        character_name: str,
        response_style: str,
    ) -> ProviderChatResult:
        if not self.settings.llm_base_url or not self.settings.llm_api_key:
            raise RuntimeError("LLM_BASE_URL and LLM_API_KEY must be configured for openai-compatible mode.")

        messages = [
            {"role": "system", "content": system_prompt},
            *conversation,
            {
                "role": "user",
                "content": f"Respond as {character_name}. Tier style: {response_style}. Keep the answer aligned with the ongoing scene.",
            },
        ]

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json={"model": self.settings.llm_model, "temperature": 0.85, "messages": messages},
            )
            response.raise_for_status()

        body = response.json()
        return ProviderChatResult(
            content=body["choices"][0]["message"]["content"],
            provider_name=self.name,
        )


def get_story_provider():
    settings = get_settings()
    if settings.llm_provider == "openai-compatible":
        return OpenAICompatibleStoryProvider()
    return MockStoryProvider()
