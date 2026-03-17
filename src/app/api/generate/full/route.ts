import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { expandArticleDraft, generateImage } from "@/lib/openai";
import type { ExpandDraftRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookieHeader(request.headers.get("cookie"));

    if (!session) {
      return NextResponse.json({ error: "请先登录后再补全正文。" }, { status: 401 });
    }

    const body = (await request.json()) as ExpandDraftRequest;
    const requestBrief =
      body.article.coverImageSource === "upload"
        ? { ...body.brief, autoCoverImage: false }
        : body.brief;
    const result = await expandArticleDraft(requestBrief, body.article);

    if (requestBrief.includeImages && requestBrief.autoCoverImage) {
      const cover = await generateImage(result.article.coverPrompt, result.article.title, {
        referenceImageUrl: body.productReferenceImageUrl,
        referenceImageName: body.productReferenceImageName,
      });
      result.article.coverImageUrl = cover.imageUrl;
      result.article.coverImageSource = cover.source;
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "补全正文时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
