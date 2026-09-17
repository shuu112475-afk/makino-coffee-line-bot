import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/faq";
import { FALLBACK_REPLY_TEXT, FAQ_RECALL_THRESHOLD } from "@/lib/config";
import { checkWebGate } from "@/lib/rate-limit";

/**
 * ポートフォリオ用のお試しエンドポイント。
 * LINE Webhook と同じ判定ロジック（ベクトル検索 → LLMによる根拠判定 → 生成）を通すが、
 * 会話ログや未対応キューへの書き込みは行わない。
 * 候補FAQの類似度と escalate 理由をそのまま返すことで、
 * 「答えられないときは答えない」挙動を画面上で確認できるようにしている。
 */
export async function POST(req: NextRequest) {
  let question: string;
  try {
    const body = await req.json();
    question = String(body?.question ?? "").trim();
  } catch {
    return NextResponse.json(
      { error: "リクエストが不正です" },
      { status: 400 },
    );
  }

  if (!question) {
    return NextResponse.json(
      { error: "質問を入力してください" },
      { status: 400 },
    );
  }
  if (question.length > 200) {
    return NextResponse.json(
      { error: "質問は200文字以内で入力してください" },
      { status: 400 },
    );
  }

  // LLMを呼ぶ前に制限を確認する（超過分に課金を発生させない）
  const limit = await checkWebGate(req);
  if (!limit.allowed) {
    const error =
      limit.reason === "daily_budget"
        ? "本日のデモ利用上限に達しました。恐れ入りますが、明日以降にお試しください。"
        : `お試し回数の上限に達しました。${limit.retryAfterSeconds}秒ほどお待ちください。`;
    return NextResponse.json(
      { error },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const startedAt = Date.now();
  const result = await answerQuestion(question);
  const elapsedMs = Date.now() - startedAt;

  const topCandidate = result.candidates[0]
    ? {
        category: result.candidates[0].category,
        question: result.candidates[0].question,
        similarity: Number(result.candidates[0].similarity.toFixed(3)),
      }
    : null;

  const common = {
    recallThreshold: FAQ_RECALL_THRESHOLD,
    topCandidate,
    elapsedMs,
    remaining: limit.remaining,
  };

  if (result.status === "escalated") {
    return NextResponse.json({
      ...common,
      status: "escalated",
      reason: result.reason,
      reply: FALLBACK_REPLY_TEXT,
    });
  }

  return NextResponse.json({
    ...common,
    status: "answered",
    reply: result.reply,
    usedFaq: {
      category: result.usedFaq.category,
      question: result.usedFaq.question,
      similarity: Number(result.usedFaq.similarity.toFixed(3)),
    },
  });
}
