import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { buildFallbackTopicStrategyResult, generateTopicStrategy } from "@/lib/openai";
import type { BriefInput } from "@/lib/types";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const host = request.headers.get("host") || "";
  const preferStableFallback = host.includes("edgeone.cool");

  try {
    const session = await getSessionFromCookieHeader(cookieHeader);

    if (!session) {
      return NextResponse.json({ error: "请先登录后再分析选题。" }, { status: 401 });
    }

    const brief = (await request.json()) as BriefInput;

    if (preferStableFallback) {
      const fallback = await buildFallbackTopicStrategyResult(brief);
      return NextResponse.json(fallback);
    }

    const result = await generateTopicStrategy(brief);

    return NextResponse.json(result);
  } catch (error) {
    if (preferStableFallback) {
      try {
        const brief = (await request.clone().json()) as BriefInput;
        const fallback = await buildFallbackTopicStrategyResult(brief);
        return NextResponse.json(fallback);
      } catch {
        return NextResponse.json(
          {
            strategy: {
              accountSnapshot: "线上环境已切到稳定兜底模式，请先按当前账号定位继续。",
              inferredDirections: ["围绕账号定位建立稳定栏目", "先做高相关问题解答与认知教育"],
              suggestedTopics: ["先做一篇入门认知稿", "从目标人群最常见问题切入", "把品牌价值讲清楚但不要硬广"],
              recommendation: "建议先从一篇入门认知稿开始，先让整条流程跑通。",
            },
            historyReferences: [],
            source: "mock",
            provider: "Mock",
            model: "本地演示",
          },
          { status: 200 },
        );
      }
    }

    const message =
      error instanceof Error ? error.message : "生成选题建议时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
