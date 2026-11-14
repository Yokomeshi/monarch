import { readFileSync } from 'node:fs'
import {
  click, colourAt, drawRoom, expect, field, pressTool, setView, test, topView, type, view3d,
} from './helpers'

test('floors and ceilings render, and a room is edited through its floor', async ({ app }) => {
  await type(app, 'Height', '1') // low walls, so the floor is in plain view from the 3D camera
  await drawRoom(app)
  await setView(app, '3D')
  const at = await view3d(app)
  // Away from the room's label, which sits at its centre.
  const floor = at(-1.5, 0, -1)
  const ceiling = at(-1.5, 1, -1)
  const floorControls = app.getByTestId('material-floor')
  const ceilingControls = app.getByTestId('material-ceiling')

  let [r, g, b] = await colourAt(app, floor)
  expect(r, 'a new floor is wood').toBeGreaterThan(b + 40)

  await click(app, floor)
  await expect(app.getByRole('heading', { name: 'Selected room' })).toBeVisible()
  await expect(app.getByTestId('selected-area')).toHaveText('22.52 m²')
  await expect(floorControls.getByTestId('material-name')).toHaveText('Wood')

  await floorControls.getByRole('radio', { name: 'Concrete' }).click()
  ;[r, g, b] = await colourAt(app, floor)
  expect(Math.abs(r - b), 'concrete is grey').toBeLessThan(25)

  // Ceilings are hidden until switched on.
  await expect(app.getByText('Ceilings are hidden.')).toBeVisible()
  await app.getByRole('button', { name: 'Ceilings' }).click()
  await expect(app.getByText('Ceilings are hidden.')).toHaveCount(0)
  ;[r, g, b] = await colourAt(app, ceiling)
  expect(r, 'a new ceiling is light paint').toBeGreaterThan(150)
  await ceilingControls.getByRole('radio', { name: 'Brick' }).click()
  ;[r, g, b] = await colourAt(app, ceiling)
  expect(r, 'the ceiling turns brick red').toBeGreaterThan(Math.max(g, b) + 25)
  await app.getByRole('button', { name: 'Ceilings' }).click()

  // With floors off, the ground shows through.
  await app.getByRole('button', { name: 'Floors' }).click()
  expect(Math.max(...(await colourAt(app, floor))), 'no floor: dark ground').toBeLessThan(80)
  await app.getByRole('button', { name: 'Floors' }).click()

  // Walls are still selectable.
  await click(app, at(3.075, 0.5, 0))
  await expect(app.getByRole('heading', { name: 'Selected wall' })).toBeVisible()
})

test('a partition makes two rooms with their own floors, and one can be applied to all', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await pressTool(app, 'Draw walls')
  await click(app, at(-1, -2))
  await click(app, at(-1, 2))
  await app.keyboard.press('Enter')
  await pressTool(app, 'Done')
  const floorName = app.getByTestId('material-floor').getByTestId('material-name')

  await click(app, at(-2, 0))
  await expect(app.getByTestId('selected-area')).toHaveText('7.12 m²')
  await app.getByTestId('material-floor').getByRole('radio', { name: 'Stone' }).click()

  await click(app, at(1, 0))
  await expect(app.getByTestId('selected-area')).toHaveText('14.82 m²')
  await expect(floorName, 'the other room keeps the default').toHaveText('Wood')

  await click(app, at(-2, 0))
  await app.getByRole('button', { name: 'Apply to all rooms' }).click()
  await click(app, at(1, 0))
  await expect(floorName).toHaveText('Stone')
})

test('floor and ceiling materials are saved and reopened', async ({ app }, testInfo) => {
  await drawRoom(app)
  let at = await topView(app)
  await click(app, at(0, 0))
  await app.getByTestId('material-floor').getByRole('radio', { name: 'Stone' }).click()
  await app.getByTestId('material-ceiling').getByLabel('Color').fill('#224466')

  const path = testInfo.outputPath('rooms.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(2)

  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(app.getByTestId('wall-count')).toHaveText('4')
  await setView(app, 'Top')
  at = await topView(app)
  await click(app, at(0, 0))
  await expect(app.getByTestId('material-floor').getByTestId('material-name')).toHaveText('Stone')
  await expect(app.getByTestId('material-ceiling').getByLabel('Color')).toHaveValue('#224466')
  await expect(field(app, 'Height')).toHaveCount(0) // the wall panel gives way to the room panel
})
