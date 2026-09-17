"use server";

import { revalidatePath } from "next/cache";
import { messagingApi } from "@line/bot-sdk";
import { getDb } from "@/lib/db";

export async function answerQuestion(formData: FormData) {
  const id = String(formData.get("id"));
  const answer = String(formData.get("answer") ?? "").trim();
  if (!id || !answer) return;

  const sql = getDb();
  const rows = await sql<{ line_user_id: string }[]>`
    select line_user_id from unresolved_queue where id = ${id} and status = 'pending'
  `;
  const row = rows[0];
  if (!row) return;

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });
  await client.pushMessage({
    to: row.line_user_id,
    messages: [{ type: "text", text: answer }],
  });

  await sql`
    update unresolved_queue
    set status = 'answered', staff_answer = ${answer}, resolved_at = now()
    where id = ${id}
  `;

  revalidatePath("/admin");
}

export async function ignoreQuestion(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) return;

  const sql = getDb();
  await sql`
    update unresolved_queue
    set status = 'ignored', resolved_at = now()
    where id = ${id} and status = 'pending'
  `;

  revalidatePath("/admin");
}
