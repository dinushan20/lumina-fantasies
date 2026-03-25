import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ChatShell } from "@/components/chat/chat-shell";
import { getServerProfileOrNull } from "@/lib/server/backend";

export default async function ChatPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.ageVerified) {
    redirect("/onboarding");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialTwinId = typeof resolvedSearchParams.twinId === "string" ? resolvedSearchParams.twinId : null;
  const profile = await getServerProfileOrNull();

  return <ChatShell initialProfile={profile} initialTwinId={initialTwinId} />;
}
