function hasRealClerkValue(value: string | undefined) {
  if (!value) {
    return false;
  }

  return !value.includes("replace_me") && !value.includes("replace-me");
}

export function isClerkConfigured() {
  return hasRealClerkValue(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && hasRealClerkValue(process.env.CLERK_SECRET_KEY);
}
