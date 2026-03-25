import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/chat(.*)", "/onboarding(.*)", "/twins(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/chat/:path*", "/onboarding/:path*", "/twins/:path*", "/admin/:path*"]
};
