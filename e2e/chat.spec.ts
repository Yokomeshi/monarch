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

/** A minimal GLB: one 0.5 x 0.8 x 0.4 m box, off-centre, so the viewport has to stand it on the floor. */
function boxGlb(): Buffer {
  const [w, h, d] = [0.5, 0.8, 0.4]
  const corners = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x * w + 3, y * h + 2, z * d])))
  const positions = Buffer.from(new Float32Array(corners.flat()).buffer)
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
  const indices = Buffer.from(new Uint16Array(quads.flatMap(([a, b, c, e]) => [a, b, c, a, c, e])).buffer)
  const bin = Buffer.concat([positions, indices])
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [3, 2, 0], max: [3 + w, 2 + h, d] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }, { buffer: 0, byteOffset: positions.length, byteLength: indices.length }],
    buffers: [{ byteLength: bin.length }],
  }
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)])
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20)
  const binChunk = pad(bin, 0)
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(body.length, 0)
    head.write(type, 4, 'ascii')
    return Buffer.concat([head, body])
  }
  return Buffer.concat([header, chunk('JSON', jsonChunk), chunk('BIN\0', binChunk)])
}

test('turns an attached photo into a 3D model the scene can use', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const sent: { messages: { role: string; content: unknown }[] }[] = []
  const script = [
    { content: [{ type: 'tool_use', id: 't1', name: 'model_from_photo', input: { photo: 1, name: 'cabinet' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't2', name: 'render_viewport', input: { code: 'const c = models.cabinet.clone(); c.position.set(1, 0, 0); scene.add(c)' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'The cabinet is in the room.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  // fal: queued, finished at once, and the model file is on its own host.
  let falJobs = 0
  await page.route('**/fal**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      falJobs++
      return route.fulfill({ json: { status_url: 'https://queue.fal.run/x/requests/1/status', response_url: 'https://queue.fal.run/x/requests/1' } })
    }
    const url = new URL(request.url()).searchParams.get('url') ?? ''
    await route.fulfill({ json: url.endsWith('/status') ? { status: 'COMPLETED' } : { model_mesh: { url: 'https://fal.test/cabinet.glb' } } })
  })
  await page.route('https://fal.test/cabinet.glb', (route) => route.fulfill({ body: boxGlb(), contentType: 'model/gltf-binary', headers: { 'Access-Control-Allow-Origin': '*' } }))

  await page.goto('/chat.html')
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/plan.png')
  await expect(page.getByAltText('Attached photo 1')).toBeVisible()
  await page.getByLabel('Message').fill('make a model of this cabinet')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('The cabinet is in the room.')).toBeVisible()
  expect(falJobs).toBe(1)

  // The model saw the photo, numbered, in the user's message.
  const first = sent[0].messages[0].content as { type: string; text?: string }[]
  expect(first.map((b) => b.type)).toEqual(['text', 'image', 'text'])
  expect(first[0].text).toBe('Photo 1:')

  // The viewport read the file and reported its real size, standing on the floor.
  const loaded = (sent[1].messages.at(-1)!.content as { content: string; is_error?: boolean }[])[0]
  expect(loaded.is_error).toBeUndefined()
  expect(loaded.content).toContain('0.5 m wide (x), 0.4 m deep (z), 0.8 m tall (y)')
  // And scene code could use it.
  expect((sent[2].messages.at(-1)!.content as { content: string }[])[0].content).toBe('ok')
  expect(errors, 'errors logged by the page').toEqual([])
})
