import {
  click, colourAt, drawRoom, expect, field, pressTool, setView, settle, test, topView, type, view3d,
} from './helpers'
import type { Page } from '@playwright/test'

const heading = (app: Page, name: string) => app.getByRole('heading', { name })
const summary = (app: Page) => app.getByTestId('opening-summary')

// drawRoom's east wall runs from (3, -2) to (3, 2), so a click at z is 2 + z metres along it.

test('place a door by clicking a wall, then size and move it', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await pressTool(app, 'Place door')
  await expect(app.getByText('Click a wall to place the door.')).toBeVisible()
  await click(app, at(3, 1))

  await expect(heading(app, 'Selected door')).toBeVisible()
  await expect(summary(app)).toHaveText('1 door, 0 windows')
  await expect(field(app, 'Position')).toHaveValue('3.000 m')
  await expect(field(app, 'Width')).toHaveValue('0.900 m')
  await expect(field(app, 'Height')).toHaveValue('2.100 m')
  await expect(field(app, 'Sill'), 'doors have no sill').toHaveCount(0)

  await type(app, 'Width', '1.2')
  await expect(field(app, 'Width')).toHaveValue('1.200 m')
  await type(app, 'Position', '0.2') // too close to the wall's end: kept 0.1 m clear
  await expect(field(app, 'Position')).toHaveValue('0.700 m')
  await field(app, 'Height slider').fill('1.8')
  await expect(field(app, 'Height')).toHaveValue('1.800 m')

  await expect(app.getByTestId('hinge')).toHaveText('start side')
  await app.getByRole('button', { name: 'Flip hinge' }).click()
  await expect(app.getByTestId('hinge')).toHaveText('end side')
  await app.getByRole('button', { name: 'Flip swing' }).click()
  await expect(app.getByTestId('swing')).toHaveText('right')
})

test('windows have a sill; a taken spot is refused; an opening cannot move into its neighbour', async ({ app }) => {
  await drawRoom(app)
  const at = await topView(app)
  await pressTool(app, 'Place window')
  await click(app, at(3, -1))
  await expect(heading(app, 'Selected window')).toBeVisible()
  await expect(field(app, 'Sill')).toHaveValue('0.900 m')
  await expect(field(app, 'Position')).toHaveValue('1.000 m')

  // The window occupies 0.4 .. 1.6 m along the wall.
  await pressTool(app, 'Place door')
  await click(app, at(3, -1.25))
  await expect(app.getByText('That spot is taken, or the wall is too small.')).toBeVisible()
  await expect(summary(app)).toHaveText('0 doors, 1 window')
  await click(app, at(3, 1))
  await expect(summary(app)).toHaveText('1 door, 1 window')
  await expect(heading(app, 'Selected door')).toBeVisible()

  await type(app, 'Position', '1.5') // would overlap the window
  await expect(field(app, 'Position')).toHaveValue('3.000 m')
  await type(app, 'Position', '2.05') // ends exactly where the window starts
  await expect(field(app, 'Position')).toHaveValue('2.050 m')

  await field(app, 'Position').blur() // leave the text field, so Delete acts on the door
  await app.keyboard.press('Delete')
  await expect(summary(app)).toHaveText('0 doors, 1 window')
  await expect(heading(app, 'New walls')).toBeVisible()

  await pressTool(app, 'Place window')
  await app.keyboard.press('Escape')
  await expect(app.getByRole('button', { name: 'Place door' })).toBeVisible()
})

test('a door is a real opening in 3D, selectable through the doorway, and is saved', async ({ app }, testInfo) => {
  await drawRoom(app)
  const top = await topView(app)
  await setView(app, '3D')
  const at = await view3d(app)
  const doorway = at(3.075, 1, 0) // middle of the east wall's outer face
  let [r, , b] = await colourAt(app, doorway)
  expect(Math.abs(r - b), 'solid painted wall').toBeLessThan(40)

  await setView(app, 'Top')
  await pressTool(app, 'Place door')
  await click(app, top(3, 0))
  await app.getByRole('button', { name: 'Flip hinge' }).click()
  await click(app, top(8, 8)) // deselect, so no outline is in the way
  await setView(app, '3D')
  ;[r, , b] = await colourAt(app, doorway)
  expect(r, 'through the doorway: the wood floor or the door leaf, not the wall').toBeGreaterThan(b + 25)

  await click(app, doorway)
  await expect(heading(app, 'Selected door')).toBeVisible()

  const path = testInfo.outputPath('door.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(summary(app)).toHaveText('1 door, 0 windows')
  await settle(app)
  await click(app, doorway)
  await expect(app.getByTestId('hinge')).toHaveText('end side')
  await expect(field(app, 'Position')).toHaveValue('2.000 m')

  await app.getByRole('button', { name: 'Delete door' }).click()
  await expect(summary(app)).toHaveCount(0)
  ;[r, , b] = await colourAt(app, doorway)
  expect(Math.abs(r - b), 'the wall is solid again').toBeLessThan(40)
})
