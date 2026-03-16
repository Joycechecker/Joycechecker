"use client";

import Link from "next/link";

const featureCards = [
  {
    title: "先做选题，不是先写文",
    body: "先判断这是新号还是老号，AI 先帮你梳理内容方向和建议选题，再决定本次主题。",
  },
  {
    title: "上传原图优先",
    body: "有真实产品图就优先用原图，没有图的位置再让 AI 生图，避免瞎编产品外观。",
  },
  {
    title: "先生成，再手改，再 AI 优化",
    body: "初稿、配图、预览和导出是一条链路，不需要在多个工具之间来回切。",
  },
];

const workflowSteps = [
  "定义公众号定位和这次的推广对象",
  "AI 给出内容方向和建议选题",
  "确认目标人群、内容要点、内容目标",
  "生成公众号成稿、图片和移动端预览",
];

export function MarketingHome() {
  return (
    <main className="marketing-shell">
      <header className="site-header">
        <Link className="site-logo" href="/">
          <span className="site-logo-mark">OS</span>
          <strong>公众号 AI 排版工作台</strong>
        </Link>
        <nav className="site-nav">
          <Link href="/studio">Studio</Link>
          <Link href="/pricing">定价</Link>
          <Link href="/login">登录</Link>
        </nav>
      </header>

      <section className="marketing-hero">
        <div className="marketing-copy">
          <p className="eyebrow">Topic-First WeChat Studio</p>
          <h1>先定选题方向，再让 AI 帮你出公众号成稿</h1>
          <p>
            这不是一个只会“从主题瞎写文”的工具。它更像一个公众号编辑台：先做号定位和选题建议，
            再做成稿、配图、预览、导出，未来还能按 Credits 计费，覆盖真实使用成本。
          </p>
          <div className="marketing-actions">
            <Link className="primary-button topbar-link" href="/studio">
              进入 Studio
            </Link>
            <Link className="ghost-button topbar-link" href="/pricing">
              查看定价方案
            </Link>
          </div>
        </div>

        <div className="hero-scoreboard">
          <div className="hero-score-card">
            <span>工作流</span>
            <strong>选题 → 成稿 → 配图 → 导出</strong>
          </div>
          <div className="hero-score-card">
            <span>图片策略</span>
            <strong>原图优先，空位再 AI 生图</strong>
          </div>
          <div className="hero-score-card">
            <span>商业模式</span>
            <strong>Credits + 订阅</strong>
          </div>
        </div>
      </section>

      <section className="marketing-grid">
        {featureCards.map((card) => (
          <article className="marketing-card" key={card.title}>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section className="marketing-showcase">
        <div>
          <p className="panel-kicker">工作方式</p>
          <h2>更像真实内容团队，而不是一次性生成器</h2>
        </div>
        <div className="workflow-list">
          {workflowSteps.map((step, index) => (
            <div className="workflow-step" key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-pricing">
        <div>
          <p className="panel-kicker">收费方式</p>
          <h2>不再靠内部补贴 Token 成本</h2>
          <p>
            对外使用时，用户需要登录、购买 Credits 或开通订阅，生成文案、优化稿件和图片都会按消耗计费。
          </p>
        </div>
        <div className="pricing-teaser-grid">
          <div className="pricing-teaser-card">
            <strong>Starter</strong>
            <p>适合个体运营，低门槛体验 Studio 和轻量文案生成。</p>
          </div>
          <div className="pricing-teaser-card featured">
            <strong>Team</strong>
            <p>适合品牌团队，多人协作、更多 Credits、更完整的历史与账单能力。</p>
          </div>
        </div>
      </section>
    </main>
  );
}
