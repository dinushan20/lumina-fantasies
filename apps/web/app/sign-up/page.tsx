import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isClerkConfigured } from "@/lib/clerk";

export default async function SignUpPage() {
  const session = await auth();
  const clerkConfigured = isClerkConfigured();

  if (session) {
    redirect("/onboarding");
  }

  const SignUp = clerkConfigured ? (await import("@clerk/nextjs")).SignUp : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      {clerkConfigured && SignUp ? (
        <SignUp
          appearance={{
            elements: {
              rootBox: "w-full max-w-md",
              card: "w-full border border-orange-400/15 bg-card/95 shadow-glow",
              headerTitle: "text-white",
              headerSubtitle: "text-orange-50/72",
              socialButtonsBlockButton: "border-white/10 bg-white/[0.04] text-orange-50",
              formButtonPrimary: "bg-orange-500 text-white hover:bg-orange-400",
              formFieldInput: "border-white/10 bg-white/[0.04] text-orange-50",
              footerActionLink: "text-orange-200 hover:text-orange-100"
            }
          }}
          fallbackRedirectUrl="/onboarding"
          signInUrl="/sign-in"
        />
      ) : (
        <div className="w-full max-w-md rounded-[32px] border border-orange-400/15 bg-card/95 p-6 text-sm leading-7 text-orange-50/78 shadow-glow">
          Clerk is not configured yet. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to enable creator and beta-user signup.
        </div>
      )}
    </main>
  );
}
