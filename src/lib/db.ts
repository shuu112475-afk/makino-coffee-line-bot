import postgres from "postgres";

let _sql: postgres.Sql | null = null;

export function getDb() {
  if (!_sql) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL is not set");
    }
    _sql = postgres(connectionString, {
      // POSTGRES_URL は Supabase のプーラー(6543番/トランザクションモード)を指す。
      // このモードでは接続がクエリ単位で使い回されるため、
      // postgres.js が既定で有効にするプリペアドステートメントは成立せず、
      // 同時アクセス時に "prepared statement already exists" で落ちる。
      prepare: false,
      // サーバーレスでは関数インスタンスの数だけプールが作られる。
      // 1インスタンスが複数本張るとプーラー側の上限をすぐ使い切るので1本に絞る。
      max: 1,
      idle_timeout: 20,
    });
  }
  return _sql;
}
