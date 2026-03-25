import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function GET() {
  try {
    const response = await fetchBackendAsCurrentUser("/api/chat/sessions");
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Chat sessions proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
