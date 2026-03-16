import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { generateArticle, generateImage } from "@/lib/openai";
import type { BriefInput } from "@/lib/types";

type GenerateRequest =
  | BriefInput
  | {
      brief: BriefInput;
      productReferenceImageUrl?: string;
      productReferenceImageName?: string;
    };

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookieHeader(request.headers.get("cookie"));

    if (!session) {
      return NextResponse.json({ error: "请先登录后再生成内容。" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateRequest;
    const brief = "brief" in body ? body.brief : body;
    const productReferenceImageUrl =
      "brief" in body ? body.productReferenceImageUrl : undefined;
    const productReferenceImageName =
      "brief" in body ? body.productReferenceImageName : undefined;
    const result = await generateArticle(brief);

    if (brief.includeImages && brief.autoCoverImage) {
      const cover = await generateImage(result.article.coverPrompt, result.article.title, {
        referenceImageUrl: productReferenceImageUrl,
        referenceImageName: productReferenceImageName,
      });
      result.article.coverImageUrl = cover.imageUrl;
      result.article.coverImageSource = cover.source;
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成文章时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
