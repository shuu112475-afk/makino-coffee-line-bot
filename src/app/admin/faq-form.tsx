"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveFaq } from "./actions";

type Props = {
  /** 判定時に最も近かったFAQ。無ければ新規作成しかできない */
  faq: {
    id: string;
    category: string;
    question: string;
    answer: string;
  } | null;
  /** お客様が実際に送ってきた質問。新規作成時の想定質問の下書きに使う */
  customerQuestion: string;
};

export function FaqForm({ faq, customerQuestion }: Props) {
  const [state, formAction] = useActionState(saveFaq, null);
  // 近いFAQがあるなら既定は「追記」。
  // no_evidence は大半が「FAQはあるが一言足りない」ケースで、
  // 毎回新規に作ると似たFAQが増えて検索がぶれる。
  const [mode, setMode] = useState<"edit" | "create">(faq ? "edit" : "create");

  const base =
    mode === "edit" && faq
      ? faq
      : { id: "", category: "", question: customerQuestion, answer: "" };

  return (
    <form
      action={formAction}
      // mode を変えたらフォームを作り直して、初期値を入れ替える
      key={mode}
      className="space-y-2.5 rounded-lg border border-[#E5E3DF] bg-[#FBFAF8] p-3.5"
    >
      <p className="text-xs font-medium text-[#2E2E2E]">
        次回から自動で答えられるようにする
      </p>

      {faq && (
        <div className="flex flex-wrap gap-3 text-xs text-[#6B6B6B]">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="mode"
              checked={mode === "edit"}
              onChange={() => setMode("edit")}
              className="accent-[#3A7D6E]"
            />
            近いFAQに書き足す
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="mode"
              checked={mode === "create"}
              onChange={() => setMode("create")}
              className="accent-[#3A7D6E]"
            />
            新しいFAQを作る
          </label>
        </div>
      )}

      <input type="hidden" name="faqId" value={base.id} />

      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <input
          name="category"
          defaultValue={base.category}
          required
          maxLength={40}
          placeholder="カテゴリ"
          className="rounded-lg border border-[#E5E3DF] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#3A7D6E]"
        />
        <input
          name="question"
          defaultValue={base.question}
          required
          maxLength={200}
          placeholder="想定される質問"
          className="rounded-lg border border-[#E5E3DF] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#3A7D6E]"
        />
      </div>

      <textarea
        name="answer"
        defaultValue={base.answer}
        required
        rows={3}
        placeholder="FAQの回答本文"
        className="w-full rounded-lg border border-[#E5E3DF] bg-white p-2.5 text-xs leading-6 outline-none focus:border-[#3A7D6E]"
      />

      <p className="text-xs leading-5 text-[#6B6B6B]">
        お客様の質問：「{customerQuestion}」
        <br />
        この質問にも答えられる内容になっているか確認してください。
      </p>

      <SaveButton mode={mode} />

      {state && "error" in state && (
        <p
          role="alert"
          className="rounded-lg bg-[#FBE9E6] px-3 py-2 text-xs leading-5 text-[#9A4A3F]"
        >
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p
          role="status"
          className="rounded-lg bg-[#E8F0ED] px-3 py-2 text-xs leading-5 text-[#3A7D6E]"
        >
          {state.ok}
        </p>
      )}
    </form>
  );
}

function SaveButton({ mode }: { mode: "edit" | "create" }) {
  // 保存のたびに埋め込みAPIを1回叩くため、連打させない。
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-[#3A7D6E] bg-white px-4 py-1.5 text-xs font-medium text-[#3A7D6E] transition-colors hover:bg-[#E8F0ED] disabled:opacity-50"
    >
      {pending
        ? "保存中…"
        : mode === "edit"
          ? "このFAQを更新する"
          : "FAQとして追加する"}
    </button>
  );
}
