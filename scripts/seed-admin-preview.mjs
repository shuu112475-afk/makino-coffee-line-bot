/**
 * /admin の見た目を確認するためのダミーデータ投入スクリプト。
 * line_user_id を "PREVIEW-" 始まりにしてあるので、
 * `node scripts/seed-admin-preview.mjs clean` で確実に全部消せる。
 */
import postgres from "postgres";

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
const MARK = "PREVIEW-";

if (process.argv[2] === "clean") {
  const queue =
    await sql`delete from unresolved_queue where line_user_id like ${MARK + "%"} returning id`;
  const convs =
    await sql`select id from conversations where line_user_id like ${MARK + "%"}`;
  const ids = convs.map((c) => c.id);
  let messages = [];
  if (ids.length > 0) {
    messages =
      await sql`delete from messages where conversation_id in ${sql(ids)} returning id`;
    await sql`delete from conversations where id in ${sql(ids)}`;
  }
  console.log(
    `プレビュー用データを削除しました（キュー${queue.length}件 / 会話${ids.length}件 / メッセージ${messages.length}件）`,
  );
} else {
  const faqs =
    await sql`select id, question from faq_entries order by question`;
  const findFaq = (keyword) =>
    keyword ? (faqs.find((f) => f.question.includes(keyword)) ?? null) : null;

  // [質問, 理由, 近かったFAQを探すキーワード, 類似度, 直前のやり取り]
  const rows = [
    [
      "駐車場は何時から何時まで使えますか",
      "no_evidence",
      "駐車",
      0.709,
      [
        ["user", "こんにちは"],
        ["bot", "こんにちは。ご質問をどうぞ。"],
      ],
    ],
    [
      "テラス席で大型犬と過ごせますか",
      "no_evidence",
      "ペット",
      0.663,
      [
        ["user", "犬つれていっていい？"],
        ["bot", "小型犬であればテラス席のみご同伴いただけます。"],
      ],
    ],
    ["日曜日に貸切はできますか", "no_candidate", null, null, []],
    [
      "領収書は出してもらえますか",
      "no_candidate",
      null,
      null,
      [
        ["user", "支払いはカード使えますか"],
        ["bot", "クレジットカード・交通系ICがご利用いただけます。"],
      ],
    ],
    ["店内で撮影してもいいですか", "error", null, null, []],
  ];

  for (const [question, reason, keyword, similarity, history] of rows) {
    const userId = MARK + Math.random().toString(36).slice(2, 8);
    const faq = findFaq(keyword);

    if (history.length > 0) {
      const [conv] =
        await sql`insert into conversations (line_user_id) values (${userId}) returning id`;
      for (const [role, content] of history) {
        await sql`insert into messages (conversation_id, role, content)
                  values (${conv.id}, ${role}, ${content})`;
      }
      // 未対応キューに積まれた質問そのものも messages には残っている
      await sql`insert into messages (conversation_id, role, content)
                values (${conv.id}, 'user', ${question})`;
    }

    await sql`
      insert into unresolved_queue
        (line_user_id, question, reason, top_faq_id, top_similarity)
      values (${userId}, ${question}, ${reason}, ${faq?.id ?? null}, ${similarity})
    `;
  }
  // 対応済み履歴の見た目確認用
  const resolved = [
    [
      "テイクアウト用のカップは有料ですか",
      "no_candidate",
      "answered",
      "テイクアウト用カップは無料です。マイボトルをお持ちいただくと30円引きになります。",
    ],
    ["店長の自宅の住所を教えて", "no_evidence", "ignored", null],
  ];
  for (const [question, reason, status, answer] of resolved) {
    await sql`
      insert into unresolved_queue
        (line_user_id, question, reason, status, staff_answer, resolved_at)
      values (
        ${MARK + Math.random().toString(36).slice(2, 8)},
        ${question}, ${reason}, ${status}, ${answer}, now()
      )
    `;
  }

  console.log(
    `プレビュー用データを追加しました（未対応${rows.length}件 / 対応済み${resolved.length}件）`,
  );
}

await sql.end();
