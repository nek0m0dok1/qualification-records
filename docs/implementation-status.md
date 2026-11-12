---
name: Implementation and verification status
discription: Records the latest main implementation snapshot, unmerged work, offline verification, user-confirmed release scope, and remaining checks.
---

# Implementation status

> Updated: 2026-11-12. Scope: observed main revision, current documentation worktree, and supplied verification evidence. Requirements remain in [PRD](PRD.md), the adopted PWA decision in [ADR-014](adr/014-use-vite-plugin-pwa.md), and data rules in [data handling](database/data-handling.md). This status does not imply production deployment.

## Main snapshot and branch state

The latest default-branch commit observed through the GitHub connector is `b17fc1ae72ba3c1456250f3d8b6fa3eb2b7e3379`; local `origin/main` agrees. A direct `git fetch origin main` could not resolve `github.com`, so the remote-tracking ref was not refreshed during this task. GitHub commit search returned `b17fc1a` as latest and confirmed [PR #21](https://github.com/nek0m0dok1/qualification-records/pull/21) is merged. PR #24 (PWA/cache verification) and PR #25 (documentation) were open and unmerged when checked.

PR #21 includes the JSON restore uncertainty safeguards: persisted UID-scoped pending state, explicit server reconciliation, stale-operation fencing, and coordination of restore and ordinary writes. These safeguards are part of main and must not be described as unmerged work.

The current local `docs-current-state` branch now includes the normal merge of PWA verification commit `5a56ebf35e3748c012cf8938d69f1e58e500de54` (merge commit `a940556`). This does not make that commit part of main. The retired-tag change `8037aaf` is also absent from the observed main history.

## User-confirmed initial release scope

The user clarified that ordinary web use must retain offline viewing and search of records already fetched for the initial release. This follows the intent of adopted ADR-014. Home-screen installation and native-style distribution remain deferred; this clarification does not replace ADR-014 or claim that all offline cases have been verified. The decision and its history are recorded in [offline web scope clarification](ideas/offline-web-scope-clarification.md).

## Current PWA verification

The reported run for `5a56ebf` passed one targeted production-mode offline test in 59.1 seconds using desktop Chromium, Firebase Auth/Firestore demo Emulators, the production Service Worker, and the Firebase SDK. It created a record, confirmed Service Worker/cache preparation, relaunched the same persistent profile offline, checked list, detail, and search, and confirmed writes were disabled. This is one successful browser case, not verification across all PWA scenarios or devices; the run details are in [PWA and cache verification](../verification/pwa-cache.md).

The prior timeout was traced to Windows `CacheStorage.open` returning `UnknownError` for a long persistent-profile path. The test now creates its persistent profile in a short `mkdtemp` directory under the OS temp root and reuses that same directory after restart. An earlier short-profile attempt reached detail but failed because a strict locator matched both a list heading and a dialog heading; the locator was scoped to the dialog, and the targeted rerun passed. Keep this failure history distinct from the current successful result.

For commit `5a56ebf`, the implementation report records typecheck, 29 unit tests, lint, production build, task-owned Prettier checks, and diff checks passing. This task did not rerun those checks or the browser. The fresh Sol review found no P1/P2 issues; it recorded one P3 follow-up in `tests/pwa/cache.spec.ts:163-169`: a cleanup `rm` failure with `EPERM`/`EBUSY` could mask the original assertion or launch error. That exception-preservation improvement remains unimplemented; do not characterize the review as having no findings.

## Other evidence and limits

| Area                                                    | Evidence                                                                                                          | Still unverified                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retired fixed tags (`8037aaf`, integrated as `cf3fb13`) | Earlier branch review reported no findings and its branch reported unit 29, one dedicated E2E, and build success. | The change is not in observed main; broader browser coverage is not implied.                                                                                                                                                                                    |
| 100 qualifications / 300 exam attempts                  | REST reads returned 100 qualifications and 100 acquisitions with IDs checked.                                     | The history check expected 300 and received 150, so it failed before SDK retrieval/UI assertions. The user skipped the large-data E2E; SDK counts, search, and sorting remain unverified. See [scale verification](../verification/M2-offline-scale-report.md). |
| PWA cases other than the targeted offline case          | Earlier passing outcomes were on older test revisions.                                                            | Current account-isolation IndexedDB assertions and other PWA cases were not rerun in a browser.                                                                                                                                                                 |
| Update and storage behavior                             | Test configuration and fault injection exist.                                                                     | New Service Worker update prompt, wizard input retention, OS-level storage denial, and actual blocked IndexedDB deletion are unverified.                                                                                                                        |
| Platform coverage                                       | One desktop Chromium run with demo Emulators succeeded.                                                           | Edge, Android, real devices, production Firebase, and Hosting are unverified.                                                                                                                                                                                   |

The older wait for `navigator.serviceWorker.ready` timed out twice at 120 seconds before it was replaced with bounded registration/activation/controller checks. The successful targeted run now supersedes the prior “offline case not rerun” status only for that single case. It does not supersede evidence gaps for the other cases above.

## Pre-update archive

Before this update, the prior [implementation status](archived/2026-11-12-offline-verification/README.md) was saved from the raw Git blob at commit `511ce0a8b35891988c21b4b861815b2b678f723c`. Its manifest records the source blob, byte size, retrieval method, and SHA-256. The archive is a historical snapshot, not current status.

## Remaining checks

- Re-run the other PWA browser cases against the current assertions and configuration.
- Verify the update prompt and input retention, storage denial behavior, and Edge/Android real-device coverage.
- Resolve the 100/300 record scale acceptance gap if the user authorizes that E2E run.
- Handle the P3 cleanup error-preservation improvement in a later scope.
- Refresh `origin/main` when network access is available; the current main observation is `b17fc1a` from GitHub search, not a successful local fetch.
