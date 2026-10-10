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

## Firebaseの新規接続

1. [Firebase管理画面](https://console.firebase.google.com/)でプロジェクトを作成します。Sparkプランを使用し、Google Analyticsは無効にします。プロジェクトIDを控えてください。
2. Webアプリを登録し、表示されるFirebase設定から次の値を `.env` に設定します。

   | Firebase設定 | 環境変数 |
   | --- | --- |
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

3. Authenticationのログイン方法で「メール / パスワード」を有効にします。メールリンク認証は使用しません。メール確認テンプレートを確認し、設定の承認済みドメインにはローカル接続先の `localhost` と `127.0.0.1` を追加します（プロトコル・ポートは含めません）。
4. Cloud FirestoreをStandard版、データベースID `(default)`、東京 `asia-northeast1`、本番モードで作成します。作成後に同じデータベースの地域は変更できません。
5. プロジェクトルートで次のコマンドを実行します。`YOUR_PROJECT_ID` は作成した実際のIDに置き換えてください。ログインはご自身のGoogleアカウントで行います。

   ```powershell
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest projects:list
   npx -y firebase-tools@latest deploy --only firestore --project YOUR_PROJECT_ID
   ```

   既存のルールとインデックスを適用します。ルールテストを先に実行し、対象プロジェクトを確認してから適用してください。Hostingの公開はこのコマンドに含まれません。

6. `.env` の `VITE_USE_EMULATORS=false` を確認し、開発サーバーを起動（起動済みなら再起動）します。
7. 自分のメールアドレスで新規登録し、確認メールのリンクを開いてから「メール確認の完了を確認」を押します。動作確認用の記録を登録し、再読み込み・編集・削除が反映されることを確認します。メール未確認の利用者は既存のルールで保存を拒否されます。

設定値不足は `.env` と再起動、`auth/operation-not-allowed` は認証方法、`permission-denied` はメール確認とルール適用先を確認してください。秘密鍵・Googleログイン情報・アプリのパスワードは共有しないでください。

CLIが `Cannot find module` で起動できない場合は、既存のnpmキャッシュの欠損が考えられます。上記コマンドの先頭を `npx --cache .runtime/npm-cache -y firebase-tools@latest` に置き換え、別のキャッシュで取得してください。`.runtime/` はGit管理対象外です。

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
