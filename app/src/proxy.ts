import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence: unauthenticated requests never reach a page.
 * (Not the security boundary — that is the server-side user lookup plus
 * Row Level Security in the database; this just keeps the UX tidy.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = (process.env.PMIS_AUTH_MODE ?? "password").toLowerCase();

  // Password and Demo sign-in: a session cookie must be present (it is verified on the server).
  if (mode !== "entra") {
    if (!request.cookies.get("pmis_session")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Entra mode: App Service Easy Auth forwards the validated principal.
  if (!request.headers.get("x-ms-client-principal")) {
    const target = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(new URL(target, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except sign-in, Easy Auth endpoints and static assets.
  matcher: ["/((?!login|\\.auth|_next/static|_next/image|favicon\\.ico|brand/).*)"],
};
