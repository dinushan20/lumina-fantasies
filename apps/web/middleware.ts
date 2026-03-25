import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isClerkConfigured } from "@/lib/clerk";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/chat(.*)", "/onboarding(.*)", "/twins(.*)", "/admin(.*)"]);

const clerkMiddlewareHandler = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

const passthroughMiddleware = () => NextResponse.next();

export default isClerkConfigured() ? clerkMiddlewareHandler : passthroughMiddleware;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"]
};
