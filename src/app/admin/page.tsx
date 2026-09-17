import { getDb } from "@/lib/db";
import { answerQuestion, ignoreQuestion } from "./actions";

export const dynamic = "force-dynamic";

type PendingItem = {
  id: string;
  line_user_id: string;
  question: string;
  created_at: string;
};

export default async function AdminPage() {
  const sql = getDb();
  const items = await sql<PendingItem[]>`
    select id, line_user_id, question, created_at
    from unresolved_queue
    where status = 'pending'
    order by created_at asc
  `;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold">未対応キュー</h1>
      <p className="mt-1 text-sm text-neutral-500">
        自動応答が確信を持てなかった質問です。回答すると、その場でLINEへ送信されます。
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">未対応の質問はありません。</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-neutral-200 p-4">
              <p className="text-xs text-neutral-400">
                {new Date(item.created_at).toLocaleString("ja-JP")}
              </p>
              <p className="mt-1 font-medium">{item.question}</p>

              <form action={answerQuestion} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={item.id} />
                <textarea
                  name="answer"
                  required
                  rows={3}
                  placeholder="お客様への回答を入力"
                  className="rounded-md border border-neutral-300 p-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white"
                  >
                    送信して解決
                  </button>
                  <button
                    type="submit"
                    formAction={ignoreQuestion}
                    formNoValidate
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    無視する
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
