import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { generateImage } from "@/lib/openai";

type ImageRequest = {
  prompt: string;
  title: string;
  referenceImageUrl?: string;
  referenceImageName?: string;
};

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookieHeader(request.headers.get("cookie"));

    if (!session) {
      return NextResponse.json({ error: "请先登录后再生成图片。" }, { status: 401 });
    }

    const body = (await request.json()) as ImageRequest;
    const result = await generateImage(body.prompt, body.title, {
      referenceImageUrl: body.referenceImageUrl,
      referenceImageName: body.referenceImageName,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成图片时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
