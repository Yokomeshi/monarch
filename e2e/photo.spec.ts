import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { click, expect, field, fixture, setView, test, topView } from './helpers'

const STATUS = 'https://queue.fal.run/tripo3d/h3.1/requests/abc/status'
const RESULT = 'https://queue.fal.run/tripo3d/h3.1/requests/abc'
const MESH = 'https://v3b.fal.media/files/model.glb'

/**
 * A stand-in for the app's /fal route and fal's file host. The job is done on the second status
 * check, and the model is fixtures/block.glb. `password`, if given, is what the route asks for.
 */
async function standIn(app: Page, password?: string) {
  const seen = { posts: [] as { image: string }[], checks: 0 }
  await app.route('**/fal**', async (route) => {
    const request = route.request()
    if (password && request.headers()['x-app-password'] !== password) {
      return route.fulfill({ status: 401, json: { error: 'Wrong or missing password.' } })
    }
    if (request.method() === 'POST') {
      seen.posts.push(request.postDataJSON())
      return route.fulfill({ json: { request_id: 'abc', status_url: STATUS, response_url: RESULT } })
    }
    const url = new URL(request.url()).searchParams.get('url')
    if (url === STATUS) return route.fulfill({ json: { status: ++seen.checks < 2 ? 'IN_PROGRESS' : 'COMPLETED' } })
    return route.fulfill({ json: { model_mesh: { url: MESH }, model_urls: {} } })
  })
  await app.route(MESH, (route) =>
    route.fulfill({ body: readFileSync(fixture('block.glb')), headers: { 'Access-Control-Allow-Origin': '*' } }),
  )
  return seen
}

const choosePhoto = (app: Page) => app.getByTestId('photo-input').setInputFiles(fixture('green-tile.png'))

test('a photo becomes a 3D model that can be placed', async ({ app }) => {
  const seen = await standIn(app)
  await setView(app, 'Top')
  const top = await topView(app)
  await choosePhoto(app)
  await expect(app.getByText('This takes a minute or two.')).toBeVisible()

  // The model is named after the photo and is ready to place, like an imported file.
  await expect(app.getByText('Click in the view to place the green-tile.glb.')).toBeVisible({ timeout: 15_000 })
  await click(app, top(0, 0))
  await expect(app.getByRole('heading', { name: 'Selected green-tile.glb' })).toBeVisible()
  expect(await field(app, 'Height').inputValue()).toBe('2.000 m')

  // One billed job, sent as a JPEG.
  expect(seen.posts).toHaveLength(1)
  expect(seen.posts[0].image).toMatch(/^data:image\/jpeg;base64,/)
})

test('making a model from a photo explains a missing server and asks for the access password', async ({ page: app }) => {
  // The plain page: the browser logs the refused requests itself, which the `app` fixture would count as errors.
  await app.goto('/')
  const error = app.getByTestId('photo-error')
  await app.route('**/fal**', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await choosePhoto(app)
  await expect(error).toContainText("Couldn't make the model: fal request failed (404).")

  await app.unroute('**/fal**')
  const seen = await standIn(app, 'open sesame')
  await choosePhoto(app)
  await expect(error).toHaveText('This needs the access password.')
  await app.getByLabel('Access password').fill('open sesame')
  await app.getByRole('button', { name: 'Try again' }).click()
  await expect(app.getByText('Click in the view to place the green-tile.glb.')).toBeVisible({ timeout: 15_000 })
  expect(seen.posts).toHaveLength(1)
})
