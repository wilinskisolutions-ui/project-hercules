import { expect, test } from '@playwright/test'

test('unlock, save, and reload a daily log', async ({ page }) => {
  let dailyLogs = []
  await page.route('**/functions/v1/ledger', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        json: {
          dailyLogs,
          measurements: [],
          workouts: [],
          targets: { calories: 2600, protein: 200 },
          adjustments: [],
          heightIn: 75,
          empty: dailyLogs.length === 0,
        },
      })
    }
    const body = request.postDataJSON()
    if (body.op === 'upsert_daily') dailyLogs = [body.row]
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/')
  await page.getByLabel('Passphrase').fill('EMIL')
  await page.getByRole('button', { name: 'Open ledger' }).click()
  await expect(page.getByText('Today’s command center')).toBeVisible()

  await page.getByLabel('Morning weight (lb)').fill('234.5')
  await page.getByLabel('Calories').fill('2500')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByText('Daily log saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('234.5')).toBeVisible()
})

