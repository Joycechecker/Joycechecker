import "server-only";

import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

import { buildPlaceholderImageDataUrl, createMockArticle } from "@/lib/mock-data";
import {
  ARTICLE_EXPANSION_SYSTEM_PROMPT,
  ARTICLE_OUTLINE_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  TOPIC_STRATEGY_SYSTEM_PROMPT,
  buildArticleOutlinePrompt,
  buildDraftExpansionPrompt,
  buildLeanTopicStrategyPrompt,
  buildRefinePrompt,
  buildTopicStrategyPrompt,
} from "@/lib/prompts";
import type { BriefInput, DraftStage, GeneratedArticle, HistoryReference, TopicStrategy } from "@/lib/types";
import {
  fetchWechatHistoryReferences,
  parseHistoryUrls,
  parseManualHistoryTitles,
} from "@/lib/wechat-history";

type TextApiStyle = "responses" | "chat";

type PartialSection = {
  heading?: string;
  summary?: string;
  paragraphs?: string[];
  callout?: string;
  imagePrompt?: string;
  imageAlt?: string;
};

type PartialArticle = {
  title?: string;
  subtitle?: string;
  dek?: string;
  introduction?: string;
  coverPrompt?: string;
  coverAlt?: string;
  sections?: PartialSection[];
  conclusion?: string;
  cta?: string;
  hashtags?: string[];
  layoutNotes?: string[];
};

type PartialTopicStrategy = {
  accountSnapshot?: string;
  inferredDirections?: string[];
  suggestedTopics?: string[];
  recommendation?: string;
};

type RuntimeConfig = {
  providerId: string;
  providerLabel: string;
  apiKey?: string;
  baseURL?: string;
  textModel: string;
  imageModel?: string;
  textApiStyle: TextApiStyle;
};

type ImageGenerationResult = {
  imageUrl: string;
  source: "ai" | "mock";
  provider: string;
  model: string;
  notice?: string;
};

type GenerateImageOptions = {
  referenceImageUrl?: string;
  referenceImageName?: string;
};

const HISTORY_REFERENCE_TIMEOUT_MS = Number(
  process.env.HISTORY_REFERENCE_TIMEOUT_MS?.trim() || "4500",
);
const TEXT_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_TEXT_REQUEST_TIMEOUT_MS?.trim() || "18000",
);
const IMAGE_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_IMAGE_REQUEST_TIMEOUT_MS?.trim() || "25000",
);

function getProviderLabel(providerId: string) {
  if (process.env.AI_PROVIDER_NAME?.trim()) {
    return process.env.AI_PROVIDER_NAME.trim();
  }

  if (providerId === "doubao") {
    return "豆包";
  }

  if (providerId === "openai") {
    return "OpenAI";
  }

  if (providerId === "compatible") {
    return "兼容后端";
  }

  return "Mock";
}

function getPublicModelLabel(model: string, providerLabel: string) {
  const trimmed = model.trim();

  if (!trimmed || trimmed.startsWith("mock")) {
    return "本地演示";
  }

  const styleMatch = trimmed.match(/\((chat|responses)\)$/);
  const styleSuffix =
    styleMatch?.[1] === "chat"
      ? "（对话）"
      : styleMatch?.[1] === "responses"
        ? "（响应）"
        : "";
  const normalized = trimmed.replace(/\s*\((chat|responses)\)$/, "");

  if (normalized.startsWith("ep-")) {
    return `${providerLabel} 接入模型${styleSuffix}`;
  }

  return normalized;
}

