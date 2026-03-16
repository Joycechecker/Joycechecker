import type {
  ArticleLength,
  BriefInput,
  GeneratedArticle,
  StylePreset,
} from "@/lib/types";

const palettes: Record<StylePreset, GeneratedArticle["palette"]> = {
  professional: {
    primary: "#0f3d91",
    secondary: "#f4f7ff",
    accent: "#ff7a00",
    surface: "#ffffff",
  },
  warm: {
    primary: "#8a3b12",
    secondary: "#fff6ef",
    accent: "#ff8f3d",
    surface: "#fffef9",
  },
  trend: {
    primary: "#0d5c63",
    secondary: "#edfbfc",
    accent: "#e85d04",
    surface: "#ffffff",
  },
};

const lengthMap: Record<ArticleLength, number> = {
  short: 3,
  medium: 4,
  long: 5,
};

function slugify(input: string, index: number) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `section-${index + 1}`;
}

function toPointList(keyPoints: string) {
  return keyPoints
    .split(/\n|,|，|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPromotionLabel(brief: BriefInput) {
  if (brief.promotedEntityType === "service") {
    return brief.brandName || "这项服务";
  }

  if (brief.promotedEntityType === "personal") {
    return brief.brandName || "这个个人 IP";
  }

  if (brief.promotedEntityType === "none") {
    return brief.accountName || "这个公众号";
  }

  return brief.brandName || "这个品牌";
}

function trimForSvg(text: string, max = 18) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function buildPlaceholderImageDataUrl(
  title: string,
  palette = palettes.professional,
) {
  const safeTitle = trimForSvg(title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.primary}" />
          <stop offset="100%" stop-color="${palette.accent}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#bg)" rx="28" />
      <circle cx="1040" cy="120" r="180" fill="rgba(255,255,255,0.12)" />
      <circle cx="180" cy="580" r="240" fill="rgba(255,255,255,0.08)" />
      <text x="92" y="228" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="38" opacity="0.82">AI 配图占位</text>
      <text x="92" y="330" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="74" font-weight="700">${safeTitle}</text>
      <text x="92" y="410" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" opacity="0.88">可接真实图片模型，当前为本地 fallback 预览图</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createMockArticle(brief: BriefInput): GeneratedArticle {
  const points = toPointList(brief.keyPoints);
  const palette = palettes[brief.stylePreset];
  const sectionCount = lengthMap[brief.articleLength];
  const promotionLabel = getPromotionLabel(brief);
  const basePoints =
    points.length > 0
      ? points
      : ["核心卖点", "用户痛点", "解决方案", "行动建议", "转化理由"];

  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const point = basePoints[index % basePoints.length];
    const heading = `${index + 1}. ${point}`;

    return {
      id: slugify(point, index),
      heading,
      summary: `围绕“${point}”展开，把 ${promotionLabel} 与 ${brief.audience} 的真实场景连接起来。`,
      paragraphs: [
        `${brief.topic} 不是简单的信息堆砌，而是要把 ${brief.objective} 说透。围绕 ${point}，先用用户听得懂的语言把问题说明白，再顺势引出 ${promotionLabel} 的解决路径。`,
        `在表达上保持“${brief.tone}”语气，避免空泛口号，用场景、数据感和可执行建议增强说服力。${brief.directionUpdate ? `这次还要顺带验证“${brief.directionUpdate}”这个新方向。` : ""}${brief.editorNotes ? `同时记住这条人工判断：${brief.editorNotes}。` : ""}`,
      ],
      callout: `建议这一段使用公众号重点样式，直接突出“${point} = 为什么现在值得行动”。`,
      imagePrompt: `为公众号文章《${brief.topic}》的章节“${point}”生成一张竖版视觉图，风格为${brief.imageStyle}，主体与 ${brief.audience} 相关，突出 ${promotionLabel} 的专业感与可信度。`,
      imageAlt: `${point} 配图`,
      imageUrl: undefined,
      imageSource: undefined,
    };
  });

  return {
    mode: "mock",
    title: `${promotionLabel} 内容工作台示例：${brief.topic}`,
    subtitle: `给 ${brief.audience} 的一篇可直接排版成公众号的 AI 初稿`,
    dek: `这是一份自动生成的首版公众号成稿示例，已经带上导语、章节结构、强调语和配图提示词。`,
    introduction: `如果你要让一篇公众号文章真正承担转化任务，关键不是“写满”，而是让内容、排版和画面在同一个节奏里推进。以下内容以“${brief.topic}”为主题，结合账号“${brief.accountName || "未命名公众号"}”的定位完成了段落拆解。${brief.directionUpdate ? `这次还会顺带试探“${brief.directionUpdate}”这个新增方向是否成立。` : ""}`,
    productReferenceImageUrl: undefined,
    productReferenceImageName: undefined,
    coverPrompt: `为公众号封面生成一张竖版头图，主题是“${brief.topic}”，推广对象为 ${promotionLabel}，整体风格 ${brief.imageStyle}，突出专业感、品质感和阅读点击欲。`,
    coverAlt: `${brief.topic} 封面图`,
    coverImageUrl: undefined,
    coverImageSource: undefined,
    sections,
    conclusion: `最后一段要把价值回收到 ${brief.objective}。用一句强结论收口，再给出一个轻量行动指令，让读者知道下一步该做什么。`,
    cta: `如果你想把这篇内容直接变成可发布的公众号成稿，现在就继续生成配图并导出 HTML。`,
    hashtags: ["公众号排版", "AI写作", "内容营销", promotionLabel],
    palette,
    layoutNotes: [
      brief.layoutPreset === "magazine"
        ? "封面图尽量做成视觉主图，标题后先放一句短导语。"
        : brief.layoutPreset === "cards"
          ? "每个章节像卡片一样独立，强句要短，便于视觉停顿。"
          : brief.layoutPreset === "report"
            ? "章节标题更像简报小节，摘要和结论要更利落。"
            : brief.layoutPreset === "promo"
              ? "关键利益点尽量前置，CTA 卡片更明显。"
              : "标题后先放一句结论式导语，再进入正文。",
      "每个章节建议使用 1 张配图，图片后保留 12-16px 留白。",
      "重点句使用浅底高亮样式，避免大段加粗。",
    ],
  };
}
