import type { Page } from '@playwright/test'
import {
  click, colourAt, expect, field, fixture, materialName, setView, settle, test, topView, type, view3d,
} from './helpers'

const heading = (app: Page, name: string) => app.getByRole('heading', { name })
const summary = (app: Page) => app.getByTestId('furniture-summary')
const importModel = async (app: Page, name: string) => {
  await app.getByTestId('model-input').setInputFiles(fixture(name))
  await expect(app.getByText(`Click in the view to place the ${name}.`)).toBeVisible()
  await settle(app)
}
const sizes = async (app: Page) => [
  await field(app, 'Width').inputValue(),
  await field(app, 'Depth').inputValue(),
  await field(app, 'Height').inputValue(),
]

// fixtures/block.glb is a red box 1 m wide, 0.5 m deep and 2 m high.
test('import a .glb, place it at its real size, and resize it in proportion', async ({ app }) => {
  await setView(app, 'Top')
  const top = await topView(app)
  await importModel(app, 'block.glb')
  await click(app, top(0, 0))

  await expect(heading(app, 'Selected block.glb')).toBeVisible()
  expect(await sizes(app)).toEqual(['1.000 m', '0.500 m', '2.000 m'])
  await expect(app.getByText('This model uses the materials saved in its file.')).toBeVisible()
  await expect(app.getByTestId('material-material')).toHaveCount(0)

  await type(app, 'Height', '1') // halves every side
  expect(await sizes(app)).toEqual(['0.500 m', '0.250 m', '1.000 m'])

  await app.getByLabel('Keep proportions').uncheck()
  await type(app, 'Width', '2') // now only the width changes
  expect(await sizes(app)).toEqual(['2.000 m', '0.250 m', '1.000 m'])

  await app.getByRole('button', { name: 'Reset size' }).click()
  expect(await sizes(app)).toEqual(['1.000 m', '0.500 m', '2.000 m'])

  // The model keeps its own red material in 3D.
  await click(app, top(8, 8))
  await setView(app, '3D')
  const at = await view3d(app)
  const [r, g, b] = await colourAt(app, at(0, 2, 0)) // its top face
  expect(r, 'the block is red').toBeGreaterThan(Math.max(g, b) + 40)

  // Once imported, the model has its own button for placing more copies.
  await setView(app, 'Top')
  await app.getByRole('button', { name: 'block.glb', exact: true }).click()
  await settle(app)
  await click(app, top(3, 2))
  await expect(summary(app)).toHaveText('2 pieces')
})

// fixtures/crate.obj is 2 wide, 0.5 deep and 1 high, and sits 10 units off-centre in its file.
test('import an .obj: it is centred on the spot clicked and takes a material', async ({ app }) => {
  await setView(app, 'Top')
  const top = await topView(app)
  await importModel(app, 'crate.obj')
  await click(app, top(0, 0))
  await expect(heading(app, 'Selected crate.obj')).toBeVisible()
  expect(await sizes(app)).toEqual(['2.000 m', '0.500 m', '1.000 m'])

  await app.getByRole('radio', { name: 'Brick' }).click()
  await expect(materialName(app)).toHaveText('Brick')

  await click(app, top(8, 8))
  await setView(app, '3D')
  const at = await view3d(app)
  // Were it left 10 m off-centre, as in its file, there would be bare ground here.
  const [r, g, b] = await colourAt(app, at(0, 1, 0))
  expect(r, 'the crate stands where it was placed, in brick').toBeGreaterThan(Math.max(g, b) + 25)
})

test('a file that is not a usable model is refused with a reason', async ({ app }) => {
  const input = app.getByTestId('model-input')
  await input.setInputFiles({ name: 'fake.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('hello') })
  await expect(app.getByTestId('model-error')).toHaveText(`Couldn't read "fake.glb" as a glb model.`)
  await expect(app.getByRole('button', { name: 'Bed', exact: true }), 'the tool is not armed').toBeVisible()
  await expect(summary(app)).toHaveCount(0)

  await input.setInputFiles({ name: 'empty.obj', mimeType: 'text/plain', buffer: Buffer.from('# nothing here\n') })
  await expect(app.getByTestId('model-error')).toHaveText(`"empty.obj" has no visible geometry.`)

  await input.setInputFiles(fixture('block.glb')) // a good file clears the message
  await expect(app.getByTestId('model-error')).toHaveCount(0)
})

test('an imported model is saved inside the project and reopens', async ({ app }, testInfo) => {
  await setView(app, 'Top')
  const top = await topView(app)
  await importModel(app, 'block.glb')
  await click(app, top(0, 0))
  await type(app, 'Height', '1.5')
  await click(app, top(8, 8))

  const path = testInfo.outputPath('model.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(summary(app)).toHaveText('1 piece')

  await setView(app, '3D')
  const at = await view3d(app)
  const topFace = at(0, 1.5, 0)
  const [r, g, b] = await colourAt(app, topFace)
  expect(r, 'the reopened model is still red').toBeGreaterThan(Math.max(g, b) + 40)
  await click(app, topFace)
  await expect(heading(app, 'Selected block.glb')).toBeVisible()
  expect(await sizes(app)).toEqual(['0.750 m', '0.375 m', '1.500 m'])
})
