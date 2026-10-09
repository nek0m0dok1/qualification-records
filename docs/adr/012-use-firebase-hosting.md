# ADR-012：公開先にFirebase Hostingを採用する

- 日付：2026-10-09
- 状態：採用
- ファイル名：012-use-firebase-hosting.md

## 背景

Vue 3・TypeScript・Viteで開発した資格管理アプリを、コンテスト審査員と一般利用者がアクセスできる状態で公開する。

認証にはFirebase Authentication、正式な記録の保存にはCloud Firestoreを採用済みである。運用費を抑え、約1か月の制作期間で公開まで完成させる必要がある。

## 決定

公開先にFirebase Hostingを採用する。

- 初期運用はSparkプランの無料枠を利用する。
- 初期公開にはFirebase提供の標準URLを使用する。
- 独自ドメインの取得は保留する。取得手続き・購入・接続設定は行わない。将来必要になった場合に、改めて判断する。
- 公開を終了する場合は、Hostingの配信を停止する。Firestoreの記録や認証アカウントの削除は別の判断とする。

## 比較した候補と理由

- Firebase Hosting：認証・DB・公開先を同じFirebaseプロジェクトで管理できる。
- Vercel：Vue 3＋Viteの公開に対応し、Git連携による更新を始めやすいが、管理先が増える。

管理のしやすさを重視し、Firebase Hostingを採用する。

## 影響と制約

- Viteのビルド成果物をFirebase Hostingへ公開する。
- 無料枠の保存容量と転送量を確認しながら運用する。
- Firebase Hostingの採用だけでは、オフライン対応は実現しない。画面を端末へ保存する仕組みを別途用意する。
- 公開URLが変わる場合、新しいURLで再ログインとデータ取得が必要になる。
- 将来のドメイン接続だけを理由に、Firestore上の資格データを移行する必要はない。

GitHub Actionsで型チェック・単体テスト・Rulesテスト・ビルドを実行し、成功時だけmainの成果物を公開する。必要なプロジェクト変数とデプロイ用Secretが未設定なら公開をスキップする。Service WorkerはADR-014のvite-plugin-pwa generateSW方式を使用する。

## 参考資料

- [Firebase Hosting概要](https://firebase.google.com/docs/hosting/)
- [公開手順](https://firebase.google.com/docs/hosting/quickstart)
- [料金・制限](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [独自ドメインの接続](https://firebase.google.com/docs/hosting/custom-domain)
