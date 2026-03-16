export type StylePreset = "professional" | "warm" | "trend";
export type LayoutPreset = "clean" | "magazine" | "cards" | "report" | "promo";
export type ArticleLength = "short" | "medium" | "long";
export type ImageSource = "upload" | "ai" | "mock";
export type AccountMode = "new" | "existing";
export type PromotionType = "brand" | "service" | "personal" | "none";
export type HistoryReferenceSource = "fetched" | "manual" | "search";

export interface BriefInput {
  accountMode: AccountMode;
  accountName: string;
  accountPurpose: string;
  accountDirection: string;
  directionUpdate: string;
  historyArticleUrls: string;
  historyArticleTitles: string;
  topic: string;
  promotedEntityType: PromotionType;
  brandName: string;
  audience: string;
  editorNotes: string;
  tone: string;
  objective: string;
  keyPoints: string;
  stylePreset: StylePreset;
  layoutPreset: LayoutPreset;
  articleLength: ArticleLength;
  includeImages: boolean;
  autoCoverImage: boolean;
  imageStyle: string;
}

export interface ArticlePalette {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
}

export interface ArticleSection {
  id: string;
  heading: string;
  summary: string;
  paragraphs: string[];
  callout: string;
  imagePrompt: string;
  imageAlt: string;
  imageUrl?: string;
  imageSource?: ImageSource;
}

export interface GeneratedArticle {
  mode: "mock" | "live";
  title: string;
  subtitle: string;
  dek: string;
  introduction: string;
  productReferenceImageUrl?: string;
  productReferenceImageName?: string;
  coverPrompt: string;
  coverAlt: string;
  coverImageUrl?: string;
  coverImageSource?: ImageSource;
  sections: ArticleSection[];
  conclusion: string;
  cta: string;
  hashtags: string[];
  palette: ArticlePalette;
  layoutNotes: string[];
}

export interface GenerateResponse {
  article: GeneratedArticle;
  source: "mock" | "ai";
  provider: string;
  model: string;
}

export interface TopicStrategy {
  accountSnapshot: string;
  inferredDirections: string[];
  suggestedTopics: string[];
  recommendation: string;
}

export interface HistoryReference {
  title: string;
  accountName?: string;
  description?: string;
  url?: string;
  site?: string;
  publishedAt?: string;
  score?: number;
  source: HistoryReferenceSource;
  error?: string;
}

export interface SavedAccountProfile {
  id: string;
  accountName: string;
  accountPurpose: string;
  accountDirection: string;
  historyArticleUrls: string;
  historyArticleTitles: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface TopicStrategyResponse {
  strategy: TopicStrategy;
  historyReferences?: HistoryReference[];
  source: "mock" | "ai";
  provider: string;
  model: string;
}

export interface RefineRequest {
  brief: BriefInput;
  article: GeneratedArticle;
  instruction: string;
}
