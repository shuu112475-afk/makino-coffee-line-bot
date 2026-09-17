export const STORE_NAME = "まきの珈琲";

// 誤answerを2段階で止める。
//
// 1段目（この閾値）: 明らかに無関係な質問を落とすためだけの粗いフィルタ。
//   実測では正当な言い換えが 0.36〜0.70 に散る一方、
//   「店長の自宅の住所を教えて」のような答えてはいけない質問が 0.55 に来る。
//   つまり類似度だけでは両者を分離できないので、ここは低めに置いて再現率を取り、
//   判定は2段目に委ねる。
// 2段目: 取得したFAQで実際に答えられるかをLLMに宣言させる（src/lib/faq.ts）。
export const FAQ_RECALL_THRESHOLD = 0.3;

// LLMに渡す候補FAQの件数
export const FAQ_TOP_K = 3;

export const FALLBACK_REPLY_TEXT =
  "確認して担当者からご連絡いたします。少々お待ちください。";

// direct: 各社 API を直接叩くときのモデルID
// gateway: Vercel AI Gateway 経由で呼ぶときのモデルID
// どちらを使うかは src/lib/models.ts が環境変数を見て決める
export const EMBEDDING_MODEL = {
  direct: "text-embedding-3-small",
  gateway: "openai/text-embedding-3-small",
} as const;

export const REPLY_MODEL = {
  direct: "claude-haiku-4-5",
  gateway: "anthropic/claude-haiku-4.5",
} as const;
