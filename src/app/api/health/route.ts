import { NextResponse } from "next/server";

import { isAuthConfigured } from "@/lib/auth";
import { getRuntimeDiagnostics } from "@/lib/openai";

export async function GET() {
  const runtime = getRuntimeDiagnostics();

  return NextResponse.json({
    ok: true,
    service: "wechat-ai-studio",
    timestamp: new Date().toISOString(),
    authConfigured: isAuthConfigured(),
    runtime: {
      providerId: runtime.providerId,
      providerLabel: runtime.providerLabel,
      hasApiKey: runtime.hasApiKey,
      hasTextModel: runtime.hasTextModel,
      hasImageModel: runtime.hasImageModel,
      hasTencentSearchConfig: runtime.hasTencentSearchConfig,
    },
  });
}
