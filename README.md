# 資格ノート

資格と取得年月、受験履歴を記録するVue 3・TypeScriptアプリです。認証とクラウド保存にFirebaseを使用し、利用者が選択した場合はFirestoreの永続キャッシュで取得済みの記録をオフライン閲覧できます。

## 必要な環境

- Node.js 24
- Firebaseプロジェクト（Email/Password Authentication、Firestore Standard、Hosting）
- Security Rulesの検証にはJava 21とFirebase Emulator Suite

## ローカル起動

1. `.env.example` を `.env` にコピーし、Firebase Web Appの設定値を入力します。
2. `npm ci` を実行します。
3. `npm run dev` で `http://127.0.0.1:5173` を開きます。

Firebaseプロジェクト未設定ではアプリの案内画面を表示します。Firebase関連のAPIキーはブラウザー公開用です。Firebase Security Rulesで利用者の権限を保護してください。秘密鍵・サービスアカウント情報は `.env` に置いたり公開したりしないでください。

## エミュレーター

Java 21を用意し、`.env` に `VITE_USE_EMULATORS=true` を設定して `npm run emulators` を起動します。ローカルの動作確認にはFirebase Emulatorのテスト用アカウントを使用します。実プロジェクトへテストデータを書き込まないでください。

## 検証・ビルド

- `npm test`：ドメイン処理・JSON検証の単体テスト
- `npm run test:rules`：Security RulesのFirebase Emulatorテスト
- `npm run test:e2e`：Chromiumの主要操作テスト
- `npm run check`：型チェック・単体テスト・本番ビルド
- `npm run build`：Hosting向け成果物を `dist/` に生成

公開用のGitHub Actionsはmainへの更新時に検証後、必要なFirebase project変数とサービスアカウントSecretが設定済みの場合だけFirebase Hostingへ公開します。Firestore Rulesの適用はHosting公開と分けて管理します。

## 保存とプライバシー

正式な保存先はCloud Firestoreです。初回登録では確認メールのリンクを開いてメールアドレスを確認し、以後はメールアドレスとパスワードでログインします。本人の記録だけをSecurity Rulesで読み書きできるようにします。

「この端末に記録を保存する」を選ぶと、取得済みデータをFirestore SDKの永続キャッシュに保存します。オフラインでは閲覧・検索だけを利用できます。キャッシュはバックアップではなく、ブラウザーのデータ消去などで失われる場合があります。ログアウト時に削除します。JSONバックアップは利用者の端末に保存されるため、共有端末では適切に管理してください。

JSONの全置換では新しいFirestoreデータセットへ準備・検証してから有効領域を切り替えます。切り替えに使う一時領域は恒久バックアップではありません。別途Firebaseの追加バックアップは提供しません。

## 作業方針

ユーザーに指定されたプロジェクトディレクトリ内だけで編集します。独立した並行作業には `.worktrees/` 以下のgit worktreeと専用ブランチを使い、変更を確認してからmainへ統合します。worktreeの内容はプロジェクトディレクトリ外へ移さないでください。

審査スライドはユーザーが作成します。Codexはスライドを生成しません。
