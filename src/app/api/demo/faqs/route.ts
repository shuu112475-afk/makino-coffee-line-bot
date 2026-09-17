import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * デモ画面に「Botが知っている範囲」を明示するための一覧。
 * 何を知っているかを先に見せておかないと、
 * 答えられなかったときにそれが正しい動作なのか単なる不具合なのか区別できない。
 */
export async function GET() {
  const sql = getDb();
  const rows = await sql<{ category: string; question: string }[]>`
    select category, question from faq_entries order by category
  `;
  return NextResponse.json({ faqs: rows });
}
