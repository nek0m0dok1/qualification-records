import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function waitForAuthEmulator(request: APIRequestContext) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await request.get('http://127.0.0.1:9099/')
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw new Error('Firebase Auth Emulator did not become available')
}

async function registerQualification(page: Page, name: string, month: string) {
  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill(name)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('保有資格のみ登録する').check()
  await page.getByRole('textbox', { name: '取得年月' }).fill(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
}

async function addRenewalFromDetail(page: Page, month: string) {
  await page.getByRole('button', { name: '受験・更新を追加' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('保有資格のみ登録する').check()
  await page.getByLabel('更新年月').fill(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
}

test('主要フロー: 取り消し後の訂正年月と自己削除・別画面からの削除', async ({ page, request, browser }) => {
  await waitForAuthEmulator(request)
  const email = `e2e-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const signup = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { data: { email, password, returnSecureToken: true } })
  expect(signup.ok()).toBeTruthy()
  const { idToken } = await signup.json()
  const verification = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key', { data: { requestType: 'VERIFY_EMAIL', idToken } })
  expect(verification.ok()).toBeTruthy()
  const pendingCodes = await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-qualification-records/oobCodes')
  expect(pendingCodes.ok()).toBeTruthy()
  const { oobCodes } = await pendingCodes.json()
  const { oobCode } = oobCodes.find((code: { email: string; requestType: string }) => code.email === email && code.requestType === 'VERIFY_EMAIL') ?? {}
  const verified = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key', { data: { oobCode } })
  expect(verified.ok(), await verified.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
  const verifyButton = page.getByRole('button', { name: 'メール確認の完了を確認' })
  if (await verifyButton.count()) await verifyButton.click()
  await expect(page.getByRole('heading', { name: '保有資格' })).toBeVisible()
  await registerQualification(page, 'E2E削除資格', '2022-01')

  const card = page.getByRole('button', { name: /E2E削除資格/ })
  await card.click()
  await page.getByRole('button', { name: '受験・更新を追加' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('保有資格のみ登録する').check()
  await page.getByLabel('更新年月').fill('2024-01')
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await card.click()
  await addRenewalFromDetail(page, '2025-01')
  await card.click()
  await page.getByRole('button', { name: '最新更新を取り消す' }).click()
  await page.getByRole('button', { name: '同意して続ける' }).click()
  await expect(page.getByText('2024-01')).toBeVisible()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill('E2E訂正資格')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  await expect(page.getByText('2024-01')).toBeVisible()
  await addRenewalFromDetail(page, '2026-01')
  await page.getByRole('button', { name: /E2E訂正資格/ }).click()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await page.getByLabel('最新の更新年月').fill('2027-01')
  await page.getByRole('button', { name: '訂正を取り消す' }).click()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await expect(page.getByLabel('最新の更新年月')).toHaveValue('2026-01')
  await page.getByRole('button', { name: '訂正を取り消す' }).click()
  await page.getByRole('button', { name: '閉じる' }).click()

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/login')
  await secondPage.getByLabel('メールアドレス').fill(email)
  await secondPage.getByLabel('パスワード', { exact: true }).fill(password)
  await secondPage.getByRole('button', { name: 'ログイン' }).click()
  await expect(secondPage.getByRole('button', { name: /E2E訂正資格/ })).toBeVisible()

  await page.getByRole('button', { name: /E2E訂正資格/ }).click()
  await page.getByRole('button', { name: '資格全体を削除' }).click()
  await page.getByRole('button', { name: '同意して続ける' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await registerQualification(page, 'E2E外部削除資格', '2023-02')
  await page.getByRole('button', { name: /E2E外部削除資格/ }).click()
  await secondPage.getByRole('button', { name: '更新' }).click()
  await expect(secondPage.getByRole('button', { name: /E2E外部削除資格/ })).toBeVisible()
  await secondPage.getByRole('button', { name: /E2E外部削除資格/ }).click()
  await secondPage.getByRole('button', { name: '資格全体を削除' }).click()
  await secondPage.getByRole('button', { name: '同意して続ける' }).click()
  await expect(secondPage.getByRole('dialog')).toHaveCount(0)
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await secondContext.close()
})
