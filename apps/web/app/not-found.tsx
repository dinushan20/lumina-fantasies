import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <Card className="max-w-2xl border-white/10">
        <CardHeader>
          <CardTitle className="text-4xl text-white">That page slipped out of the scene.</CardTitle>
          <CardDescription>
            The link may be outdated, the page may have moved, or the session may have ended. Nothing sensitive was exposed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
