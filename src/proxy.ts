import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: "/admin/:path*",
};

const unauthorized = () =>
  new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin"' },
  });

/**
 * 文字列を定数時間で比較する。
 *
 * `a === b` は先頭から順に見て違えば即座に打ち切るため、
 * 「何文字目まで合っていたか」が応答時間の差として外から観測できる。
 * 1文字ずつ総当たりすれば、総当たり空間が指数から線形に落ちる。
 *
 * 毎回ランダムな鍵でHMACを取ってから比べると、攻撃者は
 * 手元で同じダイジェストを再現できないため、時間差を手がかりにできない。
 * ダイジェスト長は入力によらず32バイト固定なので、文字数も漏れない。
 *
 * node:crypto の timingSafeEqual ではなくWeb Cryptoを使っているのは、
 * このファイルがEdgeランタイムでも動くようにするため。
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);

  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i += 1) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

export async function proxy(req: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    return new NextResponse("Admin auth is not configured", { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  // 区切りが無いヘッダーは Basic 認証の形になっていない。
  // これを許すと slice(0, -1) が走り、意図しない文字列を比較してしまう。
  if (separatorIndex === -1) return unauthorized();

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  // 「ユーザー名が違えばパスワードを比較しない」書き方にすると、
  // ユーザー名が当たっているかどうかが応答時間に出てしまう。
  // 両方を必ず評価してから判定する。
  const [userOk, passOk] = await Promise.all([
    timingSafeEqual(user, expectedUser),
    timingSafeEqual(pass, expectedPass),
  ]);

  return userOk && passOk ? NextResponse.next() : unauthorized();
}
