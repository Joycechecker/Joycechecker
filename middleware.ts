import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, readSessionFromToken, sanitizeNextPath } from "@/lib/auth-core";

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await readSessionFromToken(token);

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/studio", request.url));
    }

    return NextResponse.next();
  }

  if (session) {
    return NextResponse.next();
  }

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "请先登录后再使用 AI 功能。" }, { status: 401 });
  }

  const nextPath = sanitizeNextPath(
    `${pathname}${request.nextUrl.search ? request.nextUrl.search : ""}`,
  );
  const loginUrl = new URL("/login", request.url);

  loginUrl.searchParams.set("next", nextPath);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/studio/:path*", "/login", "/api/generate", "/api/image", "/api/refine", "/api/topic-strategy"],
};
