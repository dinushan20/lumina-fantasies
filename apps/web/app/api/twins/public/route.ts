import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function GET() {
  try {
    const response = await fetchBackendAsCurrentUser("/api/twins/public");
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Public twins proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
