import { NextResponse } from "next/server";

import { getServerSession, isAuthConfigured } from "@/lib/auth";
import { getRuntimeDiagnostics } from "@/lib/openai";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "请先登录后再查看运行诊断。" }, { status: 401 });
  }

  return NextResponse.json({
    authConfigured: isAuthConfigured(),
    hasSession: true,
    sessionUser: session
      ? {
          email: session.email,
          name: session.name,
        }
      : null,
    runtime: getRuntimeDiagnostics(),
  });
}
