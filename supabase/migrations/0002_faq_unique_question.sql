-- シード投入を冪等にするため、質問文に一意制約を付ける。
-- これにより seed-faq.mjs を再実行しても重複行が増えず、
-- 既存行は answer と embedding が上書きされる（messages からの FK も壊れない）。
create unique index if not exists faq_entries_question_key
  on faq_entries (question);