function getRuntimeConfig(): RuntimeConfig {
  const arkApiKey = process.env.ARK_API_KEY?.trim();
  const arkEndpointId =
    process.env.ARK_ENDPOINT_ID?.trim() ||
    process.env.ARK_TEXT_MODEL?.trim() ||
    process.env.ARK_MODEL_ENDPOINT?.trim();
  const arkBaseURL = process.env.ARK_BASE_URL?.trim();
  const legacyOpenAIKey = process.env.OPENAI_API_KEY?.trim();
  const providerId =
    process.env.AI_PROVIDER?.trim() ||
    (arkApiKey
      ? "doubao"
      : legacyOpenAIKey
        ? "openai"
        : process.env.AI_API_KEY?.trim()
          ? "compatible"
          : "mock");
  const defaultBaseURL =
    providerId === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" : undefined;
  const defaultTextStyle: TextApiStyle = providerId === "doubao" ? "chat" : "responses";
  const apiKey = process.env.AI_API_KEY?.trim() || arkApiKey || legacyOpenAIKey;
  const textModel =
    process.env.AI_TEXT_MODEL?.trim() ||
    arkEndpointId ||
    process.env.OPENAI_TEXT_MODEL?.trim() ||
    "gpt-4.1-mini";
  const explicitImageModel =
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.ARK_IMAGE_MODEL?.trim() ||
    process.env.OPENAI_IMAGE_MODEL?.trim();
  const imageModel = explicitImageModel || (providerId === "openai" ? "gpt-image-1" : undefined);

  return {
    providerId,
    providerLabel: getProviderLabel(providerId),
    apiKey,
    baseURL: process.env.AI_BASE_URL?.trim() || arkBaseURL || defaultBaseURL,
    textModel,
    imageModel,
    textApiStyle:
      (process.env.AI_TEXT_API_STYLE?.trim() as TextApiStyle | undefined) || defaultTextStyle,
  };
}

export function getRuntimeDiagnostics() {
  const config = getRuntimeConfig();

  return {
    providerId: config.providerId,
    providerLabel: config.providerLabel,
    hasApiKey: Boolean(config.apiKey),
    hasBaseURL: Boolean(config.baseURL),
    textApiStyle: config.textApiStyle,
    textModelLabel: getPublicModelLabel(config.textModel, config.providerLabel),
    hasTextModel: Boolean(config.textModel),
    imageModelLabel: config.imageModel
      ? getPublicModelLabel(config.imageModel, config.providerLabel)
      : "未配置",
    hasImageModel: Boolean(config.imageModel),
    hasArkApiKey: Boolean(process.env.ARK_API_KEY?.trim()),
    hasAiApiKey: Boolean(process.env.AI_API_KEY?.trim()),
    hasTencentSearchConfig: Boolean(
      process.env.TENCENTCLOUD_SECRET_ID?.trim() && process.env.TENCENTCLOUD_SECRET_KEY?.trim(),
    ),
  };
}

export async function runModelConnectivityCheck() {
  const config = getRuntimeConfig();
  const client = getClient(config, 12000);

  if (!client) {
    return {
      ok: false,
      provider: config.providerLabel,
      model: getPublicModelLabel(config.textModel, config.providerLabel),
      reason: "未读取到可用的 API Key。",
    };
  }

  try {
    const preferredStyle =
      config.providerId === "doubao" ? "chat" : config.textApiStyle;
    const fallbackStyle: TextApiStyle =
      preferredStyle === "chat" ? "responses" : "chat";
    const styles =
      config.providerId === "doubao"
        ? [preferredStyle, fallbackStyle]
        : [preferredStyle];
    let lastError: unknown;

    for (const style of styles) {
      try {
        const text = await requestArticleTextByStyle(
          client,
          config,
          buildFreshPingBrief(),
          style,
          "你是一个接口连通性自检助手。只回答 ok。",
          "请只输出 ok",
        );

        return {
          ok: text.trim().toLowerCase().includes("ok"),
          provider: config.providerLabel,
          model: getPublicModelLabel(`${config.textModel} (${style})`, config.providerLabel),
          reply: text.trim(),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("模型连通性检查失败。");
  } catch (error) {
    return {
      ok: false,
      provider: config.providerLabel,
      model: getPublicModelLabel(config.textModel, config.providerLabel),
      reason: getErrorMessage(error),
    };
  }
}

function buildFreshPingBrief(): BriefInput {
  return {
    accountMode: "new",
    accountName: "诊断号",
    accountPurpose: "接口连通性检查",
    accountDirection: "诊断",
    directionUpdate: "",
    historyArticleUrls: "",
    historyArticleTitles: "",
    topic: "诊断",
    promotedEntityType: "none",
    brandName: "",
    audience: "诊断",
    editorNotes: "",
    tone: "简洁",
    objective: "诊断",
    keyPoints: "诊断",
    stylePreset: "professional",
    layoutPreset: "clean",
    articleLength: "short",
    includeImages: false,
    autoCoverImage: false,
    imageStyle: "",
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T | Promise<T>) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(async () => {
        resolve(await fallback());
      }, timeoutMs);
    }),
  ]);
}

function getClient(config: RuntimeConfig, timeoutMs = TEXT_REQUEST_TIMEOUT_MS) {
  if (!config.apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: timeoutMs,
  });
}

