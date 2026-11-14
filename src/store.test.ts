import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import { wallFootprints } from './model/wallGeometry'
import { WALL_DEFAULTS } from './model/walls'
import { applyPreset, DEFAULT_MATERIAL, PRESETS, ROOM_DEFAULTS } from './model/materials'

const p = (x: number, z: number) => ({ x, z })
const store = () => useStore.getState()

/** Draw an L: A from (0,0) to (4,0), then B from (4,0) to (4,3). */
function drawL() {
  for (const pt of [p(0, 0), p(4, 0), p(4, 3)]) store().addDraftPoint(pt)
  store().finishDraft()
  return store().walls
}

beforeEach(() => {
  useStore.setState({
    walls: [],
    openings: [],
    draft: [],
    selectedWallId: null,
    selectedRoomId: null,
    wallDefaults: { ...WALL_DEFAULTS },
    roomDefaults: { ...ROOM_DEFAULTS },
    roomMaterials: {},
    tool: 'none',
  })
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

describe('save and load', () => {
  it('a saved project loads back with the same walls, defaults and units', async () => {
    const [a] = drawL()
    store().updateWall(a.id, { height: 3.2, material: applyPreset(DEFAULT_MATERIAL, PRESETS[3]) })
    store().setWallDefaults({ thickness: 0.3 })
    store().setUnits('imperial')
    const saved = await store().saveProject()
    const walls = store().walls

    store().clearWalls()
    store().setUnits('metric')
    store().setWallDefaults({ thickness: 0.1 })
    store().loadProject(saved)

    expect(store().walls).toEqual(walls)
    expect(store().wallDefaults.thickness).toBe(0.3)
    expect(store().units).toBe('imperial')
    expect(store().selectedWallId).toBeNull()
  })

  it('an invalid file throws and leaves the project untouched', () => {
    const walls = drawL()
    expect(() => store().loadProject('{"app":"other"}')).toThrow()
    expect(store().walls).toEqual(walls)
  })
})

describe('rooms', () => {
  const stone = applyPreset(DEFAULT_MATERIAL, PRESETS[5])

  it("setting one room's floor leaves its ceiling and other rooms on the defaults", () => {
    store().setRoomMaterial('room-a', 'floor', stone)
    expect(store().roomMaterials['room-a'].floor).toEqual(stone)
    expect(store().roomMaterials['room-a'].ceiling).toEqual(store().roomDefaults.ceiling)
    expect(store().roomMaterials['room-b']).toBeUndefined()
  })

  it('applying a room to all rooms makes its materials the default', () => {
    store().setRoomMaterial('room-a', 'floor', stone)
    store().setRoomMaterial('room-b', 'ceiling', stone)
    store().applyRoomToAll('room-a')
    expect(store().roomDefaults.floor).toEqual(stone)
    expect(store().roomMaterials).toEqual({})
  })

  it('selecting a room and selecting a wall replace each other', () => {
    const [a] = drawL()
    store().selectWall(a.id)
    store().selectRoom('room-a')
    expect(store().selectedWallId).toBeNull()
    store().selectWall(a.id)
    expect(store().selectedRoomId).toBeNull()
  })

  it('room materials survive save and load', async () => {
    store().setRoomMaterial('room-a', 'floor', stone)
    const saved = await store().saveProject()
    store().applyRoomToAll('room-b') // resets everything to the defaults
    store().loadProject(saved)
    expect(store().roomMaterials['room-a'].floor).toEqual(stone)
  })
})

describe('openings', () => {
  it('adds a door to a wall and reports when there is no room', () => {
    const [a] = drawL() // 4 m long
    expect(store().addOpening(a.id, 'door')).toBe(true)
    expect(store().openings).toMatchObject([{ wallId: a.id, type: 'door', position: 2 }])
    expect(store().addOpening(a.id, 'window')).toBe(true) // 1.45 m free on one side of the door
    expect(store().addOpening(a.id, 'window')).toBe(true) // and on the other
    expect(store().addOpening(a.id, 'window')).toBe(false)
    expect(store().openings).toHaveLength(3)
  })

  it('deleting a wall removes its openings, and only its own', () => {
    const [a, b] = drawL()
    store().addOpening(a.id, 'door')
    store().addOpening(b.id, 'window')
    store().deleteWall(a.id)
    expect(store().openings.map((o) => o.wallId)).toEqual([b.id])
    store().removeOpenings(b.id)
    expect(store().openings).toEqual([])
  })

  it('clearing the walls clears the openings', () => {
    const [a] = drawL()
    store().addOpening(a.id, 'door')
    store().clearWalls()
    expect(store().openings).toEqual([])
  })

  it('openings survive save and load', async () => {
    const [a] = drawL()
    store().addOpening(a.id, 'window')
    const openings = store().openings
    const saved = await store().saveProject()
    store().clearWalls()
    store().loadProject(saved)
    expect(store().openings).toEqual(openings)
  })
})
