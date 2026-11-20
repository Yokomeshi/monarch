import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNDO_LIMIT, UNDO_PAUSE, useStore } from './store'
import { blockGlb, crateObj } from './testModels'
import { DEFAULT_SUN } from './model/sun'
import { DEFAULT_RATES } from './model/cost'
import { wallFootprints } from './model/wallGeometry'
import { createWall, WALL_DEFAULTS } from './model/walls'
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
    past: [],
    future: [],
    suggestedWalls: null,
    suggestedGaps: [],
    suggestionClick: 'edit',
    identifying: 'idle',
    openings: [],
    objects: [],
    sun: { ...DEFAULT_SUN },
    lights: [],
    selectedLightId: null,
    costRates: { ...DEFAULT_RATES },
    models: {},
    placingModelId: null,
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

describe('imported models', () => {
  it('importing a model arms the tool; placing it uses the model at its natural size', async () => {
    await store().importModel(blockGlb())
    const [id] = Object.keys(store().models)
    expect(store().models[id]).toMatchObject({ name: 'block.glb', format: 'glb' })
    expect(store().tool).toBe('object')
    store().placeObject({ x: 1, z: 2 })
    const [placed] = store().objects
    expect(placed).toMatchObject({ kind: 'model', modelId: id, position: { x: 1, z: 2 } })
    expect(placed.size.height).toBeCloseTo(2, 6)
    expect(store().selectedObjectId).toBe(placed.id)
  })

  it('a bad file is refused and nothing is added', async () => {
    await expect(store().importModel(new File(['hello'], 'fake.glb'))).rejects.toThrow(/Couldn't read/)
    expect(store().models).toEqual({})
    expect(store().tool).toBe('none')
  })

  it('choosing a library piece after a model places the library piece', async () => {
    await store().importModel(crateObj())
    store().startPlacingObject('chair')
    store().placeObject({ x: 0, z: 0 })
    expect(store().objects[0].kind).toBe('chair')
  })

  it('placed models are saved with their file embedded, and reopen', async () => {
    await store().importModel(crateObj())
    store().placeObject({ x: 0, z: 0 })
    await store().importModel(blockGlb()) // imported but never placed: not saved
    store().setTool('none')
    const objects = store().objects
    const saved = await store().saveProject()
    expect(Object.keys(JSON.parse(saved).models)).toEqual([objects[0].modelId])
    expect(JSON.parse(saved).models[objects[0].modelId!].data).toMatch(/^data:/)

    useStore.setState({ objects: [], models: {} })
    store().loadProject(saved)
    expect(store().objects).toEqual(objects)
    expect(store().models[objects[0].modelId!]).toMatchObject({ name: 'crate.obj', format: 'obj' })
  })
})

describe('ceiling lights', () => {
  const place = (x: number, z: number) => {
    store().setTool('light')
    store().placeLight(p(x, z))
    return store().lights.at(-1)!
  }

  it('the light tool places a light, selects it and ends the tool', () => {
    const light = place(1, 2)
    expect(light).toMatchObject({ position: p(1, 2), lumens: 800, kelvin: 3000 })
    expect(store().selectedLightId).toBe(light.id)
    expect(store().tool).toBe('none')
  })

  it('does nothing without the light tool', () => {
    store().placeLight(p(1, 2))
    expect(store().lights).toEqual([])
  })

  it('selecting a light deselects everything else, and the reverse', () => {
    const [wall] = drawL()
    const light = place(1, 2)
    store().selectWall(wall.id)
    expect(store().selectedLightId).toBeNull()
    store().selectLight(light.id)
    expect(store().selectedWallId).toBeNull()
  })

  it('updates and deletes a light', () => {
    const light = place(1, 2)
    store().updateLight(light.id, { lumens: 1500, kelvin: 5000 })
    expect(store().lights[0]).toMatchObject({ lumens: 1500, kelvin: 5000, position: p(1, 2) })
    store().deleteLight(light.id)
    expect(store().lights).toEqual([])
    expect(store().selectedLightId).toBeNull()
  })

  it('is saved and loaded with the project', async () => {
    const light = place(1, 2)
    store().updateLight(light.id, { kelvin: 6000 })
    const text = await store().saveProject()
    store().deleteLight(light.id)
    store().loadProject(text)
    expect(store().lights).toEqual([{ ...light, kelvin: 6000 }])
    expect(store().selectedLightId).toBeNull()
  })
})

describe('suggested walls', () => {
  const suggestion = () => [createWall(p(0, 0), p(4, 0)), createWall(p(4, 0), p(4, 3))]

  it('are added to the walls already there when accepted', () => {
    const drawn = drawL()
    useStore.setState({ suggestedWalls: suggestion() })
    store().acceptSuggestedWalls()
    expect(store().walls).toHaveLength(drawn.length + 2)
    expect(store().suggestedWalls).toBeNull()
  })

  it('leave the walls alone when discarded', () => {
    useStore.setState({ suggestedWalls: suggestion() })
    store().discardSuggestedWalls()
    expect(store().walls).toEqual([])
    expect(store().suggestedWalls).toBeNull()
  })

  it('bring a door or window for each gap identified as one', () => {
    const walls = suggestion() // the first is 4 m long
    const gap = { wallId: walls[0].id, position: 2, width: 0.8, confidence: 0.95 }
    useStore.setState({
      suggestedWalls: walls,
      suggestedGaps: [{ ...gap, kind: 'door' }, { ...gap, wallId: walls[1].id, position: 1.5, kind: null, confidence: 0 }],
    })
    store().acceptSuggestedWalls()
    expect(store().openings).toMatchObject([{ wallId: walls[0].id, type: 'door', position: 2, width: 0.8 }])
    expect(store().suggestedGaps).toEqual([])
  })

  it('lose one wall and its gaps when it is removed', () => {
    const crop = (at: number) => ({ square: { x: at, y: at, size: 10 }, mark: { x: at, y: at, width: 2, height: 2 } })
    const walls = suggestion()
    const gap = { position: 1, width: 0.8, kind: null, confidence: 0 }
    useStore.setState({
      suggestedWalls: walls,
      suggestedGaps: [{ ...gap, wallId: walls[0].id, crop: crop(0) }, { ...gap, wallId: walls[1].id, crop: crop(5) }],
    })
    store().removeSuggestedWall(walls[0].id)
    expect(store().suggestedWalls).toEqual([walls[1]])
    expect(store().suggestedGaps).toEqual([{ ...gap, wallId: walls[1].id, crop: crop(5) }])
  })

  it('keep only the thick walls, and their gaps, on request', () => {
    const thick = createWall(p(0, 0), p(4, 0), { thickness: 0.4 })
    const thin = createWall(p(4, 0), p(4, 3), { thickness: 0.1 })
    const gap = { position: 1, width: 0.8, kind: null, confidence: 0 }
    useStore.setState({
      suggestedWalls: [thick, thin],
      suggestedGaps: [{ ...gap, wallId: thin.id }, { ...gap, wallId: thick.id }],
    })
    store().keepThickSuggestedWalls()
    expect(store().suggestedWalls).toEqual([thick])
    expect(store().suggestedGaps).toEqual([{ ...gap, wallId: thick.id }])
  })

  it('let a gap be set by hand: door, then window, then plain wall, then door again', () => {
    const walls = suggestion()
    // Identified as a door, but not confidently enough to act on: it counts as plain wall.
    useStore.setState({ suggestedWalls: walls, suggestedGaps: [{ wallId: walls[0].id, position: 2, width: 0.8, kind: 'door', confidence: 0.4 }] })
    const kinds = [1, 2, 3, 4].map(() => {
      store().cycleSuggestedGap(0)
      return store().suggestedGaps[0]
    })
    expect(kinds.map((g) => g.kind)).toEqual(['door', 'window', 'none', 'door'])
    expect(kinds.every((g) => g.confidence === 1)).toBe(true)
  })

  it('take doors and windows marked by hand: on a wall, beside a thin wall, on a gap, and across a doorway', () => {
    // Two pieces of one wall with a 0.9 m doorway between them, and a wall well apart.
    const left = createWall(p(0, 0), p(2, 0), { thickness: 0.1 })
    const right = createWall(p(2.9, 0), p(6, 0), { thickness: 0.1 })
    const other = createWall(p(0, 3), p(4, 3), { thickness: 0.1 })
    const found = { wallId: other.id, position: 3, width: 0.8, kind: null, confidence: 0 }
    useStore.setState({ suggestedWalls: [left, right, other], suggestedGaps: [found] })

    store().markSuggestion(p(1, 3), other.id)
    expect(store().suggestedGaps, 'nothing is marked in Remove mode').toHaveLength(1)

    store().setSuggestionClick('window')
    store().markSuggestion(p(1, 3), other.id) // on the wall
    store().markSuggestion(p(4.5, 0.2)) // 15 cm beside the thin wall
    store().markSuggestion(p(9, 9)) // nowhere near anything
    store().setSuggestionClick('door')
    store().markSuggestion(p(3, 3), undefined, 0) // the gap detection found
    store().markSuggestion(p(2.4, 0.1)) // in the doorway

    const { suggestedWalls, suggestedGaps } = store()
    expect(suggestedWalls, 'the two pieces are now one wall').toHaveLength(2)
    expect(suggestedGaps.map((g) => [g.kind, g.width])).toEqual([
      ['door', 0.8],
      ['window', 1.2],
      ['window', 1.2],
      ['door', expect.closeTo(0.9, 9)],
    ])
    store().acceptSuggestedWalls()
    expect(store().openings.map((o) => o.type).sort()).toEqual(['door', 'door', 'window', 'window'])
    expect(store().suggestionClick).toBe('edit')
  })

  it('forget the gaps when discarded', () => {
    const walls = suggestion()
    useStore.setState({ suggestedWalls: walls, suggestedGaps: [{ wallId: walls[0].id, position: 2, width: 0.8, kind: 'door', confidence: 1 }] })
    store().discardSuggestedWalls()
    expect(store().suggestedGaps).toEqual([])
    expect(store().openings).toEqual([])
  })

  it('are not saved with the project', async () => {
    useStore.setState({ suggestedWalls: suggestion() })
    store().loadProject(await store().saveProject())
    expect(store().walls).toEqual([])
    expect(store().suggestedWalls).toBeNull()
  })
})

describe('cost rates', () => {
  it('start at the defaults, change one at a time, and are saved with the project', async () => {
    expect(store().costRates).toEqual(DEFAULT_RATES)
    store().setCostRate('door', 525)
    expect(store().costRates).toEqual({ ...DEFAULT_RATES, door: 525 })
    const text = await store().saveProject()
    store().setCostRate('door', 1)
    store().loadProject(text)
    expect(store().costRates.door).toBe(525)
  })
})

describe('sun study', () => {
  it('is off to begin with, and a change keeps the other settings', () => {
    expect(store().sun.enabled).toBe(false)
    store().setSun({ enabled: true, latitude: -33.9 })
    store().setSun({ hour: 9.5 })
    expect(store().sun).toMatchObject({ enabled: true, latitude: -33.9, hour: 9.5 })
  })

  it('survives save and load', async () => {
    store().setSun({ enabled: true, latitude: 51.5, day: 355, hour: 15.25, north: 90 })
    const sun = store().sun
    const saved = await store().saveProject()
    store().setSun({ enabled: false, latitude: 0, day: 1, hour: 0, north: 0 })
    store().loadProject(saved)
    expect(store().sun).toEqual(sun)
  })
})

describe('undo and redo', () => {
  /** Time stands still in these tests; `later` lets enough of it pass for the next change to be a step of its own. */
  const later = () => vi.advanceTimersByTime(UNDO_PAUSE + 1)

  beforeEach(() => {
    vi.useFakeTimers()
    later()
    useStore.setState({ past: [], future: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('undo takes back the last change, and redo puts it back', () => {
    const walls = drawL()
    store().undo()
    expect(store().walls).toEqual([])
    store().redo()
    expect(store().walls).toEqual(walls)
  })

  it('goes back one step at a time, and does nothing when there is nothing left', () => {
    const [a] = drawL()
    later()
    store().updateWall(a.id, { height: 3 })
    later()
    store().deleteWall(a.id)

    store().undo()
    expect(store().walls.map((w) => w.height)).toEqual([3, 2.7])
    store().undo()
    expect(store().walls.map((w) => w.height)).toEqual([2.7, 2.7])
    store().undo()
    expect(store().walls).toEqual([])
    store().undo()
    expect(store().walls).toEqual([])
    store().redo()
    store().redo()
    store().redo()
    store().redo()
    expect(store().walls).toHaveLength(1)
  })

  it('treats changes in quick succession, such as dragging a slider, as one step', () => {
    const [a] = drawL()
    later()
    for (const height of [2.8, 2.9, 3, 3.1]) {
      vi.advanceTimersByTime(50)
      store().updateWall(a.id, { height })
    }
    store().undo()
    expect(store().walls[0].height).toBe(2.7)
    store().redo()
    expect(store().walls[0].height).toBe(3.1)
  })

  it('a change made right after an undo is a step of its own', () => {
    const [a] = drawL()
    later()
    store().updateWall(a.id, { height: 3 })
    store().undo()
    store().updateWall(a.id, { height: 3.5 })
    store().undo()
    expect(store().walls[0].height).toBe(2.7)
  })

  it('a new change after an undo drops what could have been redone', () => {
    const [a] = drawL()
    later()
    store().updateWall(a.id, { height: 3 })
    store().undo()
    later()
    store().updateWall(a.id, { height: 3.5 })
    store().redo()
    expect(store().walls[0].height).toBe(3.5)
    expect(store().future).toEqual([])
  })

  it('brings back a deleted wall together with its door', () => {
    const [a] = drawL()
    later()
    store().setTool('door')
    store().placeOpening(a.id, 2)
    later()
    store().deleteWall(a.id)
    expect(store().openings).toEqual([])
    store().undo()
    expect(store().walls).toHaveLength(2)
    expect(store().openings).toHaveLength(1)
  })

  it('covers furniture, lights and room finishes, but not the view', () => {
    store().startPlacingObject('sofa')
    store().placeObject(p(1, 1))
    later()
    store().setTool('light')
    store().placeLight(p(2, 2))
    later()
    store().setCutaway(true)
    store().setUnits('imperial')
    expect(store().past).toHaveLength(2)

    store().undo()
    expect(store().lights).toEqual([])
    expect(store().objects).toHaveLength(1)
    store().undo()
    expect(store().objects).toEqual([])
    expect(store().cutaway).toBe(true)
    expect(store().units).toBe('imperial')
  })

  it('starts afresh when a project is opened', async () => {
    drawL()
    const text = await store().saveProject()
    later()
    store().clearWalls()
    later()
    store().loadProject(text)
    expect(store().past).toEqual([])
    store().undo()
    expect(store().walls).toHaveLength(2)
  })

  it('remembers a limited number of steps', () => {
    const [a] = drawL()
    for (let i = 0; i < UNDO_LIMIT + 20; i++) {
      later()
      store().updateWall(a.id, { height: 2 + i / 100 })
    }
    expect(store().past).toHaveLength(UNDO_LIMIT)
  })
})
