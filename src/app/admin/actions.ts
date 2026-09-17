"use server";

import { revalidatePath } from "next/cache";
import { messagingApi } from "@line/bot-sdk";
import { getDb } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

/** 失敗したときだけ値が入る。成功時は行が一覧から消えるため表示するものがない。 */
export type ActionState = { error: string } | null;

export type FaqState = { error: string } | { ok: string } | null;

export async function answerQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  if (!id || !answer) return { error: "回答が空です。" };

  const sql = getDb();

  // 「先に行を確保してから送る」順序にしている。
  // 送信してから status を更新すると、連打や複数人の同時対応で
  // 両方が pending を読んでしまい、お客様に同じ文面が2通届く。
  // status = 'pending' を条件に付けた UPDATE は1つしか成功しないため、
  // 2件目以降はここで0行になって止まる。
  const claimed = await sql<{ line_user_id: string }[]>`
    update unresolved_queue
    set status = 'answered', staff_answer = ${answer}, resolved_at = now()
    where id = ${id} and status = 'pending'
    returning line_user_id
  `;
  const row = claimed[0];
  if (!row) {
    revalidatePath("/admin");
    return {
      error: "この質問はすでに対応済みです。画面を再読み込みしてください。",
    };
  }

  try {
    const client = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    });
    await client.pushMessage({
      to: row.line_user_id,
      messages: [{ type: "text", text: answer }],
    });
  } catch (error) {
    // 送信できていないので確保を取り消し、未対応のまま残す。
    // ここで解決済みにしたままにすると、お客様に届かないまま画面から消える。
    console.error("[admin] LINEへの送信に失敗しました:", error);
    await sql`
      update unresolved_queue
      set status = 'pending', staff_answer = null, resolved_at = null
      where id = ${id}
    `;
    revalidatePath("/admin");
    return {
      error:
        "LINEへの送信に失敗しました。未対応のまま残していますので、時間をおいて再送してください。",
    };
  }

  revalidatePath("/admin");
  return null;
}

export async function ignoreQuestion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const sql = getDb();
  await sql`
    update unresolved_queue
    set status = 'ignored', resolved_at = now()
    where id = ${id} and status = 'pending'
  `;

  revalidatePath("/admin");
}

/**
 * 未対応をFAQに反映して、次回から自動で答えられるようにする。
 *
 * 管理画面の目的は「今回の1件に返信すること」だけではない。
 * 同じ質問が来るたびに人が返していては自動応答の意味が無いので、
 * 対応した担当者がその場でFAQを直せる導線をここに置いている。
 *
 * 埋め込みはFAQの question から作る（シードと同じ）。
 * 検索側も質問文を埋め込んで比較しているため、揃えないと類似度がずれる。
 */
export async function saveFaq(
  _prev: FaqState,
  formData: FormData,
): Promise<FaqState> {
  const faqId = String(formData.get("faqId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();

  if (!category || !question || !answer) {
    return { error: "カテゴリ・想定質問・回答をすべて入力してください。" };
  }

  try {
    const vector = toVectorLiteral(await embedText(question));
    const sql = getDb();

    if (faqId) {
      // 既存FAQの書き換え。question を変えた場合も埋め込みを作り直す。
      const updated = await sql<{ id: string }[]>`
        update faq_entries
        set category = ${category},
            question = ${question},
            answer = ${answer},
            embedding = ${vector}::vector,
            updated_at = now()
        where id = ${faqId}
        returning id
      `;
      if (updated.length === 0) {
        return { error: "対象のFAQが見つかりませんでした。" };
      }
    } else {
      // question に一意制約があるため、同じ想定質問を二重登録しない。
      await sql`
        insert into faq_entries (category, question, answer, embedding)
        values (${category}, ${question}, ${answer}, ${vector}::vector)
        on conflict (question) do update set
          category = excluded.category,
          answer = excluded.answer,
          embedding = excluded.embedding,
          updated_at = now()
      `;
    }
  } catch (error) {
    console.error("[admin] FAQの保存に失敗しました:", error);
    return {
      error: "FAQの保存に失敗しました。時間をおいてもう一度お試しください。",
    };
  }

  revalidatePath("/admin");
  // デモ画面がFAQ一覧を表示しているため、そちらも更新する
  revalidatePath("/");

  return {
    ok: faqId
      ? "FAQを更新しました。次回からは自動で答えられます。"
      : "FAQを追加しました。次回からは自動で答えられます。",
  };
}
