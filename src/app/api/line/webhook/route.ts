import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getDb } from "@/lib/db";
import { answerQuestion } from "@/lib/faq";
import { FALLBACK_REPLY_TEXT } from "@/lib/config";

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const signature = req.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (
    !channelSecret ||
    !signature ||
    !validateSignature(bodyText, channelSecret, signature)
  ) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(bodyText) as webhook.CallbackRequest;

  for (const event of body.events) {
    after(() => handleEvent(event));
  }

  return NextResponse.json({}, { status: 200 });
}

async function handleEvent(event: webhook.Event) {
  const sql = getDb();

  // LINEの再送に備え、同じイベントIDは一度しか処理しない
  const inserted = await sql`
    insert into line_events (event_id) values (${event.webhookEventId})
    on conflict (event_id) do nothing
    returning event_id
  `;
  if (inserted.length === 0) return;

  if (event.type !== "message" || event.message.type !== "text") return;
  if (event.source?.type !== "user" || !event.source.userId) return;

  const userId = event.source.userId;
  const question = event.message.text;
  const replyToken = event.replyToken;

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  const conversationId = await getOrCreateConversationId(userId);

  await sql`
    insert into messages (conversation_id, role, content)
    values (${conversationId}, 'user', ${question})
  `;

  const result = await answerQuestion(question);

  if (result.status === "answered") {
    if (replyToken) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: result.reply }],
      });
    }
    await sql`
      insert into messages (conversation_id, role, content, matched_faq_id, confidence)
      values (${conversationId}, 'bot', ${result.reply}, ${result.usedFaq.id}, ${result.usedFaq.similarity})
    `;
    return;
  }

  if (replyToken) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: FALLBACK_REPLY_TEXT }],
    });
  }
  await sql`
    insert into messages (conversation_id, role, content)
    values (${conversationId}, 'bot', ${FALLBACK_REPLY_TEXT})
  `;
  await sql`
    insert into unresolved_queue (line_user_id, question, reason)
    values (${userId}, ${question}, ${result.reason})
  `;
}

async function getOrCreateConversationId(lineUserId: string): Promise<string> {
  const sql = getDb();
  const existing = await sql<{ id: string }[]>`
    select id from conversations
    where line_user_id = ${lineUserId}
    order by created_at desc
    limit 1
  `;
  if (existing.length > 0) return existing[0].id;

  const created = await sql<{ id: string }[]>`
    insert into conversations (line_user_id) values (${lineUserId})
    returning id
  `;
  return created[0].id;
}
