import { NextResponse } from "next/server";

import { setCurrentUserAgeVerified } from "@/auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { age_confirmed?: boolean };

    if (!payload.age_confirmed) {
      return NextResponse.json(
        {
          detail: "Please confirm that you are 18+ before entering Lumina."
        },
        { status: 400 }
      );
    }

    await setCurrentUserAgeVerified();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Could not confirm your age yet.";
    const status = detail === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ detail }, { status });
  }
}
