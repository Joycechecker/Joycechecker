"use client";

import Link from "next/link";
import { type ChangeEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";

import { createMockArticle } from "@/lib/mock-data";
import type {
  ArticleSection,
  BriefInput,
  GeneratedArticle,
  GenerateResponse,
  HistoryReference,
  LayoutPreset,
  RefineRequest,
  SavedAccountProfile,
  TopicStrategy,
  TopicStrategyResponse,
} from "@/lib/types";
import { renderWechatHtml } from "@/lib/wechat-html";

type WorkspaceStage = "strategy" | "brief" | "draft" | "assets";
const ACCOUNT_LIBRARY_STORAGE_KEY = "wechat-content-os.saved-accounts.v1";
const WORKSPACE_DRAFT_STORAGE_KEY = "wechat-content-os.workspace-draft.v1";

type SourceInfoState = {
  source: string;
  provider: string;
  model: string;
};

type ArticleWorkbenchProps = {
  viewer: {
    name: string;
    email: string;
  };
};

type SavedWorkspaceDraft = {
  brief: BriefInput;
  article: GeneratedArticle;
  refineInstruction: string;
  topicStrategy: TopicStrategy | null;
  historyReferences: HistoryReference[];
  hasGeneratedDraft: boolean;
  isDraftOutdated: boolean;
  activeStage: WorkspaceStage;
  sourceInfo: SourceInfoState;
  selectedAccountId: string | null;
  savedAt: string;
};

const defaultBrief: BriefInput = {
  accountMode: "new",
  accountName: "阿瓦鲁营养研究所",
  accountPurpose: "建立家庭营养专业心智，并持续为新品和咨询转化提供内容支持",
  accountDirection: "家庭营养科普、不同年龄段营养方案、真实生活场景里的选购建议",
  directionUpdate: "",
  historyArticleUrls: "",
  historyArticleTitles: "",
  topic: "春季营养升级指南：如何写一篇既有专业度又能促转化的公众号文章",
  promotedEntityType: "brand",
  brandName: "阿瓦鲁",
  audience: "30-45 岁关注家庭营养与品质生活的妈妈人群",
  editorNotes:
    "这个号虽然会带产品和咨询转化，但不能写得像硬广，优先建立专业可信感；如果 AI 判断过窄，要把场景扩展到家庭日常营养管理。",
  tone: "专业但不生硬，像懂用户的品牌主编在说话",
  objective: "为新品预热，建立专业营养心智，并引导用户咨询或下单",
  keyPoints:
    "A2 更亲和肠胃\n全家不同阶段需要不同营养表达\n图文节奏要让人愿意读完\n结尾 CTA 要自然能转化",
  stylePreset: "professional",
  layoutPreset: "clean",
  articleLength: "medium",
  includeImages: true,
  autoCoverImage: true,
  imageStyle: "轻奢 editorial 摄影感，干净、明亮、有高级感",
};

const defaultRefineInstruction =
  "请基于我当前编辑后的内容做优化：提高准确性，减少空话，语气更像高质量公众号，不要推翻重写。";
const defaultSourceInfo: SourceInfoState = {
  source: "mock",
  provider: "Mock",
  model: "本地演示",
};

const layoutPresetOptions: Array<{
  value: LayoutPreset;
  label: string;
  description: string;
}> = [
  {
    value: "clean",
    label: "简洁长文",
    description: "适合科普、观点、品牌主编稿，结构最稳。",
  },
  {
    value: "magazine",
    label: "杂志图文",
    description: "头图更强，适合视觉型品牌和生活方式内容。",
  },
  {
    value: "cards",
    label: "卡片分段",
    description: "每个章节像独立卡片，适合卖点拆解和清单文。",
  },
  {
    value: "report",
    label: "简报报告",
    description: "更像行业简报或复盘，适合专业信息密度较高的内容。",
  },
  {
    value: "promo",
    label: "转化促销",
    description: "重点利益点更前置，适合活动、上新和引导行动。",
  },
];

function buildFreshBrief(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    ...defaultBrief,
    accountMode: "new",
    accountName: "",
    accountPurpose: "",
    accountDirection: "",
    directionUpdate: "",
    historyArticleUrls: "",
    historyArticleTitles: "",
    topic: "",
    brandName: "",
    audience: "",
    editorNotes: "",
    objective: "",
    keyPoints: "",
    ...overrides,
  };
}

function sanitizeSourceModelLabel(model: string, provider: string) {
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
    return `${provider || "私有"} 接入模型${styleSuffix}`;
  }

  return normalized;
}

