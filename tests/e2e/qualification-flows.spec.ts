import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function waitForAuthEmulator(request: APIRequestContext) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await request.get('http://127.0.0.1:9099/')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Firebase Auth Emulator did not become available')
}

async function createVerifiedAccount(request: APIRequestContext, email: string, password: string) {
  const signup = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )
  expect(signup.ok(), await signup.text()).toBeTruthy()
  const { localId, idToken: signupToken } = await signup.json()
  const verification = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key',
    { data: { requestType: 'VERIFY_EMAIL', idToken: signupToken } },
  )
  expect(verification.ok(), await verification.text()).toBeTruthy()
  const pendingCodes = await request.get(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-qualification-records/oobCodes',
  )
  expect(pendingCodes.ok()).toBeTruthy()
  const { oobCodes } = await pendingCodes.json()
  const { oobCode } =
    oobCodes.find(
      (code: { email: string; requestType: string }) =>
        code.email === email && code.requestType === 'VERIFY_EMAIL',
    ) ?? {}
  const verified = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key',
    { data: { oobCode } },
  )
  expect(verified.ok(), await verified.text()).toBeTruthy()
  const signedIn = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )
  expect(signedIn.ok(), await signedIn.text()).toBeTruthy()
  const { idToken } = await signedIn.json()
  return { uid: localId as string, idToken: idToken as string }
}

