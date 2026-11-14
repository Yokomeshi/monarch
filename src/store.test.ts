import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import { wallFootprints } from './model/wallGeometry'
import { WALL_DEFAULTS } from './model/walls'
import { applyPreset, DEFAULT_MATERIAL, PRESETS } from './model/materials'

const p = (x: number, z: number) => ({ x, z })
const store = () => useStore.getState()

/** Draw an L: A from (0,0) to (4,0), then B from (4,0) to (4,3). */
function drawL() {
  for (const pt of [p(0, 0), p(4, 0), p(4, 3)]) store().addDraftPoint(pt)
  store().finishDraft()
  return store().walls
}

beforeEach(() => {
  useStore.setState({ walls: [], draft: [], selectedWallId: null, wallDefaults: { ...WALL_DEFAULTS }, tool: 'none' })
})

describe('wall editing', () => {
  it('changing thickness changes the wall footprint', () => {
    const [a] = drawL()
    store().updateWall(a.id, { thickness: 0.4 })
    const [startLeft, , , startRight] = wallFootprints(store().walls).get(a.id)!
    expect(Math.abs(startLeft.z - startRight.z)).toBeCloseTo(0.4, 9)
  })

  it("changing one wall's thickness moves its neighbour's mitred corner", () => {
    const [a, b] = drawL()
    const before = wallFootprints(store().walls).get(b.id)![0]
    store().updateWall(a.id, { thickness: 0.4 })
    const after = wallFootprints(store().walls).get(b.id)![0]
    expect(before.z).toBeCloseTo(0.075, 9)
    expect(after.z).toBeCloseTo(0.2, 9)
  })

  it('changing height leaves the other wall untouched', () => {
    const [a, b] = drawL()
    store().updateWall(a.id, { height: 3.5 })
    expect(store().walls.find((w) => w.id === a.id)!.height).toBe(3.5)
    expect(store().walls.find((w) => w.id === b.id)!.height).toBe(WALL_DEFAULTS.height)
  })

  it('new walls use the current defaults', () => {
    store().setWallDefaults({ height: 3, thickness: 0.2 })
    const [a] = drawL()
    expect(a.height).toBe(3)
    expect(a.thickness).toBe(0.2)
  })

  it('applies the defaults to every wall', () => {
    drawL()
    store().setWallDefaults({ height: 2.4 })
    store().applyDefaultsToAll()
    expect(store().walls.map((w) => w.height)).toEqual([2.4, 2.4])
  })

  it("changing one wall's material leaves the other untouched", () => {
    const [a, b] = drawL()
    store().updateWall(a.id, { material: { ...a.material, color: '#ff0000' } })
    expect(store().walls.find((w) => w.id === a.id)!.material.color).toBe('#ff0000')
    expect(store().walls.find((w) => w.id === b.id)!.material).toEqual(WALL_DEFAULTS.material)
  })

  it('applying the defaults to every wall includes the material', () => {
    drawL()
    store().setWallDefaults({ material: applyPreset(DEFAULT_MATERIAL, PRESETS[3]) })
    store().applyDefaultsToAll()
    expect(store().walls.map((w) => w.material.color)).toEqual([PRESETS[3].color, PRESETS[3].color])
  })

  it('deleting the selected wall clears the selection', () => {
    const [a, b] = drawL()
    store().selectWall(a.id)
    store().deleteWall(a.id)
    expect(store().walls.map((w) => w.id)).toEqual([b.id])
    expect(store().selectedWallId).toBeNull()
  })

  it('switching to a drawing tool clears the selection', () => {
    const [a] = drawL()
    store().selectWall(a.id)
    store().setTool('wall')
    expect(store().selectedWallId).toBeNull()
  })
})
