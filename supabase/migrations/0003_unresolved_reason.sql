-- 未対応キューに「なぜ答えられなかったか」を残す。
--   no_candidate: ベクトル検索で候補FAQが1件も閾値を超えなかった（＝守備範囲外の質問）
--   no_evidence : 候補は取れたが、その内容では答えられないとLLMが判断した
--   error       : 埋め込み・LLM・DBのいずれかが落ちて判定自体ができなかった
-- 管理画面でこの内訳を見ると、FAQを追記すべきか無視してよいかを判断できる。
alter table unresolved_queue
  add column if not exists reason text;
