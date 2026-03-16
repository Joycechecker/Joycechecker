import { NextResponse } from "next/server";

import { getSessionFromCookieHeader } from "@/lib/auth";
import { refineArticle } from "@/lib/openai";
import type { GeneratedArticle, RefineRequest } from "@/lib/types";

function preserveExistingImages(
  nextArticle: GeneratedArticle,
  currentArticle: GeneratedArticle,
) {
  return {
    ...nextArticle,
    coverImageUrl: currentArticle.coverImageUrl,
    coverImageSource: currentArticle.coverImageSource,
    sections: nextArticle.sections.map((section, index) => ({
      ...section,
      imageUrl: currentArticle.sections[index]?.imageUrl,
      imageSource: currentArticle.sections[index]?.imageSource,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookieHeader(request.headers.get("cookie"));

    if (!session) {
      return NextResponse.json({ error: "请先登录后再优化稿件。" }, { status: 401 });
    }

    const body = (await request.json()) as RefineRequest;
    const result = await refineArticle(body.brief, body.article, body.instruction);
    result.article = preserveExistingImages(result.article, body.article);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "优化文章时发生未知错误。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
