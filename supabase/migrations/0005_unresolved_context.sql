-- 未対応キューに「判定時に最も近かったFAQ」を残す。
--
-- 担当者が回答を書くとき、一番知りたいのは
-- 「近いFAQはあったのか、あったなら何が足りなかったのか」である。
--   reason = 'no_evidence' → 候補はあった。そのFAQに記述を足せば次から自動で答えられる
--   reason = 'no_candidate' → 候補が無い。FAQそのものを新規に作る必要がある
-- この判断材料を管理画面で出すために記録する。
--
-- 管理画面を開くたびにベクトル検索をやり直す手もあるが、
-- 質問1件につき埋め込みAPIを1回呼ぶことになり、閲覧しただけで課金が発生する。
-- 判定時点の値をそのまま残すほうが安く、かつ「そのとき何を見て判断したか」を
-- 後から検証できる記録にもなる。
alter table unresolved_queue
  add column if not exists top_faq_id uuid references faq_entries(id),
  add column if not exists top_similarity double precision;
