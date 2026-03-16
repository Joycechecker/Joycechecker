import type { GeneratedArticle, LayoutPreset } from "@/lib/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function getLayoutStyle(layoutPreset: LayoutPreset) {
  if (layoutPreset === "magazine") {
    return `
    .article.layout-magazine { padding: 0 0 42px; overflow: hidden; }
    .article.layout-magazine h1, .article.layout-magazine .subtitle, .article.layout-magazine .dek, .article.layout-magazine .lead, .article.layout-magazine .section, .article.layout-magazine .footer, .article.layout-magazine .eyebrow { padding-left: 22px; padding-right: 22px; }
    .article.layout-magazine .cover img { border-radius: 0; }
    .article.layout-magazine .cover { margin-bottom: 22px; }
    .article.layout-magazine h2 { font-size: 24px; }
    .article.layout-magazine blockquote { border-left: 4px solid var(--accent); background: rgba(255,255,255,0.88); }
    `;
  }

  if (layoutPreset === "cards") {
    return `
    .article.layout-cards { background: transparent; border: 0; box-shadow: none; padding: 0; }
    .article.layout-cards .eyebrow, .article.layout-cards h1, .article.layout-cards .subtitle, .article.layout-cards .dek, .article.layout-cards .lead, .article.layout-cards .footer { max-width: 720px; margin-left: auto; margin-right: auto; }
    .article.layout-cards .section { max-width: 720px; margin: 20px auto 0; padding: 20px; border: 1px solid var(--border); border-radius: 24px; background: var(--surface); box-shadow: 0 12px 30px rgba(16,24,40,0.06); }
    .article.layout-cards .section-summary { margin-bottom: 12px; }
    .article.layout-cards blockquote { background: linear-gradient(135deg, rgba(255,122,0,0.12), rgba(15,61,145,0.06)); }
    .article.layout-cards .cta { border-radius: 18px; }
    `;
  }

  if (layoutPreset === "report") {
    return `
    .article.layout-report { border-radius: 20px; }
    .article.layout-report h1 { font-size: 32px; }
    .article.layout-report .section { border-top: 0; padding-top: 0; margin-top: 22px; }
    .article.layout-report h2 { display: inline-flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--secondary); border-radius: 12px; font-size: 20px; }
    .article.layout-report .section-summary { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
    .article.layout-report blockquote { background: #f8fafc; border: 1px solid var(--border); }
    `;
  }

  if (layoutPreset === "promo") {
    return `
    .article.layout-promo .dek, .article.layout-promo .lead { background: linear-gradient(135deg, rgba(255,122,0,0.16), rgba(15,61,145,0.08)); }
    .article.layout-promo h2 { color: var(--accent); }
    .article.layout-promo blockquote { background: linear-gradient(135deg, rgba(255,122,0,0.18), rgba(255,255,255,0.96)); color: #7a351e; }
    .article.layout-promo .cta { background: linear-gradient(135deg, var(--accent), #ff8f3d); color: #fff; }
    .article.layout-promo .hashtags { font-weight: 600; }
    `;
  }

  return `
    .article.layout-clean .cover img, .article.layout-clean .article-image img { border-radius: 22px; }
  `;
}

export function renderWechatHtml(article: GeneratedArticle, layoutPreset: LayoutPreset = "clean") {
  const hashtags = article.hashtags.map((tag) => `#${escapeHtml(tag)}`).join(" ");
  const sections = article.sections
    .map((section) => {
      const imageMarkup = section.imageUrl
        ? `
          <figure class="article-image">
            <img src="${section.imageUrl}" alt="${escapeHtml(section.imageAlt)}" />
            <figcaption>${escapeHtml(section.imageAlt)}</figcaption>
          </figure>
        `
        : "";

      return `
        <section class="section">
          <h2>${escapeHtml(section.heading)}</h2>
          <p class="section-summary">${escapeHtml(section.summary)}</p>
          ${imageMarkup}
          ${renderParagraphs(section.paragraphs)}
          <blockquote>${escapeHtml(section.callout)}</blockquote>
        </section>
      `;
    })
    .join("");

  const coverMarkup = article.coverImageUrl
    ? `
      <figure class="cover">
        <img src="${article.coverImageUrl}" alt="${escapeHtml(article.coverAlt)}" />
      </figure>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(article.title)}</title>
  <style>
    :root {
      --primary: ${article.palette.primary};
      --secondary: ${article.palette.secondary};
      --accent: ${article.palette.accent};
      --surface: ${article.palette.surface};
      --text: #1f2430;
      --muted: #677087;
      --border: rgba(15, 61, 145, 0.12);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.9), rgba(244,247,255,0.96)),
        linear-gradient(180deg, var(--secondary), #eef1f8);
      color: var(--text);
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      line-height: 1.78;
      padding: 24px 12px 48px;
    }

    .article {
      max-width: 720px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: 28px;
      padding: 24px 18px 42px;
      box-shadow: 0 24px 80px rgba(16, 24, 40, 0.12);
      border: 1px solid var(--border);
    }

    .eyebrow {
      color: var(--accent);
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 12px;
      font-weight: 600;
    }

    h1 {
      font-family: "Songti SC", "STSong", serif;
      margin: 0;
      font-size: 34px;
      line-height: 1.28;
      color: var(--primary);
    }

    .subtitle {
      font-size: 17px;
      color: var(--muted);
      margin: 14px 0 12px;
    }

    .dek {
      margin: 0 0 18px;
      background: var(--secondary);
      border-radius: 18px;
      padding: 14px 16px;
      color: var(--text);
      font-size: 15px;
    }

    .cover img,
    .article-image img {
      width: 100%;
      border-radius: 22px;
      display: block;
    }

    .cover {
      margin: 0 0 22px;
    }

    .article-image {
      margin: 18px 0;
    }

    figcaption {
      text-align: center;
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
    }

    p {
      margin: 0 0 16px;
      font-size: 16px;
    }

    .lead {
      font-size: 17px;
      background: linear-gradient(135deg, rgba(255,122,0,0.08), rgba(15,61,145,0.05));
      padding: 16px;
      border-radius: 20px;
    }

    .section {
      padding-top: 8px;
      margin-top: 26px;
      border-top: 1px dashed var(--border);
    }

    h2 {
      font-size: 22px;
      color: var(--primary);
      margin: 0 0 8px;
      line-height: 1.35;
    }

    .section-summary {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 16px;
    }

    blockquote {
      margin: 0;
      padding: 16px 18px;
      border-radius: 20px;
      background: var(--secondary);
      color: var(--primary);
      font-weight: 600;
    }

    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }

    .cta {
      background: linear-gradient(135deg, var(--primary), #173a7a);
      color: white;
      padding: 18px;
      border-radius: 22px;
      font-size: 16px;
      margin-top: 18px;
    }

    .hashtags {
      margin-top: 18px;
      color: var(--muted);
      font-size: 14px;
    }

    ${getLayoutStyle(layoutPreset)}
  </style>
</head>
<body>
  <article class="article layout-${layoutPreset}">
    <div class="eyebrow">AI 排版成稿</div>
    <h1>${escapeHtml(article.title)}</h1>
    <p class="subtitle">${escapeHtml(article.subtitle)}</p>
    <p class="dek">${escapeHtml(article.dek)}</p>
    ${coverMarkup}
    <p class="lead">${escapeHtml(article.introduction)}</p>
    ${sections}
    <div class="footer">
      <p>${escapeHtml(article.conclusion)}</p>
      <div class="cta">${escapeHtml(article.cta)}</div>
      <div class="hashtags">${hashtags}</div>
    </div>
  </article>
</body>
</html>
  `.trim();
}
