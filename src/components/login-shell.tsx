"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { sanitizeNextPath } from "@/lib/auth-core";

type LoginShellProps = {
  authConfigured: boolean;
};

export function LoginShell({ authConfigured }: LoginShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get("next")),
    [searchParams],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!authConfigured) {
      setErrorMessage("后台还没有配置登录信息，先补环境变量再试。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "登录失败，请稍后再试。");
      }

      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登录失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <header className="site-header">
        <Link className="site-logo" href="/">
          <span className="site-logo-mark">OS</span>
          <strong>公众号 AI 排版工作台</strong>
        </Link>
        <nav className="site-nav">
          <Link href="/">首页</Link>
          <Link href="/pricing">定价</Link>
          <Link href="/login">登录</Link>
        </nav>
      </header>

      <section className="login-panel panel-card">
        <div className="login-panel-copy">
          <p className="eyebrow">Private Access</p>
          <h1>先登录，再进入你的公众号工作台</h1>
          <p>
            现在 Studio 和所有 AI 接口都已经需要登录。这样你把网站部署到公网后，陌生人也不能直接消耗你的 token。
          </p>
        </div>

        <div className="login-feature-list">
          <div>
            <strong>现在已经被保护的内容</strong>
            <p>Studio、选题分析、成稿生成、优化稿件、图片生成这几条链路都需要登录后才能使用。</p>
          </div>
          <div>
            <strong>这版适合当前阶段</strong>
            <p>先用私有邀请制账号把入口收住，等你后面接正式支付和 Credits，再升级成面向外部用户的账户系统。</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span className="field-label">邮箱</span>
            <input
              autoComplete="email"
              className="text-input"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="field-group">
            <span className="field-label">密码</span>
            <input
              autoComplete="current-password"
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入你的登录密码"
              type="password"
              value={password}
            />
          </label>

          <div className="login-panel-actions">
            <button className="primary-button topbar-link" disabled={isSubmitting} type="submit">
              {isSubmitting ? "登录中..." : "登录并进入 Studio"}
            </button>
            <Link className="ghost-button topbar-link" href="/pricing">
              查看定价
            </Link>
          </div>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          {!authConfigured ? (
            <p className="notice-text">
              当前环境还没配置登录账号。先在部署环境或本地 `.env.local` 里补上
              `AUTH_SECRET` 和登录账号配置。
            </p>
          ) : (
            <p className="login-helper">登录成功后会跳回 {nextPath}。</p>
          )}
        </form>
      </section>
    </main>
  );
}
