import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="page-shell min-h-screen py-8">
      <div className="space-y-6">
        <Skeleton className="h-12 w-56" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-[32px]" />
          <Skeleton className="h-48 w-full rounded-[32px]" />
        </div>
        <Skeleton className="h-[420px] w-full rounded-[32px]" />
      </div>
    </main>
  );
}
