import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function waitForAuthEmulator(request: APIRequestContext) {
  await expect
    .poll(async () => (await request.get('http://127.0.0.1:9099/').catch(() => null))?.ok(), {
      timeout: 15_000,
    })
    .toBeTruthy()
}

async function createVerifiedAccount(request: APIRequestContext) {
  const email = `retired-tags-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const signup = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )
  expect(signup.ok(), await signup.text()).toBeTruthy()
  const { idToken } = await signup.json()
  const verification = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key',
    { data: { requestType: 'VERIFY_EMAIL', idToken } },
  )
  expect(verification.ok(), await verification.text()).toBeTruthy()
  const pendingCodes = await request.get(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-qualification-records/oobCodes',
  )
  const { oobCodes } = await pendingCodes.json()
  const { oobCode } = oobCodes.find(
    (code: { email: string; requestType: string }) =>
      code.email === email && code.requestType === 'VERIFY_EMAIL',
  )
  const verified = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key',
    { data: { oobCode } },
  )
  expect(verified.ok(), await verified.text()).toBeTruthy()
  return { email, password }
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
}

test('廃止タグの新規選択を隠し、過去タグの表示・検索・訂正・復元を保つ', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const account = await createVerifiedAccount(request)

  // Simulate a production tag becoming retired without changing the real tag definitions.
  await page.route('**/src/domain/model.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: source.replace('selectable: true', "selectable: id !== 'law-public'"),
    })
  })
  await signIn(page, account.email, account.password)

  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await expect(page.getByLabel('法律・行政')).toHaveCount(0)
  await page.getByRole('button', { name: '閉じる' }).click()

  const fixture = {
    format: 'qualification-records',
    version: 1,
    exportedAt: '2024-06-01T00:00:00.000Z',
    tags: [
      ['language', '語学'],
      ['it', 'IT'],
      ['business-finance', 'ビジネス・金融'],
      ['law-public', '法律・行政'],
      ['industry', '工業・技術'],
      ['health-welfare', '医療・福祉'],
      ['education-childcare', '教育・保育'],
      ['life-culture', '生活・文化'],
      ['other', 'その他'],
    ].map(([id, label]) => ({ id, label })),
    qualifications: [
      {
        id: 'legacy-law',
        name: '廃止タグつきの行政資格',
        gradeOrCategory: '',
        fixedTagIds: ['law-public'],
        memo: '',
      },
    ],
    acquisitions: [{ id: 'legacy-law', qualificationId: 'legacy-law', acquiredMonth: '2020-04' }],
    examAttempts: [],
  }
  await page.goto('/settings')
  await page.getByLabel('バックアップファイル').setInputFiles({
    name: 'legacy-tag-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await expect(page.getByText(/資格 1件/)).toBeVisible()
  await page.getByRole('button', { name: '内容を確認して全置換' }).click()
  await page
    .getByRole('dialog', { name: '変更内容の確認' })
    .getByRole('button', { name: '同意して続ける' })
    .click()
  await expect(page.getByText('復元の切り替えが完了しました。')).toBeVisible({ timeout: 15_000 })

  await page.goto('/qualifications')
  const card = page.getByRole('button', { name: /廃止タグつきの行政資格/ })
  await expect(card).toBeVisible()
  const navigation = page.getByRole('navigation', { name: '主要画面' })
  await navigation.getByRole('button', { name: /検索・絞り込み/ }).click()
  const filters = page.getByRole('dialog', { name: '資格の検索・絞り込み' })
  await filters.getByLabel('資格名を検索').fill('行政資格')
  await expect(card).toBeVisible()
  await filters.getByRole('searchbox', { name: 'ジャンルを検索' }).fill('法律・行政')
  await filters.getByRole('button', { name: '法律・行政', exact: true }).click()
  await filters.getByRole('button', { name: '閉じる' }).click()
  await expect(card).toBeVisible()
  await expect(card).toContainText('法律・行政')
  await card.click()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await expect(page.getByLabel('法律・行政')).toBeChecked()
  await page.getByLabel('級・区分').fill('行政')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  await expect(page.getByRole('dialog', { name: '廃止タグつきの行政資格' })).toContainText(
    '法律・行政',
  )
})
