import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const authEmulator = 'http://127.0.0.1:9295'

export async function createVerifiedAccount(request: APIRequestContext, email: string) {
  const password = 'pwa-cache-password-123'
  const signup = await request.post(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    { data: { email, password, returnSecureToken: true } },
  )
  expect(signup.ok(), await signup.text()).toBeTruthy()
  const { idToken } = await signup.json()
  const codeResponse = await request.post(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`,
    { data: { requestType: 'VERIFY_EMAIL', idToken } },
  )
  expect(codeResponse.ok(), await codeResponse.text()).toBeTruthy()
  const codesResponse = await request.get(
    `${authEmulator}/emulator/v1/projects/demo-qualification-records/oobCodes`,
  )
  expect(codesResponse.ok()).toBeTruthy()
  const { oobCodes } = await codesResponse.json()
  const { oobCode } = oobCodes.find(
    (item: { email: string; requestType: string }) =>
      item.email === email && item.requestType === 'VERIFY_EMAIL',
  )
  const verified = await request.post(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,
    { data: { oobCode } },
  )
  expect(verified.ok(), await verified.text()).toBeTruthy()
  return { email, password }
}

export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(account.email)
  await page.getByLabel('パスワード', { exact: true }).fill(account.password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
}

export async function registerQualification(page: Page, name: string) {
  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill(name)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('button', { name: '取得年月カレンダーを開く', exact: true }).click()
  const calendar = page.getByRole('group', { name: '取得年月カレンダー', exact: true })
  await calendar.getByLabel('年', { exact: true }).selectOption('2023')
  await calendar.getByLabel('月', { exact: true }).selectOption('4')
  await page.locator('.target-summary').click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await expect(page.getByRole('button', { name })).toBeVisible()
}
