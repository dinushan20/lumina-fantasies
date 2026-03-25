import "server-only";

import { auth } from "@/auth";
import type { ProfileResponse } from "@/lib/api";

const API_BASE_URL = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function getInternalSecret() {
  const secret = process.env.INTERNAL_API_SHARED_SECRET;

  if (!secret) {
    throw new Error("INTERNAL_API_SHARED_SECRET is required for authenticated backend requests.");
  }

  return secret;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function fetchBackendAsCurrentUser(path: string, init: RequestInit = {}) {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    throw new Error("Unauthorized");
  }

  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  headers.set("X-Lumina-Internal-Secret", getInternalSecret());
  headers.set("X-Lumina-User-Id", session.user.id);
  headers.set("X-Lumina-User-Email", session.user.email);
  headers.set("X-Lumina-User-Role", session.user.role);
  headers.set("X-Lumina-Age-Verified", String(session.user.ageVerified));

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers
  });
}

export async function getServerProfileOrNull(): Promise<ProfileResponse | null> {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  try {
    const response = await fetchBackendAsCurrentUser("/api/profile/me");

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ProfileResponse;
  } catch {
    return null;
  }
}
