import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { click, drawRoom, expect, settle, test, topView } from './helpers'

/** A saved picture: its size, and the colour at a point given as fractions of its width and height. */
async function picture(page: Page, path: string, type: string) {
  const b64 = readFileSync(path).toString('base64')
  const size = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    ;(window as any).__picture = canvas
    return { width: canvas.width, height: canvas.height }
  }, `data:${type};base64,${b64}`)
  const at = (u: number, v: number) =>
    page.evaluate(
      ([u, v]) => {
        const canvas = (window as any).__picture as HTMLCanvasElement
        const d = canvas.getContext('2d')!.getImageData(Math.floor(u * canvas.width) - 8, Math.floor(v * canvas.height) - 8, 16, 16).data
        const sum = [0, 0, 0]
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c]
        return sum.map((s) => Math.round(s / (d.length / 4)))
      },
      [u, v],
    )
  return { size, at }
}

const isBrick = ([r, g, b]: number[]) => r > Math.max(g, b) + 25
const isWood = ([r, g, b]: number[]) => r > b + 40 && g > b + 15
const isPaint = ([r, , b]: number[]) => Math.abs(r - b) < 40 && r > 60

test('save the current view as a large image', async ({ app }, testInfo) => {
  await drawRoom(app)
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save image' }).click()])
  expect(download.suggestedFilename()).toBe('monarch-view.png')
  const path = testInfo.outputPath('view.png')
  await download.saveAs(path)

  const { size, at } = await picture(app, path, 'image/png')
  expect(size.width).toBe(3840)
  const canvas = (await app.locator('canvas').boundingBox())!
  expect(size.height / size.width, 'the shape of the view').toBeCloseTo(canvas.height / canvas.width, 2)
  // Top view of the room: wood floor in the middle, dark background in the corner.
  expect(isWood(await at(0.5, 0.5)), 'the floor is in the picture').toBe(true)
  expect((await at(0.03, 0.97)).every((c) => c < 60), 'and the empty background').toBe(true)

  // The view carries on working at its normal size afterwards.
  await settle(app)
  const top = await topView(app)
  await click(app, top(0, -2))
  await expect(app.getByRole('heading', { name: 'Selected wall' })).toBeVisible()
})

test('save a 360° panorama from where the walker stands', async ({ app }, testInfo) => {
  test.slow() // walking redraws continuously, which software rendering does slowly
  await drawRoom(app) // 6 m x 4 m; the walk starts in the middle, facing the north wall
  const top = await topView(app)
  await click(app, top(0, -2))
  await app.getByRole('radio', { name: 'Brick' }).click()
  await click(app, top(8, 8))
  await expect(app.getByRole('button', { name: 'Save 360°' }), 'only offered on a walk').toBeHidden()

  await app.getByRole('button', { name: 'Walk' }).click()
  await settle(app)
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save 360°' }).click()])
  expect(download.suggestedFilename()).toBe('monarch-360.jpg')
  const path = testInfo.outputPath('360.jpg')
  await download.saveAs(path)

  const { size, at } = await picture(app, path, 'image/jpeg')
  expect(size).toEqual({ width: 4096, height: 2048 })
  // The middle of the picture is straight ahead; a quarter of the way along is 90 degrees to the side.
  expect(isBrick(await at(0.5, 0.5)), 'the brick wall ahead, in the middle').toBe(true)
  expect(isPaint(await at(0.75, 0.5)), 'a painted wall to the right').toBe(true)
  expect(isPaint(await at(0.25, 0.5)), 'a painted wall to the left').toBe(true)
  expect(isPaint(await at(0.02, 0.5)), 'a painted wall behind, at the edge').toBe(true)
  expect(isWood(await at(0.5, 0.95)), 'the floor at the bottom').toBe(true)
  expect(isPaint(await at(0.5, 0.05)), 'the ceiling at the top').toBe(true)

  // Walking carries on afterwards.
  await expect(app.getByText('drag to look')).toBeVisible()
  await app.keyboard.press('Escape')
})
