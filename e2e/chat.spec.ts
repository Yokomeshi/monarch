import { test, expect } from '@playwright/test'

// The model is replaced by a script of replies, so this tests everything else: the chat, the
// sandboxed viewport running the model's code in real WebGL, and the screenshot sent back.
const ROOM = `
const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 5), new THREE.MeshStandardMaterial({ color: 0xc08a50 }))
scene.add(floor)
const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x2255aa }))
wall.position.set(0, 1.25, -2.5)
scene.add(wall)
`

test('draws the scene the model writes, shows it back to the model, and shows its answer', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    { content: [{ type: 'text', text: 'Drawing it.' }, { type: 'tool_use', id: 't1', name: 'render_viewport', input: { code: ROOM } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't2', name: 'screenshot_viewport', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Built a 4 x 5 m room.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })

  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('a 4 x 5 m room')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Built a 4 x 5 m room.')).toBeVisible()
  expect(sent).toHaveLength(3)

  // The render succeeded, and the model was sent a picture (a JPEG of the viewport, not an empty one).
  const renderResult = (sent[1].messages.at(-1)!.content as { content: unknown }[])[0].content
  expect(renderResult).toBe('ok')
  const picture = (sent[2].messages.at(-1)!.content as { content: { source: { data: string } }[] }[])[0].content[0].source.data
  expect(picture.length).toBeGreaterThan(2000)

  expect(errors, 'errors logged by the page').toEqual([])
})

test('tells the model about code that throws, so it can fix it', async ({ page }) => {
  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    { content: [{ type: 'tool_use', id: 't1', name: 'render_viewport', input: { code: 'scene.add(new THREE.Nope())' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Fixed.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('x')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Fixed.')).toBeVisible()
  const result = (sent[1].messages.at(-1)!.content as { content: string; is_error: boolean }[])[0]
  expect(result.is_error).toBe(true)
  expect(result.content).toContain('Nope')
})

test('shows the route\'s reason when the server is not set up', async ({ page }) => {
  await page.route('**/agent', (route) => route.fulfill({ status: 500, json: { error: 'The server is not configured for Claude.' } }))
  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('hello')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert')).toContainText('The server is not configured for Claude')
  await expect(page.getByLabel('Message')).toHaveValue('hello') // not lost
})
