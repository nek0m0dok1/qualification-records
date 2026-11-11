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

async function registerQualification(page: Page, name: string, month: string) {
  await page.getByRole('button', { name: '＋ 記録を追加' }).click()
  await page.getByLabel('新資格の登録').check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('textbox', { name: '資格名' }).fill(name)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('button', { name: '取得年月カレンダーを開く', exact: true }).click()
  const calendar = page.getByRole('group', { name: '取得年月カレンダー', exact: true })
  await calendar.getByLabel('年', { exact: true }).selectOption(String(Number(month.slice(0, 4))))
  await calendar.getByLabel('月', { exact: true }).selectOption(String(Number(month.slice(5, 7))))
  await page.locator('.target-summary').click()
  await expect(calendar).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '取得年月', exact: true })).toHaveValue(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
}

async function addRenewalFromDetail(page: Page, month: string) {
  await page.getByRole('button', { name: '受験・更新を追加' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByLabel('あなたの資格のみ登録する').check()
  await page.getByRole('textbox', { name: '更新年月', exact: true }).fill(month)
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '記録を保存' }).click()
}

test('主要フロー: 取り消し後の訂正年月と自己削除・別画面からの削除', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(60_000)
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
  await expect(page.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
  await expect(page).toHaveURL(/qualifications$/)
  await expect(page.getByRole('button', { name: '記録を再取得', exact: true })).toBeEnabled({
    timeout: 15_000,
  })
  const rememberedTab = await page.context().newPage()
  await rememberedTab.goto('/qualifications')
  await expect(rememberedTab.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
  await expect(
    rememberedTab.getByRole('button', { name: '記録を再取得', exact: true }),
  ).toBeEnabled({ timeout: 15_000 })
  await rememberedTab.close()
  await page.setViewportSize({ width: 719, height: 607 })
  const nav = page.getByRole('navigation', { name: '主要画面' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: 'あなたの資格' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const navBox = await nav.boundingBox()
  const mainBox = await page.locator('.workspace-content').boundingBox()
  expect(navBox && mainBox && navBox.x >= mainBox.x + mainBox.width).toBeTruthy()
  const filterTrigger = nav.getByRole('button', { name: /検索・絞り込み/ })
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
  const footerAdd = page.locator('footer').getByRole('button', { name: '＋ 記録を追加' })
  for (const path of ['/exam-attempts', '/settings']) {
    await nav.locator(`a[href="${path}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator(`a[href="${path}"]`)).toHaveAttribute('aria-current', 'page')
    await expect(footerAdd).toBeVisible()
    await expect(footerAdd).toBeEnabled()
    await footerAdd.click()
    const startWizard = page.getByRole('dialog', { name: '資格・受験の記録' })
    await expect(startWizard).toBeVisible()
    await startWizard.locator('header').getByRole('button').click()
    await expect(startWizard).toHaveCount(0)
  }
  await nav.locator('a[href="/qualifications"]').last().click()
  await expect(nav.getByRole('link', { name: 'あなたの資格' })).toHaveAttribute(
    'aria-current',
    'page',
  )
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
  await page.getByRole('button', { name: '受験・更新を追加' }).click()
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
  await expect(concurrentTab.getByRole('heading', { name: 'あなたの資格' })).toBeVisible()
  await registerQualification(concurrentTab, '復元同意中の別タブ変更', '2021-01')
  await settingsTab.bringToFront()
  await restoreConsent.getByRole('button', { name: '同意して続ける' }).click()
  await expect(settingsTab.getByRole('alert')).toContainText(
    /保存状態が変わりました|現在の状態では復元を開始できません/,
  )
  await expect(settingsTab.getByText(/復元の切り替え結果が未確認です/)).toHaveCount(0)
  await concurrentTab.reload()
  await expect(concurrentTab.getByRole('button', { name: /復元同意中の別タブ変更/ })).toBeVisible()
  await concurrentTab.close()
  await settingsTab.close()
})
