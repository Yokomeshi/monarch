import { click, colourAt, drawRoom, emptySpot, expect, field, fixture, materialName, setView, test, type, view3d } from './helpers'

test('presets, colour, PBR sliders and a photo texture change the rendered wall', async ({ app }) => {
  await drawRoom(app)
  await setView(app, '3D')
  const at = await view3d(app)
  const face = at(3.075, 1.35, 0) // centre of the x = +3 wall's outer face
  const empty = await emptySpot(app)

  await click(app, face)
  await expect(materialName(app)).toHaveText('Paint')
  let [r, g, b] = await colourAt(app, face)
  expect(r, 'paint is light, and the selection outline does not tint it').toBeGreaterThan(150)
  expect(Math.abs(r - b)).toBeLessThan(40)

  await app.getByRole('radio', { name: 'Brick' }).click()
  await expect(materialName(app)).toHaveText('Brick')
  ;[r, g, b] = await colourAt(app, face)
  expect(r, 'brick is red-brown').toBeGreaterThan(Math.max(g, b) + 25)

  await field(app, 'Color').fill('#2060c0')
  await expect(materialName(app)).toHaveText('Custom')
  ;[r, g, b] = await colourAt(app, face)
  expect(b, 'picked blue renders blue').toBeGreaterThan(r + 40)

  await field(app, 'Metalness').fill('1')
  await field(app, 'Roughness').fill('0.2')
  const metal = await colourAt(app, face)
  expect(Math.max(...metal), 'a metal surface reflects the environment, so it is not black').toBeGreaterThan(40)
  await field(app, 'Metalness').fill('0')
  await field(app, 'Roughness').fill('0.9')

  await app.getByTestId('texture-input').setInputFiles(fixture('green-tile.png'))
  await expect(materialName(app)).toHaveText('Photo: green-tile.png')
  await expect(field(app, 'Photo covers')).toHaveValue('1.000 m')
  await expect(field(app, 'Color'), 'the colour becomes a tint').toHaveCount(0)
  await expect(field(app, 'Tint')).toHaveValue('#ffffff')
  ;[r, g, b] = await colourAt(app, face)
  expect(g, 'the green photo renders green').toBeGreaterThan(Math.max(r, b) + 20)
  await type(app, 'Photo covers', '0.4')
  await expect(field(app, 'Photo covers')).toHaveValue('0.400 m')

  await app.getByRole('button', { name: 'Remove' }).click()
  await expect(field(app, 'Photo covers')).toHaveCount(0)
  ;[r, g, b] = await colourAt(app, face)
  expect(Math.abs(r - g), 'back to a plain surface').toBeLessThan(15)

  await click(app, empty)
  await expect(app.getByRole('heading', { name: 'New walls' })).toBeVisible()
  await app.getByRole('radio', { name: 'Wood' }).click()
  await app.getByRole('button', { name: 'Apply to all walls' }).click()
  ;[r, g, b] = await colourAt(app, face)
  expect(r, 'wood on every wall').toBeGreaterThan(b + 40)
})

test('a texture file that is not an image is refused', async ({ app }) => {
  await app.getByTestId('texture-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(app.getByText(`Couldn't read "notes.txt" as an image.`)).toBeVisible()
  await expect(materialName(app)).toHaveText('Paint')
})
