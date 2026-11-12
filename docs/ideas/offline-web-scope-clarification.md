---
name: Offline web scope clarification
discription: Records the user's clarification that ordinary web offline reading and search remain in the initial release while install-like distribution is deferred.
---

# Offline web scope clarification

> Status: user-confirmed scope clarification. Date: 2026-11-12. Scope: initial release of offline use in ordinary browsers. This note records the clarification and does not amend an ADR.

## Clarified decision

The initial release retains offline viewing and search in the ordinary web application for records already fetched. Home-screen installation and native-style distribution remain deferred.

## Context and rationale

The user initially understood PWA as native-like app presentation and said: 「pwaってネイティブっぽく見せるやつのことだよね？pwaは初期実装ではいらないよ」. After the assistant explained that PWA also enables offline use in a browser without installation, the user clarified: 「ほう、Web上でpwaを動かすパターンもあるのか、オフライン閲覧は欲しい」. This records an initial misunderstanding followed by an explicit request to retain offline viewing; it was not a decision to postpone that capability because tests were pending. This scope also matches the purpose of adopted [ADR-014](../adr/014-use-vite-plugin-pwa.md), which keeps the app shell in the Service Worker and record data in Firestore's persistent cache.

## Impact and current evidence

Keep the offline requirement in the initial release and preserve ADR-014. The targeted offline browser scenario passed after shortening the persistent test profile; this is evidence for that scenario only. Other PWA scenarios, the update prompt, suppression of forced reload while entering data, input retention, OS-level storage denial, and Edge/Android real-device use remain unverified. See [implementation status](../implementation-status.md) and [PWA/cache verification](../../verification/pwa-cache.md).
