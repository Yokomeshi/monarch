import { readFileSync, writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  calibrate, CALIBRATED, click, clickCorners, colourAt, emptySpot, expect, field, fixture, materialName, planExtent,
  planToWorld, setUnits, setView, test, topView, type, uploadPlan, view3d, pressTool
} from './helpers'

const text = (page: Page, id: string) => page.getByTestId(id).textContent()

async function save(page: Page, path: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save…' }).click()])
  expect(download.suggestedFilename()).toBe('monarch-project.json')
  await download.saveAs(path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

// One full session: every M1 feature, then save, reload and open.
test('a whole project survives save, reload and open', async ({ app }, testInfo) => {
  await setUnits(app, 'Imperial')
  await uploadPlan(app)
  await setView(app, 'Top')
  await calibrate(app, `10'`)

  // Trace the plan's outer room.
  const extent = planExtent(CALIBRATED)
  const world = planToWorld(CALIBRATED)
  const top = await topView(app, extent)
  await pressTool(app, 'Draw walls')
  await clickCorners(app, [[40, 40], [960, 40], [960, 760], [40, 760], [40, 40]].map(([x, y]) => top(...world(x, y))))
  await pressTool(app, 'Done')

  // Edit two walls and the new-wall default.
  await setView(app, '3D')
  const at = await view3d(app, extent)
  const east = at(world(960, 400)[0] + 0.075, 1.2, 0)
  const south = at(0, 1.2, world(500, 760)[1] + 0.075)
  const empty = await emptySpot(app)
  await click(app, east)
  await app.getByTestId('texture-input').setInputFiles(fixture('green-tile.png'))
  await type(app, 'Photo covers', `18"`)
  await type(app, 'Height', `10' 6"`)
  await click(app, south)
  await app.getByRole('radio', { name: 'Brick' }).click()
  await type(app, 'Thickness', `8"`)
  await click(app, empty)
  await app.getByRole('radio', { name: 'Wood' }).click()

  const snapshot = async () => {
    const s: Record<string, unknown> = {
      imperial: await app.getByRole('radio', { name: 'Imperial' }).getAttribute('aria-checked'),
      size: await text(app, 'plan-size'),
      count: await text(app, 'wall-count'),
      length: await text(app, 'wall-length'),
      calibration: await app.locator('.measure-label').textContent(),
      defaultMaterial: await materialName(app).textContent(),
    }
    await click(app, east)
    s.east = [await materialName(app).textContent(), await field(app, 'Height').inputValue(), await field(app, 'Photo covers').inputValue()]
    await click(app, south)
    s.south = [await materialName(app).textContent(), await field(app, 'Thickness').inputValue()]
    await click(app, empty)
    return s
  }
  const before = await snapshot()
  expect(before).toMatchObject({
    size: `20' 0" × 16' 0"`,
    count: '4',
    calibration: `10' 0"`,
    defaultMaterial: 'Wood',
    east: ['Photo: green-tile.png', `10' 6"`, `1' 6"`],
    south: ['Brick', `0' 8"`],
  })
  const coloursBefore = [await colourAt(app, east), await colourAt(app, south)]

  const path = testInfo.outputPath('monarch-project.json')
  const saved = await save(app, path)
  expect(saved.walls).toHaveLength(4)
  expect(saved.plan.image).toMatch(/^data:image\/png/)
  expect(Object.keys(saved.textures)).toHaveLength(1)

  await app.reload()
  await expect(app.getByText('Upload plan…')).toBeVisible()
  await expect(app.getByTestId('wall-count')).toHaveCount(0)

  // A damaged copy is refused and loads nothing.
  const damaged = testInfo.outputPath('damaged.json')
  writeFileSync(damaged, JSON.stringify({ ...saved, walls: [{ ...saved.walls[0], height: -1 }] }))
  await app.getByTestId('project-input').setInputFiles(damaged)
  await expect(app.getByTestId('project-error')).toContainText('damaged')
  await expect(app.getByTestId('wall-count')).toHaveCount(0)

  await app.getByTestId('project-input').setInputFiles(path)
  await expect(app.getByTestId('plan-size')).toBeVisible()
  await expect(app.getByTestId('project-error')).toHaveCount(0)
  expect(await snapshot()).toEqual(before)
  const coloursAfter = [await colourAt(app, east), await colourAt(app, south)]
  coloursAfter.flat().forEach((v, i) => expect(Math.abs(v - coloursBefore.flat()[i]), 'rendered colours match').toBeLessThanOrEqual(6))

  // Saving an opened project gives the same file.
  expect(await save(app, testInfo.outputPath('again.json'))).toEqual(saved)
})

test('a file that is not a project is refused and keeps the current work', async ({ app }) => {
  await uploadPlan(app)
  await app.getByTestId('project-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(app.getByTestId('project-error')).toHaveText("This file isn't a Monarch project.")
  await expect(app.getByTestId('plan-size')).toBeVisible()
})
