import Link from "next/link";
import { getDb } from "@/lib/db";
import { reasonBadgeClass, reasonLabel } from "../reasons";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type ResolvedItem = {
  id: string;
  question: string;
  reason: string | null;
  status: "answered" | "ignored";
  staff_answer: string | null;
  top_faq_question: string | null;
  top_similarity: number | null;
  created_at: string;
  resolved_at: string | null;
};

export default async function HistoryPage() {
  const sql = getDb();

  // 「何を送ったか」を後から読み返せることが目的なので、
  // 送信文（staff_answer）と、そのとき判定が何を見ていたかを並べて出す。
  const items = await sql<ResolvedItem[]>`
    select
      q.id,
      q.question,
      q.reason,
      q.status,
      q.staff_answer,
      f.question as top_faq_question,
      q.top_similarity,
      q.created_at,
      q.resolved_at
    from unresolved_queue q
    left join faq_entries f on f.id = q.top_faq_id
    where q.status in ('answered', 'ignored')
    order by q.resolved_at desc nulls last
    limit ${PAGE_SIZE}
  `;

  return (
    <main>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">対応済みの履歴</h1>
        <Link
          href="/admin"
          className="text-xs text-[#6B6B6B] underline underline-offset-2 hover:text-[#3A7D6E]"
        >
          未対応キューへ
        </Link>
      </div>
      <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
        担当者が実際にLINEへ送った文面です。直近{PAGE_SIZE}
        件を新しい順に表示します。
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          対応済みの質問はまだありません。
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[#E5E3DF] bg-white p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    item.status === "answered"
                      ? "bg-[#E8F0ED] text-[#3A7D6E] ring-[#CFE1DB]"
                      : "bg-[#F2F1EE] text-[#6B6B6B] ring-[#E5E3DF]"
                  }`}
                >
                  {item.status === "answered" ? "回答済み" : "回答せず終了"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${reasonBadgeClass(
                    item.reason,
                  )}`}
                >
                  {reasonLabel(item.reason)}
                </span>
                <span className="text-xs text-[#A8A49E]">
                  {item.resolved_at
                    ? new Date(item.resolved_at).toLocaleString("ja-JP")
                    : "—"}
                </span>
              </div>

              <p className="mt-2 font-medium">{item.question}</p>

              {item.status === "answered" && item.staff_answer && (
                <div className="mt-2 rounded-lg border-l-2 border-[#3A7D6E] bg-[#F5F9F7] py-2 pl-3 pr-2">
                  <p className="text-xs text-[#6B6B6B]">LINEへ送った文面</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6">
                    {item.staff_answer}
                  </p>
                </div>
              )}

              <p className="mt-2 text-xs text-[#A8A49E]">
                受信 {new Date(item.created_at).toLocaleString("ja-JP")}
                {item.top_faq_question && (
                  <>
                    {" ／ 近いFAQ "}
                    {item.top_faq_question}
                    {item.top_similarity !== null && (
                      <span className="ml-1 font-mono">
                        ({item.top_similarity.toFixed(3)})
                      </span>
                    )}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
