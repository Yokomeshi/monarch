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

test('builds a room, fits items to exact sizes, and measures them back', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const code = `
    room(4, 5, 2.5)
    const sofaShape = new THREE.BoxGeometry(1, 1, 1)
    sofaShape.translate(0, 0.5, 0) // lowest point at the origin
    const sofa = new THREE.Mesh(sofaShape, new THREE.MeshStandardMaterial({ color: 0x6b7f99 }))
    sofa.name = 'sofa'
    fit(sofa, { x: 1.95, y: 0.41, z: 0.5 })
    sofa.position.set(0, 0, -2.2)
    scene.add(sofa)
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshStandardMaterial({ color: 0xaa7744 }))
    crate.name = 'crate'
    fit(crate, { x: 1 }) // only the width is given: the rest follows, so it is not squashed
    crate.position.set(1, 0.75, 0.5)
    scene.add(crate)`
  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    { content: [{ type: 'tool_use', id: 't1', name: 'render_viewport', input: { code } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't2', name: 'measure_scene', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Checked.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('a 4 x 5 m room with a 195 x 50 x 41 cm sofa')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Checked.')).toBeVisible()

  const render = (sent[1].messages.at(-1)!.content as { content: string }[])[0].content
  expect(render).toBe('ok')
  const report = (sent[2].messages.at(-1)!.content as { content: string }[])[0].content
  expect(report).toContain('room: 4 m (13 ft 1.5 in) wide, 2.5 m (8 ft 2.4 in) high, 5 m (16 ft 4.9 in) deep.')
  expect(report).toContain('sofa: 1.95 m (6 ft 4.8 in) wide, 0.41 m (1 ft 4.1 in) high, 0.5 m (1 ft 7.7 in) deep.')
  expect(report).toContain('y 0 m to 0.41 m') // standing on the floor
  expect(report).toContain('crate: 1 m (3 ft 3.4 in) wide, 1.5 m (4 ft 11.1 in) high, 2 m (6 ft 6.7 in) deep.')
  expect(errors, 'errors logged by the page').toEqual([])
})

test('shows the photoreal render in the chat, made from a screenshot of the scene', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    { content: [{ type: 'tool_use', id: 't1', name: 'render_viewport', input: { code: 'room(4, 5, 2.5)' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't2', name: 'render_photoreal', input: { style: 'oak floor, warm evening light' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Here is the photoreal view.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  let renderBody: { prompt: string; images: string[] } | undefined
  await page.route('**/render', async (route) => {
    renderBody = route.request().postDataJSON()
    await route.fulfill({ json: { images: [{ url: 'https://fal.test/out.png' }] } })
  })
  // A 1 x 1 PNG stands in for the picture.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  await page.route('https://fal.test/out.png', (route) => route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }))

  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('a 4 x 5 m room, make it photoreal')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Here is the photoreal view.')).toBeVisible()

  // The user sees the picture. fal was sent one screenshot of the scene, and the style.
  await expect(page.getByAltText('Photoreal render of the scene')).toBeVisible()
  expect(renderBody!.prompt).toBe('oak floor, warm evening light')
  expect(renderBody!.images).toHaveLength(1)
  expect(renderBody!.images[0].startsWith('data:image/jpeg;base64,')).toBe(true)

  // The model got the picture back, to judge for itself.
  const result = (sent[2].messages.at(-1)!.content as { content: { type: string }[] }[])[0].content
  expect(result.map((b) => b.type)).toEqual(['text', 'image'])
  expect(errors, 'errors logged by the page').toEqual([])
})

test('sets the time of day and weather, so noon is bright and night is dark', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const scene = (atmosphere: string) => `
    room(4, 5, 2.5)
    const sofaShape = new THREE.BoxGeometry(1, 1, 1)
    sofaShape.translate(0, 0.5, 0)
    const sofa = new THREE.Mesh(sofaShape, new THREE.MeshStandardMaterial({ color: 0x6b7f99 }))
    fit(sofa, { x: 1.95, y: 0.41, z: 0.5 })
    sofa.position.set(0, 0, -1)
    scene.add(sofa)
    ${atmosphere}`
  const tool = (id: string, name: string, input: object) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' })
  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    tool('a', 'render_viewport', { code: scene('atmosphere({ hour: 12 })') }),
    tool('b', 'screenshot_viewport', {}),
    tool('c', 'render_viewport', { code: scene('atmosphere({ hour: 23 })') }),
    tool('d', 'screenshot_viewport', {}),
    tool('e', 'render_viewport', { code: scene("atmosphere({ hour: 9, weather: 'fog' })") }),
    tool('f', 'screenshot_viewport', {}),
    { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('noon, then night, then fog')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Done.')).toBeVisible({ timeout: 30_000 })

  const last = (call: number) => (sent[call].messages.at(-1)!.content as { content: unknown }[])[0].content
  const picture = (call: number) => (last(call) as { source: { data: string } }[])[0].source.data
  // Average brightness (0 to 255) of what the viewport showed the model.
  const brightness = (data: string) =>
    page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0, 32, 32)
      const px = g.getImageData(0, 0, 32, 32).data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3
      return sum / (px.length / 4)
    }, data)
  const [noon, night, fog] = [await brightness(picture(2)), await brightness(picture(4)), await brightness(picture(6))]
  expect(noon).toBeGreaterThan(night + 60)
  expect(Math.abs(fog - noon)).toBeGreaterThan(3) // fog really changed the picture

  expect(last(1)).toBe('ok') // the render that set the noon atmosphere
  expect(errors, 'errors logged by the page').toEqual([])
})

test('explains bad atmosphere options to the model', async ({ page }) => {
  const tool = (id: string, code: string) => ({ content: [{ type: 'tool_use', id, name: 'render_viewport', input: { code } }], stop_reason: 'tool_use' })
  const sent: { messages: { content: unknown }[] }[] = []
  const script = [
    tool('a', "atmosphere({ hour: 'noon' })"),
    tool('b', "atmosphere({ hour: 12, weather: 'snow' })"),
    { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
  ]
  await page.route('**/agent', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ json: script[sent.length - 1] })
  })
  await page.goto('/chat.html')
  await page.getByLabel('Message').fill('x')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Done.')).toBeVisible()
  const result = (call: number) => (sent[call].messages.at(-1)!.content as { content: string; is_error: boolean }[])[0]
  expect(result(1)).toMatchObject({ is_error: true, content: expect.stringContaining('atmosphere: hour must be a number') })
  expect(result(2)).toMatchObject({ is_error: true, content: expect.stringContaining("weather must be 'clear'") })
})
