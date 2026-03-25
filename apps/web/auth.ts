import "server-only";

import { createHash } from "crypto";
import { cache } from "react";

import { auth as clerkAuth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerk";

export interface LuminaSession {
  user: {
    id: string;
    clerkUserId: string;
    email: string;
    name: string | null;
    role: "admin" | "user";
    ageVerified: boolean;
  };
}

const adminEmails = new Set(
  (process.env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readMetadataBoolean(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function readMetadataRole(metadata: Record<string, unknown>) {
  const value = metadata.luminaRole ?? metadata.role;
  return value === "admin" ? "admin" : "user";
}

function buildLuminaUserId(clerkUserId: string) {
  const digest = createHash("sha256").update(`lumina:${clerkUserId}`).digest("hex");
  const chars = digest.slice(0, 32).split("");

  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function resolveRole(email: string, metadata: Record<string, unknown>): "admin" | "user" {
  if (readMetadataRole(metadata) === "admin") {
    return "admin";
  }

  return adminEmails.has(email.toLowerCase()) ? "admin" : "user";
}

function buildDisplayName(firstName: string | null, lastName: string | null, username: string | null) {
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return combined || username || null;
}

export const auth = cache(async (): Promise<LuminaSession | null> => {
  if (!isClerkConfigured()) {
    return null;
  }

  const { userId } = await clerkAuth();

  if (!userId) {
    return null;
  }

  const user = await currentUser();
  if (!user) {
    return null;
  }

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  if (!email) {
    return null;
  }

  const metadata = toMetadataRecord(user.publicMetadata);
  const role = resolveRole(email, metadata);
  const ageVerified = readMetadataBoolean(metadata, "luminaAgeVerified", "ageVerified") ?? false;

  return {
    user: {
      id: buildLuminaUserId(user.id),
      clerkUserId: user.id,
      email,
      name: buildDisplayName(user.firstName, user.lastName, user.username),
      role,
      ageVerified
    }
  };
});

export async function setCurrentUserAgeVerified() {
  if (!isClerkConfigured()) {
    throw new Error("Clerk is not configured");
  }

  const { userId } = await clerkAuth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      luminaAgeVerified: true
    }
  });
}
