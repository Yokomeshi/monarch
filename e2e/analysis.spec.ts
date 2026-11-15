import { click, drawRoom, expect, pressTool, setUnits, test, topView } from './helpers'

test('quantities follow the model as it is built', async ({ app }) => {
  await expect(app.getByTestId('takeoff')).toBeHidden()
  await drawRoom(app) // 6 m x 4 m between centre-lines, walls 2.7 m high and 0.15 m thick
  const top = await topView(app)
  const q = (name: string) => app.getByTestId(`takeoff-${name}`)

  await expect(q('wall-length')).toHaveText('20.000 m')
  await expect(q('wall-area')).toHaveText('54.00 m²') // 20 m x 2.7 m
  await expect(q('floor-area')).toHaveText('22.52 m²') // 5.85 m x 3.85 m
  await expect(q('ceiling-area')).toHaveText('22.52 m²')
  for (const name of ['doors', 'windows', 'furniture', 'lights']) await expect(q(name)).toHaveText('0')

  await pressTool(app, 'Place door')
  await click(app, top(0, 2))
  await expect(q('doors')).toHaveText('1')
  await expect(q('wall-area')).toHaveText('52.11 m²') // less 0.9 m x 2.1 m

  await pressTool(app, 'Place window')
  await click(app, top(0, -2))
  await expect(q('windows')).toHaveText('1')
  await expect(q('wall-area')).toHaveText('50.67 m²') // less 1.2 m x 1.2 m

  await pressTool(app, 'Bed')
  await click(app, top(-1, 0))
  await expect(q('furniture')).toHaveText('1')

  await pressTool(app, 'Place ceiling light')
  await click(app, top(1, 0))
  await expect(q('lights')).toHaveText('1')

  await setUnits(app, 'Imperial')
  await expect(q('wall-length')).toHaveText(`65' 7 3/8"`)
  await expect(q('floor-area')).toHaveText('242.4 sq ft')
})

test('the cost estimate multiplies quantities by editable rates, and the rates are saved', async ({ app }, testInfo) => {
  await drawRoom(app) // 54 m² of wall, 22.5225 m² of floor and of ceiling
  const cost = (name: string) => app.getByTestId(`cost-${name}`)
  const wallRate = app.getByLabel('Walls rate')

  // Default rates: walls 50, floors 80, ceilings 40 per m².
  await expect(cost('wall')).toHaveText('2,700')
  await expect(cost('floor')).toHaveText('1,802')
  await expect(cost('ceiling')).toHaveText('901')
  await expect(cost('door')).toHaveText('0')
  await expect(cost('total')).toHaveText('5,403')

  await wallRate.fill('100')
  await expect(cost('wall')).toHaveText('5,400')
  await expect(cost('total')).toHaveText('8,103')

  const top = await topView(app)
  await pressTool(app, 'Place door')
  await click(app, top(0, 2))
  await expect(cost('door')).toHaveText('400')
  await expect(cost('wall')).toHaveText('5,211') // 1.89 m² less wall

  // Imperial shows the same rate per square foot; the costs do not change.
  await setUnits(app, 'Imperial')
  await expect(wallRate).toHaveValue('9.29')
  await expect(cost('wall')).toHaveText('5,211')
  await setUnits(app, 'Metric')

  const path = testInfo.outputPath('cost.json')
  const [download] = await Promise.all([app.waitForEvent('download'), app.getByRole('button', { name: 'Save…' }).click()])
  await download.saveAs(path)
  await app.reload()
  await app.getByTestId('project-input').setInputFiles(path)
  await expect(wallRate).toHaveValue('100')
  await expect(cost('wall')).toHaveText('5,211')
})

test('checks list furniture that overlaps, runs into a wall or blocks a door', async ({ app }) => {
  await drawRoom(app)
  const top = await topView(app)
  const place = async (piece: string, x: number, z: number) => {
    await pressTool(app, piece)
    await click(app, top(x, z))
  }
  const problems = app.getByTestId('checks').getByRole('button')

  await expect(app.getByRole('heading', { name: 'Checks' })).toBeHidden()
  await place('Bed', -1.5, 0)
  await expect(app.getByTestId('checks-ok')).toHaveText('No problems found.')

  await place('Sofa', -1.5, 0.3)
  await expect(problems).toHaveText(['Bed overlaps sofa'])

  // The door on the south wall opens into the room; the chair stands where the leaf swings.
  await pressTool(app, 'Place door')
  await click(app, top(0, 2))
  await place('Chair', 0.2, 1.4)
  await place('Wardrobe', 2, -2) // centred on the north wall
  await expect(problems).toHaveText(['Bed overlaps sofa', 'Wardrobe runs into a wall', 'Chair blocks a door'])

  // Clicking a problem selects the piece; deleting it clears the problem.
  await problems.nth(1).click()
  await expect(app.getByRole('heading', { name: 'Selected wardrobe' })).toBeVisible()
  await app.getByRole('button', { name: 'Delete wardrobe' }).click()
  await expect(problems).toHaveText(['Bed overlaps sofa', 'Chair blocks a door'])
})