function extractJsonBlock(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型没有返回可解析的 JSON。");
  }

  return trimmed.slice(start, end + 1);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "发生未知错误。";
}

function isSensitiveImageError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("sensitive information") ||
    message.includes("sensitive") ||
    message.includes("safety") ||
    message.includes("内容可能涉及敏感") ||
    message.includes("敏感信息")
  );
}

function buildSafeImagePrompt(prompt: string, fallbackTitle: string) {
  const condensedPrompt = prompt.replace(/\s+/g, " ").trim().slice(0, 180);

  return [
    `请为公众号文章生成一张概念配图，主题是“${fallbackTitle}”。`,
    "改成更安全的编辑视觉表达：静物、食材、空间、手部局部、抽象构图或生活场景均可。",
    "不要出现具体品牌 logo、包装正面、二维码、证件、医疗诊疗动作、婴幼儿喂养特写、人物正脸或任何可能被判定为敏感信息的元素。",
    "整体干净、明亮、适合公众号头图或章节配图。",
    condensedPrompt ? `原始意图参考：${condensedPrompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildReferenceAwarePrompt(prompt: string, referenceSummary?: string) {
  if (!referenceSummary) {
    return prompt;
  }

  return [
    prompt,
    `参考产品包装必须保持这些识别特征一致：${referenceSummary}`,
    "不要擅自改掉瓶型、主色、标签版式、核心图案和材质观感。",
  ].join(" ");
}

function isLasImageRequest(baseURL?: string) {
  return Boolean(baseURL?.includes("operator.las.cn-beijing.volces.com"));
}

function isOpenAIHostedImageRequest(providerId: string, baseURL?: string) {
  return providerId === "openai" && (!baseURL || baseURL.includes("api.openai.com"));
}

function parseDataUrl(referenceImageUrl: string) {
  const match = referenceImageUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  const [, mimeType, base64Payload] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64Payload, "base64"),
  };
}

async function toReferenceUpload(referenceImageUrl: string, referenceImageName = "reference.png") {
  const parsed = parseDataUrl(referenceImageUrl);

  if (parsed) {
    return new File([parsed.buffer], referenceImageName, { type: parsed.mimeType });
  }

  const response = await fetch(referenceImageUrl);

  if (!response.ok) {
    throw new Error("读取参考图失败。");
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") || "image/png";

  return new File([arrayBuffer], referenceImageName, { type: mimeType });
}

async function describeReferenceImage(
  client: OpenAI | null,
  config: RuntimeConfig,
  referenceImageUrl: string,
): Promise<string | null> {
  if (!client) {
    return null;
  }

  const prompt =
    "请识别这张产品参考图里必须保持一致的包装特征，只输出一段 80 字以内中文。必须包含容器形态、主色、标签布局、材质或图案特征；不要猜测看不清的文案，不要写营销语。";
  const preferredStyle =
    config.providerId === "doubao" ? "chat" : config.textApiStyle;
  const fallbackStyle: TextApiStyle =
    preferredStyle === "chat" ? "responses" : "chat";
  const styles =
    config.providerId === "doubao"
      ? [preferredStyle, fallbackStyle]
      : [preferredStyle];

  for (const style of styles) {
    try {
      if (style === "chat") {
        const response = await client.chat.completions.create({
          model: config.textModel,
          max_tokens: 220,
          messages: [
            {
              role: "system",
              content: "你在为商品视觉生成提炼包装约束。输出只要中文短句，不要 JSON。",
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: referenceImageUrl,
                  },
                },
              ],
            },
          ],
        });

        const text = extractChatText(response.choices[0]?.message?.content).trim();

        if (text) {
          return text.replace(/\s+/g, " ").slice(0, 120);
        }

        continue;
      }

      const response = await client.responses.create({
        model: config.textModel,
        max_output_tokens: 220,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "你在为商品视觉生成提炼包装约束。输出只要中文短句，不要 JSON。" }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              {
                type: "input_image",
                image_url: referenceImageUrl,
                detail: "auto",
              },
            ],
          },
        ],
      });

      const text = response.output_text?.trim();

      if (text) {
        return text.replace(/\s+/g, " ").slice(0, 120);
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseModelJson<T>(raw: string): T {
  const candidate = extractJsonBlock(raw);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return JSON.parse(jsonrepair(candidate)) as T;
  }
}

function buildPalette(stylePreset: BriefInput["stylePreset"]) {
  if (stylePreset === "warm") {
    return {
      primary: "#8a3b12",
      secondary: "#fff6ef",
      accent: "#ff8f3d",
      surface: "#fffef9",
    };
  }

  if (stylePreset === "trend") {
    return {
      primary: "#0d5c63",
      secondary: "#edfbfc",
      accent: "#e85d04",
      surface: "#ffffff",
    };
  }

  return {
    primary: "#0f3d91",
    secondary: "#f4f7ff",
    accent: "#ff7a00",
    surface: "#ffffff",
  };
}

function getExpectedSectionCount(articleLength: BriefInput["articleLength"]) {
  if (articleLength === "short") {
    return 3;
  }

  if (articleLength === "long") {
    return 5;
  }

  return 4;
}

function getMaxOutputTokens(articleLength: BriefInput["articleLength"]) {
  if (articleLength === "short") {
    return 1400;
  }

  if (articleLength === "long") {
    return 2600;
  }

  return 2000;
}

function getOutlineMaxOutputTokens(articleLength: BriefInput["articleLength"]) {
  if (articleLength === "short") {
    return 850;
  }

  if (articleLength === "long") {
    return 1200;
  }

  return 1000;
}

function normalizeTopicStrategy(data: PartialTopicStrategy, brief: BriefInput): TopicStrategy {
  const baseDirections =
    data.inferredDirections?.map((item) => item.trim()).filter(Boolean) ||
    [];
  const baseTopics =
    data.suggestedTopics?.map((item) => item.trim()).filter(Boolean) ||
    [];
  const directionAnchor =
    brief.directionUpdate || brief.accountDirection || brief.accountPurpose || "账号定位";

  const inferredDirections =
    baseDirections.length > 0
      ? baseDirections.slice(0, 5)
      : brief.accountMode === "new"
        ? [
            "围绕账号定位建立稳定栏目",
            "先做高相关问题解答与认知教育",
            "把推广对象和读者场景自然绑定",
          ]
        : brief.directionUpdate
          ? [
              "延续账号既有的核心垂类表达",
              `用桥接型内容试探“${brief.directionUpdate}”`,
              "从读者常见问题切入做系列化内容",
              "把账号已有专业感转化成可执行建议",
            ]
          : [
              "延续账号既有的核心垂类表达",
              "从读者常见问题切入做系列化内容",
              "把账号已有专业感转化成可执行建议",
            ];

  const suggestedTopics =
    baseTopics.length > 0
      ? baseTopics.slice(0, 6)
      : [
          `围绕“${directionAnchor}”先做一篇入门认知稿`,
          `用一个具体场景解释 ${brief.audience || "目标读者"} 最关心的问题`,
          `把 ${brief.brandName || "推广对象"} 的价值讲清楚，但不要硬广`,
          "做一篇系列文章的第一篇，建立栏目感",
        ];

  return {
    accountSnapshot:
      data.accountSnapshot?.trim() ||
      (brief.accountMode === "new"
        ? `这是一个准备围绕“${brief.accountDirection || brief.accountPurpose || "明确定位"}”建立内容心智的新公众号。`
        : brief.directionUpdate
          ? `这是一个原本围绕“${brief.accountDirection || brief.accountName || "既有定位"}”运转的老公众号，本次适合用桥接式内容试探“${brief.directionUpdate}”。`
          : `这是一个适合继续围绕“${brief.accountDirection || brief.accountName || "既有定位"}”做深内容的老公众号。`),
    inferredDirections,
    suggestedTopics,
    recommendation:
      data.recommendation?.trim() ||
      `建议先从“${suggestedTopics[0]}”开始，最容易兼顾账号定位、读者兴趣和后续转化。`,
  };
}

async function resolveHistoryReferences(brief: BriefInput): Promise<{
  promptReferences: HistoryReference[];
  allReferences: HistoryReference[];
}> {
  const manualReferences = parseManualHistoryTitles(brief.historyArticleTitles);
  const urls = parseHistoryUrls(brief.historyArticleUrls);
  const searchTask =
    brief.accountMode === "existing" && brief.accountName.trim()
      ? import("@/lib/tencent-search")
          .then((module) =>
            module.searchWechatHistoryReferences(brief.accountName, brief.accountDirection),
          )
          .catch(() => [] as HistoryReference[])
      : Promise.resolve([] as HistoryReference[]);
  const [searchReferences, fetchedReferences] = await withTimeout(
    Promise.all([
      searchTask,
      urls.length > 0 ? fetchWechatHistoryReferences(urls) : Promise.resolve([]),
    ]),
    HISTORY_REFERENCE_TIMEOUT_MS,
    async () => [[], []] as [HistoryReference[], HistoryReference[]],
  );
  const validSearch = searchReferences.filter((item) => !item.error && item.title.trim());
  const validFetched = fetchedReferences.filter((item) => !item.error && item.title.trim());

  const mergeReferences = (references: HistoryReference[]) => {
    const items = new Map<string, HistoryReference>();

    for (const reference of references) {
      const key =
        reference.url?.trim() ||
        `${reference.accountName || ""}:${reference.title}:${reference.source}`;
      const existing = items.get(key);

      if (!existing) {
        items.set(key, reference);
        continue;
      }

      const existingScore = [
        existing.accountName,
        existing.description,
        existing.site,
        existing.publishedAt,
        existing.score,
      ].filter(Boolean).length - (existing.error ? 4 : 0);
      const nextScore = [
        reference.accountName,
        reference.description,
        reference.site,
        reference.publishedAt,
        reference.score,
      ].filter(Boolean).length - (reference.error ? 4 : 0);

      if (nextScore > existingScore) {
        items.set(key, reference);
      }
    }

    return Array.from(items.values());
  };

  const promptReferences = mergeReferences([
    ...validSearch,
    ...validFetched,
    ...manualReferences,
  ]).slice(0, 8);
  const allReferences = mergeReferences([
    ...searchReferences,
    ...fetchedReferences,
    ...manualReferences,
  ]).slice(0, 12);

  if (promptReferences.length > 0 || allReferences.length > 0) {
    return {
      promptReferences,
      allReferences,
    };
  }

  return {
    promptReferences: manualReferences,
    allReferences: manualReferences,
  };
}

function normalizeArticle(data: PartialArticle, brief: BriefInput, draftStage: DraftStage = "full"): GeneratedArticle {
  const fallback = createMockArticle(brief);
  const palette = buildPalette(brief.stylePreset);
  const expectedSectionCount = getExpectedSectionCount(brief.articleLength);
  const sections = Array.from({ length: expectedSectionCount }, (_, index) => {
    const section = data.sections?.[index];
    const fallbackSection = fallback.sections[index] || fallback.sections[fallback.sections.length - 1];
    const heading = section?.heading?.trim() || fallbackSection?.heading;

    return {
      id: `section-${index + 1}`,
      heading: heading ?? `章节 ${index + 1}`,
      summary: section?.summary?.trim() || fallbackSection?.summary || "",
      paragraphs:
        section?.paragraphs?.map((paragraph) => paragraph.trim()).filter(Boolean) ||
        fallbackSection?.paragraphs ||
        [],
      callout: section?.callout?.trim() || fallbackSection?.callout || "",
      imagePrompt: section?.imagePrompt?.trim() || fallbackSection?.imagePrompt || "",
      imageAlt:
        section?.imageAlt?.trim() || fallbackSection?.imageAlt || `${heading} 配图`,
      imageUrl: undefined,
      imageSource: undefined,
    };
  });

  return {
    mode: "live",
    draftStage,
    title: data.title?.trim() || fallback.title,
    subtitle: data.subtitle?.trim() || fallback.subtitle,
    dek: data.dek?.trim() || fallback.dek,
    introduction: data.introduction?.trim() || fallback.introduction,
    productReferenceImageUrl: undefined,
    productReferenceImageName: undefined,
    coverPrompt: data.coverPrompt?.trim() || fallback.coverPrompt,
    coverAlt: data.coverAlt?.trim() || fallback.coverAlt,
    coverImageUrl: undefined,
    coverImageSource: undefined,
    sections,
    conclusion: data.conclusion?.trim() || fallback.conclusion,
    cta: data.cta?.trim() || fallback.cta,
    hashtags: data.hashtags?.filter(Boolean) || fallback.hashtags,
    palette,
    layoutNotes: data.layoutNotes?.filter(Boolean) || fallback.layoutNotes,
  };
}

function extractChatText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          item.type === "text" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        return "";
      })
      .join("\n");
  }

  return "";
}

async function requestArticleTextByStyle(
  client: OpenAI,
  config: RuntimeConfig,
  brief: BriefInput,
  style: TextApiStyle,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokensOverride?: number,
) {
  const maxOutputTokens = maxOutputTokensOverride ?? getMaxOutputTokens(brief.articleLength);

  if (style === "chat") {
    const response = await client.chat.completions.create({
      model: config.textModel,
      temperature: 0.7,
      max_tokens: maxOutputTokens,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return extractChatText(response.choices[0]?.message?.content).trim();
  }

  const response = await client.responses.create({
    model: config.textModel,
    max_output_tokens: maxOutputTokens,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    });

  return response.output_text?.trim() || "";
}

async function requestStructuredArticle(
  client: OpenAI,
  config: RuntimeConfig,
  brief: BriefInput,
  systemPrompt: string,
  userPrompt: string,
  draftStage: DraftStage = "full",
  maxOutputTokensOverride?: number,
) {
  const preferredStyle =
    config.providerId === "doubao" ? "chat" : config.textApiStyle;
  const fallbackStyle: TextApiStyle =
    preferredStyle === "chat" ? "responses" : "chat";
  const styles =
    config.providerId === "doubao"
      ? [preferredStyle, fallbackStyle]
      : [preferredStyle];
  let lastError: unknown;

  for (const style of styles) {
    try {
      const rawText = await requestArticleTextByStyle(
        client,
        config,
        brief,
        style,
        systemPrompt,
        userPrompt,
        maxOutputTokensOverride,
      );

      if (!rawText) {
        throw new Error("模型没有返回文案内容。");
      }

      const parsed = parseModelJson<PartialArticle>(rawText);
      const article = normalizeArticle(parsed, brief, draftStage);

      return {
        article,
        model: `${config.textModel} (${style})`,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("生成文章失败。");
}

async function requestLeanTopicStrategy(
  client: OpenAI,
  config: RuntimeConfig,
  brief: BriefInput,
) {
  const preferredStyle = config.providerId === "doubao" ? "chat" : config.textApiStyle;
  const fallbackStyle: TextApiStyle = preferredStyle === "chat" ? "responses" : "chat";
  const styles = config.providerId === "doubao" ? [preferredStyle, fallbackStyle] : [preferredStyle];
  let lastError: unknown;

  for (const style of styles) {
    try {
      const rawText = await requestArticleTextByStyle(
        client,
        config,
        { ...brief, articleLength: "short" },
        style,
        TOPIC_STRATEGY_SYSTEM_PROMPT,
        buildLeanTopicStrategyPrompt(brief),
        700,
      );

      if (!rawText) {
        throw new Error("模型没有返回选题策略。");
      }

      const parsed = parseModelJson<PartialTopicStrategy>(rawText);
      const strategy = normalizeTopicStrategy(parsed, brief);
      return {
        strategy: {
          ...strategy,
          inferredDirections: strategy.inferredDirections.slice(0, 3),
          suggestedTopics: strategy.suggestedTopics.slice(0, 3),
        },
        model: `${config.textModel} (${style})`,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("生成选题策略失败。");
}

async function requestStructuredTopicStrategy(
  client: OpenAI,
  config: RuntimeConfig,
  brief: BriefInput,
  historyReferences: HistoryReference[],
) {
  const preferredStyle =
    config.providerId === "doubao" ? "chat" : config.textApiStyle;
  const fallbackStyle: TextApiStyle =
    preferredStyle === "chat" ? "responses" : "chat";
  const styles =
    config.providerId === "doubao"
      ? [preferredStyle, fallbackStyle]
      : [preferredStyle];
  let lastError: unknown;

  for (const style of styles) {
    try {
      const rawText = await requestArticleTextByStyle(
        client,
        config,
        { ...brief, articleLength: "short" },
        style,
        TOPIC_STRATEGY_SYSTEM_PROMPT,
        buildTopicStrategyPrompt(brief, historyReferences),
      );

      if (!rawText) {
        throw new Error("模型没有返回选题策略。");
      }

      const parsed = parseModelJson<PartialTopicStrategy>(rawText);
      const strategy = normalizeTopicStrategy(parsed, brief);

      return {
        strategy,
        model: `${config.textModel} (${style})`,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("生成选题策略失败。");
}

export async function generateArticleOutline(brief: BriefInput) {
  const config = getRuntimeConfig();
  const client = getClient(config);

  if (!client) {
    throw new Error("当前环境没有可用的 AI 配置，请先检查 API Key 和模型。");
  }

  const result = await requestStructuredArticle(
    client,
    config,
    brief,
    ARTICLE_OUTLINE_SYSTEM_PROMPT,
    buildArticleOutlinePrompt(brief),
    "outline",
    getOutlineMaxOutputTokens(brief.articleLength),
  );

  return {
    article: result.article,
    source: "ai" as const,
    provider: config.providerLabel,
    model: getPublicModelLabel(result.model, config.providerLabel),
    stage: "outline" as const,
  };
}

export async function expandArticleDraft(brief: BriefInput, article: GeneratedArticle) {
  const config = getRuntimeConfig();
  const client = getClient(config);

  if (!client) {
    throw new Error("当前环境没有可用的 AI 配置，请先检查 API Key 和模型。");
  }

  const result = await requestStructuredArticle(
    client,
    config,
    brief,
    ARTICLE_EXPANSION_SYSTEM_PROMPT,
    buildDraftExpansionPrompt(brief, article),
    "full",
  );

  return {
    article: result.article,
    source: "ai" as const,
    provider: config.providerLabel,
    model: getPublicModelLabel(result.model, config.providerLabel),
    stage: "full" as const,
  };
}

export async function generateTopicStrategy(brief: BriefInput) {
  const history = await resolveHistoryReferences(brief);
  const config = getRuntimeConfig();
  const client = getClient(config);

  if (!client) {
    throw new Error("当前环境没有可用的 AI 配置，请先检查 API Key 和模型。");
  }

  const result = await requestStructuredTopicStrategy(
    client,
    config,
    brief,
    history.promptReferences,
  );

  return {
    strategy: result.strategy,
    historyReferences: history.allReferences,
    source: "ai" as const,
    provider: config.providerLabel,
    model: getPublicModelLabel(result.model, config.providerLabel),
  };
}

export async function generateLeanTopicStrategy(brief: BriefInput) {
  const config = getRuntimeConfig();
  const client = getClient(config, 12000);

  if (!client) {
    throw new Error("当前环境没有可用的 AI 配置，请先检查 API Key 和模型。");
  }

  const result = await requestLeanTopicStrategy(client, config, brief);

  return {
    strategy: result.strategy,
    historyReferences: [],
    source: "ai" as const,
    provider: config.providerLabel,
    model: getPublicModelLabel(result.model, config.providerLabel),
  };
}

export async function refineArticle(
  brief: BriefInput,
  article: GeneratedArticle,
  instruction: string,
) {
  const config = getRuntimeConfig();
  const client = getClient(config);

  if (!client) {
    throw new Error("当前环境没有可用的 AI 配置，请先检查 API Key 和模型。");
  }

  const result = await requestStructuredArticle(
    client,
    config,
    brief,
    REFINE_SYSTEM_PROMPT,
    buildRefinePrompt(brief, article, instruction),
  );

  return {
    article: result.article,
    source: "ai" as const,
    provider: config.providerLabel,
    model: getPublicModelLabel(result.model, config.providerLabel),
    stage: result.article.draftStage,
  };
}

export async function generateImage(
  prompt: string,
  fallbackTitle: string,
  options: GenerateImageOptions = {},
): Promise<ImageGenerationResult> {
  const config = getRuntimeConfig();
  const client = getClient(config);
  const imageProvider = process.env.AI_IMAGE_PROVIDER?.trim();
  const imageBaseURL =
    process.env.AI_IMAGE_BASE_URL?.trim() ||
    process.env.LAS_BASE_URL?.trim() ||
    config.baseURL;
  const explicitImageModel =
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.ARK_IMAGE_MODEL?.trim() ||
    process.env.OPENAI_IMAGE_MODEL?.trim();
  const imageApiKey =
    process.env.AI_IMAGE_API_KEY?.trim() ||
    process.env.LAS_API_KEY?.trim() ||
    (explicitImageModel || imageProvider
      ? process.env.AI_API_KEY?.trim() ||
        process.env.ARK_API_KEY?.trim() ||
        process.env.OPENAI_API_KEY?.trim()
      : undefined);
  const imageModel =
    explicitImageModel || (config.providerId === "openai" && !imageProvider ? config.imageModel : undefined);
  const imageClient =
    imageApiKey && imageModel
      ? new OpenAI({
          apiKey: imageApiKey,
          baseURL: imageBaseURL,
          timeout: IMAGE_REQUEST_TIMEOUT_MS,
        })
      : client;
  const providerLabel = imageProvider ? getProviderLabel(imageProvider) : config.providerLabel;
  const isArkImageRequest =
    Boolean(process.env.ARK_IMAGE_MODEL?.trim()) ||
    imageBaseURL?.includes("ark.cn-beijing.volces.com");
  const supportsLasReference = isLasImageRequest(imageBaseURL);
  const supportsOpenAIReference = isOpenAIHostedImageRequest(config.providerId, imageBaseURL);
  const supportsNativeReference = !isArkImageRequest && (supportsLasReference || supportsOpenAIReference);
  const referenceSummary = options.referenceImageUrl
    ? await describeReferenceImage(client, config, options.referenceImageUrl)
    : null;
  const promptWithReference = buildReferenceAwarePrompt(prompt, referenceSummary || undefined);
  const prompts = [
    promptWithReference,
    buildSafeImagePrompt(promptWithReference, fallbackTitle),
  ];
  let referenceNotice: string | undefined;

  if (options.referenceImageUrl) {
    if (supportsNativeReference) {
      referenceNotice = "已参考你上传的产品包装图生成。";
    } else if (referenceSummary) {
      referenceNotice =
        "当前图片模型不直接吃参考图，系统先提炼了包装特征再生成；如果包装必须完全一致，建议直接上传原图。";
    } else {
      referenceNotice =
        "当前图片模型不直接吃参考图，这次仍以提示词生图；如果包装必须一致，建议直接上传原图。";
    }
  }

  if (!imageClient || !imageModel) {
    return {
      imageUrl: buildPlaceholderImageDataUrl(fallbackTitle),
      source: "mock" as const,
      provider: "Mock",
      model: "本地演示",
      notice: referenceNotice,
    };
  }
  let lastError: unknown;
  const referenceUpload =
    options.referenceImageUrl && supportsOpenAIReference
      ? await toReferenceUpload(
          options.referenceImageUrl,
          options.referenceImageName || `${fallbackTitle || "reference"}.png`,
        )
      : null;

  for (let index = 0; index < prompts.length; index += 1) {
    const currentPrompt = prompts[index];

    try {
      const result =
        referenceUpload && supportsOpenAIReference
          ? await imageClient.images.edit({
              model: imageModel,
              image: [referenceUpload],
              prompt: currentPrompt,
              size: "1024x1536",
            } as never)
          : await imageClient.images.generate(
              (
                isArkImageRequest
                  ? {
                      model: imageModel,
                      prompt: currentPrompt,
                      size: "2K",
                      response_format: "url",
                    }
                  : supportsLasReference && options.referenceImageUrl
                    ? {
                        model: imageModel,
                        prompt: currentPrompt,
                        size: "2K",
                        response_format: "url",
                        image: options.referenceImageUrl,
                      }
                    : {
                        model: imageModel,
                        prompt: currentPrompt,
                        size: "1024x1536",
                        quality: "high",
                      }
              ) as never,
            );
      const image = result.data?.[0];

      if (!image) {
        throw new Error("图片模型没有返回结果。");
      }

      if ("b64_json" in image && image.b64_json) {
        return {
          imageUrl: `data:image/png;base64,${image.b64_json}`,
          source: "ai",
          provider: providerLabel,
          model: getPublicModelLabel(imageModel, providerLabel),
          notice:
            index === 1
              ? `原始提示词被图片模型拦截，系统已自动改成更安全的概念配图后生成成功。${referenceNotice ? ` ${referenceNotice}` : ""}`.trim()
              : referenceNotice,
        };
      }

      if ("url" in image && image.url) {
        return {
          imageUrl: image.url,
          source: "ai",
          provider: providerLabel,
          model: getPublicModelLabel(imageModel, providerLabel),
          notice:
            index === 1
              ? `原始提示词被图片模型拦截，系统已自动改成更安全的概念配图后生成成功。${referenceNotice ? ` ${referenceNotice}` : ""}`.trim()
              : referenceNotice,
        };
      }

      throw new Error("图片模型没有返回结果。");
    } catch (error) {
      lastError = error;

      if (isSensitiveImageError(error) && index < prompts.length - 1) {
        continue;
      }

      break;
    }
  }

  if (isSensitiveImageError(lastError)) {
    return {
      imageUrl: buildPlaceholderImageDataUrl(fallbackTitle),
      source: "mock",
      provider: "Mock",
      model: "安全兜底",
      notice:
        `图片模型把这次请求判成了敏感内容，已先回退为占位图。建议优先上传原图；如果继续 AI 生图，请把提示词改成更抽象的场景图，避开品牌包装、人物正脸、婴幼儿特写和医疗暗示。${referenceNotice ? ` ${referenceNotice}` : ""}`.trim(),
    };
  }

  throw lastError instanceof Error ? lastError : new Error("生成图片失败。");
}
