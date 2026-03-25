import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PublicTwinsBrowser } from "@/components/twins/public-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServerProfileOrNull } from "@/lib/server/backend";

export default async function PublicTwinsPage() {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    redirect("/onboarding");
  }

  const profile = await getServerProfileOrNull();

  return (
    <main className="page-shell min-h-screen py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge>Digital twins</Badge>
          <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">Browse approved creator companions</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-orange-50/78">
            Every twin here has passed admin review, carries explicit creator consent, and still routes through live moderation before any message is released.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">Open chat</Link>
          </Button>
        </div>
      </div>

      <PublicTwinsBrowser initialProfile={profile} />
    </main>
  );
}
