import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ itemId: string }>;
  }
) {
  try {
    const { itemId } = await context.params;
    const body = await request.text();
    const response = await fetchBackendAsCurrentUser(`/api/moderation/queue/${itemId}/review`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json"
      }
    });
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Moderation review proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
