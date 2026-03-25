import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function POST(_: Request, context: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await context.params;

  try {
    const response = await fetchBackendAsCurrentUser(`/api/chat/messages/${messageId}/audio`, {
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
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Chat audio proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
