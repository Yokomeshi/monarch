import {
  calibrate, clickCorners, expect, fixture, planExtent, planInput, pressTool, setUnits, setView, test, topView, uploadPlan,
} from './helpers'

test('upload a plan and calibrate it in Top view', async ({ app }) => {
  await setUnits(app, 'Imperial')
  await uploadPlan(app)
  await expect(app.getByText('Not calibrated')).toBeVisible()

  await setView(app, 'Top')
  await calibrate(app, `10'`)

  await expect(app.getByTestId('plan-size')).toHaveText(`20' 0" × 16' 0"`)
  await expect(app.getByText('Calibrated', { exact: true })).toBeVisible()
  await expect(app.locator('.measure-label')).toHaveText(`10' 0"`)

  await setUnits(app, 'Metric')
  await expect(app.getByTestId('plan-size')).toHaveText('6.096 m × 4.877 m')
  await expect(app.locator('.measure-label')).toHaveText('3.048 m')
})

test('a metric distance calibrates too', async ({ app }) => {
  await uploadPlan(app)
  await setView(app, 'Top')
  await calibrate(app, '250 cm')
  await expect(app.getByTestId('plan-size')).toHaveText('5.000 m × 4.000 m')
})

test('a file that is not an image is refused', async ({ app }) => {
  await planInput(app).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(app.getByText(`Couldn't read "notes.txt" as an image.`)).toBeVisible()
  await expect(app.getByTestId('plan-size')).toHaveCount(0)
})

test('an unreadable distance is rejected and Esc cancels calibration', async ({ app }) => {
  await uploadPlan(app)
  await setView(app, 'Top')
  await calibrate(app, 'about ten')
  await expect(app.getByText('Enter a length, e.g. 3.2 m')).toBeVisible()

  await app.keyboard.press('Escape')
  await expect(app.getByRole('button', { name: 'Calibrate scale' })).toBeVisible()
  await expect(app.getByText('Not calibrated')).toBeVisible()
})

test('replacing the plan keeps the walls and asks for calibration again', async ({ app }) => {
  await uploadPlan(app)
  await setView(app, 'Top')
  await calibrate(app, '250 cm')
  const at = await topView(app, planExtent(0.005))
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [at(-2, -1), at(2, -1)])
  await pressTool(app, 'Done')
  await expect(app.getByTestId('wall-length')).toHaveText('4.000 m')

  await planInput(app).setInputFiles(fixture('plan.png'))
  await expect(app.getByText('Not calibrated')).toBeVisible()
  await expect(app.getByTestId('wall-count')).toHaveText('1')
  await expect(app.getByTestId('wall-length')).toHaveText('4.000 m')
})
