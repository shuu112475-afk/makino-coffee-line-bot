import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "./db";

/**
 * Postgres だけで動く固定ウィンドウ方式のレート制限。
 *
 * 公開デモは LLM を呼ぶため、無制限に叩かれると従量課金が直接の被害になる。
 * 外部サービスを増やさずに済ませたいので、既存の Postgres で実装している。
 * upsert 1回で判定まで終わるため、ラウンドトリップは1往復。
 */

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 8;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * IPは個人情報になりうるので、生値ではなくハッシュだけを保存する。
 * ソルトが無い場合でもIPv4は総当たりできてしまうため、
 * RATE_LIMIT_SALT を設定した環境ではそれを混ぜる。
 */
function identify(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.RATE_LIMIT_SALT ?? "";
  return createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export async function checkRateLimit(
  req: NextRequest,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (WINDOW_SECONDS * 1000));
  const bucket = `${identify(req)}:${windowStart}`;
  const expiresAt = new Date((windowStart + 1) * WINDOW_SECONDS * 1000);

  const sql = getDb();
  const rows = await sql<{ count: number }[]>`
    insert into demo_rate_limit (bucket, count, expires_at)
    values (${bucket}, 1, ${expiresAt})
    on conflict (bucket) do update set count = demo_rate_limit.count + 1
    returning count
  `;

  const count = rows[0]?.count ?? 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - now) / 1000),
  );

  // 期限切れ行の掃除。専用のcronを増やしたくないので、
  // ごく低い確率で通常リクエストに相乗りさせる。
  if (Math.random() < 0.02) {
    await sql`delete from demo_rate_limit where expires_at < now()`;
  }

  return {
    allowed: count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - count),
    retryAfterSeconds,
  };
}
