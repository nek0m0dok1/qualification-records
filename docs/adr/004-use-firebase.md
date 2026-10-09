## ADR-004：クラウド保存と認証にFirebaseを採用する

- 日付：2026-10-09
- 状態：採用

### 背景

複数の利用者向けに公開し、運用費をできるだけ抑える必要がある。利用者ごとのデータ分離と、オフラインでの確認・検索にも対応する。

### 決定

- 正式な記録の保存先にCloud Firestoreを採用する。
- 利用者の認証にFirebase Authenticationを採用する。
- Firestore Security Rulesで、本人の記録だけを読み書きできるよう制限する。
- 初期運用は無料のSparkプランを前提とする。

### 比較した候補と理由

- Firebase：無料枠から開始でき、Firestoreの永続キャッシュをオフライン確認の候補にできる。
- Supabase：SQLで資格と受験履歴の関係を扱える一方、無料プランでは低活動による休止と管理者による復旧対応を考慮する必要がある。

費用を抑えた公開運用とオフライン確認との相性を重視し、Firebaseを採用する。

### 影響

- 資格と受験履歴は、Firestoreの文書・コレクションとして設計する。
- 無料枠の容量・読み書き回数を考慮し、不要な取得を避ける。
- 利用制限や通信障害による保存失敗を利用者に伝える。
- 永続キャッシュはバックアップとは区別し、書き出し・復元方法を別途決める。
- 課金プランへの変更は、必要性と費用を確認してから判断する。
- Firebaseの採用によって、ホスティング先まで自動的に確定するものではない。

初期版の認証・キャッシュ・データモデル・検索・復元・ホスティングは各ADRおよびデータ仕様で決定済み。実接続前に対象Firebaseプロジェクト、Firestore Standard版とリージョンを確認する。無料枠を超える場合の課金は別途承認を必要とする。

### 参考資料

- [Firebase料金プラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestoreの無料枠](https://firebase.google.com/docs/firestore/quotas)
- [Firestoreのオフライン対応](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestoreのアクセス制御](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Supabaseの休止・復旧方針](https://supabase.com/docs/guides/platform/free-project-pausing)
