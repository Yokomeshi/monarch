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
    objects: [],
    selectedObjectId: null,
    draft: [],
    selectedWallId: null,
    selectedRoomId: null,
    selectedOpeningId: null,
    placementFailed: false,
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
  it('placing a door on a wall selects it and ends the tool', () => {
    const [a] = drawL() // 4 m long
    store().setTool('door')
    expect(store().placeOpening(a.id, 1.5)).toBe(true)
    const [door] = store().openings
    expect(door).toMatchObject({ wallId: a.id, type: 'door', position: 1.5 })
    expect(store().selectedOpeningId).toBe(door.id)
    expect(store().tool).toBe('none')
  })

  it('a spot that is taken is refused, keeps the tool, and flags the failure', () => {
    const [a] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 1.5)
    store().setTool('window')
    expect(store().placeOpening(a.id, 1.7)).toBe(false)
    expect(store().openings).toHaveLength(1)
    expect(store().tool).toBe('window')
    expect(store().placementFailed).toBe(true)
    expect(store().placeOpening(a.id, 3.2)).toBe(true)
    expect(store().placementFailed).toBe(false)
  })

  it('edits an opening within its limits and ignores a change that would overlap', () => {
    const [a] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 1)
    store().setTool('window')
    store().placeOpening(a.id, 3)
    const [door, window] = store().openings
    store().updateOpening(door.id, { width: 1.2, hinge: 'end' })
    expect(store().openings[0]).toMatchObject({ width: 1.2, hinge: 'end' })
    store().updateOpening(door.id, { position: 2.5 }) // would run into the window
    expect(store().openings[0].position).toBe(1)
    store().updateOpening(window.id, { sill: 9 }) // above the wall: fitted
    expect(store().openings[1].sill + store().openings[1].height).toBeLessThanOrEqual(a.height)
  })

  it('selecting an opening, a wall and a room replace each other', () => {
    const [a] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 2)
    const id = store().openings[0].id
    store().selectWall(a.id)
    expect(store().selectedOpeningId).toBeNull()
    store().selectOpening(id)
    expect(store().selectedWallId).toBeNull()
    store().selectRoom('room-a')
    expect(store().selectedOpeningId).toBeNull()
  })

  it('deleting an opening removes just that one and clears its selection', () => {
    const [a] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 1)
    store().setTool('window')
    store().placeOpening(a.id, 3)
    const [door, window] = store().openings
    store().selectOpening(door.id)
    store().deleteOpening(door.id)
    expect(store().openings.map((o) => o.id)).toEqual([window.id])
    expect(store().selectedOpeningId).toBeNull()
  })

  it('deleting a wall removes its openings, and only its own', () => {
    const [a, b] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 2)
    store().setTool('window')
    store().placeOpening(b.id, 1.5)
    store().deleteWall(a.id)
    expect(store().openings.map((o) => o.wallId)).toEqual([b.id])
    store().clearWalls()
    expect(store().openings).toEqual([])
  })

  it('openings survive save and load', async () => {
    const [a] = drawL()
    store().setTool('door')
    store().placeOpening(a.id, 2)
    store().updateOpening(store().openings[0].id, { hinge: 'end', swing: 'right' })
    const openings = store().openings
    const saved = await store().saveProject()
    store().clearWalls()
    store().loadProject(saved)
    expect(store().openings).toEqual(openings)
  })
})

describe('furniture', () => {
  it('placing a piece puts it at the clicked point, selects it and ends the tool', () => {
    store().startPlacingObject('sofa')
    expect(store().tool).toBe('object')
    store().placeObject({ x: 2, z: -1 })
    const [sofa] = store().objects
    expect(sofa).toMatchObject({ kind: 'sofa', position: { x: 2, z: -1 } })
    expect(store().selectedObjectId).toBe(sofa.id)
    expect(store().tool).toBe('none')
  })

  it('moves, resizes within limits and rotates a piece', () => {
    store().startPlacingObject('table')
    store().placeObject({ x: 0, z: 0 })
    const id = store().objects[0].id
    store().updateObject(id, { position: { x: 3, z: 4 }, rotation: 450 })
    store().updateObject(id, { size: { width: 99, depth: 1, height: 0.8 } })
    expect(store().objects[0]).toMatchObject({
      position: { x: 3, z: 4 }, rotation: 90, size: { width: 10, depth: 1, height: 0.8 },
    })
  })

  it('selecting a piece replaces any other selection, and the reverse', () => {
    const [a] = drawL()
    store().startPlacingObject('chair')
    store().placeObject({ x: 0, z: 0 })
    const id = store().objects[0].id
    store().selectWall(a.id)
    expect(store().selectedObjectId).toBeNull()
    store().selectObject(id)
    expect(store().selectedWallId).toBeNull()
    store().selectRoom('room-a')
    expect(store().selectedObjectId).toBeNull()
  })

  it('deleting a piece removes just that one; clearing walls leaves furniture alone', () => {
    drawL()
    for (const kind of ['bed', 'desk'] as const) {
      store().startPlacingObject(kind)
      store().placeObject({ x: 0, z: 0 })
    }
    const [bed, desk] = store().objects
    store().deleteObject(bed.id)
    expect(store().objects.map((o) => o.id)).toEqual([desk.id])
    expect(store().selectedObjectId).toBe(desk.id)
    store().clearWalls()
    expect(store().objects).toHaveLength(1)
  })

  it('duplicating a piece adds a copy beside it and selects the copy', () => {
    store().startPlacingObject('chair')
    store().placeObject({ x: 1, z: 1 })
    const original = store().objects[0]
    store().duplicateObject(original.id)
    const [, copy] = store().objects
    expect(copy).toMatchObject({ kind: 'chair', position: { x: 1.5, z: 1.5 } })
    expect(store().selectedObjectId).toBe(copy.id)
  })

  it('furniture survives save and load', async () => {
    store().startPlacingObject('wardrobe')
    store().placeObject({ x: 1, z: 2 })
    store().updateObject(store().objects[0].id, { rotation: 90, material: applyPreset(DEFAULT_MATERIAL, PRESETS[5]) })
    const objects = store().objects
    const saved = await store().saveProject()
    store().deleteObject(objects[0].id)
    store().loadProject(saved)
    expect(store().objects).toEqual(objects)
  })
})
