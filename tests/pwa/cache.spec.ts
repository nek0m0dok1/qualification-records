import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createVerifiedAccount, registerQualification, signIn } from './fixtures'

test('production preview keeps the real Emulator data and app shell after offline restart', async ({
  request,
}) => {
  test.setTimeout(90_000)
  const account = await createVerifiedAccount(request, `pwa-offline-${Date.now()}@example.test`)
  const profile = await mkdtemp(join(tmpdir(), 'qrpwa-'))
  const resolvedTempRoot = resolve(tmpdir())
  const resolvedProfile = resolve(profile)
  let context: BrowserContext | undefined
  let page: Page
  const serviceWorkerDiagnostics: string[] = []
  const recordServiceWorkerDiagnostic = (message: string) => serviceWorkerDiagnostics.push(message)
  try {
    if (
      dirname(resolvedProfile) !== resolvedTempRoot ||
      !basename(resolvedProfile).startsWith('qrpwa-')
    )
      throw new Error(`Unexpected temporary Chromium profile path: ${resolvedProfile}`)
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      timeout: 15_000,
    })
    page = context.pages()[0] ?? (await context.newPage())
    const reportServiceWorkerStage = async (stage: string) => {
      const snapshot = await page.evaluate(async () => {
        const registrations =
          'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
        return {
          url: location.href,
          secure: isSecureContext,
          serviceWorkerApi: 'serviceWorker' in navigator,
          controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
          registrations: registrations.map((registration) => ({
            scope: registration.scope,
            installing: registration.installing?.state ?? null,
            waiting: registration.waiting?.state ?? null,
            active: registration.active?.state ?? null,
            activeScript: registration.active?.scriptURL ?? null,
          })),
        }
      })
      recordServiceWorkerDiagnostic(`stage ${stage}: ${JSON.stringify(snapshot)}`)
    }
    context.on('serviceworker', (worker) =>
      recordServiceWorkerDiagnostic(`worker created: ${worker.url()}`),
    )
    page.on('console', (message) => {
      if (/service.?worker|workbox|sw\.js/i.test(message.text()))
        recordServiceWorkerDiagnostic(`console ${message.type()}: ${message.text()}`)
    })
    page.on('pageerror', (error) => recordServiceWorkerDiagnostic(`pageerror: ${error.message}`))
    page.on('requestfailed', (request) => {
      if (/sw\.js|workbox|registerSW/i.test(request.url()))
        recordServiceWorkerDiagnostic(
          `request failed: ${request.url()} (${request.failure()?.errorText})`,
        )
    })
    page.on('response', (response) => {
      if (/sw\.js|workbox|registerSW/i.test(response.url()))
        recordServiceWorkerDiagnostic(
          `script response ${response.status()} ${response.headers()['content-type'] ?? 'unknown'}: ${response.url()}`,
        )
    })
    page.setDefaultNavigationTimeout(15_000)
    await page.addInitScript(() => {
      localStorage.setItem('qr:remember', 'true')
      const diagnosticWindow = window as Window & { __pwaSwDiagnostics?: string[] }
      diagnosticWindow.__pwaSwDiagnostics = []
      if ('serviceWorker' in navigator) {
        const container = navigator.serviceWorker
        const nativeRegister = container.register.bind(container)
        Object.defineProperty(container, 'register', {
          configurable: true,
          value: async (...args: Parameters<ServiceWorkerContainer['register']>) => {
            diagnosticWindow.__pwaSwDiagnostics?.push(`register called: ${args[0]}`)
            try {
              const registration = await nativeRegister(...args)
              diagnosticWindow.__pwaSwDiagnostics?.push(
                `registration resolved: ${registration.scope} (${registration.active?.state ?? 'no active worker'})`,
              )
              return registration
            } catch (error) {
              diagnosticWindow.__pwaSwDiagnostics?.push(`registration rejected: ${String(error)}`)
              throw error
            }
          },
        })
      }
    })
    recordServiceWorkerDiagnostic(`stage before signIn: ${page.url()}`)
    await signIn(page, account)
    await reportServiceWorkerStage('after signIn')
    const name = `Offline record ${Date.now()}`
    await registerQualification(page, name)
    await reportServiceWorkerStage('after record save')
    recordServiceWorkerDiagnostic('stage before registration scope poll')
    try {
      await expect
        .poll(
          () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope),
          { timeout: 10_000 },
        )
        .toBe('http://127.0.0.1:5295/')
    } catch (error) {
      const browserRegistrationDiagnostics = await page.evaluate(
        () => (window as Window & { __pwaSwDiagnostics?: string[] }).__pwaSwDiagnostics ?? [],
      )
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
          [...serviceWorkerDiagnostics, ...browserRegistrationDiagnostics].join('\n'),
        { cause: error },
      )
    }
    await expect
      .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 10_000 })
      .toBeGreaterThan(0)
    await expect
      .poll(
        () =>
          page.evaluate(
            async () => (await navigator.serviceWorker.getRegistration())?.active?.state,
          ),
        { timeout: 10_000 },
      )
      .toBe('activated')
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 })
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
        timeout: 10_000,
      })
      .toBe(true)

    await context.setOffline(true)
    await context.close()
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      timeout: 15_000,
    })
    await context.setOffline(true)
    page = context.pages()[0] ?? (await context.newPage())
    page.setDefaultNavigationTimeout(15_000)
    await page.goto('/qualifications')
    await expect(page.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
    await expect(page.getByText('オフライン（閲覧・検索のみ）')).toBeVisible()
    await expect(page.getByRole('button', { name })).toBeVisible()
    await page.getByRole('button', { name }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name })).toBeVisible()
    await page.getByRole('button', { name: '閉じる' }).click()
    await page.getByRole('button', { name: '検索・絞り込み' }).click()
    await page.getByRole('searchbox', { name: '資格名を検索' }).fill(name)
    await expect(page.getByRole('button', { name })).toBeVisible()
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('button', { name: '＋ 記録を追加' })).toBeDisabled()
    await context.close()
  } finally {
    await context?.close().catch(() => undefined)
    if (
      dirname(resolvedProfile) === resolvedTempRoot &&
      basename(resolvedProfile).startsWith('qrpwa-')
    )
      await rm(resolvedProfile, { recursive: true, force: true })
  }
})

