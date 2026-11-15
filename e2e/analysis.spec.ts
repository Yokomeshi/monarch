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
