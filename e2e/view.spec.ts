import { click, colourAt, drawRoom, emptySpot, expect, field, settle, setView, test, topView, view3d } from './helpers'

test('cutaway cuts the walls in the view so the rooms show, without changing the walls', async ({ app }) => {
  await drawRoom(app) // walls 2.7 m high
  await setView(app, '3D')
  const at = await view3d(app)
  const floor = at(0, 0, 0) // the middle of the floor, hidden behind the near walls from this angle
  const cutaway = app.getByRole('button', { name: 'Cutaway' })

  let [r, , b] = await colourAt(app, floor)
  expect(Math.abs(r - b), 'a painted wall is in the way').toBeLessThan(40)

  await cutaway.click()
  await expect(cutaway).toHaveAttribute('aria-pressed', 'true')
  ;[r, , b] = await colourAt(app, floor)
  expect(r, 'the wood floor shows over the cut walls').toBeGreaterThan(b + 40)

  // Ceilings stay out of the way while cutaway is on.
  await app.getByRole('button', { name: 'Ceilings' }).click()
  ;[r, , b] = await colourAt(app, floor)
  expect(r, 'still the floor, not a ceiling').toBeGreaterThan(b + 40)
  await app.getByRole('button', { name: 'Ceilings' }).click()

  // The wall itself is still 2.7 m: only the drawing is cut.
  await click(app, at(3.075, 0.6, 0))
  await expect(app.getByRole('heading', { name: 'Selected wall' })).toBeVisible()
  await expect(field(app, 'Height')).toHaveValue('2.700 m')
  await click(app, await emptySpot(app))

  await cutaway.click()
  ;[r, , b] = await colourAt(app, floor)
  expect(Math.abs(r - b), 'the full wall is back').toBeLessThan(40)
})

test('walk through a room: look, move, stop at walls, and leave', async ({ app }) => {
  await drawRoom(app) // 6 m x 4 m, centred on the origin; walls 2.7 m high
  const top = await topView(app)
  await click(app, top(0, -2)) // the north wall, straight ahead of where the walk starts
  await app.getByRole('radio', { name: 'Brick' }).click()
  await click(app, top(8, 8))

  const walk = app.getByRole('button', { name: 'Walk' })
  await walk.click()
  await expect(walk).toHaveAttribute('aria-pressed', 'true')
  await expect(app.getByText('drag to look')).toBeVisible()
  await expect(app.locator('.room-label'), 'Top-view labels are hidden on a walk').toHaveCount(0)
  await settle(app)

  const box = (await app.locator('canvas').boundingBox())!
  const ahead = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // Bottom of the view, to the right of the help bar.
  const down = { x: box.x + box.width - 60, y: box.y + box.height - 14 }
  const up = { x: ahead.x, y: box.y + 70 }
  const isBrick = ([r, g, b]: number[]) => r > Math.max(g, b) + 25
  const isWood = ([r, g, b]: number[]) => r > b + 40 && g > b + 15
  const hold = async (key: string, ms: number) => {
    await app.keyboard.down(key)
    await app.waitForTimeout(ms)
    await app.keyboard.up(key)
    await settle(app)
  }

  // Standing in the middle, 2 m from the brick wall, at eye height.
  expect(isBrick(await colourAt(app, ahead)), 'the brick wall is straight ahead').toBe(true)
  expect(isBrick(await colourAt(app, down)), 'this close, the wall fills the view down to the bottom').toBe(true)
  const ceiling = await colourAt(app, up)
  expect(Math.abs(ceiling[0] - ceiling[2]), 'a painted ceiling is overhead, though Ceilings is off').toBeLessThan(40)

  // Backing away brings the floor into view below the wall.
  await hold('s', 1200)
  expect(isBrick(await colourAt(app, ahead))).toBe(true)
  expect(isWood(await colourAt(app, down)), 'the wood floor shows once further from the wall').toBe(true)

  // Keep backing up: the wall behind stops the walker, who stays inside on the wood floor.
  await hold('s', 3000)
  expect(isWood(await colourAt(app, down)), 'still inside the room').toBe(true)

  // Turn right to face the painted east wall.
  await hold('ArrowRight', 1000)
  const east = await colourAt(app, ahead)
  expect(isBrick(east), 'no longer facing the brick wall').toBe(false)
  expect(Math.abs(east[0] - east[2]), 'facing a painted wall').toBeLessThan(40)

  // Nothing can be selected while walking.
  await click(app, ahead)
  await expect(app.getByRole('heading', { name: 'Selected wall' })).toHaveCount(0)

  await app.keyboard.press('Escape')
  await expect(walk).toHaveAttribute('aria-pressed', 'false')
  await expect(app.getByText('drag to look')).toHaveCount(0)
  // Back in Top view, where editing works again.
  await settle(app)
  await click(app, top(0, -2))
  await expect(app.getByRole('heading', { name: 'Selected wall' })).toBeVisible()
})
