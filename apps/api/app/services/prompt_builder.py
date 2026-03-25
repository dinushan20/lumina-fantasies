from __future__ import annotations

from collections.abc import Iterable

from app.schemas.profile import ProfilePreferences
from app.schemas.twin import TwinReferenceData


def dedupe_prompt_items(values: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []

    for value in values:
        if value is None:
            continue
        cleaned = value.strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(cleaned)

    return normalized


def build_profile_preference_tags(profile_preferences: ProfilePreferences) -> list[str]:
    return dedupe_prompt_items(
        [
            *profile_preferences.kinks,
            *profile_preferences.favorite_genres,
            *profile_preferences.tone_preferences,
        ]
    )


def build_profile_boundaries(profile_preferences: ProfilePreferences) -> list[str]:
    return dedupe_prompt_items(
        [
            *profile_preferences.hard_limits,
            profile_preferences.custom_boundaries,
        ]
    )


def build_twin_allowed_kinks(reference_data: TwinReferenceData) -> list[str]:
    return dedupe_prompt_items(reference_data.allowed_kinks)


def build_twin_hard_limits(reference_data: TwinReferenceData) -> list[str]:
    return dedupe_prompt_items(reference_data.hard_limits)


def build_twin_personality_traits(reference_data: TwinReferenceData) -> list[str]:
    return dedupe_prompt_items(reference_data.personality_traits)


def build_twin_prompt_profile(reference_data: TwinReferenceData) -> dict[str, str]:
    allowed_kinks = ", ".join(build_twin_allowed_kinks(reference_data)) or "No creator-approved kinks provided."
    hard_limits = ", ".join(build_twin_hard_limits(reference_data)) or "No twin hard limits provided."
    traits = ", ".join(build_twin_personality_traits(reference_data)) or "No explicit personality traits provided."
    examples = "\n".join(f"- {item}" for item in dedupe_prompt_items(reference_data.example_prompts)) or "- No example prompts provided."

    return {
        "voice_style": reference_data.voice_style or "No voice-style guidance provided.",
        "personality_traits": traits,
        "allowed_kinks": allowed_kinks,
        "hard_limits": hard_limits,
        "example_prompts": examples,
    }
