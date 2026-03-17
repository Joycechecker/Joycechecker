import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth";
import { getRuntimeDiagnostics, runModelConnectivityCheck } from "@/lib/openai";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "请先登录后再查看模型诊断。" }, { status: 401 });
  }

  const runtime = getRuntimeDiagnostics();
  const check = await runModelConnectivityCheck();

  return NextResponse.json({
    hasSession: true,
    sessionUser: {
      email: session.email,
      name: session.name,
    },
    runtime,
    check,
  });
}
