from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CreateCheckoutRequest(BaseModel):
    tier: Literal["basic", "premium", "vip"]


class CheckoutSessionResponse(BaseModel):
    url: str


class CustomerPortalResponse(BaseModel):
    url: str


class StripeWebhookResponse(BaseModel):
    received: bool

