import Link from "next/link";

import { auth } from "@/auth";
import { PricingCards } from "@/components/pricing/pricing-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServerProfileOrNull } from "@/lib/server/backend";

export default async function PricingPage() {
  const session = await auth();
  const profile = session ? await getServerProfileOrNull() : null;

  return (
    <main className="page-shell min-h-screen py-8 sm:py-12">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge>Pricing</Badge>
          <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">Choose the subscription tier that matches your appetite.</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Stripe Checkout powers subscriptions while your profile keeps boundaries, entitlement gates, and usage history synced.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={session ? "/dashboard" : "/"}>{session ? "Back to dashboard" : "Back to overview"}</Link>
        </Button>
      </div>

      <PricingCards profile={profile} signedIn={Boolean(session)} />
    </main>
  );
}
