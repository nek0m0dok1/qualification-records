# PWA and cache verification

## Harness

- `playwright.pwa.config.ts` runs a production-mode Vite preview, real Chromium Service Workers, and the demo Firebase Auth and Firestore Emulators.
- PWA build output is isolated in ignored `dist-pwa-e2e/`; the standard production build and Hosting `dist/` path are unchanged.
- PWA verification uses app port 5295, Auth port 9295, and Firestore port 8195. It does not depend on the development Playwright config or the existing emulator ports.
- `pwa-e2e` is the only production-like build mode that connects to those Emulators. Runtime switches for cache-unavailable and cache-deletion failure are checked only in that mode; normal production configuration remains unchanged.
- The browser signs in through the Firebase SDK and creates records through the app. Emulator REST calls only create and verify fixture accounts. Cache failure cases use controlled test-mode failure injection.

## Results

- `npm run typecheck`: passed after the profile and detail-locator changes.
- `npm test`: 29 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed to the normal `dist/` path; Vite generated the Workbox service worker with 16 precache entries.
- Targeted Prettier check for `playwright.pwa.config.ts`, `tests/pwa/cache.spec.ts`, and `verification/pwa-cache.md`: passed. Repository-wide `npm run format:check` reports existing formatting failures across unrelated baseline files; those files were not reformatted.
- Initial PWA browser suite: 2 of 4 passed. Real logout/cache deletion followed by a second account sign-in did not expose the prior account's record. Injected deletion failure displayed the blocking cleanup state and hid records.
- One coordinator-approved rerun of the two failures: the cache-unavailable case passed after moving Firestore repository construction into the guarded refresh path. This also fixed a production error path where cache initialization could throw before the user-facing failure handler.
- The previous unverified offline case was traced to a Windows `CacheStorage.open` `UnknownError` for long persistent-profile paths (177–180 characters); the same production SW activated with an 88-character profile. The test now creates its persistent Chromium profile with `mkdtemp` directly under `os.tmpdir()`, reuses that exact directory after restart, and closes the context before deleting only a checked `qrpwa-*` child of the temp root in `finally`.
- `npm run test:pwa-e2e -- --grep=production --list`: exactly one offline-restart test selected. `npm run test:pwa-e2e -- --grep=production`: passed 1 test in 59.1 seconds using the real Firebase SDK and dedicated demo Auth/Firestore Emulators, production-mode preview, and real Chromium Service Workers. The test created a record, confirmed registration/cache/activation, restarted the persistent browser offline, and verified list, detail, search, and disabled write controls.
- The first short-profile run reached the offline detail view but stopped on a strict-mode locator matching both the list heading and dialog heading. The test now scopes the detail assertion to the dialog; the single targeted rerun passed. This was a test locator correction, not a relaxed product assertion.
- Firebase CLI configstore is isolated for the Emulator webServer child with `XDG_CONFIG_HOME` under ignored `.runtime/firebase-config`; a CLI startup preflight succeeded without reading or modifying the user-level Firebase config. The runner retains 60-second webServer, 90-second case, and 360-second global timeouts.

## Independent review follow-up

- The prior three passing outcomes (cache deletion failure, different-account visibility, and the targeted cache-unavailable case) were observed before review changes; they do not verify the current test revisions.
- The account-isolation case now checks that the Firestore IndexedDB database contains the created record before logout, and that the Firestore database is absent after logout. These new assertions have not been browser-run in this task.
- The dedicated build script and preview now both use `dist-pwa-e2e/`. Review follow-up browser tests were not run as requested.
- The results above include the targeted offline browser run; the account-isolation browser assertions and other PWA cases were not rerun here.

## Not verified

- A real newer Service Worker installation showing the update prompt, and keeping an open wizard from forced reload, were not exercised.
- Cache-unavailable and deletion-failure outcomes use deliberate `pwa-e2e` fault injection; browser/OS-level storage denial and an actual blocked IndexedDB deletion were not reproduced.
- This was desktop Chromium with demo Emulators, not Chrome/Edge/Android or production Firebase/Hosting. No real data, Firebase project, Hosting configuration, or public deployment was used.
