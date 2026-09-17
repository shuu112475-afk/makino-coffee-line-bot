"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { answerQuestion, ignoreQuestion } from "./actions";

export function AnswerForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(answerQuestion, null);
  const [answer, setAnswer] = useState("");
  // 送信前に必ず確認を挟む。LINEのpushは取り消せないため、
  // textareaからボタン1つでお客様に届く導線にはしない。
  const [confirming, setConfirming] = useState(false);
  const text = answer.trim();

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="answer" value={text} />
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          readOnly={confirming}
          rows={3}
          placeholder="お客様への回答を入力"
          className="rounded-lg border border-[#E5E3DF] bg-white p-2.5 text-sm leading-6 outline-none focus:border-[#3A7D6E] read-only:bg-[#F2F1EE] read-only:text-[#6B6B6B]"
        />

        {confirming ? (
          <div className="rounded-lg border border-[#EEDCC6] bg-[#FBEFE3] p-3.5">
            <p className="text-xs font-medium text-[#9A6234]">
              この内容をLINEへ送信します。送信後は取り消せません。
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-white p-2.5 text-sm leading-6">
              {text}
            </p>
            <div className="mt-3 flex gap-2">
              <SubmitButton />
              <BackButton onClick={() => setConfirming(false)} />
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={text.length === 0}
              onClick={() => setConfirming(true)}
              className="rounded-full bg-[#3A7D6E] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              送信内容を確認
            </button>
          </div>
        )}
      </form>

      {!confirming && (
        <form action={ignoreQuestion}>
          <input type="hidden" name="id" value={id} />
          <IgnoreButton />
        </form>
      )}

      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-[#FBE9E6] px-3 py-2 text-xs leading-5 text-[#9A4A3F]"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  // pending中はボタン自体を無効化する。確認画面を挟んでも、
  // 反応が無いと思って連打されると同じ送信が飛ぶ。
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[#9A6234] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "送信中…" : "LINEへ送信する"}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-full border border-[#E0C9AC] bg-white px-4 py-2 text-sm text-[#9A6234] disabled:opacity-60"
    >
      書き直す
    </button>
  );
}

function IgnoreButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-[#E5E3DF] bg-white px-4 py-2 text-sm text-[#6B6B6B] transition-colors hover:border-[#3A7D6E] disabled:opacity-60"
    >
      {pending ? "処理中…" : "回答せずに閉じる"}
    </button>
  );
}
