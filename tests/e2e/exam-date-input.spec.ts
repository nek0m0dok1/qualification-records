import { expect, test } from '@playwright/test'

test('年月日コントロールの範囲・暦日・外部クリアが同期し、無効値を送信しない', async ({
  page,
}, testInfo) => {
  await page.goto('/tests/fixtures/exam-date-input.html')

  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })

  const form = page.locator('form')
  const value = page.getByRole('textbox', { name: '受験年月（日は任意）', exact: true })
  const year = page.getByLabel('受験年月（日は任意）の年')
  const month = page.getByLabel('受験年月（日は任意）の月')
  const day = page.getByLabel('受験年月（日は任意）の日')

  await expect(value).toHaveValue('2024-05-12')
  await year.fill('2101')
  await year.press('Tab')
  await expect(value).toHaveValue('2101-05-12')
  await expect(page.getByRole('alert')).toContainText('1900年から2100年')
  expect(await value.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false)
  await form.getByRole('button', { name: '保存' }).click()
  expect(await page.evaluate(() => window.examDateFixture?.submitted.value)).toBe(0)
  expect(await page.evaluate(() => window.examDateFixture?.value.value)).toBe('2024-05-12')

  await year.fill('2024')
  await year.press('Tab')
  await value.fill('2024-01-31')
  await month.selectOption('02')
  await expect(value).toHaveValue('2024-02-31')
  await expect(day).toHaveValue('31')
  expect(await value.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false)
  expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false)
  await day.selectOption('29')
  await expect(value).toHaveValue('2024-02-29')
  expect(await page.evaluate(() => window.examDateFixture?.value.value)).toBe('2024-02-29')

  await year.fill('2023')
  await year.press('Tab')
  await expect(value).toHaveValue('2023-02-29')
  await expect(day).toHaveValue('29')
  expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false)
  await day.selectOption('28')
  await expect(value).toHaveValue('2023-02-28')

  await page.getByRole('button', { name: '外部値を空にする' }).click()
  await expect(value).toHaveValue('')
  await expect(year).toHaveValue('')
  await expect(month).toHaveValue('')
  await expect(page.getByRole('button', { name: '日も指定する' })).toHaveCount(1)
  await expect(page.getByLabel('受験年月（日は任意）の日')).toHaveCount(0)
})

test('日を未選択の年月変更では日指定を保ち、明示解除まで送信不可にする', async ({ page }) => {
  await page.goto('/tests/fixtures/exam-date-input.html')

  const form = page.locator('form')
  const value = page.getByRole('textbox', { name: '受験年月（日は任意）', exact: true })
  const year = page.getByLabel('受験年月（日は任意）の年')
  const month = page.getByLabel('受験年月（日は任意）の月')
  const day = page.getByLabel('受験年月（日は任意）の日')
  const removeDay = page.getByRole('button', { name: '年月のみにする' })

  await expect(value).toHaveValue('2024-05-12')
  await page.evaluate(() => {
    if (window.examDateFixture) window.examDateFixture.value.value = '2024-05'
  })
  await expect(value).toHaveValue('2024-05')
  await page.getByRole('button', { name: '日も指定する' }).click()
  await expect(day).toHaveValue('')
  await month.selectOption('06')
  await expect(value).toHaveValue('2024-06')
  await expect(day).toHaveValue('')
  await expect(removeDay).toBeVisible()
  expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false)
  await day.selectOption('15')
  await expect(value).toHaveValue('2024-06-15')

  await page.evaluate(() => {
    if (window.examDateFixture) window.examDateFixture.value.value = '2024-05'
  })
  await expect(value).toHaveValue('2024-05')
  await page.getByRole('button', { name: '日も指定する' }).click()
  await year.fill('2025')
  await year.press('Tab')
  await expect(value).toHaveValue('2025-05')
  await expect(day).toHaveValue('')
  await expect(removeDay).toBeVisible()
  await month.selectOption('06')
  await expect(value).toHaveValue('2025-06')
  await expect(day).toHaveValue('')
  expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false)
  await day.selectOption('15')
  await expect(value).toHaveValue('2025-06-15')
})

declare global {
  interface Window {
    examDateFixture?: {
      value: { value: string }
      submitted: { value: number }
    }
  }
}
