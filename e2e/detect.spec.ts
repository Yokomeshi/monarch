import {
  CALIBRATED, calibrate, colourAt, expect, planExtent, planToWorld, setView, test, topView, uploadPlan,
} from './helpers'

test('detect the walls drawn on a plan, check them, and add them', async ({ app }) => {
  await setView(app, 'Top')
  await uploadPlan(app)
  const detect = app.getByRole('button', { name: 'Detect walls' })
  await expect(detect, 'needs the scale first').toBeDisabled()

  await calibrate(app, '3.048 m') // the plan's marks are 10 ft apart
  const at = await topView(app, planExtent(CALIBRATED))
  const world = planToWorld(CALIBRATED)
  // On the plan's top wall, and on its red dimension line.
  const onWall = at(...world(500, 40))
  const onDimension = at(...world(400, 400))
  const isOrange = ([r, , b]: number[]) => r > 180 && r - b > 100

  expect(isOrange(await colourAt(app, onWall)), 'the drawn wall is black').toBe(false)
  await detect.click()
  // The outer rectangle, and the two walls of the inner room. The dimension line is not a wall.
  await expect(app.getByTestId('detect-result')).toContainText('Found 6 walls')
  expect(isOrange(await colourAt(app, onWall)), 'the suggestion is drawn over the wall').toBe(true)
  expect(isOrange(await colourAt(app, onDimension)), 'nothing over the dimension line').toBe(false)
  await expect(app.getByTestId('wall-count')).toBeHidden()

  await app.getByRole('button', { name: 'Discard' }).click()
  expect(isOrange(await colourAt(app, onWall)), 'gone when discarded').toBe(false)
  await expect(app.getByTestId('wall-count')).toBeHidden()

  await detect.click()
  await app.getByRole('button', { name: 'Add walls' }).click()
  await expect(app.getByTestId('wall-count')).toHaveText('6')
  // The walls meet properly: they close the inner room and the L-shaped room around it.
  await expect(app.getByTestId('rooms')).toHaveText(/^Room 1.*Room 2.*Total/)
  await expect(app.locator('.room-label')).toHaveCount(2)
})
