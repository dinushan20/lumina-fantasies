import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ itemId: string }>;
  }
) {
  try {
    const { itemId } = await context.params;
    const response = await fetchBackendAsCurrentUser(`/api/moderation/queue/${itemId}`);
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Moderation item proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
