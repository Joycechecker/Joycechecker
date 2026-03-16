import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "公众号 AI 排版工作台",
  description: "先做公众号选题，再用 AI 生成文案、配图、预览和导出成稿。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
