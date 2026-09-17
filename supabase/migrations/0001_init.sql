-- まきの珈琲 LINE Bot: 初期スキーマ
create extension if not exists vector;

create table if not exists faq_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  answer text not null,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

create index if not exists faq_entries_embedding_idx
  on faq_entries using hnsw (embedding vector_cosine_ops);

create table if not exists line_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_line_user_id_idx
  on conversations (line_user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  role text not null check (role in ('user', 'bot')),
  content text not null,
  matched_faq_id uuid references faq_entries(id),
  confidence float,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on messages (conversation_id);

create table if not exists unresolved_queue (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  question text not null,
  status text not null default 'pending' check (status in ('pending', 'answered', 'ignored')),
  staff_answer text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists unresolved_queue_status_idx
  on unresolved_queue (status, created_at);

-- サーバー側は Postgres 接続文字列 (service role相当) から直接アクセスするため
-- anon/authenticated ロールへの公開は行わない。防御的にRLSを有効化し、
-- ポリシーは作成しない（デフォルト拒否）。
alter table faq_entries enable row level security;
alter table line_events enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table unresolved_queue enable row level security;
