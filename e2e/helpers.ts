import { test as base, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { PerspectiveCamera, Vector3 } from 'three'

export { expect }

/** Opens the app and fails the test if the page logs an error. */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await use(page)
    expect(errors, 'errors logged by the page').toEqual([])
  },
})

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

// fixtures/plan.png: 1000 x 800 px. Outer room walls run through 40..960 x 40..760 px,
// and two red marks at (250, 400) and (750, 400) are labelled 10 ft apart.
export const PLAN_PX = { width: 1000, height: 800 }
/** Scale before calibration: the app shows a new plan 20 m wide. */
export const UNCALIBRATED = 20 / PLAN_PX.width
/** Scale once the marks are calibrated as 10 ft. */
export const CALIBRATED = 3.048 / 500

export type Pt = { x: number; y: number }
export type Extent = { width: number; depth: number }

/** What the app frames: the plan, or 20 m square when there is none. */
export const planExtent = (metresPerPx: number): Extent => ({
  width: PLAN_PX.width * metresPerPx,
  depth: PLAN_PX.height * metresPerPx,
})
const NO_PLAN: Extent = { width: 20, depth: 20 }
const FIT_MARGIN = 0.9 // matches CameraRig

/** World metres -> screen, for the freshly framed Top view. */
export async function topView(page: Page, extent = NO_PLAN) {
  const box = (await page.locator('canvas').boundingBox())!
  const zoom = FIT_MARGIN * Math.min(box.width / extent.width, box.height / extent.depth)
  return (x: number, z: number): Pt => ({
    x: box.x + box.width / 2 + x * zoom,
    y: box.y + box.height / 2 + z * zoom,
  })
}

/** World metres -> screen, for the freshly framed 3D view. */
export async function view3d(page: Page, extent = NO_PLAN) {
  const box = (await page.locator('canvas').boundingBox())!
  const camera = new PerspectiveCamera(50, box.width / box.height, 0.1, 1000)
  const dist = Math.hypot(extent.width, extent.depth) / 2 / Math.sin((25 * Math.PI) / 180) / FIT_MARGIN
  camera.position.copy(new Vector3(1, 0.8, 1).normalize().multiplyScalar(dist))
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return (x: number, y: number, z: number): Pt => {
    const v = new Vector3(x, y, z).project(camera)
    return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height }
  }
}

/** A spot in the canvas's bottom-left corner: bare ground in the framed 3D view. */
export async function emptySpot(page: Page): Promise<Pt> {
  const box = (await page.locator('canvas').boundingBox())!
  return { x: box.x + 30, y: box.y + box.height - 30 }
}

/** Plan pixels -> world metres (the plan is centred on the origin). */
export const planToWorld = (metresPerPx: number) => (px: number, py: number) =>
  [(px - PLAN_PX.width / 2) * metresPerPx, (py - PLAN_PX.height / 2) * metresPerPx] as const

/** Let the scene render the latest state. */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForTimeout(250)
}

export async function click(page: Page, pt: Pt, options?: Parameters<Page['mouse']['click']>[2]) {
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.click(pt.x, pt.y, options)
}

export async function setView(page: Page, view: '3D' | 'Top') {
  await page.getByRole('radio', { name: view, exact: true }).click()
  await settle(page)
}

/** Press a sidebar button that changes what clicks in the scene do, and let the scene catch up. */
export async function pressTool(
  page: Page,
  name: 'Draw walls' | 'Done' | 'Calibrate scale' | 'Place door' | 'Place window',
) {
  await page.getByRole('button', { name }).click()
  await settle(page)
}

export const setUnits = (page: Page, units: 'Metric' | 'Imperial') =>
  page.getByRole('radio', { name: units }).click()

export const planInput = (page: Page) => page.locator('label', { hasText: 'plan…' }).locator('input')

export async function uploadPlan(page: Page) {
  await planInput(page).setInputFiles(fixture('plan.png'))
  await expect(page.getByTestId('plan-size')).toBeVisible()
  await settle(page)
}

/** In Top view, click the plan's two marks and enter their distance. */
export async function calibrate(page: Page, distance: string, metresPerPx = UNCALIBRATED) {
  const at = await topView(page, planExtent(metresPerPx))
  const world = planToWorld(metresPerPx)
  await pressTool(page, 'Calibrate scale')
  await click(page, at(...world(250, 400)))
  await click(page, at(...world(750, 400)))
  await page.getByLabel('Real distance between the points').fill(distance)
  await page.getByRole('button', { name: 'Set scale' }).click()
  await settle(page)
}

/** With the wall tool active, click each corner in turn. */
export async function clickCorners(page: Page, corners: Pt[]) {
  for (const c of corners) await click(page, c)
}

/** Draw a closed 6 m x 4 m room centred on the origin, in Top view with no plan. */
export async function drawRoom(page: Page) {
  await setView(page, 'Top')
  const at = await topView(page)
  await pressTool(page, 'Draw walls')
  await clickCorners(page, [at(-3, -2), at(3, -2), at(3, 2), at(-3, 2), at(-3, -2)])
  await pressTool(page, 'Done')
  await expect(page.getByTestId('wall-count')).toHaveText('4')
}

export const field = (page: Page, label: string) => page.getByLabel(label, { exact: true })

export async function type(page: Page, label: string, value: string) {
  await field(page, label).fill(value)
  await page.keyboard.press('Enter')
}

export const materialName = (page: Page) => page.getByTestId('material-name')

/** Average rendered colour of a 12 px square, read from a screenshot. */
export async function colourAt(page: Page, pt: Pt): Promise<[number, number, number]> {
  await settle(page)
  const png = await page.screenshot({ clip: { x: pt.x - 6, y: pt.y - 6, width: 12, height: 12 } })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const sum = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c]
    return sum.map((v) => Math.round(v / (d.length / 4))) as [number, number, number]
  }, png.toString('base64'))
}
