import {
  calibrate, click, clickCorners, drawRoom, expect, field, planExtent, planToWorld, setUnits, setView, settle,
  test, topView, type, UNCALIBRATED, uploadPlan, view3d, pressTool
} from './helpers'

const count = (app: import('@playwright/test').Page) => app.getByTestId('wall-count')
const heading = (app: import('@playwright/test').Page, name: string) => app.getByRole('heading', { name })

test('trace a closed room, then an open chain finished with Enter', async ({ app }) => {
  await drawRoom(app)
  await expect(app.getByTestId('wall-length')).toHaveText('20.000 m')

  const at = await topView(app)
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [at(-3, 0), at(0, 0), at(0, 2)])
  await app.keyboard.press('Enter')
  await expect(count(app)).toHaveText('6')
  await expect(app.getByTestId('wall-length')).toHaveText('25.000 m')
})

test('walls traced before calibration stay on the drawing afterwards', async ({ app }) => {
  await setUnits(app, 'Imperial')
  await uploadPlan(app)
  await setView(app, 'Top')
  const at = await topView(app, planExtent(UNCALIBRATED))
  const world = planToWorld(UNCALIBRATED)
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [[40, 40], [960, 40], [960, 760], [40, 760], [40, 40]].map(([x, y]) => at(...world(x, y))))
  await pressTool(app, 'Done')

  await calibrate(app, `10'`)
  // 2 x (920 + 720) px at 10 ft per 500 px.
  await expect(app.getByTestId('wall-length')).toHaveText(`65' 7 1/4"`)
})

test('drawing aids: Shift locks the angle, Backspace removes a corner, a double click adds no wall', async ({ app }) => {
  await setView(app, 'Top')
  const at = await topView(app)
  await pressTool(app, 'Draw walls')

  await click(app, at(-4, 0))
  await app.keyboard.down('Shift')
  // Points are on whole screen pixels (36 px per metre here): the browser rounds the mouse to them.
  await click(app, at(0, 0.5)) // 4 m across, slightly off horizontal
  await app.keyboard.up('Shift')
  await click(app, at(0, 3))
  await app.keyboard.press('Backspace') // drop the (0, 3) corner
  await click(app, at(0, 0.5)) // not the locked point, so this adds a short wall
  await app.keyboard.press('Enter')

  await expect(count(app)).toHaveText('2')
  // The locked wall keeps its length, hypot(4, 0.5) = 4.031 m, but lies flat, ending at
  // (0.031, 0). The second wall runs from there to (0, 0.5): 0.501 m.
  await expect(app.getByTestId('wall-length')).toHaveText('4.532 m')

  // Clicking the same spot twice finishes the chain without a zero-length wall.
  await click(app, at(2, 2))
  await click(app, at(4, 2))
  await click(app, at(4, 2))
  await expect(count(app)).toHaveText('3')
})

test('T-junctions, sharp angles and collinear walls render without errors', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [at(0, -2), at(0, 2)]) // ends partway along two walls
  await app.keyboard.press('Enter')
  await clickCorners(app, [at(5, 0), at(8, 0), at(5, 0.15)]) // very sharp angle
  await app.keyboard.press('Enter')
  await clickCorners(app, [at(-8, 4), at(-6, 4), at(-4, 4)]) // collinear
  await app.keyboard.press('Enter')
  await pressTool(app, 'Done')

  await expect(count(app)).toHaveText('9')
  await setView(app, '3D')
  await settle(app)
})

test('select a wall in 3D and edit it with the field and the slider', async ({ app }) => {
  await drawRoom(app)
  await expect(heading(app, 'New walls')).toBeVisible()
  await expect(field(app, 'Height')).toHaveValue('2.700 m')

  await setView(app, '3D')
  const at = await view3d(app)
  await click(app, at(3.075, 1.35, 0))
  await expect(heading(app, 'Selected wall')).toBeVisible()
  await expect(app.getByTestId('selected-length')).toHaveText('4.000 m')

  await type(app, 'Height', '3.5')
  await expect(field(app, 'Height')).toHaveValue('3.500 m')
  await expect(field(app, 'Height slider')).toHaveValue('3.5')
  await field(app, 'Thickness slider').fill('0.4')
  await expect(field(app, 'Thickness')).toHaveValue('0.400 m')

  await type(app, 'Height', 'abc')
  await expect(app.getByText('Enter a length, e.g. 2.7 m')).toBeVisible()
  await app.keyboard.press('Escape')
  await expect(field(app, 'Height')).toHaveValue('3.500 m')

  await type(app, 'Height', '50')
  await expect(field(app, 'Height')).toHaveValue('6.000 m')

  await type(app, 'Height', '3.5')
  await setUnits(app, 'Imperial')
  await expect(field(app, 'Height')).toHaveValue(`11' 5 3/4"`)
  await type(app, 'Height', `12'`)
  await setUnits(app, 'Metric')
  await expect(field(app, 'Height')).toHaveValue('3.658 m')
})

