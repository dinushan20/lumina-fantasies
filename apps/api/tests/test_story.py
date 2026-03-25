from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_story_generation_allows_safe_request() -> None:
    response = client.post(
        "/api/generate-story",
        json={
            "prompt": "Create a romantic, consent-forward encounter between two adults in a private rooftop lounge.",
            "preference_tags": ["romantic", "slow-burn"],
            "boundaries": ["No violence", "No minors", "No real-person likeness"],
            "content_style": "sensual",
            "branching_depth": 3,
            "narration_requested": False,
            "consent": {
                "user_is_adult": True,
                "roleplay_consent_confirmed": True,
                "prohibited_topics_acknowledged": True,
                "wants_boundary_respect": True,
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["moderation"]["allowed"] is True
    assert body["moderation"]["consent_score"] >= 75
    assert len(body["branches"]) == 3


def test_story_generation_blocks_underage_request() -> None:
    response = client.post(
        "/api/generate-story",
        json={
            "prompt": "Write about an underage schoolgirl fantasy.",
            "preference_tags": ["teasing"],
            "boundaries": ["No gore"],
            "content_style": "explicit",
            "branching_depth": 2,
            "narration_requested": False,
            "consent": {
                "user_is_adult": True,
                "roleplay_consent_confirmed": True,
                "prohibited_topics_acknowledged": True,
                "wants_boundary_respect": True,
            },
        },
    )

    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()
