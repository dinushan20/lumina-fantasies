import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function POST(_: Request, context: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await context.params;

  try {
    const response = await fetchBackendAsCurrentUser(`/api/creator-invites/${inviteToken}/accept`, {
      method: "POST"
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Creator invite acceptance proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
