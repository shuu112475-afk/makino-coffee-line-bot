import postgres from "postgres";
import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// OPENAI_API_KEY があれば OpenAI を直接、無ければ Vercel AI Gateway 経由。
// （src/lib/models.ts と同じ方針。こちらは .mjs なので TS を import できず手書き）
const EMBEDDING_MODEL = process.env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).textEmbeddingModel(
      "text-embedding-3-small",
    )
  : "openai/text-embedding-3-small";

const faqs = [
  {
    category: "営業時間",
    question: "営業時間を教えてください",
    answer:
      "営業時間は平日 8:00〜19:00、土日祝 9:00〜19:00です。ラストオーダーは閉店の30分前となります。",
  },
  {
    category: "場所",
    question: "お店の場所はどこですか",
    answer:
      "〇〇駅から徒歩5分の場所にございます。詳しい地図はLINE公式アカウントのプロフィールからご確認いただけます。",
  },
  {
    category: "駐車場",
    question: "駐車場はありますか",
    answer:
      "店舗専用駐車場を3台分ご用意しております。満車の場合は近隣のコインパーキングをご利用ください。",
  },
  {
    category: "Wi-Fi",
    question: "Wi-Fiは使えますか",
    answer:
      "フリーWi-Fiをご用意しております。パスワードは店内のPOPまたはレシートに記載しております。",
  },
  {
    category: "電源",
    question: "電源は使えますか",
    answer:
      "カウンター席と一部のテーブル席に電源コンセントをご用意しております。",
  },
  {
    category: "テイクアウト",
    question: "テイクアウトはできますか",
    answer:
      "ドリンク・フードともにテイクアウト可能です。店頭でのご注文のほか、LINEでの事前注文にも対応しております。",
  },
  {
    category: "アレルギー対応",
    question: "アレルギー対応はしていますか",
    answer:
      "乳・卵・小麦を含むメニューがございます。詳細なアレルギー表はスタッフにお申し付けいただければご案内いたします。完全除去のご対応は店舗の設備上できかねる場合がございます。",
  },
  {
    category: "ペット可否",
    question: "ペットを連れて入店できますか",
    answer:
      "テラス席に限り、リードを付けた小型犬とご一緒にご入店いただけます。店内席へのペットの同伴はご遠慮いただいております。",
  },
];

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) {
  console.error(
    "POSTGRES_URL が見つかりません。`vercel env pull .env.local` を実行してください。",
  );
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

for (const faq of faqs) {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: faq.question,
  });
  const vector = `[${embedding.join(",")}]`;
  await sql`
    insert into faq_entries (category, question, answer, embedding)
    values (${faq.category}, ${faq.question}, ${faq.answer}, ${vector}::vector)
    on conflict (question) do update set
      category = excluded.category,
      answer = excluded.answer,
      embedding = excluded.embedding,
      updated_at = now()
  `;
  console.log(`登録: [${faq.category}] ${faq.question}`);
}

console.log(`完了: ${faqs.length}件のFAQを登録しました。`);
await sql.end();
