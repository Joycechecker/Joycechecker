import "server-only";

import type { HistoryReference } from "@/lib/types";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};
const FETCH_TIMEOUT_MS = Number(process.env.WECHAT_FETCH_TIMEOUT_MS?.trim() || "3500");

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function decodeJsEscapes(value: string) {
  const normalized = value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => `\\u00${hex}`);

  try {
    return JSON.parse(`"${normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return normalized;
  }
}

function cleanText(value?: string) {
  if (!value) {
    return "";
  }

  return decodeHtmlEntities(decodeJsEscapes(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function extractMetadata(html: string, url: string): HistoryReference {
  const title =
    matchFirst(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i,
      /<meta[^>]+content=["']([^"]+)["'][^>]+property=["']og:title["']/i,
      /var\s+msg_title\s*=\s*'([^']+)'/i,
      /var\s+msg_title\s*=\s*"([^"]+)"/i,
      /<title>([^<]+)<\/title>/i,
    ]) || "未识别标题";

  const accountName =
    matchFirst(html, [
      /var\s+nickname\s*=\s*htmlDecode\("([^"]+)"\)/i,
      /var\s+nickname\s*=\s*'([^']+)'/i,
      /var\s+profile_nickname\s*=\s*"([^"]+)"/i,
      /var\s+profile_nickname\s*=\s*'([^']+)'/i,
      /<meta[^>]+property=["']og:article:author["'][^>]+content=["']([^"]+)["']/i,
    ]) || undefined;

  const description =
    matchFirst(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i,
      /<meta[^>]+content=["']([^"]+)["'][^>]+name=["']description["']/i,
      /var\s+msg_desc\s*=\s*htmlDecode\("([^"]+)"\)/i,
      /var\s+msg_desc\s*=\s*"([^"]+)"/i,
      /var\s+msg_desc\s*=\s*'([^']+)'/i,
    ]) || undefined;

  return {
    title,
    accountName,
    description,
    url,
    source: "fetched",
  };
}

export function parseHistoryUrls(raw: string) {
  return raw
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 5);
}

export function parseManualHistoryTitles(raw: string): HistoryReference[] {
  return raw
    .split(/\n+/)
    .map((item) => item.replace(/^[\-\d.、\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((title) => ({
      title,
      source: "manual" as const,
    }));
}

export async function fetchWechatHistoryReferences(urls: string[]) {
  const results = await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          headers: REQUEST_HEADERS,
          redirect: "follow",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            title: "抓取失败",
            url,
            source: "fetched" as const,
            error: `HTTP ${response.status}`,
          };
        }

        const html = await response.text();
        return extractMetadata(html, url);
      } catch (error) {
        return {
          title: "抓取失败",
          url,
          source: "fetched" as const,
          error: error instanceof Error ? error.message : "未知抓取错误",
        };
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  return results;
}
