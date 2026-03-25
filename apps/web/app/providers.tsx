"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { PropsWithChildren } from "react";

export function Providers({ children }: PropsWithChildren) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      dynamic
      appearance={{
        variables: {
          colorBackground: "#130f19",
          colorPrimary: "#f59e0b",
          colorText: "#fff7ed",
          colorTextSecondary: "rgba(255, 247, 237, 0.72)",
          colorInputBackground: "rgba(255, 255, 255, 0.04)",
          colorInputText: "#fff7ed",
          colorDanger: "#fca5a5",
          borderRadius: "1.5rem"
        }
      }}
      publishableKey={publishableKey}
    >
      {children}
    </ClerkProvider>
  );
}
