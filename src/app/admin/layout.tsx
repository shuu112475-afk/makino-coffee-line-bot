import Link from "next/link";

/**
 * 管理画面の外枠。デモ画面（/）と同じ配色にそろえている。
 * 同じサービスの表と裏なので、担当者が見る画面だけ色が違うと
 * ポートフォリオとして「作りかけ」に見える。
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-full bg-[#FBFAF8] text-[#2E2E2E]">
      <header className="border-b border-[#E5E3DF] bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3A7D6E]" />
          <Link href="/admin" className="text-sm font-medium">
            まきの珈琲 ｜ 問い合わせ管理
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10">{children}</div>
    </div>
  );
}
