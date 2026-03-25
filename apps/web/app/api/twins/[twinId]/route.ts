import { NextResponse } from "next/server";

import { fetchBackendAsCurrentUser } from "@/lib/server/backend";

interface RouteContext {
  params: Promise<{
    twinId: string;
  }>;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { twinId } = await context.params;
    const response = await fetchBackendAsCurrentUser(`/api/twins/${twinId}`);
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Twin proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { twinId } = await context.params;
    const body = await request.text();
    const response = await fetchBackendAsCurrentUser(`/api/twins/${twinId}`, {
      method: "PATCH",
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
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Twin update proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { twinId } = await context.params;
    const response = await fetchBackendAsCurrentUser(`/api/twins/${twinId}`, {
      method: "DELETE"
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Twin delete proxy failed.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