function getLayoutPresetLabel(layoutPreset: LayoutPreset) {
  return layoutPresetOptions.find((item) => item.value === layoutPreset)?.label || "简洁长文";
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function paragraphsToText(paragraphs: string[]) {
  return paragraphs.join("\n\n");
}

function textToParagraphs(text: string) {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function textToTags(text: string) {
  return text
    .split(/[\n,，#]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textToPoints(text: string) {
  return text
    .split(/\n+/)
    .map((item) => item.replace(/^[\-\d.、\s]+/, "").trim())
    .filter(Boolean);
}

async function readApiPayload<T>(response: Response) {
  const rawText = await response.text();

  if (!rawText) {
    return {} as T & { error?: string };
  }

  try {
    return JSON.parse(rawText) as T & { error?: string };
  } catch {
    return {
      error:
        rawText.startsWith("Error")
          ? `线上接口暂时异常：${rawText}`
          : "线上接口返回了非标准响应，请稍后重试。",
    } as T & { error?: string };
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("上传图片读取失败"));
    };

    reader.onerror = () => reject(new Error("上传图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function buildArticlePlainText(article: GeneratedArticle) {
  const lines = [
    article.title,
    article.subtitle,
    article.dek,
    "",
    article.introduction,
    "",
    ...article.sections.flatMap((section) => [
      section.heading,
      section.summary,
      ...section.paragraphs,
      section.callout ? `重点：${section.callout}` : "",
      "",
    ]),
    article.conclusion,
    "",
    article.cta,
    "",
    article.hashtags.map((tag) => `#${tag}`).join(" "),
  ];

  return lines
    .map((line) => line.trim())
    .filter((line, index, list) => line.length > 0 || list[index - 1] !== "")
    .join("\n");
}

function preserveUploadedImages(
  nextArticle: GeneratedArticle,
  currentArticle: GeneratedArticle,
): GeneratedArticle {
  return {
    ...nextArticle,
    productReferenceImageUrl:
      currentArticle.productReferenceImageUrl || nextArticle.productReferenceImageUrl,
    productReferenceImageName:
      currentArticle.productReferenceImageName || nextArticle.productReferenceImageName,
    coverImageUrl:
      currentArticle.coverImageSource === "upload"
        ? currentArticle.coverImageUrl
        : nextArticle.coverImageUrl,
    coverImageSource:
      currentArticle.coverImageSource === "upload"
        ? currentArticle.coverImageSource
        : nextArticle.coverImageSource,
    sections: nextArticle.sections.map((section, index) =>
      currentArticle.sections[index]?.imageSource === "upload"
        ? {
            ...section,
            imageUrl: currentArticle.sections[index]?.imageUrl,
            imageSource: "upload" as const,
          }
        : section,
    ),
  };
}

function getImageSourceText(source?: GeneratedArticle["coverImageSource"]) {
  if (source === "upload") {
    return "已使用上传原图";
  }

  if (source === "ai") {
    return "当前使用 AI 图";
  }

  if (source === "mock") {
    return "当前是占位图";
  }

  return "还没有图片";
}

function getPromotionTypeLabel(type: BriefInput["promotedEntityType"]) {
  if (type === "service") {
    return "商业服务";
  }

  if (type === "personal") {
    return "个人 IP";
  }

  if (type === "none") {
    return "暂不推广";
  }

  return "品牌";
}

function getPromotedEntityFieldLabel(type: BriefInput["promotedEntityType"]) {
  if (type === "service") {
    return "服务名称";
  }

  if (type === "personal") {
    return "个人名称 / IP 名称";
  }

  if (type === "none") {
    return "推广对象名称";
  }

  return "品牌名称";
}

function hasValue(value: string) {
  return value.trim().length > 0;
}

function getHistoryReferenceCaption(item: HistoryReference) {
  if (item.error) {
    return `抓取失败：${item.error}`;
  }

  const sourceLabel =
    item.source === "search"
      ? "腾讯搜索候选"
      : item.source === "fetched"
        ? "已抓取原文"
        : "手动补充";

  return [item.accountName, item.publishedAt, sourceLabel].filter(Boolean).join(" · ");
}

function hasWorkspaceContent(
  brief: BriefInput,
  topicStrategy: TopicStrategy | null,
  hasGeneratedDraft: boolean,
) {
  return [
    brief.accountName,
    brief.accountPurpose,
    brief.accountDirection,
    brief.topic,
    brief.audience,
    brief.keyPoints,
    brief.objective,
    brief.historyArticleUrls,
    brief.historyArticleTitles,
  ].some((value) => hasValue(value)) || Boolean(topicStrategy) || hasGeneratedDraft;
}

function isInlineDataUrl(value?: string) {
  return typeof value === "string" && value.startsWith("data:");
}

function stripInlineImagesFromArticle(article: GeneratedArticle) {
  let removedInlineImages = false;

  const nextArticle: GeneratedArticle = {
    ...article,
    productReferenceImageUrl: article.productReferenceImageUrl,
    productReferenceImageName: article.productReferenceImageName,
    coverImageUrl: article.coverImageUrl,
    coverImageSource: article.coverImageSource,
    sections: article.sections.map((section) => ({ ...section })),
  };

  if (isInlineDataUrl(nextArticle.productReferenceImageUrl)) {
    nextArticle.productReferenceImageUrl = undefined;
    nextArticle.productReferenceImageName = undefined;
    removedInlineImages = true;
  }

  if (isInlineDataUrl(nextArticle.coverImageUrl)) {
    nextArticle.coverImageUrl = undefined;
    nextArticle.coverImageSource = undefined;
    removedInlineImages = true;
  }

  nextArticle.sections = nextArticle.sections.map((section) => {
    if (!isInlineDataUrl(section.imageUrl)) {
      return section;
    }

    removedInlineImages = true;

    return {
      ...section,
      imageUrl: undefined,
      imageSource: undefined,
    };
  });

  return {
    article: nextArticle,
    removedInlineImages,
  };
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `account-${Date.now()}`;
}

function sortAccountsByLastUsed(accounts: SavedAccountProfile[]) {
  return [...accounts].sort((left, right) => {
    const leftTime = new Date(left.lastUsedAt).getTime();
    const rightTime = new Date(right.lastUsedAt).getTime();

    return rightTime - leftTime;
  });
}

function readSavedAccounts() {
  if (typeof window === "undefined") {
    return [] as SavedAccountProfile[];
  }

  const raw = window.localStorage.getItem(ACCOUNT_LIBRARY_STORAGE_KEY);

  if (!raw) {
    return [] as SavedAccountProfile[];
  }

  try {
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      return [] as SavedAccountProfile[];
    }

    return sortAccountsByLastUsed(
      data.filter((item): item is SavedAccountProfile => {
        return (
          typeof item?.id === "string" &&
          typeof item?.accountName === "string" &&
          typeof item?.accountPurpose === "string" &&
          typeof item?.accountDirection === "string"
        );
      }),
    );
  } catch {
    return [] as SavedAccountProfile[];
  }
}

function writeSavedAccounts(accounts: SavedAccountProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    ACCOUNT_LIBRARY_STORAGE_KEY,
    JSON.stringify(sortAccountsByLastUsed(accounts)),
  );
}

function readSavedWorkspaceDraft() {
  if (typeof window === "undefined") {
    return null as SavedWorkspaceDraft | null;
  }

  const raw = window.localStorage.getItem(WORKSPACE_DRAFT_STORAGE_KEY);

  if (!raw) {
    return null as SavedWorkspaceDraft | null;
  }

  try {
    const data = JSON.parse(raw) as SavedWorkspaceDraft;

    if (
      typeof data?.brief !== "object" ||
      typeof data?.article !== "object" ||
      typeof data?.activeStage !== "string"
    ) {
      return null as SavedWorkspaceDraft | null;
    }

    return data;
  } catch {
    return null as SavedWorkspaceDraft | null;
  }
}

function clearSavedWorkspaceDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(WORKSPACE_DRAFT_STORAGE_KEY);
}

function writeSavedWorkspaceDraft(draft: SavedWorkspaceDraft) {
  if (typeof window === "undefined") {
    return { removedInlineImages: false };
  }

  try {
    window.localStorage.setItem(WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    return { removedInlineImages: false };
  } catch {
    const sanitized = stripInlineImagesFromArticle(draft.article);
    const fallbackDraft: SavedWorkspaceDraft = {
      ...draft,
      article: sanitized.article,
    };

    try {
      window.localStorage.setItem(WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(fallbackDraft));

      return { removedInlineImages: sanitized.removedInlineImages };
    } catch {
      return { removedInlineImages: false, failed: true as const };
    }
  }
}

function buildBriefFromAccount(
  profile: SavedAccountProfile,
  currentBrief?: BriefInput,
): BriefInput {
  return buildFreshBrief({
    accountMode: "existing",
    accountName: profile.accountName,
    accountPurpose: profile.accountPurpose,
    accountDirection: profile.accountDirection,
    historyArticleUrls: profile.historyArticleUrls,
    historyArticleTitles: profile.historyArticleTitles,
    tone: currentBrief?.tone ?? defaultBrief.tone,
    stylePreset: currentBrief?.stylePreset ?? defaultBrief.stylePreset,
    layoutPreset: currentBrief?.layoutPreset ?? defaultBrief.layoutPreset,
    articleLength: currentBrief?.articleLength ?? defaultBrief.articleLength,
    includeImages: currentBrief?.includeImages ?? defaultBrief.includeImages,
    autoCoverImage: currentBrief?.autoCoverImage ?? defaultBrief.autoCoverImage,
    imageStyle: currentBrief?.imageStyle ?? defaultBrief.imageStyle,
  });
}

function isAccountProfileReady(brief: BriefInput) {
  return (
    hasValue(brief.accountName) &&
    hasValue(brief.accountPurpose) &&
    hasValue(brief.accountDirection)
  );
}

export function ArticleWorkbench({ viewer }: ArticleWorkbenchProps) {
  const [brief, setBrief] = useState<BriefInput>(() => buildFreshBrief());
  const [article, setArticle] = useState<GeneratedArticle>(() =>
    createMockArticle(buildFreshBrief()),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlanningTopics, setIsPlanningTopics] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState(defaultRefineInstruction);
  const [topicStrategy, setTopicStrategy] = useState<TopicStrategy | null>(null);
  const [historyReferences, setHistoryReferences] = useState<HistoryReference[]>([]);
  const [hasGeneratedDraft, setHasGeneratedDraft] = useState(false);
  const [isDraftOutdated, setIsDraftOutdated] = useState(false);
  const [activeStage, setActiveStage] = useState<WorkspaceStage>("strategy");
  const [savedAccounts, setSavedAccounts] = useState<SavedAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const hasHydratedWorkspaceRef = useRef(false);
  const resultPanelRef = useRef<HTMLDivElement>(null);
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<SourceInfoState>(defaultSourceInfo);
  const [error, setError] = useState<string | null>(null);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const accounts = readSavedAccounts();
    const workspaceDraft = readSavedWorkspaceDraft();

    setSavedAccounts(accounts);

    if (workspaceDraft) {
      setBrief(buildFreshBrief(workspaceDraft.brief));
      setArticle(workspaceDraft.article);
      setRefineInstruction(workspaceDraft.refineInstruction);
      setTopicStrategy(workspaceDraft.topicStrategy || null);
      setHistoryReferences(workspaceDraft.historyReferences || []);
      setHasGeneratedDraft(Boolean(workspaceDraft.hasGeneratedDraft));
      setIsDraftOutdated(Boolean(workspaceDraft.isDraftOutdated));
      setActiveStage(workspaceDraft.activeStage || "strategy");
      setSourceInfo(
        workspaceDraft.sourceInfo
          ? {
              ...workspaceDraft.sourceInfo,
              model: sanitizeSourceModelLabel(
                workspaceDraft.sourceInfo.model || defaultSourceInfo.model,
                workspaceDraft.sourceInfo.provider || defaultSourceInfo.provider,
              ),
            }
          : defaultSourceInfo,
      );
      setSelectedAccountId(workspaceDraft.selectedAccountId || null);
      setAccountNotice("已恢复你上次未完成的临时草稿，刷新页面不会再直接从头来过。");
      hasHydratedWorkspaceRef.current = true;
      return;
    }

    if (accounts[0]) {
      setSelectedAccountId(accounts[0].id);
      setBrief((current) => buildBriefFromAccount(accounts[0], current));
      setAccountNotice(`已载入你最近使用的账号“${accounts[0].accountName}”。`);
    }

    hasHydratedWorkspaceRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedWorkspaceRef.current) {
      return;
    }

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      if (!hasWorkspaceContent(brief, topicStrategy, hasGeneratedDraft)) {
        clearSavedWorkspaceDraft();
        return;
      }

      const saveResult = writeSavedWorkspaceDraft({
        brief,
        article,
        refineInstruction,
        topicStrategy,
        historyReferences,
        hasGeneratedDraft,
        isDraftOutdated,
        activeStage,
        sourceInfo,
        selectedAccountId,
        savedAt: new Date().toISOString(),
      });

      if (saveResult.failed) {
        setError("当前草稿暂存失败。请先减少超大的上传图片后再试。");
        return;
      }

      if (saveResult.removedInlineImages) {
        setImageNotice("临时草稿已保存，但你上传的原图太大，刷新后需要重新上传图片。");
      }
    }, 450);

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    activeStage,
    article,
    brief,
    hasGeneratedDraft,
    historyReferences,
    isDraftOutdated,
    refineInstruction,
    selectedAccountId,
    sourceInfo,
    topicStrategy,
  ]);

  const outline = useMemo(
    () => article.sections.map((section) => section.heading),
    [article.sections],
  );
  const keyPointList = useMemo(() => textToPoints(brief.keyPoints), [brief.keyPoints]);
  const estimatedReadMinutes = useMemo(() => {
    const articleTextLength =
      article.title.length +
      article.subtitle.length +
      article.dek.length +
      article.introduction.length +
      article.conclusion.length +
      article.cta.length +
      article.sections.reduce(
        (total, section) =>
          total +
          section.heading.length +
          section.summary.length +
          section.callout.length +
          section.paragraphs.join("").length,
        0,
      );

    return Math.max(3, Math.round(articleTextLength / 420));
  }, [article]);
  const generationChecklist = useMemo(() => {
    const items = [
      {
        label: "公众号名称",
        done: hasValue(brief.accountName),
      },
      {
        label: "账号目标",
        done: hasValue(brief.accountPurpose),
      },
      {
        label: "本次选题",
        done: hasValue(brief.topic),
      },
      {
        label: "目标人群",
        done: hasValue(brief.audience),
      },
      {
        label: "内容要点",
        done: hasValue(brief.keyPoints),
      },
      {
        label: "内容目标",
        done: hasValue(brief.objective),
      },
    ];

    if (brief.accountMode === "new") {
      items.splice(2, 0, {
        label: "内容方向",
        done: hasValue(brief.accountDirection),
      });
    }

    if (brief.promotedEntityType !== "none") {
      items.push({
        label: getPromotedEntityFieldLabel(brief.promotedEntityType),
        done: hasValue(brief.brandName),
      });
    }

    return items;
  }, [
    brief.accountDirection,
    brief.accountMode,
    brief.accountName,
    brief.accountPurpose,
    brief.audience,
    brief.brandName,
    brief.keyPoints,
    brief.objective,
    brief.promotedEntityType,
    brief.topic,
  ]);
  const missingGenerationFields = useMemo(
    () => generationChecklist.filter((item) => !item.done).map((item) => item.label),
    [generationChecklist],
  );
  const readyFieldCount = generationChecklist.length - missingGenerationFields.length;
  const isReadyToGenerate = missingGenerationFields.length === 0;
  const workspaceStages = useMemo(
    () => [
      {
        id: "strategy" as const,
        label: "账号与选题",
        hint: "先认号，再拿方向",
        locked: false,
      },
      {
        id: "brief" as const,
        label: "成稿要求",
        hint: "补充本次内容要求",
        locked: false,
      },
      {
        id: "draft" as const,
        label: "当前稿",
        hint: "生成后再编辑优化",
        locked: !hasGeneratedDraft,
      },
      {
        id: "assets" as const,
        label: "图片处理",
        hint: "封面和章节配图",
        locked: !hasGeneratedDraft,
      },
    ],
    [hasGeneratedDraft],
  );
  const currentStageMeta =
    workspaceStages.find((item) => item.id === activeStage) || workspaceStages[0];
  const currentAccountProfile =
    savedAccounts.find((item) => item.id === selectedAccountId) || null;
  const canSaveAccount = isAccountProfileReady(brief);
  const currentAccountSelectionValue = selectedAccountId
    ? selectedAccountId
    : brief.accountMode === "existing"
      ? "__existing__"
      : "__new__";
  const currentStageIndex = Math.max(
    1,
    workspaceStages.findIndex((item) => item.id === activeStage) + 1,
  );
  const currentModeLabel =
    sourceInfo.source === "mock" ? "Mock 演示" : `${sourceInfo.provider} AI`;

  function syncSavedAccounts(nextAccounts: SavedAccountProfile[]) {
    const sortedAccounts = sortAccountsByLastUsed(nextAccounts);
    setSavedAccounts(sortedAccounts);
    writeSavedAccounts(sortedAccounts);
  }

  function saveAccountProfile(options?: { silent?: boolean }) {
    if (!isAccountProfileReady(brief)) {
      if (!options?.silent) {
        setAccountNotice("先补齐公众号名称、账号目标和稳定内容方向，再保存到你的号库。");
      }
      return null;
    }

    const existingProfile =
      savedAccounts.find((item) => item.id === selectedAccountId) || null;
    const timestamp = new Date().toISOString();
    const nextProfile: SavedAccountProfile = {
      id: existingProfile?.id || createLocalId(),
      accountName: brief.accountName.trim(),
      accountPurpose: brief.accountPurpose.trim(),
      accountDirection: brief.accountDirection.trim(),
      historyArticleUrls: brief.historyArticleUrls.trim(),
      historyArticleTitles: brief.historyArticleTitles.trim(),
      createdAt: existingProfile?.createdAt || timestamp,
      updatedAt: timestamp,
      lastUsedAt: timestamp,
    };

    const nextAccounts = [
      nextProfile,
      ...savedAccounts.filter((item) => item.id !== nextProfile.id),
    ];

    syncSavedAccounts(nextAccounts);
    setSelectedAccountId(nextProfile.id);
    setBrief((current) => ({ ...current, accountMode: "existing" }));

    if (!options?.silent) {
      setAccountNotice(
        existingProfile
          ? `“${nextProfile.accountName}”的账号档案已更新，以后可以直接在号库里选。`
          : `已把“${nextProfile.accountName}”加入你的号库。下次进来直接选这个号即可。`,
      );
    }

    return nextProfile;
  }

  function resetStrategyState() {
    setTopicStrategy(null);
    setHistoryReferences([]);
    setActiveStage("strategy");
  }

  function handleStartNewAccount() {
    const nextBrief = buildFreshBrief({
      tone: brief.tone,
      stylePreset: brief.stylePreset,
      layoutPreset: brief.layoutPreset,
      articleLength: brief.articleLength,
      includeImages: brief.includeImages,
      autoCoverImage: brief.autoCoverImage,
      imageStyle: brief.imageStyle,
    });

    if (hasGeneratedDraft) {
      setIsDraftOutdated(true);
    }

    setSelectedAccountId(null);
    setAccountNotice("正在新建一个公众号档案。这部分只需要建一次，保存后下次直接选。");
    resetStrategyState();
    setBrief(nextBrief);
  }

  function handleStartExistingAccount() {
    const nextBrief = buildFreshBrief({
      accountMode: "existing",
      tone: brief.tone,
      stylePreset: brief.stylePreset,
      layoutPreset: brief.layoutPreset,
      articleLength: brief.articleLength,
      includeImages: brief.includeImages,
      autoCoverImage: brief.autoCoverImage,
      imageStyle: brief.imageStyle,
    });

    if (hasGeneratedDraft) {
      setIsDraftOutdated(true);
    }

    setSelectedAccountId(null);
    setAccountNotice("现在是在录入一个已经运营过的老号。补完账号信息和历史线索后，保存一次，以后也会出现在你的号库里。");
    resetStrategyState();
    setBrief(nextBrief);
  }

  function handleSelectSavedAccount(accountId: string) {
    const profile = savedAccounts.find((item) => item.id === accountId);

    if (!profile) {
      return;
    }

    if (hasGeneratedDraft) {
      setIsDraftOutdated(true);
    }

    const refreshedProfile = {
      ...profile,
      lastUsedAt: new Date().toISOString(),
    };

    syncSavedAccounts([
      refreshedProfile,
      ...savedAccounts.filter((item) => item.id !== refreshedProfile.id),
    ]);
    setSelectedAccountId(refreshedProfile.id);
    setAccountNotice(`已切换到“${profile.accountName}”。这次只要补本次任务，不用重新判断新号还是老号。`);
    resetStrategyState();
    setBrief((current) => buildBriefFromAccount(refreshedProfile, current));
  }

  function handleUseTopic(topic?: string) {
    if (topic) {
      setBrief((current) => ({ ...current, topic }));
    }

    setActiveStage("brief");
  }

  const handleChange = <K extends keyof BriefInput>(key: K, value: BriefInput[K]) => {
    if (key === "accountMode") {
      setTopicStrategy(null);
      setHistoryReferences([]);
      setActiveStage("strategy");
    }

    if (hasGeneratedDraft) {
      setIsDraftOutdated(true);
    }

    setBrief((current) => ({ ...current, [key]: value }));
  };

  const handleArticleChange = <K extends keyof GeneratedArticle>(
    key: K,
    value: GeneratedArticle[K],
  ) => {
    setArticle((current) => ({ ...current, [key]: value }));
  };

  const handleSectionChange = <K extends keyof ArticleSection>(
    sectionId: string,
    key: K,
    value: ArticleSection[K],
  ) => {
    setArticle((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, [key]: value } : section,
      ),
    }));
  };

  function focusResultPanel() {
    requestAnimationFrame(() => {
      resultPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setImageNotice(null);
    setResultNotice(null);

    try {
      const requestBrief =
        article.coverImageSource === "upload"
          ? { ...brief, autoCoverImage: false }
          : brief;
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brief: requestBrief,
          productReferenceImageUrl: article.productReferenceImageUrl,
          productReferenceImageName: article.productReferenceImageName,
        }),
      });

      const payload = await readApiPayload<GenerateResponse>(response);

      if (!response.ok) {
        throw new Error(payload.error || "生成失败");
      }

      startTransition(() => {
        setArticle(preserveUploadedImages(payload.article, article));
        setHasGeneratedDraft(true);
        setIsDraftOutdated(false);
        setActiveStage("draft");
        setSourceInfo({
          source: payload.source,
          provider: payload.provider,
          model: sanitizeSourceModelLabel(payload.model, payload.provider),
        });
      });
      saveAccountProfile({ silent: true });
      setResultNotice("成稿已生成，右侧结果区可以直接预览、复制和导出。");
      focusResultPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  async function handleTopicStrategy() {
    setIsPlanningTopics(true);
    setError(null);

    try {
      const response = await fetch("/api/topic-strategy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(brief),
      });

      const payload = await readApiPayload<TopicStrategyResponse>(response);

      if (!response.ok) {
        throw new Error(payload.error || "生成选题建议失败");
      }

      setTopicStrategy(payload.strategy);
      setHistoryReferences(payload.historyReferences || []);
      setActiveStage("strategy");
      setSourceInfo({
        source: payload.source,
        provider: payload.provider,
        model: sanitizeSourceModelLabel(payload.model, payload.provider),
      });
      saveAccountProfile({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成选题建议失败");
    } finally {
      setIsPlanningTopics(false);
    }
  }

  async function handleRefine() {
    setIsRefining(true);
    setError(null);
    setResultNotice(null);

    try {
      const body: RefineRequest = {
        brief,
        article,
        instruction: refineInstruction,
      };

      const response = await fetch("/api/refine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await readApiPayload<GenerateResponse>(response);

      if (!response.ok) {
        throw new Error(payload.error || "优化失败");
      }

      startTransition(() => {
        setArticle(payload.article);
        setHasGeneratedDraft(true);
        setIsDraftOutdated(false);
        setActiveStage("draft");
        setSourceInfo({
          source: payload.source,
          provider: payload.provider,
          model: sanitizeSourceModelLabel(payload.model, payload.provider),
        });
      });
      setResultNotice("当前稿已更新，右侧结果区已同步最新版本。");
      focusResultPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "优化失败");
    } finally {
      setIsRefining(false);
    }
  }

  async function handleGenerateSectionImage(sectionId: string) {
    const section = article.sections.find((item) => item.id === sectionId);

    if (!section) {
      return;
    }

    if (section.imageSource === "upload") {
      setImageNotice("当前章节已使用你上传的原图。如需 AI 生图，请先移除这张上传图。");
      return;
    }

    setActiveImageId(sectionId);
    setError(null);
    setImageNotice(null);

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: section.imagePrompt,
          title: section.heading,
          referenceImageUrl: article.productReferenceImageUrl,
          referenceImageName: article.productReferenceImageName,
        }),
      });

      const payload = await readApiPayload<{
        imageUrl?: string;
        error?: string;
        source?: string;
        notice?: string;
      }>(response);

      if (!response.ok || !payload.imageUrl) {
        throw new Error(payload.error || "生成图片失败");
      }

      setArticle((current) => ({
        ...current,
        sections: current.sections.map((item) =>
          item.id === sectionId
            ? {
                ...item,
                imageUrl: payload.imageUrl,
                imageSource: payload.source === "ai" ? "ai" : "mock",
              }
            : item,
        ),
      }));
      setImageNotice(
        payload.notice ||
          (payload.source === "mock"
            ? "当前未配置真实图片模型，章节里显示的是占位图。配置图片模型后再点一次就会出真图。"
            : null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成图片失败");
    } finally {
      setActiveImageId(null);
    }
  }

  async function handleGenerateCoverImage() {
    if (article.coverImageSource === "upload") {
      setImageNotice("当前已使用你上传的封面原图。如需 AI 生图，请先移除上传图。");
      return;
    }

    setIsGeneratingCover(true);
    setError(null);
    setImageNotice(null);

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: article.coverPrompt,
          title: article.title,
          referenceImageUrl: article.productReferenceImageUrl,
          referenceImageName: article.productReferenceImageName,
        }),
      });

      const payload = await readApiPayload<{
        imageUrl?: string;
        error?: string;
        source?: string;
        notice?: string;
      }>(response);

      if (!response.ok || !payload.imageUrl) {
        throw new Error(payload.error || "生成封面图失败");
      }

      setArticle((current) => ({
        ...current,
        coverImageUrl: payload.imageUrl,
        coverImageSource: payload.source === "ai" ? "ai" : "mock",
      }));
      setImageNotice(
        payload.notice ||
          (payload.source === "mock"
            ? "当前未配置真实图片模型，封面显示的是占位图。配置图片模型后再点一次就会出真图。"
            : null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成封面图失败");
    } finally {
      setIsGeneratingCover(false);
    }
  }

  async function handleCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setImageNotice(null);

    try {
      const imageUrl = await readFileAsDataUrl(file);
      setArticle((current) => ({
        ...current,
        coverImageUrl: imageUrl,
        coverImageSource: "upload",
      }));
      setImageNotice("已使用你上传的封面图，预览、优化和导出都会优先保留这张图。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传封面图失败");
    } finally {
      event.target.value = "";
    }
  }

  async function handleProductReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setImageNotice(null);

    try {
      const imageUrl = await readFileAsDataUrl(file);
      setArticle((current) => ({
        ...current,
        productReferenceImageUrl: imageUrl,
        productReferenceImageName: file.name,
      }));
      setImageNotice("已添加产品参考图。后续 AI 生成封面和章节图时，会优先参考这张包装图。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传产品参考图失败");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSectionUpload(
    sectionId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setImageNotice(null);

    try {
      const imageUrl = await readFileAsDataUrl(file);
      setArticle((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                imageUrl,
                imageSource: "upload",
              }
            : section,
        ),
      }));
      setImageNotice("已使用你上传的产品图；这张图会优先显示，不会被 AI 自动覆盖。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传章节配图失败");
    } finally {
      event.target.value = "";
    }
  }

  function handleRemoveCoverImage() {
    setArticle((current) => ({
      ...current,
      coverImageUrl: undefined,
      coverImageSource: undefined,
    }));
    setImageNotice("封面图已移除。现在如果再点生成封面图，会走 AI 生图。");
  }

  function handleRemoveProductReference() {
    setArticle((current) => ({
      ...current,
      productReferenceImageUrl: undefined,
      productReferenceImageName: undefined,
    }));
    setImageNotice("产品参考图已移除。之后的 AI 生图会重新只依赖提示词。");
  }

  function handleRemoveSectionImage(sectionId: string) {
    setArticle((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              imageUrl: undefined,
              imageSource: undefined,
            }
          : section,
      ),
    }));
    setImageNotice("章节配图已移除。现在如果再点生成配图，会走 AI 生图。");
  }

  function handleExportHtml() {
    const html = renderWechatHtml(article, brief.layoutPreset);
    downloadFile(
      `${article.title.replaceAll(/\s+/g, "-") || "wechat-article"}.html`,
      html,
      "text/html;charset=utf-8",
    );
  }

  async function handleCopyArticleText() {
    try {
      await navigator.clipboard.writeText(buildArticlePlainText(article));
      setResultNotice("正文已复制到剪贴板。");
      focusResultPanel();
    } catch {
      setError("复制正文失败，请检查浏览器剪贴板权限。");
    }
  }

  async function handleCopyArticleHtml() {
    try {
      await navigator.clipboard.writeText(renderWechatHtml(article, brief.layoutPreset));
      setResultNotice("HTML 源码已复制到剪贴板。");
      focusResultPanel();
    } catch {
      setError("复制 HTML 失败，请检查浏览器剪贴板权限。");
    }
  }

  return (
    <main className="studio-shell studio-shell-app">
      <section className="studio-workbench">
        <aside className="studio-sidebar panel-card">
          <div className="studio-sidebar-brand">
            <div className="studio-sidebar-mark">CC</div>
            <div className="studio-sidebar-brand-copy">
              <p className="eyebrow">WeChat Content OS</p>
              <strong>CCmediaStudio</strong>
            </div>
          </div>

          <div className="studio-sidebar-section">
            <p className="eyebrow">Workspace</p>
            <div className="studio-sidebar-current">
              <span className="studio-sidebar-current-icon">{String(currentStageIndex).padStart(2, "0")}</span>
              <div className="studio-sidebar-current-copy">
                <strong>{currentStageMeta.label}</strong>
                <span>{currentStageMeta.hint}</span>
              </div>
            </div>
          </div>

          <div
            className="studio-sidebar-section studio-sidebar-nav"
            role="tablist"
            aria-label="工作台阶段"
          >
            <p className="eyebrow">Workflow</p>
            {workspaceStages.map((stage, index) => (
              <button
                aria-selected={activeStage === stage.id}
                className={[
                  "studio-sidebar-tab",
                  activeStage === stage.id ? "is-active" : "",
                  stage.locked ? "is-locked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={stage.locked}
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                role="tab"
                type="button"
              >
                <span className="studio-sidebar-tab-index">{index + 1}</span>
                <span className="studio-sidebar-tab-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.locked ? "先生成成稿" : stage.hint}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="studio-sidebar-foot">
            <div className="credits-pill">
              <span>当前模式</span>
              <strong>{currentModeLabel}</strong>
            </div>
            <div className="credits-pill muted-pill">
              <span>我的号库</span>
              <strong>{savedAccounts.length} 个账号</strong>
            </div>
            <div className="studio-sidebar-account">
              <div className="studio-sidebar-avatar">
                {(viewer.name || brief.accountName || "号").slice(0, 1)}
              </div>
              <div className="studio-sidebar-account-copy">
                <strong>{viewer.name}</strong>
                <span>{viewer.email}</span>
              </div>
            </div>
            <div className="studio-sidebar-links">
              <Link className="ghost-button topbar-link" href="/pricing">
                定价
              </Link>
              <button
                className="primary-button topbar-link"
                disabled={isLoggingOut}
                onClick={handleLogout}
                type="button"
              >
                {isLoggingOut ? "退出中..." : "退出登录"}
              </button>
            </div>
          </div>
        </aside>

        <section className="studio-main-column">
          <header className="studio-mainbar panel-card">
            <div className="studio-mainbar-path">
              <span>Projects</span>
              <span>›</span>
              <strong>{brief.accountName || "未命名公众号"}</strong>
            </div>
            <div className="studio-mainbar-actions">
              <div className="studio-status-chip">自动暂存草稿</div>
              <div className="credits-pill">
                <span>当前账号</span>
                <strong>{viewer.name}</strong>
              </div>
              <div className="credits-pill muted-pill">
                <span>本次预计</span>
                <strong>选题 4 / 成稿 20</strong>
              </div>
            </div>
          </header>

          <div className="studio-canvas panel-card">
            <div className="canvas-head">
              <div>
                <p className="panel-kicker">当前步骤</p>
                <h2>
                  {String(currentStageIndex).padStart(2, "0")} {currentStageMeta.label}
                </h2>
                <p className="help-text">{currentStageMeta.hint}</p>
              </div>
              {isReadyToGenerate ? (
                <button
                  className="primary-button"
                  disabled={isGenerating}
                  onClick={handleGenerate}
                  type="button"
                >
                  {isGenerating ? "AI 生成中..." : "一键生成成稿"}
                </button>
              ) : (
                <div className="generation-gate-card">
                  <strong>先补齐初始信息</strong>
                  <span>
                    已完成 {readyFieldCount}/{generationChecklist.length}
                  </span>
                  <p>填完这些字段后，生成按钮会自动出现。</p>
                  <div className="generation-gate-tags">
                    {missingGenerationFields.slice(0, 4).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                    {missingGenerationFields.length > 4 ? (
                      <span>+{missingGenerationFields.length - 4}</span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="canvas-meta-row">
              <span className="canvas-meta-chip">模式：{currentModeLabel}</span>
              <span className="canvas-meta-chip">引擎：{sourceInfo.model}</span>
              <span className="canvas-meta-chip">已写要点：{keyPointList.length || 0} 条</span>
              <span className="canvas-meta-chip">
                推广对象：{getPromotionTypeLabel(brief.promotedEntityType)}
              </span>
              <span className="canvas-meta-chip">图片策略：原图优先，缺图再 AI</span>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

          <div className={activeStage === "strategy" ? "workspace-stage-panel is-active" : "workspace-stage-panel"}>
          <section className="brief-spotlight">
            <div className="brief-spotlight-head">
              <div>
                <p className="panel-kicker">我的号库</p>
                <h3>先选公众号档案，再做这次选题</h3>
              </div>
              <div className="brief-spotlight-meta">
                <span>
                  {selectedAccountId
                    ? "从号库继续"
                    : brief.accountMode === "new"
                      ? "首次新建"
                      : "首次录入老号"}
                </span>
                <span>{selectedAccountId ? "以后直接选这个号" : "当前还没保存到号库"}</span>
              </div>
            </div>

            <div className="account-library-shell">
              <div className="account-library-copy">
                <strong>账号档案是长期信息</strong>
                <p>这部分只需要建一次。建完以后，它会出现在“你做过的号”里，下次直接选；只有这次的选题和新增方向再临时补。</p>
              </div>
              <div className="account-library-actions">
                <label className="field account-library-field">
                  <span>你做过的号</span>
                  <select
                    value={currentAccountSelectionValue}
                    onChange={(event) => {
                      if (event.target.value === "__new__") {
                        handleStartNewAccount();
                        return;
                      }

                      if (event.target.value === "__existing__") {
                        handleStartExistingAccount();
                        return;
                      }

                      handleSelectSavedAccount(event.target.value);
                    }}
                  >
                    <option value="__new__">新建公众号档案</option>
                    <option value="__existing__">录入已有老号</option>
                    {savedAccounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.accountName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="account-library-button-row">
                  <button className="ghost-button" onClick={handleStartNewAccount} type="button">
                    新建公众号
                  </button>
                  <button
                    className="ghost-button"
                    onClick={handleStartExistingAccount}
                    type="button"
                  >
                    录入老号
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!canSaveAccount}
                    onClick={() => saveAccountProfile()}
                    type="button"
                  >
                    {currentAccountProfile ? "更新账号档案" : "保存到号库"}
                  </button>
                </div>
              </div>
            </div>

            {accountNotice ? <p className="notice-text">{accountNotice}</p> : null}

            <div className="field-grid compact-grid">
              <label className="field">
                <span>公众号名称</span>
                <input
                  placeholder="例如：阿瓦鲁营养研究所"
                  value={brief.accountName}
                  onChange={(event) => handleChange("accountName", event.target.value)}
                />
              </label>

              <label className="field">
                <span>{brief.accountMode === "new" ? "这个号的主要目的" : "你认为这个号目前的主要目标"}</span>
                <input
                  placeholder={
                    brief.accountMode === "new"
                      ? "例如：做专业营养心智并带咨询转化"
                      : "例如：持续做母婴营养科普并承接转化"
                  }
                  value={brief.accountPurpose}
                  onChange={(event) => handleChange("accountPurpose", event.target.value)}
                />
              </label>
            </div>

            <label className="field brief-spotlight-field">
              <span>
                {brief.accountMode === "new"
                  ? "这个号长期主要做什么内容方向"
                  : "这个号长期稳定的内容方向是什么"}
              </span>
              <textarea
                placeholder={
                  brief.accountMode === "new"
                    ? "例如：家庭营养科普、儿童成长营养、不同年龄段搭配建议"
                    : "例如：历史上偏母婴营养、家庭饮食、产品知识科普"
                }
                rows={4}
                value={brief.accountDirection}
                onChange={(event) => handleChange("accountDirection", event.target.value)}
              />
            </label>

            <label className="field brief-spotlight-field">
              <span>
                {brief.accountMode === "new"
                  ? "如果首篇想先验证一个更细的小方向，也可以写在这里"
                  : "如果这次想试一个新的规划方向 / 新栏目，也写在这里"}
              </span>
              <textarea
                placeholder={
                  brief.accountMode === "new"
                    ? "例如：先从“春季免疫力”这个切口启动，再慢慢扩成家庭营养体系"
                    : "例如：这个号原来偏母婴营养，这次想试探“全家早餐营养”能不能成为新栏目"
                }
                rows={3}
                value={brief.directionUpdate}
                onChange={(event) => handleChange("directionUpdate", event.target.value)}
              />
            </label>

            {brief.accountMode === "existing" ? (
              <>
                <label className="field brief-spotlight-field">
                  <span>半自动抓取：可直接贴 1 到 5 篇历史文章链接</span>
                  <textarea
                    placeholder={
                      "每行贴 1 篇微信文章链接，例如：\nhttps://mp.weixin.qq.com/s/xxxx\nhttps://mp.weixin.qq.com/s/yyyy"
                    }
                    rows={4}
                    value={brief.historyArticleUrls}
                    onChange={(event) => handleChange("historyArticleUrls", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>如果某些链接抓不到，也可以手动补历史标题</span>
                  <textarea
                    placeholder={"每行 1 个历史标题，例如：\n春季孩子补钙，先别急着买钙片\n家庭营养升级，从早餐这一步开始"}
                    rows={4}
                    value={brief.historyArticleTitles}
                    onChange={(event) =>
                      handleChange("historyArticleTitles", event.target.value)
                    }
                  />
                </label>
              </>
            ) : null}

            <div className="strategy-actions">
              <button
                className="ghost-button"
                disabled={isPlanningTopics}
                onClick={handleTopicStrategy}
                type="button"
              >
                {isPlanningTopics ? "AI 分析中..." : "AI 分析内容方向"}
              </button>
              <p className="help-text">
                {brief.accountMode === "new"
                  ? "新号会基于账号目标、长期方向和本次想验证的小方向给你首轮栏目建议；分析成功后也会自动把这个号加入号库。"
                  : "老号如已配置腾讯联网搜索，会先按公众号名找候选历史文章；你也可以贴链接或手填标题兜底。如果这次想试一个新方向，AI 会优先给桥接式选题，不会直接把号写歪。"}
              </p>
            </div>

            {topicStrategy ? (
              <div className="strategy-board">
                <p className="strategy-summary">{topicStrategy.accountSnapshot}</p>

                <div className="strategy-group">
                  <strong>AI 判断的内容方向</strong>
                  <div className="keypoint-pills">
                    {topicStrategy.inferredDirections.map((direction) => (
                      <span key={direction}>{direction}</span>
                    ))}
                  </div>
                </div>

                <div className="strategy-group">
                  <strong>建议的选题方向</strong>
                  <div className="topic-chip-list">
                    {topicStrategy.suggestedTopics.map((topic) => (
                      <button
                        className="topic-chip"
                        key={topic}
                        onClick={() => handleUseTopic(topic)}
                        type="button"
                      >
                        <span>采用并继续</span>
                        <strong>{topic}</strong>
                      </button>
                    ))}
                  </div>
                </div>

                {historyReferences.length > 0 ? (
                  <div className="strategy-group">
                    <strong>已读取的历史线索</strong>
                    <div className="history-reference-list">
                      {historyReferences.map((item, index) => (
                        <div className="history-reference-card" key={`${item.title}-${index}`}>
                          <p>{item.title}</p>
                          <span>{getHistoryReferenceCaption(item)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="recommendation-text">{topicStrategy.recommendation}</p>

                <div className="strategy-footer-actions">
                  <div className="strategy-footer-copy">
                    <strong>这一步已经有产出</strong>
                    <p>
                      上面这块就是 AI 给你的账号判断和选题建议。你可以直接点某个建议题进入下一步，也可以手动写一个自己的题再继续。
                    </p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => handleUseTopic(brief.topic)}
                    type="button"
                  >
                    {hasValue(brief.topic) ? "带着当前选题进入成稿要求" : "先去补成稿要求"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          </div>

          <div className={activeStage === "brief" ? "workspace-stage-panel is-active" : "workspace-stage-panel"}>
          <div className="stage-context-card">
            <div className="stage-context-copy">
              <p className="panel-kicker">上一步产出</p>
              <h3>这里是在补“这次怎么写”，不是重新做选题</h3>
              <p className="help-text">
                账号判断和选题建议在上一步已经给出；这一页只负责补充本次成稿的人群、要点、目标和风格。
              </p>
            </div>
            <div className="stage-context-tags">
              <span>{brief.accountName || "未命名公众号"}</span>
              <span>{brief.topic || "还没确认本次选题"}</span>
              <span>版式：{getLayoutPresetLabel(brief.layoutPreset)}</span>
              {brief.directionUpdate ? <span>新方向：{brief.directionUpdate}</span> : null}
            </div>
            {topicStrategy ? (
              <p className="stage-context-summary">
                {topicStrategy.accountSnapshot} {topicStrategy.recommendation}
              </p>
            ) : null}
          </div>

          <div className="field-grid">
            <label className="field field-span-full">
              <span>本次选题</span>
              <textarea
                rows={3}
                value={brief.topic}
                onChange={(event) => handleChange("topic", event.target.value)}
              />
            </label>

            <label className="field">
              <span>推广对象</span>
              <select
                value={brief.promotedEntityType}
                onChange={(event) =>
                  handleChange(
                    "promotedEntityType",
                    event.target.value as BriefInput["promotedEntityType"],
                  )
                }
              >
                <option value="brand">品牌</option>
                <option value="service">商业服务</option>
                <option value="personal">个人 IP</option>
                <option value="none">暂不推广</option>
              </select>
            </label>

            <label className="field">
              <span>{getPromotedEntityFieldLabel(brief.promotedEntityType)}</span>
              <input
                disabled={brief.promotedEntityType === "none"}
                placeholder={brief.promotedEntityType === "none" ? "本次内容不带推广对象" : ""}
                value={brief.brandName}
                onChange={(event) => handleChange("brandName", event.target.value)}
              />
            </label>

            <label className="field field-span-full">
              <span>目标人群</span>
              <textarea
                rows={3}
                value={brief.audience}
                onChange={(event) => handleChange("audience", event.target.value)}
              />
            </label>

            <label className="field field-span-full">
              <span>人工意见 / 修正判断</span>
              <textarea
                placeholder={
                  "例如：这个号最近想从母婴营养扩展到全家营养；不要把内容写成纯卖货；第 1 段一定先讲用户真实痛点。"
                }
                rows={4}
                value={brief.editorNotes}
                onChange={(event) => handleChange("editorNotes", event.target.value)}
              />
            </label>

            <section className="brief-spotlight compact-spotlight field-span-full">
              <div className="brief-spotlight-head">
                <div>
                  <p className="panel-kicker">内容要点</p>
                  <h3>这里写你大致想讲的点</h3>
                </div>
                <div className="brief-spotlight-meta">
                  <span>{keyPointList.length || 0} 条要点</span>
                  <span>建议每行 1 条</span>
                </div>
              </div>

              <label className="field brief-spotlight-field">
                <span>例如：用户痛点、产品优势、证据、案例、CTA</span>
                <textarea
                  placeholder={"每行写 1 个要点，例如：\n为什么春季要补营养\nA2 更亲和肠胃\n不同人群怎么选\n结尾怎么自然转化"}
                  rows={6}
                  value={brief.keyPoints}
                  onChange={(event) => handleChange("keyPoints", event.target.value)}
                />
              </label>

              <div className="keypoint-pills">
                {keyPointList.length > 0 ? (
                  keyPointList.map((point) => <span key={point}>{point}</span>)
                ) : (
                  <span>这里填得越具体，AI 出来的文案越接近你真正想讲的结构。</span>
                )}
              </div>
            </section>

            <label className="field field-span-full">
              <span>内容目标</span>
              <textarea
                rows={3}
                value={brief.objective}
                onChange={(event) => handleChange("objective", event.target.value)}
              />
            </label>

            <label className="field field-span-full">
              <span>语气调性</span>
              <textarea
                rows={3}
                value={brief.tone}
                onChange={(event) => handleChange("tone", event.target.value)}
              />
            </label>

            <label className="field">
              <span>风格预设</span>
              <select
                value={brief.stylePreset}
                onChange={(event) =>
                  handleChange("stylePreset", event.target.value as BriefInput["stylePreset"])
                }
              >
                <option value="professional">专业感</option>
                <option value="warm">温暖感</option>
                <option value="trend">趋势感</option>
              </select>
            </label>

            <section className="field field-span-full">
              <span>版式选择</span>
              <div className="layout-preset-grid">
                {layoutPresetOptions.map((option) => (
                  <button
                    className={
                      brief.layoutPreset === option.value
                        ? "layout-preset-card is-active"
                        : "layout-preset-card"
                    }
                    key={option.value}
                    onClick={() => handleChange("layoutPreset", option.value)}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <p>{option.description}</p>
                  </button>
                ))}
              </div>
            </section>

            <label className="field">
              <span>篇幅</span>
              <select
                value={brief.articleLength}
                onChange={(event) =>
                  handleChange("articleLength", event.target.value as BriefInput["articleLength"])
                }
              >
                <option value="short">短文</option>
                <option value="medium">中篇</option>
                <option value="long">长文</option>
              </select>
            </label>

            <label className="field field-span-full">
              <span>图片风格</span>
              <textarea
                rows={3}
                value={brief.imageStyle}
                onChange={(event) => handleChange("imageStyle", event.target.value)}
              />
            </label>
          </div>

          <div className="toggle-row">
            <label className="checkbox">
              <input
                checked={brief.includeImages}
                onChange={(event) => handleChange("includeImages", event.target.checked)}
                type="checkbox"
              />
              <span>生成配图提示词</span>
            </label>

            <label className="checkbox">
              <input
                checked={brief.autoCoverImage}
                onChange={(event) => handleChange("autoCoverImage", event.target.checked)}
                type="checkbox"
              />
              <span>自动出封面图</span>
            </label>
          </div>

          <div className="stage-submit-card">
            <div className="stage-submit-copy">
              <p className="panel-kicker">提交本次成稿要求</p>
              <h3>确认这一页后，直接生成这次成稿</h3>
              <p className="help-text">
                这里提交的是你刚刚填写的本次选题、人群、要点和风格，不用再回到顶部找按钮。
              </p>
            </div>
            {isReadyToGenerate ? (
              <button
                className="primary-button"
                disabled={isGenerating}
                onClick={handleGenerate}
                type="button"
              >
                {isGenerating ? "AI 生成中..." : "提交并生成成稿"}
              </button>
            ) : (
              <div className="generation-gate-card stage-submit-gate">
                <strong>还差这些信息</strong>
                <span>
                  已完成 {readyFieldCount}/{generationChecklist.length}
                </span>
                <p>补齐后，这里会直接变成生成按钮。</p>
                <div className="generation-gate-tags">
                  {missingGenerationFields.slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                  {missingGenerationFields.length > 4 ? (
                    <span>+{missingGenerationFields.length - 4}</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          </div>

          <div className={activeStage === "draft" ? "workspace-stage-panel is-active" : "workspace-stage-panel"}>
          <div className="meta-block">
            <div>
              <p className="panel-kicker">文章结构</p>
              <h3>当前大纲</h3>
            </div>
            {!hasGeneratedDraft ? (
              <div className="draft-empty-state">
                <strong>这里会显示本次真实生成稿的大纲</strong>
                <p>先完成上面的初始信息，再点“一键生成成稿”，这里才会同步成当前稿结构。</p>
              </div>
            ) : (
              <>
                {isDraftOutdated ? (
                  <p className="stale-draft-note">
                    你刚修改了前置 brief，这里仍是上一轮生成稿。重新生成后才会同步。
                  </p>
                ) : null}
                <ul className="outline-list">
                  {outline.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="meta-block">
            <div className="action-row">
              <div>
                <p className="panel-kicker">编辑当前稿</p>
                <h3>手动改，再让 AI 优化</h3>
              </div>
              {hasGeneratedDraft ? (
                <button
                  className="primary-button"
                  disabled={isRefining || isDraftOutdated}
                  onClick={handleRefine}
                  type="button"
                >
                  {isRefining ? "AI 优化中..." : "AI 优化当前稿"}
                </button>
              ) : null}
            </div>
            {!hasGeneratedDraft ? (
              <div className="draft-empty-state">
                <strong>还没有可优化的当前稿</strong>
                <p>这里会在你完成一次真实生成后，展示那一版稿件的可编辑内容。现在不会再显示默认 mock 草稿。</p>
              </div>
            ) : (
              <>
                <p className="help-text">
                  {isDraftOutdated
                    ? "你已经修改了前置 brief，下面这版仍是上一轮生成稿。请先重新生成，再做 AI 优化。"
                    : "先在下面直接改准内容，再写一句优化要求，AI 会基于这版继续修，不会默认推翻重写。"}
                </p>

                <label className="field refine-field">
                  <span>优化要求</span>
                  <textarea
                    rows={3}
                    value={refineInstruction}
                    onChange={(event) => setRefineInstruction(event.target.value)}
                  />
                </label>

                <div className="editor-stack">
              <div className="editor-card">
                <div className="editor-grid">
                  <label className="field">
                    <span>主标题</span>
                    <input
                      value={article.title}
                      onChange={(event) => handleArticleChange("title", event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>副标题</span>
                    <input
                      value={article.subtitle}
                      onChange={(event) => handleArticleChange("subtitle", event.target.value)}
                    />
                  </label>

                  <label className="field editor-span-full">
                    <span>摘要</span>
                    <textarea
                      rows={3}
                      value={article.dek}
                      onChange={(event) => handleArticleChange("dek", event.target.value)}
                    />
                  </label>

                  <label className="field editor-span-full">
                    <span>导语</span>
                    <textarea
                      rows={4}
                      value={article.introduction}
                      onChange={(event) =>
                        handleArticleChange("introduction", event.target.value)
                      }
                    />
                  </label>

                  {brief.includeImages ? (
                    <>
                      <label className="field editor-span-full">
                        <span>封面图提示词</span>
                        <textarea
                          rows={3}
                          value={article.coverPrompt}
                          onChange={(event) =>
                            handleArticleChange("coverPrompt", event.target.value)
                          }
                        />
                      </label>

                      <label className="field editor-span-full">
                        <span>封面图说明</span>
                        <input
                          value={article.coverAlt}
                          onChange={(event) =>
                            handleArticleChange("coverAlt", event.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : null}

                  <label className="field editor-span-full">
                    <span>结尾总结</span>
                    <textarea
                      rows={4}
                      value={article.conclusion}
                      onChange={(event) =>
                        handleArticleChange("conclusion", event.target.value)
                      }
                    />
                  </label>

                  <label className="field editor-span-full">
                    <span>CTA</span>
                    <textarea
                      rows={3}
                      value={article.cta}
                      onChange={(event) => handleArticleChange("cta", event.target.value)}
                    />
                  </label>

                  <label className="field editor-span-full">
                    <span>标签</span>
                    <input
                      value={article.hashtags.join("，")}
                      onChange={(event) =>
                        handleArticleChange("hashtags", textToTags(event.target.value))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="editor-section-list">
                {article.sections.map((section, index) => (
                  <div className="editor-section-card" key={section.id}>
                    <div className="editor-section-head">
                      <strong>章节 {index + 1}</strong>
                      <span>{section.heading}</span>
                    </div>
                    <div className="editor-grid">
                      <label className="field editor-span-full">
                        <span>章节标题</span>
                        <input
                          value={section.heading}
                          onChange={(event) =>
                            handleSectionChange(section.id, "heading", event.target.value)
                          }
                        />
                      </label>

                      <label className="field editor-span-full">
                        <span>章节摘要</span>
                        <textarea
                          rows={3}
                          value={section.summary}
                          onChange={(event) =>
                            handleSectionChange(section.id, "summary", event.target.value)
                          }
                        />
                      </label>

                      <label className="field editor-span-full">
                        <span>正文段落</span>
                        <textarea
                          rows={6}
                          value={paragraphsToText(section.paragraphs)}
                          onChange={(event) =>
                            handleSectionChange(
                              section.id,
                              "paragraphs",
                              textToParagraphs(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label className="field editor-span-full">
                        <span>高亮句</span>
                        <textarea
                          rows={2}
                          value={section.callout}
                          onChange={(event) =>
                            handleSectionChange(section.id, "callout", event.target.value)
                          }
                        />
                      </label>

                      {brief.includeImages ? (
                        <>
                          <label className="field editor-span-full">
                            <span>配图提示词</span>
                            <textarea
                              rows={3}
                              value={section.imagePrompt}
                              onChange={(event) =>
                                handleSectionChange(
                                  section.id,
                                  "imagePrompt",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="field editor-span-full">
                            <span>配图说明</span>
                            <input
                              value={section.imageAlt}
                              onChange={(event) =>
                                handleSectionChange(section.id, "imageAlt", event.target.value)
                              }
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
                </div>
              </>
            )}
          </div>
          </div>

          <div className={activeStage === "assets" ? "workspace-stage-panel is-active" : "workspace-stage-panel"}>
            <div className="meta-block">
              {brief.includeImages ? (
                <div className="cover-asset-panel">
                  <div className="cover-asset-shell reference-asset-shell">
                    <div className="asset-preview-card cover-asset-preview reference-asset-preview">
                      {article.productReferenceImageUrl ? (
                        <figure className="asset-preview-media">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={article.productReferenceImageName || "产品参考图"}
                            src={article.productReferenceImageUrl}
                          />
                        </figure>
                      ) : (
                        <div className="asset-preview-placeholder">
                          <strong>还没上传产品参考图</strong>
                          <p>先给一张真实包装图，AI 生图时会优先参考它的瓶型、主色和标签布局。</p>
                        </div>
                      )}
                    </div>

                    <div className="cover-asset-copy">
                      <div className="asset-card-head">
                        <div>
                          <p className="panel-kicker">产品参考图</p>
                          <h3>先让 AI 认识真实包装，再生成场景图</h3>
                        </div>
                        <span className="asset-status-chip">
                          {article.productReferenceImageUrl ? "已添加参考图" : "未添加"}
                        </span>
                      </div>

                      <p className="help-text">
                        这张图不会直接替换封面或章节图，而是用来约束包装、配色和瓶身细节。支持的模型会直接参考；不支持时，系统也会先提炼包装特征再生图。
                      </p>

                      <div className="asset-copy-stack">
                        <div className="asset-copy-block">
                          <span className="asset-copy-label">适用范围</span>
                          <p>封面图和所有章节 AI 配图都会优先参考这张产品图。</p>
                        </div>
                        <div className="asset-copy-block">
                          <span className="asset-copy-label">什么时候不用它</span>
                          <p>如果你已经有最终成品图，直接上传到对应封面或章节卡片里即可。</p>
                        </div>
                      </div>

                      <div className="asset-actions-row">
                        <label className="ghost-button upload-button">
                          上传参考图
                          <input accept="image/*" onChange={handleProductReferenceUpload} type="file" />
                        </label>
                        {article.productReferenceImageUrl ? (
                          <button
                            className="ghost-button"
                            onClick={handleRemoveProductReference}
                            type="button"
                          >
                            移除参考图
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="cover-asset-shell">
                    <div className="asset-preview-card cover-asset-preview">
                      {article.coverImageUrl ? (
                        <figure className="asset-preview-media">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={article.coverAlt} src={article.coverImageUrl} />
                        </figure>
                      ) : (
                        <div className="asset-preview-placeholder">
                          <strong>封面预览还没生成</strong>
                          <p>{article.coverPrompt}</p>
                        </div>
                      )}
                    </div>

                    <div className="cover-asset-copy">
                      <div className="asset-card-head">
                        <div>
                          <p className="panel-kicker">封面图</p>
                          <h3>先上传产品原图，没有时再用 AI 补位</h3>
                        </div>
                        <span className="asset-status-chip">
                          {getImageSourceText(article.coverImageSource)}
                        </span>
                      </div>

                      <p className="help-text">
                        上传的原图会在预览、导出和后续优化里优先保留，不会被 AI 图覆盖。
                      </p>

                      <div className="asset-copy-stack">
                        <label className="field asset-inline-field asset-copy-block">
                          <span className="asset-copy-label">当前说明</span>
                          <input
                            value={article.coverAlt}
                            onChange={(event) =>
                              handleArticleChange("coverAlt", event.target.value)
                            }
                          />
                        </label>
                        <label className="field asset-inline-field asset-copy-block">
                          <span className="asset-copy-label">生成提示词</span>
                          <textarea
                            rows={4}
                            value={article.coverPrompt}
                            onChange={(event) =>
                              handleArticleChange("coverPrompt", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <p className="asset-inline-hint">
                        这里改完提示词后，直接点“生成封面图”就会按当前内容重新出图。
                      </p>

                      <div className="asset-actions-row">
                        <label className="ghost-button upload-button">
                          上传封面图
                          <input accept="image/*" onChange={handleCoverUpload} type="file" />
                        </label>
                        <button
                          className="ghost-button"
                          disabled={isGeneratingCover || article.coverImageSource === "upload"}
                          onClick={handleGenerateCoverImage}
                          type="button"
                        >
                          {isGeneratingCover ? "生成中..." : "生成封面图"}
                        </button>
                        {article.coverImageUrl ? (
                          <button
                            className="ghost-button"
                            onClick={handleRemoveCoverImage}
                            type="button"
                          >
                            移除图片
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {imageNotice ? <p className="notice-text">{imageNotice}</p> : null}
            </div>

            <div className="meta-block">
              <p className="panel-kicker">AI 配图</p>
              <h3>章节原图优先，缺失再用 AI</h3>
              <div className="section-actions">
                {article.sections.map((section) => (
                  <article className="section-action-card" key={section.id}>
                    <div className="section-action-main">
                      <div className="asset-preview-card section-asset-preview">
                        {section.imageUrl ? (
                          <figure className="asset-preview-media">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt={section.imageAlt} src={section.imageUrl} />
                          </figure>
                        ) : (
                          <div className="asset-preview-placeholder">
                            <strong>还没有这张配图</strong>
                            <p>{section.imageAlt}</p>
                          </div>
                        )}
                      </div>
                      <div className="section-asset-copy">
                        <div className="asset-card-head">
                          <strong>{section.heading}</strong>
                          <span className="asset-status-chip">
                            {getImageSourceText(section.imageSource)}
                          </span>
                        </div>
                        <div className="asset-copy-stack">
                          <label className="field asset-inline-field asset-copy-block">
                            <span className="asset-copy-label">配图说明</span>
                            <input
                              value={section.imageAlt}
                              onChange={(event) =>
                                handleSectionChange(section.id, "imageAlt", event.target.value)
                              }
                            />
                          </label>
                          <label className="field asset-inline-field asset-copy-block">
                            <span className="asset-copy-label">生成提示词</span>
                            <textarea
                              rows={4}
                              value={section.imagePrompt}
                              onChange={(event) =>
                                handleSectionChange(
                                  section.id,
                                  "imagePrompt",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                        <p className="asset-inline-hint">
                          参考图会一起带进去；如果这张图不对，先改这里再点“生成配图”。
                        </p>
                      </div>
                    </div>
                    <div className="asset-actions-row">
                      <label className="ghost-button upload-button">
                        上传原图
                        <input
                          accept="image/*"
                          onChange={(event) => handleSectionUpload(section.id, event)}
                          type="file"
                        />
                      </label>
                      <button
                        className="ghost-button"
                        disabled={
                          activeImageId === section.id || section.imageSource === "upload"
                        }
                        onClick={() => handleGenerateSectionImage(section.id)}
                        type="button"
                      >
                        {activeImageId === section.id ? "生成中..." : "生成配图"}
                      </button>
                      {section.imageUrl ? (
                        <button
                          className="ghost-button"
                          onClick={() => handleRemoveSectionImage(section.id)}
                          type="button"
                        >
                          移除图片
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
          </div>
        </section>

        <div className="preview-panel panel-card" ref={resultPanelRef}>
          <div className="preview-head">
            <div>
              <p className="panel-kicker">结果区</p>
              <h2>公众号预览和输出</h2>
              <p className="help-text">
                右侧固定预览当前成稿，复制正文、复制 HTML、导出 HTML 都围绕这块完成。
              </p>
              {resultNotice ? <p className="notice-text result-notice">{resultNotice}</p> : null}
            </div>
            <div className="result-head-side">
              <div className="status-pill">
                {!hasGeneratedDraft
                  ? "待生成"
                  : sourceInfo.source === "mock"
                    ? "Mock Ready"
                    : `${sourceInfo.provider} Live`}
              </div>
              <div className="preview-mode-pills">
                <span className="is-active">手机</span>
                <span>公众号长文</span>
              </div>
            </div>
          </div>

          <div className="preview-stage">
            <div className="preview-stage-bar">
              <span>MOBILE PREVIEW</span>
              <div className="preview-stage-icons">
                <span className="preview-icon-pill">i</span>
                <span className="preview-icon-pill">文</span>
              </div>
            </div>

            <div className="preview-stage-body">
              <div className="phone-frame">
                <div className="phone-notch" />
                {!hasGeneratedDraft ? (
                  <div className="preview-empty-state">
                    <strong>这里会显示本次真实生成稿的预览</strong>
                    <p>完成上面的初始信息后点“一键生成成稿”，右侧才会出现这次稿件的移动端成品视图。</p>
                  </div>
                ) : (
                  <div className="phone-screen">
                    <div className="wechat-shell-bar">
                      <span>‹ 微信</span>
                      <strong>{article.title.slice(0, 12) || "公众号预览"}</strong>
                      <span>···</span>
                    </div>
                    <article className={`wechat-article layout-${brief.layoutPreset}`}>
                      {isDraftOutdated ? (
                        <div className="stale-preview-banner">当前预览仍是上一轮生成稿</div>
                      ) : null}
                      <p className="article-tag">AI 排版稿</p>
                      <h1>{article.title}</h1>
                      <p className="article-subtitle">{article.subtitle}</p>
                      <div className="wechat-meta-line">
                        <span className="wechat-account-name">
                          {brief.accountName || "公众号"}
                        </span>
                        <span>{estimatedReadMinutes} 分钟阅读</span>
                        <span>{getLayoutPresetLabel(brief.layoutPreset)}</span>
                      </div>
                      <p className="article-dek">{article.dek}</p>

                      {article.coverImageUrl ? (
                        <figure className="article-cover">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={article.coverAlt} src={article.coverImageUrl} />
                        </figure>
                      ) : brief.includeImages ? (
                        <div className="image-placeholder article-cover-placeholder">
                          <strong>还没上传封面图</strong>
                          <p>{article.coverPrompt}</p>
                          <span>上传真实产品图，或用 AI 生成概念封面。</span>
                        </div>
                      ) : null}

                      <p className="article-intro">{article.introduction}</p>

                      {article.sections.map((section) => (
                        <section
                          className={`article-section layout-${brief.layoutPreset}`}
                          key={section.id}
                        >
                          <h2>{section.heading}</h2>
                          <p className="section-summary">{section.summary}</p>

                          {section.imageUrl ? (
                            <figure className="inline-visual">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img alt={section.imageAlt} src={section.imageUrl} />
                              <figcaption>{section.imageAlt}</figcaption>
                            </figure>
                          ) : brief.includeImages ? (
                            <div className="image-placeholder inline-visual">
                              <strong>{section.imageAlt}</strong>
                              <p>{section.imagePrompt}</p>
                              <span>上传真实产品图，或点击上方按钮用 AI 补图。</span>
                            </div>
                          ) : null}

                          {section.paragraphs.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                          ))}

                          <div className={`highlight-box layout-${brief.layoutPreset}`}>
                            {section.callout}
                          </div>
                        </section>
                      ))}

                      <section
                        className={`article-section article-footer layout-${brief.layoutPreset}`}
                      >
                        <p>{article.conclusion}</p>
                        <div className={`cta-box layout-${brief.layoutPreset}`}>{article.cta}</div>
                        <div className="tag-row">
                          {article.hashtags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      </section>
                    </article>
                    <div className="wechat-bottom-bar">
                      <span>♡</span>
                      <span>↗</span>
                      <span>{article.sections.length} 段</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="preview-output-bar">
            <div className="preview-output-copy">
              <strong>输出动作</strong>
              <p>这一步完成后，直接复制正文、复制 HTML 或导出公众号单文件。</p>
            </div>
            {hasGeneratedDraft ? (
              <div className="result-toolbar">
                <button className="ghost-button" onClick={handleCopyArticleText} type="button">
                  复制正文
                </button>
                <button className="ghost-button" onClick={handleCopyArticleHtml} type="button">
                  复制 HTML
                </button>
                <button className="primary-button" onClick={handleExportHtml} type="button">
                  导出 HTML
                </button>
              </div>
            ) : (
              <div className="preview-output-placeholder">生成成稿后这里会出现导出动作</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
