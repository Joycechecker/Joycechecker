import type { BriefInput, HistoryReference } from "@/lib/types";
import type { GeneratedArticle } from "@/lib/types";

const articleShapeExample = {
  title: "主标题",
  subtitle: "副标题",
  dek: "一句摘要",
  introduction: "导语，不超过 120 字。",
  coverPrompt: "封面图提示词",
  coverAlt: "封面图说明",
  sections: [
    {
      heading: "章节标题",
      summary: "章节摘要",
      paragraphs: ["段落一", "段落二"],
      callout: "适合高亮强调的一句话",
      imagePrompt: "该章节配图提示词",
      imageAlt: "该章节配图说明",
    },
  ],
  conclusion: "结尾总结",
  cta: "行动号召",
  hashtags: ["标签1", "标签2"],
  layoutNotes: ["排版建议 1", "排版建议 2"],
};

const topicStrategyShapeExample = {
  accountSnapshot: "一句话概括这个公众号目前适合做什么内容",
  inferredDirections: ["内容方向 1", "内容方向 2", "内容方向 3"],
  suggestedTopics: ["建议选题 1", "建议选题 2", "建议选题 3", "建议选题 4"],
  recommendation: "本次最值得先写的方向建议，控制在一两句话内",
};

export const ARTICLE_SYSTEM_PROMPT = `
你是中文公众号主编。
把 brief 转成可直接排版的公众号文章数据。

输出要求：
1. 只输出 JSON，不要 Markdown，不要解释，不要代码块。
2. 所有文案必须使用简体中文。
3. 风格适合公众号阅读：句子顺、信息密度高、能促转化。
4. 每个章节最多 2 段，每段 1 到 2 句。
5. sections 数量要和用户要求长度匹配：short=3，medium=4，long=5。
6. 每个 section 都要有 imagePrompt，方便后续生成配图。
7. 不要输出虚假统计数据；如果 brief 没给数据，就用定性表达。
8. 所有字符串值必须是单行字符串，不得包含裸换行符；需要分段时只能放进数组。

严格按照这个 JSON 结构返回，不得新增字段，也不得缺字段：
${JSON.stringify(articleShapeExample)}
`.trim();

export const TOPIC_STRATEGY_SYSTEM_PROMPT = `
你是中文公众号内容策划。
你的任务是先判断一个公众号适合做哪些内容方向，再给出一组可执行的选题建议。

输出要求：
1. 只输出 JSON，不要 Markdown，不要解释，不要代码块。
2. 所有文案必须使用简体中文。
3. 如果是新号，重点根据账号目标和内容方向给出建议。
4. 如果是老号，要优先依据提供的历史线索做判断；没有线索时才能做合理推断，不要伪造具体历史文章。
5. suggestedTopics 要具体，像能直接拿去写公众号的题目方向。
6. 所有字符串值必须是单行字符串，不得包含裸换行符。

严格按照这个 JSON 结构返回，不得新增字段，也不得缺字段：
${JSON.stringify(topicStrategyShapeExample)}
`.trim();

export const REFINE_SYSTEM_PROMPT = `
你是中文公众号主编兼内容编辑。
你的任务是基于“当前稿件”做二次优化，而不是整篇推翻重写。

输出要求：
1. 只输出 JSON，不要 Markdown，不要解释，不要代码块。
2. 保持字段结构完全一致，不得新增字段，也不得缺字段。
3. 优先保留用户已经手动修改过的表达，只优化不准确、不顺、啰嗦或不够像公众号的部分。
4. 如果用户给了具体修改要求，必须优先遵守。
5. 不能编造数据或事实；没有依据时只做表达优化。
6. 每个章节最多 2 段，每段 1 到 2 句。
7. 所有字符串值必须是单行字符串，不得包含裸换行符；需要分段时只能放进数组。

严格按照这个 JSON 结构返回，不得新增字段，也不得缺字段：
${JSON.stringify(articleShapeExample)}
`.trim();

