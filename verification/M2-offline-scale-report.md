# Scale and browser verification status

## User direction

The user explicitly asked to skip the large-data E2E in this pass. Offline/PWA/cache work is assigned separately to M3; project documents remain parent-owned.

## Actions

- Preserved the proposed 100-qualification/300-exam-attempt Playwright source as `verification/drafts/offline-scale.spec.ts.txt`; the `.txt` file is outside Playwright's `tests/e2e` discovery tree and is not executable by the normal suite.
- Restored this worker's changes to `playwright.config.ts` and generated `src/typed-router.d.ts`. The Auth Emulator wait change was unnecessary for existing tests because their account helper already waits for Auth.
- Interrupted the previously unresponsive worker invocation. The existing Vite PID 17972 and ports/processes were not stopped; their final state is unknown.

## Measurement and limits

- The Chromium project started far enough to run the fixture preflight. The REST root/head and dataset metadata checks passed, and the qualifications/acquisitions collections each reported 100 records with expected IDs.
- The REST list returned 150 exam-attempt documents where the preflight required 300. The test failed before browser SDK retrieval or UI assertions; do not describe the 100/300 SDK acceptance as tested.
- Browser console/response diagnostics are present in the deferred spec only; they were not collected because page navigation and the SDK stage were not reached.
- Chromium UI search/tag AND/sort, Edge, Android viewport, and Android real hardware remain unverified. No large-data rerun was performed after the user's skip instruction.
- PWA/cache/offline checks remain with M3.

## Short checks

- `npm run lint` and targeted Prettier check passed before moving the spec into the draft directory.
- No build or E2E rerun was performed after the skip instruction.
