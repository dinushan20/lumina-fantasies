import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/server/backend";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/beta-access/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: await request.text(),
      cache: "no-store"
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch {
    return NextResponse.json({ detail: "Beta access proxy failed." }, { status: 500 });
  }
}
