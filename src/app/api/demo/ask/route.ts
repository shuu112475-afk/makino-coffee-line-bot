import { NextRequest, NextResponse } from "next/server";
import { answerQuestion, findFaqCandidates } from "@/lib/faq";
import { FALLBACK_REPLY_TEXT, FAQ_RECALL_THRESHOLD } from "@/lib/config";

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
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 },
    );
  }
  if (question.length > 200) {
    return NextResponse.json(
      { error: "質問は200文字以内で入力してください" },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const [result, candidates] = await Promise.all([
    answerQuestion(question),
    findFaqCandidates(question),
  ]);

  const topCandidate = candidates[0]
    ? {
        category: candidates[0].category,
        question: candidates[0].question,
        similarity: Number(candidates[0].similarity.toFixed(3)),
      }
    : null;

  if (result.status === "escalated") {
    return NextResponse.json({
      status: "escalated",
      reason: result.reason,
      reply: FALLBACK_REPLY_TEXT,
      recallThreshold: FAQ_RECALL_THRESHOLD,
      topCandidate,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json({
    status: "answered",
    reply: result.reply,
    recallThreshold: FAQ_RECALL_THRESHOLD,
    topCandidate,
    usedFaq: {
      category: result.usedFaq.category,
      question: result.usedFaq.question,
      similarity: Number(result.usedFaq.similarity.toFixed(3)),
    },
    elapsedMs: Date.now() - startedAt,
  });
}
