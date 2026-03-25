import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ requestId: string }>;
  }
) {
  try {
    const { requestId } = await context.params;
    const search = new URL(request.url).search;
    const response = await fetchBackendAsCurrentUser(`/api/story/${requestId}${search}`);
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Story status proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
