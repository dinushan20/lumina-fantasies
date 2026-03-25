import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreatorOnboardingWizard } from "@/components/twins/creator-onboarding-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServerProfileOrNull } from "@/lib/server/backend";

export default async function CreatorOnboardingPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    redirect("/onboarding");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const inviteToken = typeof resolvedSearchParams.invite === "string" ? resolvedSearchParams.invite : null;
  const profile = await getServerProfileOrNull();

  return (
    <main className="page-shell min-h-screen py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge>Creator onboarding</Badge>
          <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">Guided creator launch</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-orange-50/78">
            Review the platform rules, submit one metadata-only twin, and move safely into the creator review queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard/creators">Creator studio</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>

      <CreatorOnboardingWizard initialProfile={profile} inviteToken={inviteToken} />
    </main>
  );
}
