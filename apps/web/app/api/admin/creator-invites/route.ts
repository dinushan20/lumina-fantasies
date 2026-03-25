import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

async function proxy(request: Request) {
  try {
    const response = await fetchBackendAsCurrentUser("/api/admin/creator-invites", {
      method: request.method,
      body: request.method === "POST" ? await request.text() : undefined
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Creator invite proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}
