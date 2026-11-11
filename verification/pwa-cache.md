# PWA and cache verification

## Harness

- `playwright.pwa.config.ts` runs a production-mode Vite preview, real Chromium Service Workers, and the demo Firebase Auth and Firestore Emulators.
- PWA build output is isolated in ignored `dist-pwa-e2e/`; the standard production build and Hosting `dist/` path are unchanged.
- PWA verification uses app port 5295, Auth port 9295, and Firestore port 8195. It does not depend on the development Playwright config or the existing emulator ports.
- `pwa-e2e` is the only production-like build mode that connects to those Emulators. Runtime switches for cache-unavailable and cache-deletion failure are checked only in that mode; normal production configuration remains unchanged.
- The browser signs in through the Firebase SDK and creates records through the app. Emulator REST calls only create and verify fixture accounts. Cache failure cases use controlled test-mode failure injection.

## Results

- `npm run typecheck`: passed.
- `npm test`: 28 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite generated the Workbox service worker with 16 precache entries.
- Prettier check for task-owned files: passed. Repository-wide `npm run format:check` reports existing formatting failures across unrelated baseline files; those files were not reformatted.
- Initial PWA browser suite: 2 of 4 passed. Real logout/cache deletion followed by a second account sign-in did not expose the prior account's record. Injected deletion failure displayed the blocking cleanup state and hid records.
- One coordinator-approved rerun of the two failures: the cache-unavailable case passed after moving Firestore repository construction into the guarded refresh path. This also fixed a production error path where cache initialization could throw before the user-facing failure handler.
- The offline restart case again reached its 120-second limit while awaiting `navigator.serviceWorker.ready`. That unbounded wait was removed and replaced with bounded registration/activation/controller checks before relaunching the persistent Chromium profile. The corrected offline case has not been rerun, so offline restart, detail/search offline use, and write blocking remain unverified.

## Independent review follow-up

- The prior three passing outcomes (cache deletion failure, different-account visibility, and the targeted cache-unavailable case) were observed before review changes; they do not verify the current test revisions.
- The account-isolation case now checks that the Firestore IndexedDB database contains the created record before logout, and that the Firestore database is absent after logout. These new assertions have not been browser-run.
- The dedicated build script and preview now both use `dist-pwa-e2e/`. Review follow-up browser tests were not run as requested.
- After the review changes, typecheck, all 28 unit tests, lint, and Prettier checks for task-owned files passed. The standard production build and PWA e2e build both passed; the SHA-256 of `dist/index.html` remained unchanged across the PWA e2e build, and `dist-pwa-e2e/sw.js` was generated.

## Not verified

- A real newer Service Worker installation showing the update prompt, and keeping an open wizard from forced reload, were not exercised.
- Cache-unavailable and deletion-failure outcomes use deliberate `pwa-e2e` fault injection; browser/OS-level storage denial and an actual blocked IndexedDB deletion were not reproduced.
- This was desktop Chromium with demo Emulators, not Chrome/Edge/Android or production Firebase/Hosting. No real data, Firebase project, Hosting configuration, or public deployment was used.
