import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "./db";

/**
 * Postgres だけで動く固定ウィンドウ方式のレート制限。
 *
 * 公開デモは LLM を呼ぶため、無制限に叩かれると従量課金が直接の被害になる。
 * 外部サービスを増やさずに済ませたいので、既存の Postgres で実装している。
 * upsert 1回で判定まで終わるため、ラウンドトリップは1往復。
 *
 * 守りたいものが2つあるので、制限も2層にしている。
 *
 * - 個別制限: 1人の連打を止める。Webは IP、LINEは userId で数える。
 * - 全体制限: Web と LINE を合算した1日の呼び出し総数に上限を置く。
 *   個別制限だけでは「大勢がそれぞれ少しずつ叩く」状況で青天井になるため、
 *   課金額の天井を決めるのはこちらの役割。
 *
 * 個別制限で弾いたリクエストは全体カウンタを消費しない（呼び出し順に依存）。
 * 逆にすると、連打した1人が全体の枠を食い潰して他の閲覧者が使えなくなる。
 */

const WEB_WINDOW_SECONDS = 60;
const WEB_MAX_REQUESTS = 8;

// LINEは1往復の対話なので、Webより少し厳しくてよい。
const LINE_WINDOW_SECONDS = 60;
const LINE_MAX_REQUESTS = 6;

/**
 * 1日あたりの LLM 呼び出し総数の上限。
 *
 * 1リクエストにつき embedding 1回 + Claude Haiku 1回で概ね $0.001。
 * 既定値の 300 なら、最悪ケースでも 1日 $0.3 / 月 $9 で頭打ちになる。
 * 上限に達しても課金が止まるだけで、アプリは固定文言を返して動き続ける。
 */
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;
const DAILY_MAX_REQUESTS = Number(process.env.DAILY_LLM_BUDGET ?? 300);

export type Gate =
  | { allowed: true; remaining: number }
  | {
      allowed: false;
      reason: "too_many_requests" | "daily_budget";
      retryAfterSeconds: number;
    };

/**
 * IPやLINEのユーザーIDは個人情報になりうるので、生値ではなくハッシュを保存する。
 * ソルトが無い場合でもIPv4は総当たりできてしまうため、
 * RATE_LIMIT_SALT を設定した環境ではそれを混ぜる。
 */
function hash(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "";
  return createHash("sha256")
    .update(`${salt}:${value}`)
    .digest("hex")
    .slice(0, 32);
}

type Consumed = { count: number; retryAfterSeconds: number };

async function consume(
  scope: string,
  identifier: string,
  windowSeconds: number,
): Promise<Consumed> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000));
  const bucket = `${scope}:${identifier}:${windowStart}`;
  const expiresAt = new Date((windowStart + 1) * windowSeconds * 1000);

  const sql = getDb();
  const rows = await sql<{ count: number }[]>`
    insert into demo_rate_limit (bucket, count, expires_at)
    values (${bucket}, 1, ${expiresAt})
    on conflict (bucket) do update set count = demo_rate_limit.count + 1
    returning count
  `;

  // 期限切れ行の掃除。専用のcronを増やしたくないので、
  // ごく低い確率で通常リクエストに相乗りさせる。
  if (Math.random() < 0.02) {
    await sql`delete from demo_rate_limit where expires_at < now()`;
  }

  return {
    count: rows[0]?.count ?? 1,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now) / 1000),
    ),
  };
}

/**
 * 個別制限 → 全体制限の順に判定する。
 * LLMを呼ぶ前に必ずこれを通すこと。
 */
async function gate(
  scope: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<Gate> {
  const individual = await consume(scope, identifier, windowSeconds);
  if (individual.count > maxRequests) {
    return {
      allowed: false,
      reason: "too_many_requests",
      retryAfterSeconds: individual.retryAfterSeconds,
    };
  }

  const daily = await consume("daily", "all", DAILY_WINDOW_SECONDS);
  if (daily.count > DAILY_MAX_REQUESTS) {
    return {
      allowed: false,
      reason: "daily_budget",
      retryAfterSeconds: daily.retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - individual.count),
  };
}

export function checkWebGate(req: NextRequest): Promise<Gate> {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return gate("web", hash(ip), WEB_MAX_REQUESTS, WEB_WINDOW_SECONDS);
}

export function checkLineGate(lineUserId: string): Promise<Gate> {
  return gate("line", hash(lineUserId), LINE_MAX_REQUESTS, LINE_WINDOW_SECONDS);
}
