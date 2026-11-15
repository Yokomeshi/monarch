import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  click, colourAt, drawRoom, expect, field, pressTool, setView, settle, test, topView, type, view3d,
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

/** The furniture as saved in the project file: exact positions, without relying on screen pixels. */
async function savedObjects(app: Page, path: string) {
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  return JSON.parse(readFileSync(path, 'utf8')).objects as { position: { x: number; z: number }; rotation: number }[]
}

async function drag(app: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await app.mouse.move(from.x, from.y)
  await app.mouse.down()
  await app.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await app.mouse.move(to.x, to.y, { steps: 5 })
  await app.mouse.up()
  await settle(app)
}

test('a piece dragged near a wall snaps flush with its back to the wall; Alt places it freely', async ({ app }, testInfo) => {
  await drawRoom(app) // walls 0.15 m thick; the east wall's inner face is at x = 2.925
  const at = await topView(app)
  await pressTool(app, 'Sofa') // 2 m wide, 0.9 m deep
  await click(app, at(0, 0))
  await drag(app, at(0, 0), at(2.4, 0))
  // Flush: 2.925 - 0.45. Its front now faces -x, into the room.
  await expect(app.getByTestId('rotation')).toHaveText('270°')

  await pressTool(app, 'Chair') // 0.45 m wide, 0.5 m deep
  await click(app, at(-1, 0))
  await app.keyboard.down('Alt')
  await drag(app, at(-1, 0), at(-2.6, 0)) // within reach of the west wall, but Alt is held
  await app.keyboard.up('Alt')
  await expect(app.getByTestId('rotation')).toHaveText('0°')

  const [sofa, chair] = await savedObjects(app, testInfo.outputPath('snap.json'))
  expect(sofa.position.x).toBeCloseTo(2.475, 6)
  expect(sofa.position.z).toBeCloseTo(0, 6)
  expect(sofa.rotation).toBeCloseTo(270, 6)
  expect(chair.position.x, 'left where it was dropped, not flush at -2.675').toBeCloseTo(-2.6, 1)
  expect(Math.abs(chair.position.x + 2.675)).toBeGreaterThan(0.03)
})

test('duplicate a piece and nudge it with the arrow keys', async ({ app }, testInfo) => {
  await setView(app, 'Top')
  const at = await topView(app)
  await pressTool(app, 'Table')
  await click(app, at(0, 0))

  await app.getByRole('button', { name: 'Duplicate' }).click()
  await expect(summary(app)).toHaveText('2 pieces')
  await expect(heading(app, 'Selected table')).toBeVisible()

  // The copy starts at (0.5, 0.5): two 5 cm steps right, one 50 cm step down.
  await app.keyboard.press('ArrowRight')
  await app.keyboard.press('ArrowRight')
  await app.keyboard.press('Shift+ArrowDown')
  await app.keyboard.press('Control+d')
  await expect(summary(app)).toHaveText('3 pieces')

  const [original, copy, second] = await savedObjects(app, testInfo.outputPath('nudge.json'))
  // The original was placed by a click, so its position is only as exact as the click.
  expect(original.position.x).toBeCloseTo(0, 6)
  expect(original.position.z).toBeCloseTo(0, 6)
  expect(copy.position.x - original.position.x).toBeCloseTo(0.6, 9)
  expect(copy.position.z - original.position.z).toBeCloseTo(1.0, 9)
  expect(second.position.x - copy.position.x).toBeCloseTo(0.5, 9)
  expect(second.position.z - copy.position.z).toBeCloseTo(0.5, 9)
})

test('cabinets: a base cabinet with drawers, and a wall cabinet hung above it without clashing', async ({ app }, testInfo) => {
  await drawRoom(app)
  const top = await topView(app)

  await pressTool(app, 'Base cabinet')
  await click(app, top(0, 0))
  await expect(app.getByRole('heading', { name: 'Selected base cabinet' })).toBeVisible()
  await expect(field(app, 'Height')).toHaveValue('0.900 m')
  await expect(field(app, 'Off floor')).toHaveValue('0.000 m')
  const fronts = (name: string) => app.getByRole('radiogroup', { name: 'Fronts' }).getByRole('radio', { name })
  await expect(fronts('Doors')).toBeChecked()
  await fronts('Drawers').click()
  await expect(fronts('Drawers')).toBeChecked()

  // A wall cabinet in the same spot hangs above the base cabinet: no clash.
  await pressTool(app, 'Wall cabinet')
  await click(app, top(0, 0))
  await expect(app.getByRole('heading', { name: 'Selected wall cabinet' })).toBeVisible()
  await expect(field(app, 'Off floor')).toHaveValue('1.450 m')
  await expect(app.getByTestId('checks-ok')).toBeVisible()
  // Lowered into the base cabinet, it clashes.
  await type(app, 'Off floor', '0.5 m')
  await expect(app.getByTestId('checks').getByRole('button')).toHaveText(['Base cabinet overlaps wall cabinet'])
  await type(app, 'Off floor', '1.45 m')
  await expect(app.getByTestId('checks-ok')).toBeVisible()

  // Both survive save and open.
  const path = testInfo.outputPath('cabinets.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(app.getByTestId('furniture-summary')).toHaveText('2 pieces')
  // Still hung at its height: on the floor it would clash with the base cabinet under it.
  await expect(app.getByTestId('checks-ok')).toBeVisible()
})
