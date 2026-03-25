import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreatorTwinDashboard } from "@/components/twins/creator-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServerProfileOrNull } from "@/lib/server/backend";

export default async function CreatorDashboardPage() {
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
          <Badge>Creator studio</Badge>
          <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">Consent-attested digital twins</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-orange-50/78">
            Upload creator-approved persona metadata, keep hard limits explicit, and send every twin through admin review before it ever reaches fans.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/creators/onboard">Guided onboarding</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/twins">Browse public twins</Link>
          </Button>
        </div>
      </div>

      <CreatorTwinDashboard initialProfile={profile} />
    </main>
  );
}
