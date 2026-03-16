import "server-only";

import { wsa } from "tencentcloud-sdk-nodejs-wsa";

import type { HistoryReference } from "@/lib/types";
import { fetchWechatHistoryReferences } from "@/lib/wechat-history";

type SearchPage = {
  title?: string;
  url?: string;
  passage?: string;
  content?: string;
  site?: string;
  date?: string | number;
  score?: string | number;
};

type TencentSearchConfig = {
  secretId: string;
  secretKey: string;
  region?: string;
};

const SearchClient = wsa.v20250508.Client;

function getTencentSearchConfig(): TencentSearchConfig | null {
  const secretId =
    process.env.TENCENTCLOUD_SECRET_ID?.trim() ||
    process.env.TENCENT_SECRET_ID?.trim();
  const secretKey =
    process.env.TENCENTCLOUD_SECRET_KEY?.trim() ||
    process.env.TENCENT_SECRET_KEY?.trim();

  if (!secretId || !secretKey) {
    return null;
  }

  return {
    secretId,
    secretKey,
    region: process.env.TENCENTCLOUD_REGION?.trim(),
  };
}

function cleanText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function normalizeCompareText(value?: string) {
  return (value || "").toLowerCase().replace(/[\s\-_.()（）【】\[\]·,，:："'“”‘’]/g, "");
}

function getPrimaryDirectionKeyword(accountDirection: string) {
  return accountDirection
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .find(Boolean);
}

function buildSearchQueries(accountName: string, accountDirection: string) {
  const keyword = getPrimaryDirectionKeyword(accountDirection);

  return [`${accountName} 公众号`, keyword ? `${accountName} ${keyword}` : ""]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 2);
}

function parseSearchPage(raw: string): SearchPage | null {
  try {
    return JSON.parse(raw) as SearchPage;
  } catch {
    return null;
  }
}

function normalizePublishedAt(value?: string | number) {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }

  return cleanText(value);
}

function normalizeScore(value?: string | number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function dedupeSearchReferences(references: HistoryReference[]) {
  const byKey = new Map<string, HistoryReference>();

  for (const reference of references) {
    const key =
      reference.url?.trim() ||
      `${reference.accountName || ""}:${reference.title}:${reference.source}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, reference);
      continue;
    }

    const existingScore = [
      existing.accountName,
      existing.description,
      existing.publishedAt,
      existing.site,
    ].filter(Boolean).length;
    const nextScore = [
      reference.accountName,
      reference.description,
      reference.publishedAt,
      reference.site,
    ].filter(Boolean).length;

    if (nextScore > existingScore) {
      byKey.set(key, reference);
    }
  }

  return Array.from(byKey.values());
}

function rankMatch(reference: HistoryReference, accountName: string) {
  const target = normalizeCompareText(accountName);
  const title = normalizeCompareText(reference.title);
  const account = normalizeCompareText(reference.accountName);

  if (account && (account.includes(target) || target.includes(account))) {
    return 2;
  }

  if (title.includes(target)) {
    return 1;
  }

  return 0;
}

async function runSearchQuery(
  query: string,
  config: TencentSearchConfig,
): Promise<HistoryReference[]> {
  const client = new SearchClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region || "",
    profile: {
      httpProfile: {
        reqTimeout: 8,
      },
    },
  });

  const response = await client.SearchPro({
    Query: query,
    Mode: 0,
    Site: "mp.weixin.qq.com",
  });

  const pages = (response.Pages || [])
    .map((item) => parseSearchPage(item))
    .filter((item): item is SearchPage => Boolean(item))
    .filter((item) => cleanText(item.url).includes("mp.weixin.qq.com"))
    .slice(0, 6);

  if (pages.length === 0) {
    return [];
  }

  const fetchedReferences = await fetchWechatHistoryReferences(
    pages.map((item) => cleanText(item.url)).filter(Boolean),
  );
  const fetchedByUrl = new Map(
    fetchedReferences
      .filter((item) => item.url)
      .map((item) => [item.url as string, item]),
  );

  return pages.map((page) => {
    const url = cleanText(page.url);
    const hydrated = fetchedByUrl.get(url);

    return {
      title:
        hydrated?.title && hydrated.title !== "未识别标题"
          ? hydrated.title
          : cleanText(page.title) || "未识别标题",
      accountName: hydrated?.accountName,
      description: hydrated?.description || cleanText(page.content || page.passage),
      url,
      site: cleanText(page.site),
      publishedAt: normalizePublishedAt(page.date),
      score: normalizeScore(page.score),
      source: "search" as const,
    };
  });
}

export function hasTencentSearchConfig() {
  return Boolean(getTencentSearchConfig());
}

export async function searchWechatHistoryReferences(
  accountName: string,
  accountDirection: string,
) {
  const config = getTencentSearchConfig();
  const normalizedName = accountName.trim();

  if (!config || !normalizedName) {
    return [];
  }

  try {
    const queries = buildSearchQueries(normalizedName, accountDirection);
    const results = await Promise.all(queries.map((query) => runSearchQuery(query, config)));
    const merged = dedupeSearchReferences(results.flat());
    const ranked = merged
      .map((reference) => ({
        reference,
        matchScore: rankMatch(reference, normalizedName),
        relevanceScore: reference.score || 0,
      }))
      .sort(
        (left, right) =>
          right.matchScore - left.matchScore || right.relevanceScore - left.relevanceScore,
      );
    const matched = ranked.filter((item) => item.matchScore > 0);
    const selected = matched.length > 0 ? matched : ranked;

    return selected.slice(0, 5).map((item) => item.reference);
  } catch {
    return [];
  }
}