test('a failed cache deletion is explicit and blocks account access', async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000)
  const first = await createVerifiedAccount(request, `pwa-delete-${Date.now()}@example.test`)
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('qr:remember', 'true'))
  await signIn(page, first)
  const name = `Private record ${Date.now()}`
  await registerQualification(page, name)
  await page.getByRole('button', { name: 'アカウント' }).click()
  await page.evaluate(() => localStorage.setItem('qr:pwa-e2e-cache-delete-fails', 'true'))
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('heading', { name: '端末データの削除が未完了です' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('削除を再試行')
  await expect(page.getByText(name)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '端末データの削除が未完了です' })).toBeVisible()
  await expect(page.getByText(name)).toHaveCount(0)
  await context.close()
})

test('unavailable persistent cache reports the limitation', async ({ browser, request }) => {
  const account = await createVerifiedAccount(request, `pwa-unavailable-${Date.now()}@example.test`)
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('qr:remember', 'true')
    localStorage.setItem('qr:pwa-e2e-cache-unavailable', 'true')
  })
  await signIn(page, account)
  await expect(page.getByRole('alert')).toContainText('端末保存を利用できません')
  await expect(page.getByRole('button', { name: '＋ 記録を追加' })).toBeDisabled()
  await context.close()
})

test('after a real logout and cache deletion, another account cannot see the previous data', async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000)
  const first = await createVerifiedAccount(request, `pwa-owner-${Date.now()}@example.test`)
  const second = await createVerifiedAccount(request, `pwa-next-${Date.now()}@example.test`)
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('qr:remember', 'true'))
  await signIn(page, first)
  const name = `Previous account record ${Date.now()}`
  await registerQualification(page, name)
  const cacheContainsRecord = async () =>
    page.evaluate(async (qualificationName) => {
      const factory = indexedDB as IDBFactory & {
        databases: () => Promise<{ name?: string }[]>
      }
      const infos = await factory.databases()
      const info = infos.find((database) => database.name?.startsWith('firestore/'))
      if (!info?.name) return false
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(info.name!)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const transaction = opened.transaction([...opened.objectStoreNames], 'readonly')
      const storeValues = await Promise.all(
        [...opened.objectStoreNames].map(
          (storeName) =>
            new Promise<unknown[]>((resolve, reject) => {
              const request = transaction.objectStore(storeName).getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            }),
        ),
      )
      opened.close()
      return storeValues.some((values) => JSON.stringify(values).includes(qualificationName))
    }, name)
  const firestoreDatabaseCount = async () =>
    page.evaluate(async () => {
      const factory = indexedDB as IDBFactory & {
        databases: () => Promise<{ name?: string }[]>
      }
      return (await factory.databases()).filter((database) =>
        database.name?.startsWith('firestore/'),
      ).length
    })
  await expect.poll(cacheContainsRecord, { timeout: 10_000 }).toBe(true)
  await page.getByRole('button', { name: 'アカウント' }).click()
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible()
  await expect.poll(firestoreDatabaseCount, { timeout: 10_000 }).toBe(0)
  await signIn(page, second)
  await expect(page.getByText(name)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '記録を再取得', exact: true })).toBeEnabled()
  await context.close()
})
