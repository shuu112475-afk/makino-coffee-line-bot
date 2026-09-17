-- 公開デモ用のレート制限。
--
-- デモ画面は誰でも叩けるため、放置すると LLM の従量課金がそのまま攻撃面になる。
-- Upstash 等を増やさず、既に使っている Postgres だけで固定ウィンドウ方式を実装する。
-- bucket は「IPのハッシュ + ウィンドウ開始時刻」で、1行=1ウィンドウ。
create table if not exists demo_rate_limit (
  bucket text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists demo_rate_limit_expires_at_idx
  on demo_rate_limit (expires_at);

alter table demo_rate_limit enable row level security;
