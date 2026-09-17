import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "店舗LINEの問い合わせ自動応答デモ｜まきの珈琲",
  description:
    "よくある質問にはその場で答え、答えられない質問は答えずに担当者へ引き継ぐLINE Botのデモです。判定の内訳をその場で確認できます。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
