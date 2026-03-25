"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <Card className="max-w-2xl border-white/10">
        <CardHeader>
          <CardTitle className="text-4xl text-white">Something interrupted the experience.</CardTitle>
          <CardDescription>
            We hid the technical details to keep the beta polished and private. You can retry safely or head back to a stable page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={reset} type="button">
            Try again
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
