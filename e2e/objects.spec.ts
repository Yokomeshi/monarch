import type { Page } from '@playwright/test'
import {
  click, colourAt, expect, field, pressTool, setView, settle, test, topView, type, view3d,
} from './helpers'

const heading = (app: Page, name: string) => app.getByRole('heading', { name })
const summary = (app: Page) => app.getByTestId('furniture-summary')

test('place a bed from the library, then resize, rotate and delete it', async ({ app }) => {
  await setView(app, 'Top')
  const at = await topView(app)
  await pressTool(app, 'Bed')
  await expect(app.getByText('Click in the view to place the bed.')).toBeVisible()
  await click(app, at(0, 0))

  await expect(heading(app, 'Selected bed')).toBeVisible()
  await expect(summary(app)).toHaveText('1 piece')
  await expect(field(app, 'Width')).toHaveValue('1.600 m')
  await expect(field(app, 'Depth')).toHaveValue('2.000 m')
  await expect(field(app, 'Height')).toHaveValue('0.900 m')

  await type(app, 'Width', '1.8')
  await expect(field(app, 'Width')).toHaveValue('1.800 m')
  await type(app, 'Depth', '99') // capped at the slider's 6 m
  await expect(field(app, 'Depth')).toHaveValue('6.000 m')

  await expect(app.getByTestId('rotation')).toHaveText('0°')
  await app.getByRole('button', { name: 'Rotate 90°' }).click()
  await expect(app.getByTestId('rotation')).toHaveText('90°')
  await field(app, 'Rotation').fill('45')
  await expect(app.getByTestId('rotation')).toHaveText('45°')

  await app.getByRole('radio', { name: 'Stone' }).click()
  await expect(app.getByTestId('material-name')).toHaveText('Stone')

  await app.keyboard.press('Delete')
  await expect(summary(app)).toHaveCount(0)
  await expect(heading(app, 'New walls')).toBeVisible()

  await pressTool(app, 'Sofa')
  await app.keyboard.press('Escape')
  await expect(app.getByRole('button', { name: 'Sofa', exact: true })).toBeVisible()
})

test('drag a piece to move it; the camera stays put and still works afterwards', async ({ app }) => {
  await setView(app, 'Top')
  const at = await topView(app)
  await pressTool(app, 'Table') // 1.6 m x 0.9 m
  await click(app, at(0, 0))
  await click(app, at(8, 8))
  await expect(heading(app, 'New walls')).toBeVisible()

  const from = at(0, 0)
  const to = at(3, 2)
  await app.mouse.move(from.x, from.y)
  await app.mouse.down()
  await app.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await app.mouse.move(to.x, to.y, { steps: 5 })
  await app.mouse.up()
  await settle(app)
  await expect(heading(app, 'Selected table'), 'pressing on a piece selects it').toBeVisible()

  // The table is now at (3, 2) and no longer at (0, 0). Had the camera panned instead, these would miss.
  await click(app, at(8, 8))
  await click(app, at(0, 0))
  await expect(heading(app, 'New walls')).toBeVisible()
  await click(app, at(3, 2))
  await expect(heading(app, 'Selected table')).toBeVisible()

  // The camera still responds: zooming in moves the table away from that spot on screen,
  // and Frame plan brings the view, and the table, back.
  await click(app, at(8, 8))
  const centre = at(0, 0)
  await app.mouse.move(centre.x, centre.y)
  for (let i = 0; i < 15; i++) await app.mouse.wheel(0, -120)
  await settle(app)
  await click(app, at(3, 2))
  await expect(heading(app, 'New walls'), 'zoomed in, the table is elsewhere on screen').toBeVisible()
  await app.getByRole('button', { name: 'Frame plan' }).click()
  await settle(app)
  await click(app, at(3, 2))
  await expect(heading(app, 'Selected table')).toBeVisible()
})

test('furniture renders in 3D and survives save and reopen', async ({ app }, testInfo) => {
  await setView(app, 'Top')
  const top = await topView(app)
  await pressTool(app, 'Wardrobe') // 1.2 m wide, 0.6 m deep, 2 m high
  await click(app, top(0, 0))
  await type(app, 'Height', '2.2')
  await app.getByRole('button', { name: 'Rotate 90°' }).click()
  await click(app, top(8, 8))

  await setView(app, '3D')
  const at = await view3d(app)
  // Rotated 90 degrees, its 1.2 m width runs along z. The camera sees the top from above.
  const topFace = at(0, 2.2, 0)
  const [r, , b] = await colourAt(app, topFace)
  expect(r, 'the wardrobe is wood').toBeGreaterThan(b + 40)

  const path = testInfo.outputPath('furniture.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(summary(app)).toHaveText('1 piece')
  await settle(app)
  await click(app, topFace)
  await expect(heading(app, 'Selected wardrobe')).toBeVisible()
  await expect(field(app, 'Height')).toHaveValue('2.200 m')
  await expect(app.getByTestId('rotation')).toHaveText('90°')
})
