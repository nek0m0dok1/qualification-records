import { expect, test, chromium, type BrowserContext } from '@playwright/test'
import { createVerifiedAccount, registerQualification, signIn } from './fixtures'

test('production preview keeps the real Emulator data and app shell after offline restart', async ({
  request,
}, testInfo) => {
  test.setTimeout(90_000)
  const account = await createVerifiedAccount(request, `pwa-offline-${Date.now()}@example.test`)
  const profile = testInfo.outputPath('persistent-chromium-profile')
  let context: BrowserContext = await chromium.launchPersistentContext(profile, {
    headless: true,
    serviceWorkers: 'allow',
  })
  let page = context.pages()[0] ?? (await context.newPage())
  await page.addInitScript(() => localStorage.setItem('qr:remember', 'true'))
  await signIn(page, account)
  const name = `Offline record ${Date.now()}`
  await registerQualification(page, name)
  const registrationScope = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.scope,
  )
  expect(registrationScope).toBe('http://127.0.0.1:5295/')
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 10_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
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
  })
  await context.setOffline(true)
  page = context.pages()[0] ?? (await context.newPage())
  page.setDefaultNavigationTimeout(15_000)
  await page.goto('/qualifications')
  await expect(page.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
  await expect(page.getByText('オフライン（閲覧・検索のみ）')).toBeVisible()
  await expect(page.getByRole('button', { name })).toBeVisible()
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('button', { name: '検索・絞り込み' }).click()
  await page.getByRole('searchbox', { name: '資格名を検索' }).fill(name)
  await expect(page.getByRole('button', { name })).toBeVisible()
  await page.getByRole('button', { name: '閉じる' }).click()
  await expect(page.getByRole('button', { name: '＋ 記録を追加' })).toBeDisabled()
  await context.close()
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
  await page.getByRole('button', { name: 'アカウント' }).click()
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible()
  await signIn(page, second)
  await expect(page.getByText(name)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '記録を再取得', exact: true })).toBeEnabled()
  await context.close()
})
