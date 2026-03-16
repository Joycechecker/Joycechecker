import { NextResponse } from "next/server";

import {
  applySessionCookie,
  authenticateUser,
  createSessionToken,
  getAuthSetupHint,
  isAuthConfigured,
} from "@/lib/auth";

type LoginRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: getAuthSetupHint() }, { status: 503 });
  }

  const body = (await request.json()) as LoginRequest;
  const email = body.email?.trim() || "";
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "请输入邮箱和密码。" }, { status: 400 });
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const response = NextResponse.json({
    ok: true,
    user,
  });

  return applySessionCookie(response, token);
}
