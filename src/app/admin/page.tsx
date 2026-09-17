import Link from "next/link";
import { getDb } from "@/lib/db";
import { AnswerForm } from "./answer-form";
import { FaqForm } from "./faq-form";
import { REASON, REASON_ORDER, TONE_CLASS } from "./reasons";

export const dynamic = "force-dynamic";

type PendingItem = {
  id: string;
  line_user_id: string;
  question: string;
  reason: string | null;
  top_similarity: number | null;
  top_faq_id: string | null;
  top_faq_question: string | null;
  top_faq_category: string | null;
  top_faq_answer: string | null;
  created_at: string;
};

type ContextRow = {
  queue_id: string;
  role: "user" | "bot";
  content: string;
  created_at: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sql = getDb();
  const requested = (await searchParams).reason;
  // 不正な値をそのままSQLに渡さない。既知の理由以外は「すべて」に倒す。
  const filter =
    requested && requested in REASON ? (requested as string) : null;

  // 件数は絞り込みの影響を受けてはいけない。
  // 「いま何が残っているか」の全体像はフィルタ中も見えている必要がある。
  const counts = await sql<{ reason: string | null; count: string }[]>`
    select reason, count(*) as count
    from unresolved_queue
    where status = 'pending'
    group by reason
  `;
  const countOf = (reason: string | null) =>
    reason === null
      ? counts.reduce((sum, c) => sum + Number(c.count), 0)
      : Number(counts.find((c) => c.reason === reason)?.count ?? 0);

  const items = await sql<PendingItem[]>`
    select
      q.id,
      q.line_user_id,
      q.question,
      q.reason,
      q.top_similarity,
      q.top_faq_id,
      f.question as top_faq_question,
      f.category as top_faq_category,
      f.answer   as top_faq_answer,
      q.created_at
    from unresolved_queue q
    left join faq_entries f on f.id = q.top_faq_id
    where q.status = 'pending'
      and (${filter}::text is null or q.reason = ${filter})
    order by q.created_at asc
  `;

  // 直前のやり取りをまとめて1クエリで取る。
  // 質問1件ごとにクエリを投げると、キューが溜まるほど遅くなる。
  const contextRows =
    items.length === 0
      ? []
      : await sql<ContextRow[]>`
          select q.id as queue_id, m.role, m.content, m.created_at
          from unresolved_queue q
          join lateral (
            select mm.role, mm.content, mm.created_at
            from messages mm
            join conversations c on c.id = mm.conversation_id
            where c.line_user_id = q.line_user_id
              and mm.created_at <= q.created_at
            order by mm.created_at desc
            limit 7
          ) m on true
          where q.id in ${sql(items.map((i) => i.id))}
        `;

  const contextByQueueId = new Map<string, ContextRow[]>();
  for (const row of contextRows) {
    const list = contextByQueueId.get(row.queue_id) ?? [];
    list.push(row);
    contextByQueueId.set(row.queue_id, list);
  }

  return (
    <main>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">未対応キュー</h1>
        <Link
          href="/admin/history"
          className="text-xs text-[#6B6B6B] underline underline-offset-2 hover:text-[#3A7D6E]"
        >
          対応済みの履歴へ
        </Link>
      </div>
      <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
        自動応答が確信を持てなかった質問です。回答すると、その場でLINEへ送信されます。
      </p>

      <nav className="mt-5 flex flex-wrap gap-2">
        <FilterTab
          href="/admin"
          label="すべて"
          count={countOf(null)}
          active={filter === null}
        />
        {REASON_ORDER.map((key) => (
          <FilterTab
            key={key}
            href={`/admin?reason=${key}`}
            label={REASON[key].label}
            count={countOf(key)}
            active={filter === key}
          />
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          {filter === null
            ? "未対応の質問はありません。"
            : "この理由の未対応はありません。"}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => {
            const reason = item.reason ? REASON[item.reason] : undefined;
            const history = buildHistory(
              contextByQueueId.get(item.id) ?? [],
              item.question,
            );

            return (
              <li
                key={item.id}
                className="rounded-xl border border-[#E5E3DF] bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      TONE_CLASS[reason?.tone ?? "gray"]
                    }`}
                  >
                    {reason?.label ?? "理由の記録なし"}
                  </span>
                  <span className="text-xs text-[#A8A49E]">
                    {new Date(item.created_at).toLocaleString("ja-JP")}
                  </span>
                </div>

                <p className="mt-2 font-medium">{item.question}</p>

                {item.top_faq_question ? (
                  <p className="mt-1 truncate text-xs text-[#6B6B6B]">
                    近いFAQ：{item.top_faq_question}
                    {item.top_similarity !== null && (
                      <span className="ml-1 font-mono">
                        ({item.top_similarity.toFixed(3)})
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#A8A49E]">近いFAQなし</p>
                )}

                {/* 一覧では要点だけ見せ、対応するときだけ開く。
                    常に開いていると1件が画面を占有し、溜まったときに全体像が掴めない。 */}
                <details className="group mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E5E3DF] px-3 py-1 text-xs text-[#2E2E2E] transition-colors hover:border-[#3A7D6E] hover:bg-[#E8F0ED]">
                    <span className="transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    対応する
                  </summary>

                  <div className="mt-3 space-y-3">
                    {reason && (
                      <p className="text-xs leading-5 text-[#6B6B6B]">
                        {reason.hint}
                      </p>
                    )}

                    {history.length > 0 && (
                      <div>
                        <p className="text-xs text-[#6B6B6B]">
                          直前のやり取り
                        </p>
                        <div className="mt-1.5 space-y-1.5 border-l-2 border-[#E5E3DF] pl-3">
                          {history.map((m, i) => (
                            <p key={i} className="text-xs leading-5">
                              <span className="text-[#A8A49E]">
                                {m.role === "user" ? "客" : "Bot"}：
                              </span>
                              <span className="text-[#2E2E2E]">
                                {m.content}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.top_faq_question && (
                      <div className="rounded-lg bg-[#FBFAF8] p-3.5">
                        <p className="text-xs text-[#6B6B6B]">
                          判定時に最も近かったFAQ
                          {item.top_similarity !== null && (
                            <>
                              {" ／ 類似度 "}
                              <span className="font-mono">
                                {item.top_similarity.toFixed(3)}
                              </span>
                            </>
                          )}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#2E2E2E]">
                          [{item.top_faq_category}] {item.top_faq_question}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                          {item.top_faq_answer}
                        </p>
                      </div>
                    )}

                    <AnswerForm id={item.id} />

                    <FaqForm
                      faq={
                        item.top_faq_id && item.top_faq_question
                          ? {
                              id: item.top_faq_id,
                              category: item.top_faq_category ?? "",
                              question: item.top_faq_question,
                              answer: item.top_faq_answer ?? "",
                            }
                          : null
                      }
                      customerQuestion={item.question}
                    />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function FilterTab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-[#3A7D6E] bg-[#3A7D6E] text-white"
          : "border-[#E5E3DF] bg-white text-[#6B6B6B] hover:border-[#3A7D6E] hover:bg-[#E8F0ED]"
      }`}
    >
      {label}
      <span className={active ? "ml-1.5" : "ml-1.5 text-[#A8A49E]"}>
        {count}
      </span>
    </Link>
  );
}

/**
 * lateral句は新しい順で取るので古い順に直し、
 * 「今まさに対応しようとしている質問」とそれ以降は落とす。
 * 質問文そのものは上部に大きく出しているため、履歴で繰り返すと読みにくい。
 */
function buildHistory(rows: ContextRow[], question: string): ContextRow[] {
  const asc = [...rows].reverse();
  const cut = asc.findLastIndex(
    (m) => m.role === "user" && m.content === question,
  );
  return cut === -1 ? asc : asc.slice(0, cut);
}
