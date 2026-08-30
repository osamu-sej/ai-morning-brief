# AI Morning Brief

無料で、前日のAI関連情報を収集・整理し、通常のChromeにあるGemini Notebookへ記事ごとに追加して音声解説を生成するmacOS向けツールです。認証情報や有料APIは使いません。

## 現在の実装範囲

- 対象日ごとのローカル保存領域と設定の初期化
- Xスクリーンショットと投稿URLの受け入れ
- macOS Vision OCRヘルパー（ローカル実行）
- 手動投入した記事テキストの取り込み
- 無料の公開ソース収集（GitHub公開検索、Hacker News公開検索、Google News RSS）
- Ollama上の`gemma4:12b-mlx`による上位5件の日本語要約・分類（利用不可時はルールベースへ縮退）
- 記事ごとのMarkdownと日次Markdownの生成
- macOSの`launchd`による毎朝5時の自動実行
- Chrome拡張機能による、新規Gemini Notebook作成・記事ごとのテキスト追加・音声解説生成リクエスト
- ローカルブリッジの常時起動（`127.0.0.1`のみ）
- 実行環境診断とドライラン

Xをツールが自動巡回・撮影する機能は含めません。利用者が保存した画像を補助入力にします。公開収集はログイン不要の公開エンドポイントだけを利用し、APIキー・Cookie・アカウント情報は扱いません。

## クイックスタート

```bash
cd /Users/osamu/Documents/Codex/2026-08-26/new-chat/ai-morning-brief
npm run setup
npm run build:ocr
npm run doctor
```

X投稿を追加する例です。

```bash
npm run amb -- add-x \
  --image /absolute/path/to/x-post.png \
  --url https://x.com/example/status/123456789 \
  --date 2026-08-25
```

記事本文を手動で入れる場合は、`runtime/inbox/articles/YYYY-MM-DD/`へUTF-8の`.md`または`.txt`ファイルを保存します。毎日の実行では公開ソースを自動収集し、X画像・手動記事は追加候補として併用します。

Gemini Notebookを操作しないドライランは次の通りです。

```bash
 npm run amb -- run --date 2026-08-25 --dry-run
```

公開収集を使わずローカル入力だけを検証する場合は、`--no-collect`を付けます。Gemmaを使わずに速度優先で確認する場合は、`--no-local-ai`を付けます。

生成物は`runtime/processed/YYYY-MM-DD/selected/`および`runtime/daily/YYYY-MM-DD/`へ保存されます。

## 毎朝の自動実行

次のコマンドで、毎日05:00に前日分を処理するmacOSの`launchd`定義を作成・登録します。

```bash
npm run amb -- schedule install --hour 5 --minute 0
```

実行ログは`runtime/logs/launchd.out.log`と`runtime/logs/launchd.err.log`に残り、処理後にはmacOS通知を表示します。解除する場合は次を実行します。

```bash
npm run amb -- schedule uninstall
```

## Gemini Notebookの自動処理

`extension/`をChromeの「パッケージ化されていない拡張機能を読み込む」から登録します。通常のChromeでGemini Notebookへ一度ログインした状態で、拡張機能の「毎朝5:10のNotebook自動投入を有効化」を押してください。

毎朝5:00に`launchd`が前日分を収集・整理し、5:10にChrome拡張機能が新規Notebookを作成します。選定した最大30件を**1記事ずつ別々のテキストソース**として追加後、標準の音声解説生成を依頼します。10分の間隔で、Gemma処理完了前に古い資料を読む競合を防ぎます。Chromeが起動しており、Macがスリープしていないことが実行条件です。音声の完成時間はGemini Notebook側の処理状況に依存します。

拡張機能はログイン情報・Cookieを取得、保存、移植しません。Googleの通常ログイン済みChromeセッションの画面操作のみを使います。

対象日の初期値は日本時間の前日です。境界時刻を含む日付計算は自動テストで検証します。

## ディレクトリ

```text
runtime/
  config/settings.json
  inbox/x/YYYY-MM-DD/
  inbox/articles/YYYY-MM-DD/
  processed/YYYY-MM-DD/selected/
  daily/YYYY-MM-DD/daily_brief_YYYY-MM-DD.md
  state/app.sqlite3              # 将来の状態DB用予約
  browser-profile/               # 専用Chromeプロファイル
  logs/
```
