"use client";

import { SignOutButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function ClerkSignOutButton() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button type="button" variant="outline">
        Sign out
      </Button>
    </SignOutButton>
  );
}
