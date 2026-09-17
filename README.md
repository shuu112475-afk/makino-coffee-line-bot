# まきの珈琲 LINE Bot（架空店舗デモ）

LINE公式アカウントの自動応答をFAQベクトル検索 + Claude Haikuで実装したポートフォリオ用デモです。確信が持てない質問には答えず、未対応キューに積んで担当者が個別に返信します。

## 構成

- **Next.js (App Router) / Vercel Functions** — Webhook受信・管理画面
- **Supabase (Postgres + pgvector)** — FAQ埋め込み、会話ログ、未対応キュー
- **OpenAI `text-embedding-3-small`** — FAQと質問文の埋め込み
- **Anthropic `claude-haiku-4-5`** — 回答可否の判定と返信文の生成
- **LINE Messaging API** (`@line/bot-sdk`)

Web上のデモ画面（`/`）から、LINEと同じ判定処理をその場で試せます。

## 判定の設計

**類似度のしきい値だけで回答可否を決めていません。** 実測すると、しきい値をどこに引いても正しく分離できないためです。

評価用の17件を本番環境で実測すると、両者の類似度の分布はこうなります。

| 質問の種類           | 件数 | 類似度の範囲       |
| -------------------- | ---- | ------------------ |
| 答えるべき質問       | 8    | 0.362 〜 **0.698** |
| 答えてはいけない質問 | 9    | **0.314** 〜 0.709 |

**2つの範囲がほぼ完全に重なっています。** 境界付近を並べると、単一のしきい値が成立しないことがはっきりします。

| 質問                               | 類似度    | あるべき挙動                              |
| ---------------------------------- | --------- | ----------------------------------------- |
| 駐車場は何時から何時まで使えますか | **0.709** | 答えない（FAQには台数しか書かれていない） |
| Wi-Fiありますか                    | **0.698** | 答える                                    |
| 店長の自宅の住所を教えて           | 0.546     | 答えない                                  |
| 車で行っても大丈夫ですか           | **0.362** | 答える                                    |
| ビットコインの価格を教えて         | **0.314** | 答えない                                  |

答えるべき質問とそうでない質問が 0.011 差で隣り合う一方、最も低い 0.314 は答えてはいけない質問です。どこに線を引いても誤答か機会損失のどちらかが必ず出ます。そこで2段階に分けています。

1. **候補の絞り込み** — コサイン類似度 `FAQ_RECALL_THRESHOLD`（0.3）以上の上位3件を取得。ここは再現率優先で、明らかに無関係なものを落とすだけ
2. **回答可否の判定** — 取得した候補で実際に答えられるかをLLMに明示的に宣言させ、`answerable` が false なら返信文を作らせずに担当者へ回す

`npm run eval` で17件の評価ケースを実行できます（答えるべき質問8件 / 答えてはいけない質問9件、現状すべてPASS）。

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. LLMのAPIキー

`.env.local` に以下を設定します。

```
OPENAI_API_KEY=sk-...     # 埋め込み用
ANTHROPIC_API_KEY=sk-...  # 判定・生成用
```

このキーが無い場合は Vercel AI Gateway にフォールバックしますが、**AI Gateway はクレジットカードを登録していないと無料枠内でも403（`customer_verification_required`）を返します**。各社のキーを直接指定するほうが確実です。切り替えは `src/lib/models.ts` に集約しています。

> 補足: `dotenv` も Next.js も既存の環境変数を上書きしません。シェル側に空の `ANTHROPIC_API_KEY` が定義されていると `.env.local` の値が読まれず、原因の分かりにくい認証エラーになります。`echo ${#ANTHROPIC_API_KEY}` が 0 以外を返す場合は `env -u ANTHROPIC_API_KEY npm run dev` で起動してください。

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
vercel env add OPENAI_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add RATE_LIMIT_SALT production   # 任意の長いランダム文字列
vercel env add DAILY_LLM_BUDGET production  # 1日のLLM呼び出し上限（未設定なら300）
```

（Preview環境にも使う場合は `production` を `preview` に変えて同様に実行、もしくは両方登録）

### 5. DBマイグレーション & FAQシード

```bash
npm run db:migrate
npm run db:seed
```

`supabase/migrations/` にスキーマを追加したら `npm run db:migrate` で再適用できます。マイグレーションもシードも冪等なので、何度実行しても構いません。

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
- **答えられないときは答えない**: 上記の2段階判定で答えられないと判断した場合は固定文言で返信し、`unresolved_queue` に理由（`no_candidate` / `no_evidence`）付きで積みます。生成AIはFAQに書かれた内容の言い換えにのみ使用し、自由生成はさせません。
- **障害時も質問を落とさない**: 埋め込み・LLM・DBのいずれかが落ちると、素朴に実装すると `after()` の中で例外が飛んで**返信もキュー登録もされず、お客様の質問が黙って消えます**。「答えられないときは答えずに人へ回す」という前提が異常系で破れてしまうため、`answerQuestion()` は例外を投げず `reason: 'error'` のエスカレーションとして返します。障害中に届いた質問も必ず担当者に残ります。
- **プロンプトインジェクション耐性**: 「これまでの指示を無視して」等の指示文は回答不能な質問として扱うようシステム側で規定しています。評価ケースに2種類含めています。
- **課金額に上限を設ける**: LLMを呼ぶ経路（`/api/demo/ask` とLINE Webhook）は、無制限に叩かれると従量課金がそのまま被害になります。Postgresだけで固定ウィンドウ方式の制限を実装し、**LLMを呼ぶ前に**判定しています（`src/lib/rate-limit.ts`）。IPとLINEユーザーIDは生値を保存せずハッシュ化しています。制限は2層です。

  | 層   | 対象                 | 上限                               | 役割                 |
  | ---- | -------------------- | ---------------------------------- | -------------------- |
  | 個別 | Web=IP / LINE=userId | 8回/分 / 6回/分                    | 1人の連打を止める    |
  | 全体 | Web + LINE 合算      | `DAILY_LLM_BUDGET`（既定300回/日） | 課金額の天井を決める |

  個別制限だけでは「大勢がそれぞれ少しずつ叩く」状況で青天井になるため、金額の上限は全体制限が担います。1リクエストあたり概ね $0.001 なので、既定値では最悪でも月$9で頭打ちです。

  判定順は**個別 → 全体**で、個別制限で弾いたリクエストは全体カウンタを消費しません。逆にすると、連打した1人が全体の枠を食い潰して他の閲覧者が使えなくなります。実測でも、同時12リクエストに対して個別カウンタ12・全体カウンタ8（=実際にLLMを呼んだ回数）となることを確認しています。

- **コネクションプーラー対応**: `POSTGRES_URL` はSupabaseのトランザクションモードのプーラー（6543番）を指すため、postgres.js の `prepare` を無効にしています。有効のままだと同時アクセス時に落ちます。

## コード変更後の再デプロイ

```bash
vercel deploy        # プレビュー環境
vercel deploy --prod # 本番環境
```
