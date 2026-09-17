import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";
import { EMBEDDING_MODEL, REPLY_MODEL } from "./config";

/**
 * モデルの解決を1箇所に集約する。
 *
 * 環境変数に各社の API キーがあれば provider を直接呼び、
 * 無ければモデルID文字列を返して Vercel AI Gateway 経由にフォールバックする。
 * Gateway はクレジットカード未登録だと 403 を返すため、ローカル開発では直接呼びを使う。
 */

/**
 * 空文字や空白だけの環境変数は「未設定」として扱う。
 * dotenv も Next.js も既存の process.env を上書きしないため、
 * シェル側に空の API キーが定義されていると .env.local の値が読まれない。
 * その状態で空文字を鍵として provider に渡すと原因の分かりにくい認証エラーになるので、
 * ここで正規化して Gateway フォールバックへ倒す。
 */
function readKey(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getEmbeddingModel(): EmbeddingModel | string {
  const apiKey = readKey("OPENAI_API_KEY");
  if (apiKey) {
    return createOpenAI({ apiKey }).textEmbeddingModel(EMBEDDING_MODEL.direct);
  }
  return EMBEDDING_MODEL.gateway;
}

export function getReplyModel(): LanguageModel {
  const apiKey = readKey("ANTHROPIC_API_KEY");
  if (apiKey) {
    return createAnthropic({ apiKey })(REPLY_MODEL.direct);
  }
  return REPLY_MODEL.gateway;
}
