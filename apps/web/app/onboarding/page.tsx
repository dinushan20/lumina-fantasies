import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AgeGateCard } from "@/components/auth/age-gate-card";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { getServerProfileOrNull } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    return (
      <main className="page-shell flex min-h-screen items-center py-10 sm:py-16">
        <AgeGateCard />
      </main>
    );
  }

  const profile = await getServerProfileOrNull();

  return (
    <main className="page-shell flex min-h-screen items-center py-10 sm:py-16">
      <PreferencesForm
        initialPreferences={
          profile?.preferences ?? {
            kinks: [],
            hard_limits: [],
            favorite_genres: [],
            custom_boundaries: null,
            tone_preferences: [],
            narration_opt_in: false,
            digital_twin_interest: false
          }
        }
      />
    </main>
  );
}
