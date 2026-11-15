import type { Page } from '@playwright/test'
import {
  CALIBRATED, calibrate, click, colourAt, expect, fixture, planExtent, planInput, planToWorld, pressTool, settle, setView, test,
  topView, uploadPlan,
} from './helpers'

test('detect the walls drawn on a plan, check them, and add them', async ({ app }) => {
  await setView(app, 'Top')
  await uploadPlan(app)
  const detect = app.getByRole('button', { name: 'Detect walls' })
  await expect(detect, 'needs the scale first').toBeDisabled()

  await calibrate(app, '3.048 m') // the plan's marks are 10 ft apart
  const at = await topView(app, planExtent(CALIBRATED))
  const world = planToWorld(CALIBRATED)
  // On the plan's top wall, and on its red dimension line.
  const onWall = at(...world(500, 40))
  const onDimension = at(...world(400, 400))
  const isOrange = ([r, , b]: number[]) => r > 180 && r - b > 100

  expect(isOrange(await colourAt(app, onWall)), 'the drawn wall is black').toBe(false)
  await detect.click()
  // The outer rectangle, and the two walls of the inner room. The dimension line is not a wall.
  await expect(app.getByTestId('detect-result')).toContainText('Found 6 walls, shown in orange.')
  expect(isOrange(await colourAt(app, onWall)), 'the suggestion is drawn over the wall').toBe(true)
  expect(isOrange(await colourAt(app, onDimension)), 'nothing over the dimension line').toBe(false)
  await expect(app.getByTestId('wall-count')).toBeHidden()

  await app.getByRole('button', { name: 'Discard' }).click()
  expect(isOrange(await colourAt(app, onWall)), 'gone when discarded').toBe(false)
  await expect(app.getByTestId('wall-count')).toBeHidden()

  await detect.click()
  await app.getByRole('button', { name: 'Add walls' }).click()
  await expect(app.getByTestId('wall-count')).toHaveText('6')
  // The walls meet properly: they close the inner room and the L-shaped room around it.
  await expect(app.getByTestId('rooms')).toHaveText(/^Room 1.*Room 2.*Total/)
  await expect(app.locator('.room-label')).toHaveCount(2)
})

// fixtures/plan-openings.png: 1200 x 900 px at 100 px per metre. Three rooms; a door (leaf and arc) in the
// bottom wall, a window in the right wall, and two plain openings in the partitions. A red line from
// (100, 60) to (1100, 60) is labelled 10.0 m.
async function detectOnOpeningsPlan(app: Page) {
  await setView(app, 'Top')
  await planInput(app).setInputFiles(fixture('plan-openings.png'))
  await expect(app.getByTestId('plan-size')).toBeVisible()
  await settle(app)
  // Before calibration the plan is shown 20 m wide.
  const at = await topView(app, { width: 20, depth: 15 })
  const world = (px: number, py: number) => [((px - 600) * 20) / 1200, ((py - 450) * 20) / 1200] as const
  await pressTool(app, 'Calibrate scale')
  await click(app, at(...world(100, 60)))
  await click(app, at(...world(1100, 60)))
  await app.getByLabel('Real distance between the points').fill('10 m')
  await app.getByRole('button', { name: 'Set scale' }).click()
  await settle(app)
  await app.getByRole('button', { name: 'Detect walls' }).click()
  await expect(app.getByTestId('detect-result')).toContainText('Found 6 walls, shown in orange, with 4 gaps bridged.')
}

/** What Jev replies to the gap question. */
const jevReply = (choice: string, confidence: number) => ({
  model: 'jev-1.14.0',
  answers: { kind: { type: 'choice', choice, confidence, probabilities: {} } },
})

test('gaps in detected walls are identified as doors and windows and added with the walls', async ({ app }) => {
  // No network: the service's replies are played back. The first gap asked about is called a window,
  // the next two doors, and the last an uncertain door.
  const replies = [jevReply('window', 0.99), jevReply('door', 0.99), jevReply('opening', 0.95), jevReply('door', 0.4)]
  const requests: { headers: Record<string, string>; body: any }[] = []
  await app.route('**/jev', async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() })
    await route.fulfill({ json: replies[requests.length - 1] })
  })

  await detectOnOpeningsPlan(app)
  expect(requests, 'nothing is sent until asked').toHaveLength(0)

  await app.getByRole('button', { name: 'Identify doors and windows' }).click()
  // A plain opening counts as a door; the uncertain one is left alone.
  await expect(app.getByTestId('identify-result')).toHaveText(
    '2 doors (green) and 1 window (blue) will be added. 1 left as plain wall.',
  )
  expect(requests).toHaveLength(4)
  for (const { headers, body } of requests) {
    expect(headers['typesafe-danger-zone-images']).toBe('true')
    expect(headers.authorization, 'the key is added by the server, not the browser').toBeUndefined()
    const [image] = Object.values(body.assets) as { format: string; data_base64: string }[]
    expect(image.format).toBe('png')
    expect(image.data_base64.length).toBeGreaterThan(500)
  }

  await app.getByRole('button', { name: 'Add walls' }).click()
  await expect(app.getByTestId('wall-count')).toHaveText('6')
  await expect(app.getByTestId('opening-summary')).toHaveText('2 doors, 1 window')
  await expect(app.locator('.room-label')).toHaveCount(3)
})