async function replaceEmulatorRecord(
  request: APIRequestContext,
  input: {
    uid: string
    idToken: string
    datasetId: string
    collection: 'acquisitions' | 'examAttempts'
    id: string
    fields: Record<string, unknown>
  },
) {
  const documentsPath =
    'http://127.0.0.1:8080/v1/projects/demo-qualification-records/databases/(default)/documents'
  const rootPath = `${documentsPath}/users/${input.uid}`
  const headers = { Authorization: `Bearer ${input.idToken}` }
  const [rootResponse, datasetResponse] = await Promise.all([
    request.get(rootPath, { headers }),
    request.get(`${rootPath}/datasets/${input.datasetId}`, { headers }),
  ])
  expect(rootResponse.ok(), await rootResponse.text()).toBeTruthy()
  expect(datasetResponse.ok(), await datasetResponse.text()).toBeTruthy()
  const rootName = `projects/demo-qualification-records/databases/(default)/documents/users/${input.uid}`
  const rootFields = (await rootResponse.json()).fields as Record<string, unknown>
  const datasetFields = (await datasetResponse.json()).fields as Record<string, unknown>
  const revision = Number((rootFields.revision as { integerValue: string }).integerValue)
  const recordPath = `${rootPath}/datasets/${input.datasetId}/${input.collection}/${input.id}`
  const recordName = `${rootName}/datasets/${input.datasetId}/${input.collection}/${input.id}`
  const response = await request.post(`${documentsPath}:commit`, {
    headers,
    data: {
      writes: [
        { update: { name: recordName, fields: input.fields } },
        {
          update: {
            name: `${rootName}/datasets/${input.datasetId}`,
            fields: datasetFields,
          },
        },
        {
          update: {
            name: rootName,
            fields: {
              activeDatasetId: rootFields.activeDatasetId,
              revision: { integerValue: String(revision + 1) },
            },
          },
        },
      ],
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const verification = await request.get(recordPath, { headers })
  expect(verification.ok(), await verification.text()).toBeTruthy()
  expect((await verification.json()).fields).toEqual(input.fields)
}

async function refreshPageRecords(page: Page) {
  const fetchedAt = page.locator('.status-bar > span > small')
  const previousFetch = await fetchedAt.innerText()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: '記録を再取得' }).click()
  await expect(fetchedAt).not.toHaveText(previousFetch)
}

async function registerQualification(page: Page, name: string, month: string) {
  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await expect(page.getByText('STEP 1 / 4')).toBeVisible()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill(name)
  await page.getByLabel('受験結果').selectOption('passed')
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('textbox', { name: '取得年月', exact: true }).fill(month)
  await expect(page.getByLabel('取得年月の年')).toHaveValue(month.slice(0, 4))
  await expect(page.getByLabel('取得年月の月')).toHaveValue(month.slice(5, 7))
  await expect(page.getByRole('button', { name: '日も指定する' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '取得年月', exact: true })).toHaveValue(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
}

async function addRenewalFromDetail(page: Page, month: string) {
  await page.getByRole('button', { name: '更新・記録を追加' }).click()
  await page.getByLabel('受験結果').selectOption('passed')
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('textbox', { name: '更新年月', exact: true }).fill(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
}

test('受験履歴の検索と結果フィルターをサイドバーのダイアログで操作できる', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const email = `attempt-filter-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  await createVerifiedAccount(request, email, password)

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()

  await page.getByRole('button', { name: '検索・絞り込み' }).click()
  const ownedDialog = page.getByRole('dialog', { name: '資格の検索・絞り込み' })
  await expect(ownedDialog.getByRole('searchbox', { name: '資格名を検索' })).toBeVisible()
  await ownedDialog
    .getByRole('group', { name: 'ジャンル候補' })
    .getByRole('button', { name: 'IT', exact: true })
    .click()
  await expect(ownedDialog.getByRole('button', { name: 'ITを解除' })).toBeVisible()
  await ownedDialog.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('link', { name: '受験履歴' }).click()
  await page.getByRole('button', { name: '検索・絞り込み' }).click()
  const attemptsDialog = page.getByRole('dialog', { name: '受験履歴の検索・絞り込み' })
  await expect(attemptsDialog.getByRole('button', { name: 'ITを解除' })).toHaveCount(0)
  const search = attemptsDialog.getByRole('searchbox', { name: '資格名を検索' })
  await search.fill('検索語')
  await expect(search).toHaveValue('検索語')
  const passed = attemptsDialog.getByRole('button', { name: '合格', exact: true })
  await passed.click()
  await expect(passed).toHaveAttribute('aria-pressed', 'true')
  const selected = attemptsDialog.getByRole('button', { name: '合格を解除' })
  await expect(selected).toBeVisible()
  await expect(attemptsDialog.getByRole('button', { name: 'ITを解除' })).toHaveCount(0)
  await selected.click()
  await expect(attemptsDialog.getByRole('button', { name: '合格を解除' })).toHaveCount(0)
  await passed.click()
  await page.screenshot({ path: testInfo.outputPath('attempt-filter-desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('attempt-filter-mobile.png') })
  await attemptsDialog.getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('link', { name: '資格一覧' }).click()
  await page.getByRole('button', { name: '検索・絞り込み' }).click()
  const reopenedOwnedDialog = page.getByRole('dialog', { name: '資格の検索・絞り込み' })
  await expect(reopenedOwnedDialog.getByRole('button', { name: 'ITを解除' })).toBeVisible()
  await expect(reopenedOwnedDialog.getByRole('button', { name: '合格を解除' })).toHaveCount(0)
  await reopenedOwnedDialog.getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('link', { name: '受験履歴' }).click()
  await page.getByRole('button', { name: '検索・絞り込み' }).click()
  await expect(
    page.getByRole('dialog', { name: '受験履歴の検索・絞り込み' }).getByRole('button', {
      name: '合格を解除',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: '受験履歴の検索・絞り込み' }).getByRole('button', {
      name: 'ITを解除',
    }),
  ).toHaveCount(0)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/qualifications')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(attemptsDialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()
})

test('既存資格の結果は明示選択が必要で、未操作終了では破棄確認を出さない', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const email = `result-selection-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  await createVerifiedAccount(request, email, password)

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await registerQualification(page, '結果未選択の回帰確認', '1900-04')

  await page.getByRole('button', { name: /結果未選択の回帰確認/ }).click()
  await page.getByRole('button', { name: '更新・記録を追加' }).click()
  const wizard = page.getByRole('dialog', { name: '資格・受験の記録' })
  await expect(wizard.getByText('STEP 1 / 3')).toBeVisible()
  await expect(wizard.locator('.steps li')).toHaveText(['資格・結果', '年月', '確認'])
  await expect(wizard.getByText('対象', { exact: true })).toHaveCount(0)
  await expect(wizard.getByRole('button', { name: '戻る' })).toHaveCount(0)
  const result = wizard.getByLabel('受験結果')
  const nextButton = wizard.getByRole('button', { name: '次へ' })
  await expect(result).toHaveValue('')
  await expect(result.locator('option').first()).toHaveText('選択してください')
  await expect(result).toHaveAttribute('required', '')
  await expect(nextButton).toBeDisabled()
  await wizard
    .locator('form')
    .evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
  await expect(wizard.getByText('受験結果を選択してください。')).toBeVisible()
  await expect(wizard.getByText('STEP 1 / 3')).toBeVisible()
  await expect(wizard.getByText('この内容で保存します')).toHaveCount(0)
  await wizard.locator('header').getByRole('button', { name: '閉じる' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /結果未選択の回帰確認/ }).click()
  await page.getByRole('button', { name: '更新・記録を追加' }).click()
  const reopened = page.getByRole('dialog', { name: '資格・受験の記録' })
  await reopened.getByLabel('受験結果').selectOption('passed')
  await reopened.getByRole('button', { name: '次へ' }).click()
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await reopened.getByRole('button', { name: '戻る' }).click()
  await expect(reopened.getByText('STEP 1 / 3')).toBeVisible()
  await expect(reopened.getByRole('button', { name: '戻る' })).toHaveCount(0)
  await reopened.getByRole('button', { name: '次へ' }).click()
  await reopened.getByLabel('あなたの資格のみ登録する').check()
  const renewalMonth = reopened.getByRole('textbox', { name: '更新年月', exact: true })
  await renewalMonth.fill('2024-05')
  const renewalYear = reopened.getByLabel('更新年月の年')
  await renewalYear.fill('2101')
  await renewalYear.press('Tab')
  await expect(renewalMonth).toHaveValue('2101-05')
  expect(await renewalMonth.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(
    false,
  )
  await reopened.getByRole('button', { name: '次へ' }).click()
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await renewalYear.fill('2024')
  await renewalYear.press('Tab')
  await expect(renewalMonth).toHaveValue('2024-05')
  await renewalMonth.fill('2101-05')
  await expect(reopened.getByRole('alert')).toContainText('1900年から2100年')
  await reopened.getByRole('button', { name: '次へ' }).click()
  await renewalMonth.press('Enter')
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await expect(renewalMonth).toHaveValue('2101-05')
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await renewalMonth.fill('not-a-date')
  await expect(renewalMonth).toHaveValue('not-a-date')
  await reopened.getByRole('button', { name: '次へ' }).click()
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await renewalMonth.fill('10000-01')
  await expect(reopened.getByRole('alert')).toContainText('1900年から2100年')
  await reopened.getByRole('button', { name: '次へ' }).click()
  await expect(reopened.getByText('STEP 2 / 3')).toBeVisible()
  await renewalMonth.fill('2100-05')
  await expect(renewalMonth).toHaveValue('2100-05')
  await expect(reopened.getByRole('alert')).toHaveCount(0)
  await reopened.getByRole('button', { name: '次へ' }).click()
  await expect(reopened.getByText('STEP 3 / 3')).toBeVisible()
  await reopened.getByRole('button', { name: '記録を保存' }).click()
  await expect(reopened).toHaveCount(0)
  await expect(page.getByRole('button', { name: /結果未選択の回帰確認/ })).toBeVisible()
  await page.getByRole('button', { name: /結果未選択の回帰確認/ }).click()
  const qualificationDetail = page.getByRole('dialog', { name: '結果未選択の回帰確認' })
  await expect(qualificationDetail.getByText('1900年4月', { exact: true })).toBeVisible()
  await expect(qualificationDetail.getByText('2100年5月', { exact: true })).toBeVisible()
})

test('範囲外の既存年月と受験日は訂正中に保持し、明示選択で置き換えられる', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const email = `legacy-date-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const account = await createVerifiedAccount(request, email, password)

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await registerQualification(page, 'レガシー年月の訂正確認', '2020-04')

  const rootPath = `http://127.0.0.1:8080/v1/projects/demo-qualification-records/databases/(default)/documents/users/${account.uid}`
  const authHeaders = { Authorization: `Bearer ${account.idToken}` }
  const rootResponse = await request.get(rootPath, { headers: authHeaders })
  expect(rootResponse.ok(), await rootResponse.text()).toBeTruthy()
  const datasetId = (await rootResponse.json()).fields.activeDatasetId.stringValue as string
  const acquisitionPath = `${rootPath}/datasets/${datasetId}/acquisitions`
  const acquisitionsResponse = await request.get(acquisitionPath, { headers: authHeaders })
  expect(acquisitionsResponse.ok(), await acquisitionsResponse.text()).toBeTruthy()
  const acquisitionDocuments = (await acquisitionsResponse.json()).documents as {
    name: string
    fields: { qualificationId: { stringValue: string } }
  }[]
  const qualificationId = acquisitionDocuments[0].fields.qualificationId.stringValue
  const acquisitionId = acquisitionDocuments[0].name.split('/').at(-1)!
  await replaceEmulatorRecord(request, {
    uid: account.uid,
    idToken: account.idToken,
    datasetId,
    collection: 'acquisitions',
    id: acquisitionId,
    fields: {
      qualificationId: { stringValue: qualificationId },
      acquiredMonth: { stringValue: '1899-01' },
    },
  })
  await refreshPageRecords(page)
  await page.getByRole('button', { name: /レガシー年月の訂正確認/ }).click()

  const detail = page.getByRole('dialog', { name: 'レガシー年月の訂正確認' })
  await detail.getByRole('button', { name: '情報を訂正' }).click()
  const acquisitionMonth = page.getByRole('textbox', { name: '取得年月', exact: true })
  await expect(acquisitionMonth).toHaveValue('1899-01')
  await expect(page.getByLabel('取得年月の年')).toHaveValue('1899')
  await expect(page.getByLabel('取得年月の月')).toHaveValue('01')
  await page.getByRole('textbox', { name: '資格名' }).focus()
  await expect(acquisitionMonth).toHaveValue('1899-01')
  await page.getByRole('textbox', { name: '資格名' }).fill('訂正後のレガシー年月資格')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  const updatedDetail = page.getByRole('dialog', { name: '訂正後のレガシー年月資格' })
  await expect(updatedDetail.getByText('1899年1月', { exact: true })).toBeVisible()

  await updatedDetail.getByRole('button', { name: '情報を訂正' }).click()
  const updatedAcquisitionMonth = page.getByRole('textbox', {
    name: '取得年月',
    exact: true,
  })
  await updatedAcquisitionMonth.fill('1898-12')
  await expect(page.getByRole('alert')).toContainText('1900年から2100年')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  await expect(page.getByRole('dialog', { name: '資格情報の訂正' })).toBeVisible()
  await updatedAcquisitionMonth.fill('1899-01')
  await page.getByLabel('取得年月の年').fill('1900')
  await page.getByLabel('取得年月の年').press('Tab')
  await page.getByLabel('取得年月の月').selectOption('01')
  await page.getByRole('textbox', { name: '資格名' }).focus()
  await expect(updatedAcquisitionMonth).toHaveValue('1900-01')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  await expect(
    page
      .getByRole('dialog', { name: '訂正後のレガシー年月資格' })
      .getByText('1900年1月', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '更新・記録を追加' }).click()
  const update = page.getByRole('dialog', { name: '資格・受験の記録' })
  await update.getByLabel('受験結果').selectOption('failed')
  await update.getByRole('button', { name: '次へ' }).click()
  await update
    .getByRole('textbox', { name: '受験年月（日は任意）', exact: true })
    .fill('2024-05-12')
  const examDate = update.getByRole('textbox', { name: '受験年月（日は任意）', exact: true })
  await update.getByRole('button', { name: '年月のみにする' }).click()
  await expect(examDate).toHaveValue('2024-05')
  await update.getByRole('button', { name: '日も指定する' }).click()
  await update.getByLabel('受験年月（日は任意）の日').selectOption('12')
  await expect(examDate).toHaveValue('2024-05-12')
  await examDate.fill('2024-01-31')
  await update.getByLabel('受験年月（日は任意）の月').selectOption('02')
  await expect(examDate).toHaveValue('2024-02-31')
  expect(await examDate.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false)
  await expect(update.getByLabel('受験年月（日は任意）の日')).toHaveValue('31')
  await update.getByLabel('受験年月（日は任意）の日').selectOption('29')
  await expect(examDate).toHaveValue('2024-02-29')
  await update.getByLabel('受験年月（日は任意）の年').fill('2023')
  await update.getByLabel('受験年月（日は任意）の年').press('Tab')
  await expect(examDate).toHaveValue('2023-02-29')
  expect(await examDate.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false)
  await expect(update.getByLabel('受験年月（日は任意）の日')).toHaveValue('29')
  await update.getByLabel('受験年月（日は任意）の日').selectOption('28')
  await expect(examDate).toHaveValue('2023-02-28')
  await update.getByRole('button', { name: '次へ' }).click()
  await update.getByRole('button', { name: '記録を保存' }).click()
  await expect(update).toHaveCount(0)

  const attemptsPath = `${rootPath}/datasets/${datasetId}/examAttempts`
  const attemptsResponse = await request.get(attemptsPath, { headers: authHeaders })
  expect(attemptsResponse.ok(), await attemptsResponse.text()).toBeTruthy()
  const attemptDocuments = ((await attemptsResponse.json()).documents ?? []) as {
    name: string
    fields: {
      qualificationId: { stringValue: string }
      result: { stringValue: string }
    }
  }[]
  expect(attemptDocuments).toHaveLength(1)
  const attemptDocument = attemptDocuments[0]
  const attemptId = attemptDocument.name.split('/').at(-1)!
  await replaceEmulatorRecord(request, {
    uid: account.uid,
    idToken: account.idToken,
    datasetId,
    collection: 'examAttempts',
    id: attemptId,
    fields: {
      qualificationId: attemptDocument.fields.qualificationId,
      examDate: { stringValue: '2101-03-09' },
      result: attemptDocument.fields.result,
    },
  })
  await refreshPageRecords(page)
  await page.goto('/exam-attempts')
  const attemptCard = page.getByRole('button', { name: /2101年3月9日/ })
  await expect(attemptCard).toBeVisible()
  await attemptCard.click()
  const attemptDetail = page.getByRole('dialog', { name: '訂正後のレガシー年月資格' })
  await attemptDetail.getByRole('button', { name: '訂正', exact: true }).click()
  const attemptEdit = page.getByRole('dialog', { name: '受験履歴の訂正' })
  const attemptDate = attemptEdit.getByRole('textbox', {
    name: '受験年月（日は任意）',
    exact: true,
  })
  await expect(attemptDate).toHaveValue('2101-03-09')
  await attemptDate.fill('2101-03-10')
  await expect(attemptEdit.getByRole('alert')).toContainText('1900年から2100年')
  await attemptEdit.getByRole('button', { name: '訂正を保存' }).click()
  await expect(attemptEdit).toBeVisible()
  await attemptDate.fill('2101-03-09')
  await expect(attemptEdit.getByLabel('受験年月（日は任意）の日')).toHaveValue('09')
  await attemptEdit.getByLabel('受験結果').focus()
  await expect(attemptDate).toHaveValue('2101-03-09')
  await attemptEdit.getByRole('button', { name: '訂正を保存' }).click()
  await expect(page.getByRole('button', { name: /2101年3月9日/ })).toBeVisible()
})

test('主要フロー: 取り消し後の訂正年月と自己削除・別画面からの削除', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const email = `e2e-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const signup = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )
  expect(signup.ok()).toBeTruthy()
  const { idToken } = await signup.json()
  const verification = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key',
    { data: { requestType: 'VERIFY_EMAIL', idToken } },
  )
  expect(verification.ok()).toBeTruthy()
  const pendingCodes = await request.get(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-qualification-records/oobCodes',
  )
  expect(pendingCodes.ok()).toBeTruthy()
  const { oobCodes } = await pendingCodes.json()
  const { oobCode } =
    oobCodes.find(
      (code: { email: string; requestType: string }) =>
        code.email === email && code.requestType === 'VERIFY_EMAIL',
    ) ?? {}
  const verified = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key',
    { data: { oobCode } },
  )
  expect(verified.ok(), await verified.text()).toBeTruthy()

  await page.goto('/login')
  await page.setViewportSize({ width: 719, height: 611 })
  await page.getByLabel('メールアドレス').fill(email)
  const passwordInput = page.getByLabel('パスワード', { exact: true })
  await passwordInput.fill(password)
  await expect(passwordInput).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'パスワードを表示', exact: true }).click()
  await expect(passwordInput).toHaveAttribute('type', 'text')
  await expect(passwordInput).toHaveValue(password)
  await page.getByLabel('メールアドレス').fill('sample@example.test')
  await passwordInput.fill('sample-password')
  await page.screenshot({
    path: 'docs/assets/issue-12-password-toggle-719x611.png',
    fullPage: true,
  })
  await page.getByLabel('メールアドレス').fill(email)
  await passwordInput.fill(password)
  await page.getByRole('button', { name: 'パスワードを非表示', exact: true }).click()
  await expect(passwordInput).toHaveAttribute('type', 'password')
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  const verifyButton = page.getByRole('button', { name: 'メール確認の完了を確認' })
  if (await verifyButton.count()) await verifyButton.click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await expect(page).toHaveURL(/qualifications$/)
  await expect(page.getByRole('button', { name: '記録を再取得', exact: true })).toBeEnabled({
    timeout: 15_000,
  })
  const rememberedTab = await page.context().newPage()
  await rememberedTab.goto('/qualifications')
  await expect(rememberedTab.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await expect(
    rememberedTab.getByRole('button', { name: '記録を再取得', exact: true }),
  ).toBeEnabled({ timeout: 15_000 })
  await rememberedTab.close()
  await page.setViewportSize({ width: 719, height: 607 })
  const nav = page.getByRole('navigation', { name: '主要画面' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: '資格一覧' })).toHaveAttribute('aria-current', 'page')
  const navBox = await nav.boundingBox()
  const mainBox = await page.locator('.workspace-content').boundingBox()
  expect(navBox && mainBox && navBox.x >= mainBox.x + mainBox.width).toBeTruthy()
  const filterTrigger = page.getByRole('button', { name: /検索・絞り込み/ })
  await expect(nav.getByRole('button', { name: /検索・絞り込み/ })).toHaveCount(0)
  await expect(filterTrigger).toBeVisible()
  await filterTrigger.focus()
  await page.keyboard.press('Enter')
  const filterDialog = page.getByRole('dialog', { name: '資格の検索・絞り込み' })
  await expect(filterDialog).toBeVisible()
  const genreOptions = filterDialog.locator('.dialog-tag-options button')
  const genreCount = await genreOptions.count()
  for (let index = 0; index < genreCount; index += 1) await genreOptions.nth(index).click()
  await expect(filterDialog.locator('.selected-tag')).toHaveCount(genreCount)
  await expect(filterDialog.locator('.modal-heading')).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.locator('.selected-tags')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  await page.setViewportSize({ width: 640, height: 360 })
  await expect(filterDialog.locator('.modal-heading')).toBeInViewport()
  await expect(filterDialog.getByRole('button', { name: '閉じる' })).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  const selectedRemoval = filterDialog.locator('.selected-tag button').first()
  await expect(selectedRemoval).toBeInViewport()
  const candidateBounds = await filterDialog.locator('.dialog-tag-options').evaluate((list) => {
    const listRect = list.getBoundingClientRect()
    const dialogRect = list.closest('dialog')!.getBoundingClientRect()
    return {
      inside: listRect.top >= dialogRect.top && listRect.bottom <= dialogRect.bottom,
      height: listRect.height,
    }
  })
  expect(
    candidateBounds.inside && candidateBounds.height >= 40,
    JSON.stringify(candidateBounds),
  ).toBeTruthy()
  await selectedRemoval.click()
  await expect(
    filterDialog.locator('.dialog-tag-options button:not([aria-pressed="true"])').first(),
  ).toBeVisible()
  await filterDialog
    .locator('.dialog-tag-options button:not([aria-pressed="true"])')
    .first()
    .click()
  await expect(filterDialog.locator('.selected-tag')).toHaveCount(genreCount)
  await filterDialog
    .locator('.selected-tag button')
    .evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()))
  await page.evaluate(() => {
    const candidates = document.querySelector('.dialog-tag-options')!
    const selected = document.querySelector('.selected-tag-list')!
    for (let index = 0; index < 100; index += 1) {
      candidates.append(document.createElement('button'))
      const tag = document.createElement('span')
      tag.textContent = `Synthetic selected genre ${index}`
      selected.append(tag)
    }
  })
  await expect(filterDialog.locator('.dialog-tag-options')).toBeInViewport()
  await expect(filterDialog.locator('.selected-tags')).toBeInViewport()
  await expect(filterDialog.locator('.selected-tag-list')).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  await page.setViewportSize({ width: 640, height: 360 })
  await expect(filterDialog.locator('.modal-heading')).toBeInViewport()
  await expect(filterDialog.getByRole('button', { name: '閉じる' })).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  await expect(filterDialog.locator('.selected-tag-list')).toBeInViewport()
  const selectedListOverflow = await filterDialog
    .locator('.selected-tag-list')
    .evaluate((list) => ({
      scroll: list.scrollHeight,
      client: list.clientHeight,
    }))
  expect(selectedListOverflow.scroll).toBeGreaterThan(selectedListOverflow.client)
  await expect(filterDialog.locator('.dialog-tag-options')).toBeInViewport()
  const denseCandidateBounds = await filterDialog
    .locator('.dialog-tag-options')
    .evaluate((list) => {
      const listRect = list.getBoundingClientRect()
      const dialogRect = list.closest('dialog')!.getBoundingClientRect()
      return listRect.top >= dialogRect.top && listRect.bottom <= dialogRect.bottom
    })
  expect(denseCandidateBounds).toBeTruthy()
  await filterDialog.getByRole('searchbox', { name: 'ジャンルを検索' }).fill('語学')
  await expect(filterDialog.getByRole('button', { name: '語学', exact: true })).toBeVisible()
  await filterDialog.getByRole('searchbox', { name: 'ジャンルを検索' }).fill('')
  await page.setViewportSize({ width: 390, height: 640 })
  await expect(filterDialog.locator('.modal-heading')).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.locator('.selected-tags')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  await page.setViewportSize({ width: 719, height: 607 })
  const overflow = await page
    .locator('.dialog-tag-options, .selected-tag-list')
    .evaluateAll((lists) =>
      lists.map((list) => ({ scroll: list.scrollHeight, client: list.clientHeight })),
    )
  expect(overflow.every(({ scroll, client }) => scroll > client)).toBeTruthy()
  await page.evaluate(() => {
    document
      .querySelectorAll('.dialog-tag-options button:empty')
      .forEach((button) => button.remove())
    document
      .querySelectorAll('.selected-tag-list > span:not(.selected-tag)')
      .forEach((tag) => tag.remove())
  })
  await page.addStyleTag({ content: '.account small { visibility: hidden; }' })
  await page.screenshot({ path: 'docs/assets/issue-15-filter-dialog-719x607.png', fullPage: true })
  await expect(filterDialog.getByRole('combobox')).toHaveCount(0)
  const languageChip = filterDialog.getByRole('button', { name: '語学', exact: true })
  await languageChip.click()
  await expect(languageChip).toHaveAttribute('aria-pressed', 'true')
  await filterDialog.getByRole('searchbox', { name: 'ジャンルを検索' }).fill('no matching genre')
  await expect(filterDialog.getByRole('button', { name: '語学を解除' })).toBeVisible()
  await page.setViewportSize({ width: 640, height: 360 })
  await expect(filterDialog.locator('.modal-heading')).toBeInViewport()
  await expect(filterDialog.getByLabel('資格名を検索')).toBeInViewport()
  await expect(filterDialog.getByLabel('ジャンルを検索')).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(filterDialog).toHaveCount(0)
  await expect(filterTrigger).toBeFocused()
  await expect(page.getByText('0件を表示')).toBeVisible()
  await expect(page.getByRole('button', { name: '＋ 記録を追加' })).toBeVisible()
  await expect(page.locator('footer')).toHaveCount(0)
  for (const path of ['/exam-attempts', '/settings']) {
    await nav.locator(`a[href="${path}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator(`a[href="${path}"]`)).toHaveAttribute('aria-current', 'page')
    if (path === '/exam-attempts') {
      const pageAdd = page.getByRole('button', { name: '＋ 記録を追加' })
      await expect(pageAdd).toBeVisible()
      await expect(pageAdd).toBeEnabled()
      await pageAdd.click()
      const startWizard = page.getByRole('dialog', { name: '資格・受験の記録' })
      await expect(startWizard).toBeVisible()
      await startWizard.locator('header').getByRole('button').click()
      await expect(startWizard).toHaveCount(0)
    } else {
      await expect(page.getByRole('button', { name: '＋ 記録を追加' })).toHaveCount(0)
    }
  }
  await nav.locator('a[href="/qualifications"]').last().click()
  await expect(nav.getByRole('link', { name: '資格一覧' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('footer')).toHaveCount(0)
  await page.setViewportSize({ width: 719, height: 611 })
  const narrowLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(narrowLayout.scrollWidth).toBeLessThanOrEqual(narrowLayout.viewport)
  await page.setViewportSize({ width: 390, height: 640 })
  const mobileLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.viewport)
  await filterTrigger.click()
  await expect(page.getByRole('button', { name: '語学を解除' })).toBeVisible()
  await page.getByRole('button', { name: '語学を解除' }).click()
  await expect(page.getByText('ジャンルは選択されていません')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.connection-dot')).toHaveClass(/online/)
  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill('破棄確認テスト')
  const wizard = page.getByRole('dialog', { name: '資格・受験の記録' })
  await wizard.locator('header').getByRole('button', { name: '閉じる' }).click()
  const discardDialog = page.getByRole('dialog', { name: '入力内容を破棄します' })
  await discardDialog.locator('header').getByRole('button', { name: '閉じる' }).click()
  await expect(discardDialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '資格名' })).toHaveValue('破棄確認テスト')
  await wizard.locator('header').getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('button', { name: '閉じて破棄する' }).click()
  await expect(wizard).toHaveCount(0)
  await registerQualification(page, 'E2E削除資格', '2022-01')
  await filterTrigger.click()
  const qualificationSearch = page.getByRole('searchbox', { name: '資格名を検索' })
  await qualificationSearch.fill('E2E削除資格')
  await expect(page.getByRole('button', { name: /E2E削除資格/ })).toBeVisible()
  await qualificationSearch.fill('no matching qualification')
  await expect(page.locator('.qualification-card')).toHaveCount(0)
  await qualificationSearch.fill('')
  await page.keyboard.press('Escape')
  const correctionDetail = page.getByRole('dialog', { name: 'E2E削除資格' })
  await page.getByRole('button', { name: /E2E削除資格/ }).click()
  await correctionDetail.getByRole('button', { name: '情報を訂正' }).click()
  const correctionEdit = page.getByRole('dialog', { name: '資格情報の訂正' })
  await page.getByRole('textbox', { name: '資格名' }).fill('未保存の訂正')
  const correctionDiscardDialog = page.getByRole('dialog', { name: '入力内容を破棄します' })
  await correctionEdit.locator('header').getByRole('button', { name: '閉じる' }).click()
  await correctionDiscardDialog.locator('header').getByRole('button', { name: '閉じる' }).click()
  await expect(correctionDiscardDialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '資格名' })).toHaveValue('未保存の訂正')
  await correctionEdit.locator('header').getByRole('button', { name: '閉じる' }).click()
  await page.keyboard.press('Escape')
  await expect(correctionDiscardDialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '資格名' })).toHaveValue('未保存の訂正')
  await correctionEdit.locator('header').getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('button', { name: '閉じて破棄する' }).click()
  await expect(correctionEdit).toHaveCount(0)

  await expect(
    page.locator('.qualification-card').filter({ hasText: 'E2E削除資格' }),
  ).not.toContainText('取得年月')
  const card = page.getByRole('button', { name: /E2E削除資格/ })
  await card.click()
  await page.getByRole('button', { name: '更新・記録を追加' }).click()
  await page.getByLabel('受験結果').selectOption('passed')
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('textbox', { name: '更新年月', exact: true }).fill('2024-01')
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await card.click()
  await addRenewalFromDetail(page, '2025-01')
  await card.click()
  await page.getByRole('button', { name: '最新更新を取り消す' }).click()
  await page.getByRole('button', { name: '同意して続ける' }).click()
  await expect(page.getByText('2024年1月', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill('E2E訂正資格')
  await page.getByRole('button', { name: '訂正を保存' }).click()
  await expect(page.getByText('2024年1月', { exact: true })).toBeVisible()
  await addRenewalFromDetail(page, '2026-01')
  await page.getByRole('button', { name: /E2E訂正資格/ }).click()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await page.getByRole('textbox', { name: '最新の更新年月', exact: true }).fill('2027-01')
  await page.getByRole('button', { name: '訂正を取り消す' }).click()
  await page.getByRole('button', { name: '情報を訂正' }).click()
  await expect(page.getByRole('textbox', { name: '最新の更新年月', exact: true })).toHaveValue(
    '2026-01',
  )
  await page.getByRole('button', { name: '訂正を取り消す' }).click()
  await page.getByRole('button', { name: '閉じる' }).click()

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/login')
  await secondPage.getByLabel('メールアドレス').fill(email)
  await secondPage.getByLabel('パスワード', { exact: true }).fill(password)
  await secondPage.getByRole('button', { name: 'ログイン' }).click()
  await expect(secondPage.getByRole('button', { name: /E2E訂正資格/ })).toBeVisible()
  const sessionOnlyTab = await secondContext.newPage()
  await sessionOnlyTab.goto('/qualifications')
  await expect(sessionOnlyTab.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible()
  await sessionOnlyTab.close()

  await page.getByRole('button', { name: /E2E訂正資格/ }).click()
  await page.getByRole('button', { name: '資格全体を削除' }).click()
  await page.getByRole('button', { name: '同意して続ける' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await registerQualification(page, 'E2E外部削除資格', '2023-02')
  await page.getByRole('button', { name: /E2E外部削除資格/ }).click()
  await secondPage.getByRole('button', { name: '記録を再取得' }).click()
  await expect(secondPage.getByRole('button', { name: /E2E外部削除資格/ })).toBeVisible()
  await secondPage.getByRole('button', { name: /E2E外部削除資格/ }).click()
  await secondPage.getByRole('button', { name: '資格全体を削除' }).click()
  await secondPage.getByRole('button', { name: '同意して続ける' }).click()
  await expect(secondPage.getByRole('dialog')).toHaveCount(0)
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await secondContext.close()

  const settingsTab = await page.context().newPage()
  await settingsTab.goto('/settings')
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeEnabled()
  const backupDownload = settingsTab.waitForEvent('download')
  await settingsTab.getByRole('button', { name: 'バックアップを書き出す' }).click()
  const download = await backupDownload
  await settingsTab.locator('input[type="file"]').setInputFiles((await download.path())!)
  await settingsTab.getByRole('button', { name: '内容を確認して全置換' }).click()
  const restoreConsent = settingsTab.getByRole('dialog', { name: '変更内容の確認' })
  await expect(restoreConsent).toBeVisible()

  const concurrentTab = await page.context().newPage()
  await concurrentTab.goto('/qualifications')
  await expect(concurrentTab.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await registerQualification(concurrentTab, '復元同意中の別タブ変更', '2021-01')
  await settingsTab.bringToFront()
  await restoreConsent.getByRole('button', { name: '同意して続ける' }).click()
  await expect(settingsTab.getByRole('alert')).toContainText(
    /既存記録が変更されています。更新して復元をやり直してください。/,
  )
  await expect(settingsTab.getByText(/復元の切り替え結果が未確認です/)).toHaveCount(0)
  await concurrentTab.reload()
  await expect(concurrentTab.getByRole('button', { name: /復元同意中の別タブ変更/ })).toBeVisible()

  const refreshedBackup = settingsTab.waitForEvent('download')
  await settingsTab.getByRole('button', { name: 'バックアップを書き出す' }).click()
  const refreshedDownload = await refreshedBackup
  await settingsTab.locator('input[type="file"]').setInputFiles((await refreshedDownload.path())!)
  await settingsTab.getByRole('button', { name: '内容を確認して全置換' }).click()
  const refreshedConsent = settingsTab.getByRole('dialog', { name: '変更内容の確認' })
  await expect(refreshedConsent).toBeVisible()
  await registerQualification(concurrentTab, '同意中refresh対象の別タブ変更', '2022-02')
  await settingsTab.bringToFront()
  const refreshButton = settingsTab.getByRole('button', { name: '記録を再取得' })
  const fetchedAt = settingsTab.locator('.status-bar > span > small')
  const previousFetch = await fetchedAt.innerText()
  await settingsTab.waitForTimeout(1100)
  await settingsTab.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.record-refresh button')?.click()
  })
  await expect(fetchedAt).not.toHaveText(previousFetch)
  await expect(refreshButton).toBeEnabled()
  await refreshedConsent.getByRole('button', { name: '同意して続ける' }).click()
  await expect(settingsTab.getByRole('alert')).toHaveText(
    '保存状態が変わりました。最新の記録を読み込んでから再確認してください。',
  )
  await expect(settingsTab.getByText(/復元の切り替え結果が未確認です/)).toHaveCount(0)
  await expect(refreshButton).toBeEnabled()
  await concurrentTab.reload()
  await expect(
    concurrentTab.getByRole('button', { name: /同意中refresh対象の別タブ変更/ }),
  ).toBeVisible()
  await concurrentTab.close()
  await settingsTab.close()
})

test('同意待機中にUIDが変わっても旧バックアップを別UIDへ復元しない', async ({ page, request }) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const firstEmail = `restore-owner-${Date.now()}@example.test`
  const secondEmail = `restore-other-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const firstAccount = await createVerifiedAccount(request, firstEmail, password)
  const secondAccount = await createVerifiedAccount(request, secondEmail, password)

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(firstEmail)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await registerQualification(page, 'UID変更前の所有者資格', '2024-04')

  const settingsTab = await page.context().newPage()
  await settingsTab.goto('/settings')
  const backupDownload = settingsTab.waitForEvent('download')
  await settingsTab.getByRole('button', { name: 'バックアップを書き出す' }).click()
  const backup = await backupDownload
  await settingsTab.locator('input[type="file"]').setInputFiles((await backup.path())!)
  await settingsTab.getByRole('button', { name: '内容を確認して全置換' }).click()
  const consent = settingsTab.getByRole('dialog', { name: '変更内容の確認' })
  await expect(consent).toBeVisible()

  await settingsTab.evaluate((uid) => {
    const lockWindow = window as typeof window & {
      restoreLockReady?: boolean
      releaseRestoreLock?: () => void
    }
    lockWindow.restoreLockReady = false
    void navigator.locks.request(`qr:mutation:${uid}`, async () => {
      lockWindow.restoreLockReady = true
      await new Promise<void>((resolve) => (lockWindow.releaseRestoreLock = resolve))
    })
  }, firstAccount.uid)
  await expect
    .poll(() =>
      settingsTab.evaluate(
        () => (window as typeof window & { restoreLockReady?: boolean }).restoreLockReady,
      ),
    )
    .toBe(true)
  await consent.getByRole('button', { name: '同意して続ける' }).click()

  const switchingTab = await page.context().newPage()
  await switchingTab.goto('/qualifications')
  await expect(switchingTab.getByRole('button', { name: /UID変更前の所有者資格/ })).toBeVisible()
  await switchingTab.getByRole('button', { name: 'アカウント' }).click()
  await switchingTab.getByRole('button', { name: 'ログアウト' }).click()
  await expect(switchingTab.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible()
  await switchingTab.getByLabel('メールアドレス').fill(secondEmail)
  await switchingTab.getByLabel('パスワード', { exact: true }).fill(password)
  await switchingTab.getByRole('button', { name: 'ログイン' }).click()
  await expect(switchingTab.getByRole('heading', { name: '資格一覧' })).toBeVisible()
  await settingsTab.getByRole('button', { name: 'アカウント' }).click()
  const accountDialog = settingsTab.getByRole('dialog', { name: 'アカウント' })
  await expect(accountDialog.getByText(secondEmail, { exact: true })).toBeVisible()
  await accountDialog.getByRole('button', { name: '閉じる' }).click()
  await expect(accountDialog).toHaveCount(0)

  let releaseBobSave!: () => void
  let signalBobSave!: () => void
  const bobSaveRequested = new Promise<void>((resolve) => (signalBobSave = resolve))
  const bobSaveGate = new Promise<void>((resolve) => (releaseBobSave = resolve))
  let bobWriteHeld = false
  await switchingTab.route('**/*', async (route) => {
    const request = route.request()
    if (!bobWriteHeld && request.url().includes(':8080') && request.method() === 'POST') {
      bobWriteHeld = true
      signalBobSave()
      await bobSaveGate
    }
    await route.continue()
  })
  const bobSave = registerQualification(switchingTab, 'UID切替後に保留中の通常保存', '2023-03')
  await bobSaveRequested

  await settingsTab.evaluate(() =>
    (window as typeof window & { releaseRestoreLock?: () => void }).releaseRestoreLock?.(),
  )
  await expect(settingsTab.getByRole('alert')).toHaveText(
    'ログイン状態が変わりました。内容を再確認してください。',
  )
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeDisabled()
  releaseBobSave()
  await bobSave
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeEnabled()
  await expect(settingsTab.getByRole('button', { name: '記録を再取得' })).toBeEnabled()
  await expect(settingsTab.getByRole('button', { name: '＋ 記録を追加' })).toHaveCount(0)
  await expect(settingsTab.getByText(/復元の切り替え結果が未確認です/)).toHaveCount(0)
  const pendingByUid = await settingsTab.evaluate(
    ({ firstUid, secondUid }) => [
      localStorage.getItem(`qr:restore-pending:${firstUid}`),
      localStorage.getItem(`qr:restore-pending:${secondUid}`),
    ],
    { firstUid: firstAccount.uid, secondUid: secondAccount.uid },
  )
  expect(pendingByUid).toEqual([null, null])

  const firestoreDocument = (uid: string) =>
    `http://127.0.0.1:8080/v1/projects/demo-qualification-records/databases/(default)/documents/users/${uid}`
  const firstRootResponse = await request.get(firestoreDocument(firstAccount.uid), {
    headers: { Authorization: `Bearer ${firstAccount.idToken}` },
  })
  expect(firstRootResponse.ok(), await firstRootResponse.text()).toBeTruthy()
  const firstRoot = await firstRootResponse.json()
  const firstDatasetId = firstRoot.fields.activeDatasetId.stringValue as string
  const firstRecordsResponse = await request.get(
    `${firestoreDocument(firstAccount.uid)}/datasets/${firstDatasetId}/qualifications`,
    { headers: { Authorization: `Bearer ${firstAccount.idToken}` } },
  )
  expect(firstRecordsResponse.ok(), await firstRecordsResponse.text()).toBeTruthy()
  expect(
    ((await firstRecordsResponse.json()).documents ?? []).map(
      (document: { fields: { name: { stringValue: string } } }) => document.fields.name.stringValue,
    ),
  ).toEqual(['UID変更前の所有者資格'])

  const secondRootResponse = await request.get(firestoreDocument(secondAccount.uid), {
    headers: { Authorization: `Bearer ${secondAccount.idToken}` },
  })
  expect(secondRootResponse.ok(), await secondRootResponse.text()).toBeTruthy()
  const secondRoot = await secondRootResponse.json()
  const secondDatasetId = secondRoot.fields.activeDatasetId.stringValue as string
  let bobQualificationId = ''
  for (const kind of ['qualifications', 'acquisitions', 'examAttempts']) {
    const response = await request.get(
      `${firestoreDocument(secondAccount.uid)}/datasets/${secondDatasetId}/${kind}`,
      { headers: { Authorization: `Bearer ${secondAccount.idToken}` } },
    )
    expect(response.ok(), await response.text()).toBeTruthy()
    const documents = (await response.json()).documents ?? []
    if (kind === 'qualifications') {
      expect(
        documents.map(
          (document: { fields: { name: { stringValue: string } } }) =>
            document.fields.name.stringValue,
        ),
      ).toEqual(['UID切替後に保留中の通常保存'])
      bobQualificationId = documents[0].name.split('/').at(-1) as string
    } else if (kind === 'acquisitions')
      expect(
        documents.map(
          (document: {
            fields: {
              qualificationId: { stringValue: string }
              acquiredMonth: { stringValue: string }
            }
          }) => [
            document.fields.qualificationId.stringValue,
            document.fields.acquiredMonth.stringValue,
          ],
        ),
      ).toEqual([[bobQualificationId, '2023-03']])
    else expect(documents).toEqual([])
  }
  await switchingTab.close()
  await settingsTab.close()
})

test('復元のロック待機中に開始した同一UIDの書き出しbusyを復元中止が解除しない', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await waitForAuthEmulator(request)
  const email = `restore-busy-owner-${Date.now()}@example.test`
  const password = 'e2e-password-123'
  const account = await createVerifiedAccount(request, email, password)
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('ログイン状態を記憶する').check()
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: '資格一覧' })).toBeVisible()

  const settingsTab = await page.context().newPage()
  await settingsTab.goto('/settings')
  const downloadPromise = settingsTab.waitForEvent('download')
  await settingsTab.getByRole('button', { name: 'バックアップを書き出す' }).click()
  const download = await downloadPromise
  await settingsTab.locator('input[type="file"]').setInputFiles((await download.path())!)
  await settingsTab.getByRole('button', { name: '内容を確認して全置換' }).click()
  const consent = settingsTab.getByRole('dialog', { name: '変更内容の確認' })
  await expect(consent).toBeVisible()
  await settingsTab.evaluate((uid) => {
    const lockWindow = window as typeof window & {
      restoreLockReady?: boolean
      releaseRestoreLock?: () => void
    }
    lockWindow.restoreLockReady = false
    void navigator.locks.request(`qr:mutation:${uid}`, async () => {
      lockWindow.restoreLockReady = true
      await new Promise<void>((resolve) => (lockWindow.releaseRestoreLock = resolve))
    })
  }, account.uid)
  await expect
    .poll(() =>
      settingsTab.evaluate(
        () => (window as typeof window & { restoreLockReady?: boolean }).restoreLockReady,
      ),
    )
    .toBe(true)
  await consent.getByRole('button', { name: '同意して続ける' }).click()

  let releaseExport!: () => void
  let signalExport!: () => void
  const exportRequested = new Promise<void>((resolve) => (signalExport = resolve))
  const exportGate = new Promise<void>((resolve) => (releaseExport = resolve))
  let exportHeld = false
  await settingsTab.route('**/*', async (route) => {
    const request = route.request()
    if (!exportHeld && request.url().includes(':8080') && request.method() === 'POST') {
      exportHeld = true
      signalExport()
      await exportGate
    }
    await route.continue()
  })
  const exportDownload = settingsTab.waitForEvent('download')
  await settingsTab.getByRole('button', { name: 'バックアップを書き出す' }).click()
  await exportRequested
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeDisabled()
  await settingsTab.evaluate(() =>
    (window as typeof window & { releaseRestoreLock?: () => void }).releaseRestoreLock?.(),
  )
  await expect(settingsTab.getByRole('alert')).toContainText('現在の状態では復元を開始できません')
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeDisabled()
  releaseExport()
  await exportDownload
  await expect(settingsTab.getByRole('button', { name: 'バックアップを書き出す' })).toBeEnabled()
  await settingsTab.close()
})
