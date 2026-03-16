"use client";

import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "¥79 / 月",
    description: "适合个人运营，先把选题、成稿和轻量配图跑起来。",
    points: ["每月基础 Credits", "AI 选题建议", "成稿与导出", "单账号使用"],
  },
  {
    name: "Team",
    price: "¥299 / 月",
    description: "适合品牌或内容团队，覆盖多人协作和更高频的图文生产。",
    points: ["更高月度 Credits", "多人协作位", "历史记录与账单", "优先模型通道"],
    featured: true,
  },
  {
    name: "Credits Pack",
    price: "按量购买",
    description: "适合偶发使用或临时冲量，不想开月订阅时补充额度。",
    points: ["一次性充值", "按消耗扣减", "和订阅额度叠加", "适合爆量活动期"],
  },
];

export function PricingShell() {
  return (
    <main className="pricing-shell">
      <header className="site-header">
        <Link className="site-logo" href="/">
          <span className="site-logo-mark">OS</span>
          <strong>公众号 AI 排版工作台</strong>
        </Link>
        <nav className="site-nav">
          <Link href="/">首页</Link>
          <Link href="/studio">Studio</Link>
          <Link href="/login">登录</Link>
        </nav>
      </header>

      <section className="pricing-hero">
        <p className="eyebrow">Pricing</p>
        <h1>把 Token 成本变成可持续的定价结构</h1>
        <p>
          真正对外开放后，用户需要登录并消耗 Credits。文案生成、AI 优化和图片生成都应该有明确成本，不再由内部团队无限补贴。
        </p>
      </section>

      <section className="pricing-grid">
        {plans.map((plan) => (
          <article
            className={plan.featured ? "pricing-card featured" : "pricing-card"}
            key={plan.name}
          >
            <p className="panel-kicker">{plan.name}</p>
            <h2>{plan.price}</h2>
            <p>{plan.description}</p>
            <ul>
              {plan.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link className={plan.featured ? "primary-button topbar-link" : "ghost-button topbar-link"} href="/login">
              预留开通入口
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
