import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  type AuthSession,
  authenticateUser,
  createSessionToken,
  getAuthCookieMaxAge,
  getAuthSetupHint,
  isAuthConfigured,
  readSessionFromToken,
  sanitizeNextPath,
} from "@/lib/auth-core";

export {
  AUTH_COOKIE_NAME,
  type AuthSession,
  authenticateUser,
  createSessionToken,
  getAuthSetupHint,
  isAuthConfigured,
  readSessionFromToken,
  sanitizeNextPath,
};

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  return readSessionFromToken(token);
}

export async function getSessionFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.slice(`${AUTH_COOKIE_NAME}=`.length);

  return readSessionFromToken(token);
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getAuthCookieMaxAge(),
    path: "/",
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });

  return response;
}
