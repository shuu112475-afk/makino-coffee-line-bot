import postgres from "postgres";
const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });

const events = await sql`select count(*)::int as n from line_events`;
console.log(`受信したWebhookイベント: ${events[0].n} 件`);

const msgs = await sql`
  select role, content, matched_faq_id, confidence, created_at
  from messages order by created_at desc limit 12`;
console.log("\n--- 直近のメッセージ（古い順）---");
for (const m of msgs.reverse()) {
  const sim = m.confidence == null ? "-" : Number(m.confidence).toFixed(3);
  console.log(
    `[${m.role.padEnd(9)}] 類似度=${sim.padStart(5)}  ${m.content.slice(0, 60)}`,
  );
}

const q = await sql`
  select id, question, reason, status, created_at
  from unresolved_queue order by created_at desc limit 10`;
console.log(`\n--- 未対応キュー (${q.length}件) ---`);
for (const r of q)
  console.log(`[${r.status}] ${r.reason?.padEnd(12)} ${r.question}`);

await sql.end();
