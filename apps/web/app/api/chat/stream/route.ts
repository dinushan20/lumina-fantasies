import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetchBackendAsCurrentUser("/api/chat/stream", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json"
      }
    });

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") ?? "text/event-stream");
    headers.set("Cache-Control", response.headers.get("cache-control") ?? "no-cache");
    headers.set("Connection", response.headers.get("connection") ?? "keep-alive");

    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Chat stream proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
