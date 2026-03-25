import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Lumina Fantasies",
    template: "%s | Lumina Fantasies"
  },
  description: "Consent-first AI storytelling, streaming companions, ethical digital twins, and premium voice narration.",
  openGraph: {
    title: "Lumina Fantasies",
    description: "Private, ethical AI fantasy companions and creator-approved twins.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumina Fantasies",
    description: "Private, ethical AI fantasy companions and creator-approved twins."
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-body text-foreground antialiased">
        <Providers>
          {children}
          {process.env.NODE_ENV === "development" ? (
            <div className="fixed bottom-3 right-3 z-50 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-orange-100/80 backdrop-blur">
              Lumina Fantasies v0.1-beta
            </div>
          ) : null}
        </Providers>
      </body>
    </html>
  );
}
