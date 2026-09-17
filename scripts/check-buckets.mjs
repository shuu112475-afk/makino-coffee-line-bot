import postgres from "postgres";
const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
const rows = await sql`select bucket, count, expires_at from demo_rate_limit order by bucket`;
for (const r of rows) console.log(`${r.bucket.split(":")[0].padEnd(6)} count=${String(r.count).padStart(3)}  ${r.bucket.slice(0, 44)}`);
if (process.argv[2] === "reset") {
  await sql`delete from demo_rate_limit`;
  console.log("→ 全バケットを削除しました");
}
await sql.end();
