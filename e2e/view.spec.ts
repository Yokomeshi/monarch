import { click, colourAt, drawRoom, emptySpot, expect, field, setView, test, view3d } from './helpers'

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