test('defaults apply to all walls, and Delete removes the selected wall', async ({ app }) => {
  await drawRoom(app)
  await type(app, 'Height', '2.4')
  await app.getByRole('button', { name: 'Apply to all walls' }).click()

  await setView(app, '3D')
  const at = await view3d(app)
  await click(app, at(3.075, 1.2, 0))
  await expect(field(app, 'Height')).toHaveValue('2.400 m')

  await app.keyboard.press('Delete')
  await expect(count(app)).toHaveText('3')
  await expect(heading(app, 'New walls')).toBeVisible()
})

test('Backspace while typing in a field edits the text, not the wall', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await click(app, at(3, 0))
  await expect(heading(app, 'Selected wall')).toBeVisible()

  await field(app, 'Height').click()
  await app.keyboard.press('Backspace')
  await app.keyboard.press('Delete')
  await expect(count(app)).toHaveText('4')
})

test('clicking a floor selects its room; clicking outside deselects, with or without a plan', async ({ app }) => {
  await drawRoom(app)
  let at = await topView(app)
  await click(app, at(3, 0))
  await expect(heading(app, 'Selected wall')).toBeVisible()
  await click(app, at(0, 0))
  await expect(heading(app, 'Selected room')).toBeVisible()
  await click(app, at(8, 8))
  await expect(heading(app, 'New walls')).toBeVisible()

  await uploadPlan(app) // 20 m x 16 m, so it lies under the room and around it
  at = await topView(app, planExtent(UNCALIBRATED))
  await click(app, at(3, 0))
  await expect(heading(app, 'Selected wall')).toBeVisible()
  await click(app, at(8, 7)) // on the plan, outside the room
  await expect(heading(app, 'New walls')).toBeVisible()
})

test('a wall drawn up to another wall snaps onto it, with or without the angle lock', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  const topWall = at(0, -2)
  await pressTool(app, 'Draw walls')

  // End 5 px short of the top wall: it snaps onto the wall, so the new wall is exactly 2 m.
  await click(app, at(0, 0))
  await click(app, { x: topWall.x, y: topWall.y + 5 })
  await app.keyboard.press('Enter')
  await expect(count(app)).toHaveText('5')
  await expect(app.getByTestId('wall-length')).toHaveText('22.000 m')

  // With Shift, a cursor that is off-axis and short still lands on the wall, straight up.
  await click(app, at(1, 0))
  await app.keyboard.down('Shift')
  await click(app, { x: at(1, -2).x + 3, y: topWall.y + 5 })
  await app.keyboard.up('Shift')
  await app.keyboard.press('Enter')
  await expect(count(app)).toHaveText('6')
  await expect(app.getByTestId('wall-length')).toHaveText('24.000 m')
})

test('closed rooms are listed with their areas, and a partition splits a room', async ({ app }) => {
  await setView(app, 'Top')
  const at = await topView(app)
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [at(-3, -2), at(3, -2), at(3, 2)])
  await app.keyboard.press('Enter')
  await expect(app.getByText('No closed rooms yet.')).toBeVisible()

  await clickCorners(app, [at(3, 2), at(-3, 2), at(-3, -2)])
  await app.keyboard.press('Enter')
  // 6 m x 4 m between centrelines, less a 0.15 m wall: 5.85 x 3.85.
  await expect(app.getByTestId('rooms')).toHaveText('Room 122.52 m²')
  await expect(app.locator('.room-label')).toHaveText('Room 122.52 m²')

  await clickCorners(app, [at(-1, -2), at(-1, 2)])
  await app.keyboard.press('Enter')
  // 1.85 x 3.85 and 3.85 x 3.85. The total, 21.945 m², sits on a rounding boundary,
  // so it is checked in square feet below instead.
  await expect(app.getByTestId('rooms')).toHaveText(/^Room 17\.12 m²Room 214\.82 m²Total/)
  await expect(app.locator('.room-label')).toHaveCount(2)

  await setUnits(app, 'Imperial')
  await expect(app.getByTestId('rooms-total')).toHaveText('236.2 sq ft')
})

test('the inspector is in view, right of the 3D view, once a wall is selected', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await click(app, at(0, -2))
  const selected = app.locator('.inspector').getByRole('heading', { name: 'Selected wall' })
  await expect(selected).toBeInViewport()
  const canvas = (await app.locator('canvas').boundingBox())!
  expect((await selected.boundingBox())!.x).toBeGreaterThan(canvas.x + canvas.width)
})
