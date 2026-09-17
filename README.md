# まきの珈琲 LINE Bot（架空店舗デモ）

LINE公式アカウントの自動応答をFAQベクトル検索 + Claude Haikuで実装したポートフォリオ用デモです。確信が持てない質問には答えず、未対応キューに積んで担当者が個別に返信します。

## 構成

- **Next.js (App Router) / Vercel Functions** — Webhook受信・管理画面
- **Supabase (Postgres + pgvector)** — FAQ埋め込み、会話ログ、未対応キュー
- **Vercel AI Gateway** — 埋め込み (`openai/text-embedding-3-small`) と応答生成 (`anthropic/claude-haiku-4.5`)
- **LINE Messaging API** (`@line/bot-sdk`)

設計の詳細（DBスキーマ・Webhookフロー・しきい値判定の考え方）は会話ログを参照してください。

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. AI Gateway のクレジットカード登録

FAQの埋め込み生成・応答生成は Vercel AI Gateway 経由で行うため、**カード登録なしではAPIが403で拒否されます**（無料枠内でも登録自体が必須）。

1. https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fai%3Fmodal%3Dadd-credit-card を開く
2. チーム（`shuu112475-7099s-projects`）を選択した状態でカード情報を入力し保存
3. 登録できたら、下記コマンドで動作確認:
   ```bash
   npx dotenv -e .env.local -- node scripts/seed-faq.mjs
   ```
   `GatewayInternalServerError: ... customer_verification_required` が出なければ成功です

### 3. LINEチャネルの作成とキー取得

1. [LINE Developers コンソール](https://developers.line.biz/console/) にLINEアカウントでログイン
2. プロバイダーが無ければ「新規プロバイダー作成」（例: 個人名やポートフォリオ用の名前）
3. そのプロバイダー内で「チャネルを作成」→ **Messaging API** を選択
4. チャネル名（例: まきの珈琲）、業種などを入力して作成
   - 業種は「飲食」系を選択すれば審査で問題になりにくいです
5. 作成したチャネルの管理画面で以下を取得:
   - **チャネル基本設定** タブ → `Channel secret` をコピー → `LINE_CHANNEL_SECRET`
   - **Messaging API設定** タブ → `チャネルアクセストークン（長期）` の発行ボタン → `LINE_CHANNEL_ACCESS_TOKEN`
6. 同じ **Messaging API設定** タブで:
   - 「応答メッセージ」をOFF、「Webhookの利用」をONにする（自動応答と競合するため）
   - QRコードから自分のLINEに友だち追加しておくと、あとで動作確認しやすいです

### 4. 環境変数をまとめて反映

`.env.local` の該当行を埋めます（`LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` はすでに空行を用意済み）。`ADMIN_USER` / `ADMIN_PASS` もデフォルト値（`admin` / `change-me`）から変更してください。

本番デプロイ前に、同じ値を Vercel 側にも登録します:

```bash
vercel env add LINE_CHANNEL_SECRET production
vercel env add LINE_CHANNEL_ACCESS_TOKEN production
vercel env add ADMIN_USER production
vercel env add ADMIN_PASS production
```

（Preview環境にも使う場合は `production` を `preview` に変えて同様に実行、もしくは両方登録）

### 5. DBマイグレーション & FAQシード

```bash
npx dotenv -e .env.local -- node scripts/migrate.mjs
npx dotenv -e .env.local -- node scripts/seed-faq.mjs
```

`supabase/migrations/` にスキーマを追加したら、同じ `migrate.mjs` で再適用できます。

### 6. デプロイ & LINE Webhook設定

Webhookは公開URLが必要なので、先にデプロイします。

```bash
vercel deploy --prod
```

デプロイ後、LINE Developers コンソールの **Messaging API設定** タブで Webhook URL に `https://<デプロイ先ドメイン>/api/line/webhook` を設定し、「検証」ボタンで200が返ることを確認してください。

### 7. 動作確認

1. 手順3でQRコードから友だち追加した自分のLINEアカウントから、Botにメッセージを送る
   - 例:「営業時間を教えてください」→ FAQに基づく自動返信が来ればOK
   - 例:「猫は飼えますか」など想定外の質問 → 固定の「確認してご連絡します」が返り、`/admin` の未対応キューに積まれることを確認
2. `/admin`（Basic認証: `ADMIN_USER`/`ADMIN_PASS`）を開き、未対応の質問に回答して送信 → LINEにpushで届くか確認

### 8. ローカル起動（開発用）

```bash
npm run dev
```

`/admin` は Basic認証で保護されています。

## 実装のポイント

- **即座に200を返す**: 署名検証・重複チェックのみ同期実行し、実際の応答処理は `next/server` の `after()` で非同期化しています（`src/app/api/line/webhook/route.ts`）。
- **署名検証**: `X-Line-Signature` を `@line/bot-sdk` の `validateSignature` でチャネルシークレット検証しています。
- **重複排除**: `webhookEventId` を `line_events` テーブルに一意制約でINSERTし、再送分は処理をスキップします。
- **答えられないときは答えない**: FAQ埋め込みとのコサイン類似度が `FAQ_MATCH_THRESHOLD`（`src/lib/config.ts`）未満の場合は固定文言で返信し、`unresolved_queue` に積みます。生成AIはFAQ回答の言い回し整形にのみ使用し、自由生成はさせません。

## コード変更後の再デプロイ

```bash
vercel deploy        # プレビュー環境
vercel deploy --prod # 本番環境
```