export function buildArticlePrompt(brief: BriefInput) {
  return `
请根据以下 brief 生成一篇可直接进入公众号排版流程的文章。

公众号阶段：${brief.accountMode === "new" ? "新号" : "老号"}
公众号名称：${brief.accountName}
公众号主要目标：${brief.accountPurpose}
公众号内容方向：${brief.accountDirection}
本次新增规划方向 / 新栏目尝试：${brief.directionUpdate || "未填写"}
主题：${brief.topic}
推广对象类型：${
    brief.promotedEntityType === "brand"
      ? "品牌"
      : brief.promotedEntityType === "service"
        ? "商业服务"
        : brief.promotedEntityType === "personal"
          ? "个人 IP"
          : "无明确推广对象"
  }
推广对象名称：${brief.brandName || "未填写"}
目标受众：${brief.audience}
人工意见 / 修正判断：${brief.editorNotes || "未填写"}
语气与调性：${brief.tone}
内容目标：${brief.objective}
必须覆盖的信息点：
${brief.keyPoints}

风格预设：${brief.stylePreset}
版式偏好：${brief.layoutPreset}
篇幅：${brief.articleLength}
是否需要配图：${brief.includeImages ? "需要" : "不需要"}
配图风格偏好：${brief.imageStyle}

额外要求：
- 标题要像公众号头条，不要学院派标题。
- 导语控制在 90 字内。
- 每个章节都要有一个可高亮的强句。
- CTA 要自然，不要硬广。
- 如果用户提供了“人工意见 / 修正判断”，优先遵守，不要和这些判断冲突。
- 如果用户提供了“本次新增规划方向 / 新栏目尝试”，要在不打散账号原有定位的前提下，把这次试探自然融入文章结构。
- 版式偏好主要影响 layoutNotes、章节节奏和强句安排，不需要在正文里解释版式名称。
- summary 尽量在 36 字内。
- callout 尽量在 28 字内。
- imagePrompt 用一句话说清主体、场景、风格，不要写成长段。
- 如果需要配图，请让 coverPrompt 和各 section 的 imagePrompt 足够具体，能直接拿去出图。
- 所有 JSON 字符串必须单行输出，不要在字符串中换行。
  `.trim();
}

export function buildTopicStrategyPrompt(
  brief: BriefInput,
  historyReferences: HistoryReference[] = [],
) {
  const historyBlock =
    historyReferences.length > 0
      ? historyReferences
          .map((item, index) => {
            const detail = [
              `标题：${item.title}`,
              item.accountName ? `账号：${item.accountName}` : "",
              item.source === "search"
                ? "来源：腾讯联网搜索"
                : item.source === "fetched"
                  ? "来源：手动贴文抓取"
                  : "来源：手动补标题",
              item.publishedAt ? `时间：${item.publishedAt}` : "",
              item.site ? `站点：${item.site}` : "",
              item.description ? `摘要：${item.description}` : "",
            ]
              .filter(Boolean)
              .join(" | ");

            return `${index + 1}. ${detail}`;
          })
          .join("\n")
      : brief.historyArticleTitles.trim() || "未提供";

  return `
请先判断这个公众号目前适合做哪些内容方向，再给出本次值得尝试的选题建议。

公众号阶段：${brief.accountMode === "new" ? "新号" : "老号"}
公众号名称：${brief.accountName || "未填写"}
公众号主要目标：${brief.accountPurpose || "未填写"}
公众号内容方向：${brief.accountDirection || "未填写"}
本次新增规划方向 / 新栏目尝试：${brief.directionUpdate || "未填写"}
推广对象类型：${
    brief.promotedEntityType === "brand"
      ? "品牌"
      : brief.promotedEntityType === "service"
        ? "商业服务"
        : brief.promotedEntityType === "personal"
          ? "个人 IP"
          : "无明确推广对象"
  }
推广对象名称：${brief.brandName || "未填写"}
目标受众：${brief.audience || "未填写"}
人工意见 / 修正判断：${brief.editorNotes || "未填写"}
历史文章线索：
${historyBlock}

要求：
- 如果是新号，优先给出建立账号心智和内容栏目感的选题。
- 如果是老号且提供了历史文章线索，要优先依据这些真实线索判断方向；如果没有线索，再基于账号名和定位做推断。
- 如果这次有新的规划方向或新栏目尝试，要在保留原有账号心智的前提下，给出 1 到 2 个桥接式选题，而不是直接把账号定位整个改掉。
- 如果用户提供了人工判断或纠偏意见，要优先吸收这些意见，再输出方向和选题。
- 建议选题要适合公众号，不要像短视频标题。
- inferredDirections 保持 3 到 5 条。
- suggestedTopics 保持 4 到 6 条。
  `.trim();
}

export function buildRefinePrompt(
  brief: BriefInput,
  article: GeneratedArticle,
  instruction: string,
) {
  return `
请基于下面的 brief 和当前稿件做优化。

优化目标：
${instruction.trim() || "提高准确性、表达清晰度、公众号阅读节奏，并尽量保留原有结构。"}

brief：
${JSON.stringify(brief, null, 2)}

当前稿件：
${JSON.stringify(article, null, 2)}

优化原则：
- 不要推翻重写，优先在当前稿件上修订。
- 如果某段已经准确，就少改。
- 如果内容不准，优先修正表述逻辑和用词。
- 保持公众号风格，减少空话、套话和泛泛而谈。
- 如果用户没有要求，不要大改标题方向和章节结构。
  `.trim();
}