test('without the service, identifying fails with an explanation and the walls can still be added', async ({ page: app }) => {
  // The plain page, not the `app` fixture: the browser logs the 404s itself, which that fixture would count as errors.
  await app.goto('/')
  await app.route('**/jev', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await detectOnOpeningsPlan(app)
  const identify = app.getByRole('button', { name: 'Identify doors and windows' })
  await identify.click()
  await expect(app.getByTestId('identify-error')).toContainText("Couldn't identify the gaps: Jev request failed (404).")

  // When the server explains itself, the explanation is shown.
  await app.unroute('**/jev')
  await app.route('**/jev', (route) => route.fulfill({ status: 500, json: { error: 'The server is not configured for Jev.' } }))
  await identify.click()
  await expect(app.getByTestId('identify-error')).toContainText(
    "Couldn't identify the gaps: Jev request failed (500): The server is not configured for Jev.",
  )

  await app.getByRole('button', { name: 'Add walls' }).click()
  await expect(app.getByTestId('wall-count')).toHaveText('6')
  await expect(app.getByTestId('opening-summary')).toBeHidden()
})

test('the hosted app asks for its access password, remembers it, and sends it with each request', async ({ page: app }) => {
  // The plain page: the browser logs the 401s itself. The stand-in server wants the password "open sesame".
  await app.goto('/')
  const passwords: (string | undefined)[] = []
  await app.route('**/jev', async (route) => {
    const password = route.request().headers()['x-app-password']
    passwords.push(password)
    if (password === 'open sesame') await route.fulfill({ json: jevReply('door', 0.99) })
    else await route.fulfill({ status: 401, json: { error: 'Wrong or missing password' } })
  })
  const identify = app.getByRole('button', { name: 'Identify doors and windows' })
  const error = app.getByTestId('identify-error')

  await detectOnOpeningsPlan(app)
  await identify.click()
  await expect(error).toHaveText('This needs the access password.')
  expect(passwords.every((p) => p === undefined), 'no password sent before one is entered').toBe(true)

  await app.getByLabel('Access password').fill('guess')
  await identify.click()
  await expect(error).toHaveText('That password was not accepted.')

  await app.getByLabel('Access password').fill('open sesame')
  await identify.click()
  await expect(app.getByTestId('identify-result')).toContainText('4 doors (green) and 0 windows (blue) will be added.')

  // Remembered in this browser: after a reload it is sent without asking.
  await app.reload()
  passwords.length = 0
  await detectOnOpeningsPlan(app)
  await identify.click()
  await expect(app.getByTestId('identify-result')).toContainText('4 doors')
  expect(passwords).toEqual(['open sesame', 'open sesame', 'open sesame', 'open sesame'])
})

test('a suggested wall can be removed, and a gap set by hand, before adding', async ({ app }) => {
  await detectOnOpeningsPlan(app)
  const at = await topView(app, { width: 12, depth: 9 })
  const world = (px: number, py: number) => [(px - 600) / 100, (py - 450) / 100] as const
  const result = app.getByTestId('detect-result')

  // The partition between the two left rooms and the living room, away from its gap.
  await click(app, at(...world(606, 250)))
  await expect(result).toContainText('Found 5 walls, shown in orange, with 3 gaps bridged.')

  // The door gap in the bottom wall: one click makes it a door, a second a window.
  const gap = at(...world(565, 792))
  await click(app, gap)
  await expect(app.getByTestId('identify-result')).toHaveText(
    '1 door (green) and 0 windows (blue) will be added. 2 left as plain wall.',
  )
  await click(app, gap)
  await expect(app.getByTestId('identify-result')).toContainText('0 doors (green) and 1 window (blue) will be added.')

  await app.getByRole('button', { name: 'Add walls' }).click()
  await expect(app.getByTestId('wall-count')).toHaveText('5')
  await expect(app.getByTestId('opening-summary')).toHaveText('0 doors, 1 window')
})
