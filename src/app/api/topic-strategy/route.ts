import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { generateTopicStrategy } from "@/lib/openai";
import type { BriefInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookieHeader(request.headers.get("cookie"));

    if (!session) {
      return NextResponse.json({ error: "请先登录后再分析选题。" }, { status: 401 });
    }

    const brief = (await request.json()) as BriefInput;
    const result = await generateTopicStrategy(brief);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成选题建议时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
