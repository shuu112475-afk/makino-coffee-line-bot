import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const dir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dir, "..", "supabase", "migrations");

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "POSTGRES_URL_NON_POOLING (or POSTGRES_URL) が見つかりません。`vercel env pull .env.local` を実行してください。",
  );
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  console.log(`適用中: ${file}`);
  const content = readFileSync(path.join(migrationsDir, file), "utf8");
  await sql.unsafe(content);
}

console.log(`完了: ${files.length}件のマイグレーションを適用しました。`);
await sql.end();
