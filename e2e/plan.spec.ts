import {
  CALIBRATED, PLAN_PX, UNCALIBRATED, settle,
  calibrate, clickCorners, colourAt, expect, fixture, planExtent, planInput, planToWorld, pressTool, setUnits, setView, test,
  topView, uploadPlan,
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

test('point markers stay small on screen however the plan is scaled', async ({ app }) => {
  await uploadPlan(app)
  await setView(app, 'Top')
  await calibrate(app, '50 cm') // a tiny scale: the whole plan is 1 m wide
  const scale = 0.5 / 500
  const at = await topView(app, planExtent(scale))
  const [x, z] = planToWorld(scale)(250, 400)
  const marker = at(x, z)

  const [r, , b] = await colourAt(app, marker)
  expect(b, 'the marker is drawn at the point').toBeGreaterThan(r + 50)
  // 14 px away diagonally the plan's white paper must show, not the marker.
  const beside = await colourAt(app, { x: marker.x - 14, y: marker.y - 14 })
  expect(Math.min(...beside), 'the plan is visible right beside the marker').toBeGreaterThan(200)
})

test('calibrate by pressing on one mark and dragging to the other; Shift keeps the line straight', async ({ app }) => {
  await setUnits(app, 'Imperial')
  await uploadPlan(app)
  await setView(app, 'Top')
  const distance = app.getByLabel('Real distance between the points')
  const size = app.getByTestId('plan-size')
  /** Press on the plan's left mark and drag to its right mark, ending `below` screen pixels under it. */
  const drag = async (metresPerPx: number, below: number, shift = false) => {
    const at = await topView(app, planExtent(metresPerPx))
    const world = planToWorld(metresPerPx)
    const from = at(...world(250, 400))
    const to = at(...world(750, 400))
    const end = { x: to.x, y: to.y + below }
    await pressTool(app, 'Calibrate scale')
    await app.mouse.move(from.x, from.y)
    await app.mouse.down()
    if (shift) await app.keyboard.down('Shift')
    await app.mouse.move((from.x + end.x) / 2, (from.y + end.y) / 2, { steps: 5 })
    await app.mouse.move(end.x, end.y, { steps: 5 })
    await app.mouse.up()
    if (shift) await app.keyboard.up('Shift')
    await expect(distance, 'both points are picked by the one drag').toBeVisible()
    await distance.fill(`10'`)
    await app.getByRole('button', { name: 'Set scale' }).click()
    await settle(app)
  }

  // Straight from mark to mark: the plan is 20 ft wide, as when clicking the two marks.
  await drag(UNCALIBRATED, 0)
  await expect(size).toHaveText(`20' 0" × 16' 0"`)

  // A hand that drifts 30 px off the line measures a longer span, so the plan comes out smaller...
  await drag(CALIBRATED, 30)
  await expect(size).not.toHaveText(`20' 0" × 16' 0"`)
  // ...unless Shift holds the line level. (The scale is now slightly off, so aim by the scale just set.)
  await setUnits(app, 'Metric')
  const drifted = parseFloat((await size.textContent())!) // the plan's width in metres
  await setUnits(app, 'Imperial')
  await drag(drifted / PLAN_PX.width, 30, true)
  await expect(size).toHaveText(`20' 0" × 16' 0"`)
})
