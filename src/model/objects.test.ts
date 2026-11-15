import { describe, expect, it } from 'vitest'
import {
  createModelObject, createObject, duplicateObject, fitSize, isCabinet, LIBRARY, modelFormat, objectParts, resizeObject,
  resizeProportional, scaleObjects, type CabinetKind, type CabinetOptions, type ObjectKind, type Size3,
} from './objects'

const kinds = Object.keys(LIBRARY) as ObjectKind[]
const p = (x: number, z: number) => ({ x, z })

/** Every part must stay inside the object's stated size: that is what makes the sliders truthful. */
function expectWithin(kind: ObjectKind, size: Size3, cabinet?: CabinetOptions) {
  const parts = objectParts({ ...createObject(kind, p(0, 0)), size, ...(cabinet && { cabinet }) })
  expect(parts.length).toBeGreaterThan(0)
  const eps = 1e-9
  for (const { size: [w, h, d], position: [x, y, z] } of parts) {
    expect(w, `${kind} part width`).toBeGreaterThan(0)
    expect(h, `${kind} part height`).toBeGreaterThan(0)
    expect(d, `${kind} part depth`).toBeGreaterThan(0)
    expect(Math.abs(x) + w / 2, `${kind} x`).toBeLessThanOrEqual(size.width / 2 + eps)
    expect(Math.abs(z) + d / 2, `${kind} z`).toBeLessThanOrEqual(size.depth / 2 + eps)
    expect(y - h / 2, `${kind} bottom`).toBeGreaterThanOrEqual(-eps)
    expect(y + h / 2, `${kind} top`).toBeLessThanOrEqual(size.height + eps)
  }
  return parts
}

describe('furniture library', () => {
  it('has the eight starter pieces and three cabinets, each with a name and a realistic default size', () => {
    expect(kinds.sort()).toEqual([
      'baseCabinet', 'bed', 'bookshelf', 'chair', 'counter', 'desk', 'sofa', 'table', 'tallCabinet', 'wallCabinet', 'wardrobe',
    ])
    for (const kind of kinds) {
      const { name, size } = LIBRARY[kind]
      expect(name).toMatch(/^[A-Z]/)
      for (const v of Object.values(size)) {
        expect(v).toBeGreaterThanOrEqual(0.3)
        expect(v).toBeLessThanOrEqual(2.2)
      }
    }
  })

  it.each(kinds)('%s fits exactly inside its size at the default', (kind) => {
    expectWithin(kind, LIBRARY[kind].size)
  })

  it.each(kinds)('%s still fits when made very small, very large or lopsided', (kind) => {
    expectWithin(kind, { width: 0.2, depth: 0.2, height: 0.2 })
    expectWithin(kind, { width: 6, depth: 6, height: 3 })
    expectWithin(kind, { width: 5, depth: 0.3, height: 0.4 })
  })

  it.each(kinds)('%s reaches its full width, depth and height', (kind) => {
    const size = LIBRARY[kind].size
    const parts = expectWithin(kind, size)
    const reach = (axis: 0 | 1 | 2, dim: 0 | 1 | 2) =>
      Math.max(...parts.map((q) => q.position[axis] + q.size[dim] / 2)) - Math.min(...parts.map((q) => q.position[axis] - q.size[dim] / 2))
    expect(reach(0, 0)).toBeCloseTo(size.width, 9)
    expect(reach(1, 1)).toBeCloseTo(size.height, 9)
    expect(reach(2, 2)).toBeCloseTo(size.depth, 9)
  })

  it('a table keeps thin legs when it is made wider', () => {
    const legs = (width: number) =>
      objectParts({ ...createObject('table', p(0, 0)), size: { width, depth: 0.9, height: 0.75 } })
        .filter((q) => q.size[1] > 0.5)
        .map((q) => q.size[0])
    expect(legs(1.6)).toHaveLength(4)
    expect(legs(4)).toEqual(legs(1.6))
  })
})

describe('cabinets', () => {
  const cabinets: CabinetKind[] = ['baseCabinet', 'wallCabinet', 'tallCabinet']
  const doors: CabinetOptions = { fronts: 'doors' }
  const drawers: CabinetOptions = { fronts: 'drawers' }
  const sized = (kind: CabinetKind, patch: Partial<Size3>) => ({ ...LIBRARY[kind].size, ...patch })
  const cabinetParts = (kind: CabinetKind, cabinet: CabinetOptions, patch: Partial<Size3> = {}) =>
    objectParts({ kind, size: sized(kind, patch), cabinet })
  /** Doors and drawer fronts: thin plain slabs. The plinth and carcass are deep, the handles and worktop accented. */
  const fronts = (kind: CabinetKind, cabinet: CabinetOptions, patch: Partial<Size3> = {}) =>
    cabinetParts(kind, cabinet, patch).filter((q) => !q.accent && q.size[2] < 0.05)
  const bodies = (kind: CabinetKind) => cabinetParts(kind, doors).filter((q) => !q.accent && q.size[2] >= 0.05)
  const worktops = (kind: CabinetKind) => cabinetParts(kind, doors).filter((q) => q.accent && q.size[2] === LIBRARY[kind].size.depth)
  const frontEdge = (q: { size: number[]; position: number[] }) => q.position[2] + q.size[2] / 2

  it('names them and gives them standard sizes', () => {
    expect(LIBRARY.baseCabinet).toMatchObject({ name: 'Base cabinet', size: { width: 0.6, depth: 0.6, height: 0.9 } })
    expect(LIBRARY.wallCabinet).toMatchObject({ name: 'Wall cabinet', size: { width: 0.6, depth: 0.35, height: 0.72 } })
    expect(LIBRARY.tallCabinet).toMatchObject({ name: 'Tall cabinet', size: { width: 0.6, depth: 0.6, height: 2.1 } })
  })

  it('tells cabinets from other pieces', () => {
    expect(cabinets.map(isCabinet)).toEqual([true, true, true])
    expect(kinds.filter(isCabinet).sort()).toEqual([...cabinets].sort())
    expect(isCabinet('model')).toBe(false)
  })

  it('has one door per 0.6 m of width, all the same size', () => {
    for (const kind of ['baseCabinet', 'wallCabinet'] as const) {
      expect(fronts(kind, doors, { width: 0.6 })).toHaveLength(1)
      expect(fronts(kind, doors, { width: 0.9 })).toHaveLength(2)
      expect(fronts(kind, doors, { width: 1.2 })).toHaveLength(2)
      expect(fronts(kind, doors, { width: 1.5 })).toHaveLength(3)
    }
    const three = fronts('baseCabinet', doors, { width: 1.5 })
    for (const q of three) {
      expect(q.size[0]).toBeCloseTo(three[0].size[0], 9)
      expect(q.size[0]).toBeLessThan(0.5)
    }
    // Gaps between and around the doors, so the seams show.
    expect(three[0].size[0] * 3).toBeLessThan(1.5)
    expect(new Set(three.map((q) => q.position[0].toFixed(6))).size).toBe(3)
  })

  it('a tall cabinet has an upper and a lower door in each column', () => {
    expect(fronts('tallCabinet', doors, { width: 0.6 })).toHaveLength(2)
    expect(fronts('tallCabinet', doors, { width: 0.9 })).toHaveLength(4)
  })

  it('has full-width drawers no taller than 0.3 m, so more of them as it gets taller', () => {
    expect(fronts('baseCabinet', drawers)).toHaveLength(3)
    expect(fronts('baseCabinet', drawers, { height: 0.4 })).toHaveLength(1)
    expect(fronts('baseCabinet', drawers, { height: 1.2 })).toHaveLength(4)
    expect(fronts('wallCabinet', drawers)).toHaveLength(3)
    expect(fronts('baseCabinet', drawers, { width: 1.5 })).toHaveLength(3)
    for (const q of fronts('baseCabinet', drawers)) {
      expect(q.size[1]).toBeLessThanOrEqual(0.3)
      expect(q.size[0]).toBeGreaterThan(0.58)
    }
  })

  it.each(cabinets)('%s has its fronts on the front face, proud of the carcass, each with a handle', (kind) => {
    for (const cabinet of [doors, drawers]) {
      const carcassFront = Math.max(...bodies(kind).map(frontEdge))
      const slabs = fronts(kind, cabinet)
      const handles = cabinetParts(kind, cabinet).filter((q) => q.accent && q.size[2] < 0.05)
      expect(handles).toHaveLength(slabs.length)
      for (const q of slabs) {
        expect(q.position[2]).toBeGreaterThan(0)
        expect(q.position[2] - q.size[2] / 2).toBeCloseTo(carcassFront, 9)
      }
      for (const q of handles) expect(q.position[2] - q.size[2] / 2).toBeCloseTo(frontEdge(slabs[0]), 9)
    }
  })

  it('a base cabinet has a worktop on top and a plinth recessed from the front', () => {
    const { width, depth, height } = LIBRARY.baseCabinet.size
    const [worktop] = worktops('baseCabinet')
    expect(worktop.size[0]).toBe(width)
    expect(worktop.position[1] + worktop.size[1] / 2).toBeCloseTo(height, 9)
    expect(frontEdge(worktop)).toBeCloseTo(depth / 2, 9)
    const [plinth, carcass] = bodies('baseCabinet').sort((a, b) => a.position[1] - b.position[1])
    expect(plinth.position[1] - plinth.size[1] / 2).toBe(0)
    expect(carcass.position[1] - carcass.size[1] / 2).toBeCloseTo(plinth.size[1], 9)
    expect(frontEdge(plinth)).toBeLessThan(frontEdge(carcass) - 0.03)
    // The worktop overhangs the carcass and its fronts.
    expect(frontEdge(worktop)).toBeGreaterThan(frontEdge(fronts('baseCabinet', doors)[0]))
  })

  it('a wall cabinet has neither plinth nor worktop, a tall cabinet only a plinth', () => {
    expect(bodies('wallCabinet')).toHaveLength(1)
    expect(worktops('wallCabinet')).toHaveLength(0)
    expect(bodies('tallCabinet')).toHaveLength(2)
    expect(worktops('tallCabinet')).toHaveLength(0)
  })

  it.each(cabinets)('%s stays inside its size with doors or drawers, from the smallest size to the largest', (kind) => {
    for (const cabinet of [doors, drawers]) {
      expectWithin(kind, LIBRARY[kind].size, cabinet)
      expectWithin(kind, { width: 0.1, depth: 0.1, height: 0.1 }, cabinet)
      expectWithin(kind, { width: 10, depth: 10, height: 10 }, cabinet)
      expectWithin(kind, { width: 10, depth: 0.1, height: 0.1 }, cabinet)
      expectWithin(kind, { width: 0.1, depth: 0.1, height: 10 }, cabinet)
    }
  })

  it('a new cabinet has doors, and a wall cabinet hangs at 1.45 m', () => {
    for (const kind of cabinets) expect(createObject(kind, p(0, 0)).cabinet).toEqual(doors)
    expect(createObject('baseCabinet', p(0, 0)).cabinet).not.toBe(LIBRARY.baseCabinet.cabinet)
    expect(createObject('wallCabinet', p(0, 0)).elevation).toBe(1.45)
    expect(createObject('baseCabinet', p(0, 0))).not.toHaveProperty('elevation')
    expect(createObject('tallCabinet', p(0, 0))).not.toHaveProperty('elevation')
    const sofa = createObject('sofa', p(0, 0))
    expect(sofa).not.toHaveProperty('cabinet')
    expect(sofa).not.toHaveProperty('elevation')
  })

  it('a cabinet without options is drawn with doors', () => {
    const { kind, size } = createObject('baseCabinet', p(0, 0))
    expect(objectParts({ kind, size })).toEqual(objectParts({ kind, size, cabinet: doors }))
  })

  it('duplicating and resizing keep the options and the elevation', () => {
    const o = { ...createObject('wallCabinet', p(0, 0)), cabinet: drawers, elevation: 1.6 }
    const copy = duplicateObject(o)
    expect(copy).toMatchObject({ cabinet: drawers, elevation: 1.6 })
    expect(copy.cabinet).not.toBe(o.cabinet)
    expect(resizeObject(o, { size: { width: 1.2, depth: 0.35, height: 0.72 } })).toMatchObject({ cabinet: drawers, elevation: 1.6 })
    expect(duplicateObject(createObject('sofa', p(0, 0)))).not.toHaveProperty('cabinet')
  })
})

describe('placed objects', () => {
  it('a new object stands at the clicked point with its default size, unrotated', () => {
    const o = createObject('sofa', p(2, -1))
    expect(o).toMatchObject({ kind: 'sofa', position: p(2, -1), rotation: 0, size: LIBRARY.sofa.size })
    expect(o.material.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(createObject('sofa', p(0, 0)).id).not.toBe(o.id)
  })

  it('resizing keeps each dimension between 0.1 m and 10 m, and rotation within 0-360', () => {
    const o = createObject('bed', p(0, 0))
    expect(resizeObject(o, { size: { width: 50, depth: 0.01, height: 1 } }).size).toEqual({ width: 10, depth: 0.1, height: 1 })
    expect(resizeObject(o, { rotation: 370 }).rotation).toBe(10)
    expect(resizeObject(o, { rotation: -90 }).rotation).toBe(270)
    expect(resizeObject(o, { position: p(3, 4) })).toMatchObject({ position: p(3, 4), size: o.size })
  })

  it('recalibrating the plan moves furniture with it but keeps its real size', () => {
    const o = createObject('table', p(2, -4))
    expect(scaleObjects([o], 0.5)).toEqual([{ ...o, position: p(1, -2) }])
  })
})

describe('imported models', () => {
  it('recognises model files by extension, whatever the case', () => {
    expect(modelFormat('Chair.GLB')).toBe('glb')
    expect(modelFormat('sofa.v2.gltf')).toBe('gltf')
    expect(modelFormat('table.obj')).toBe('obj')
    expect(modelFormat('photo.png')).toBeNull()
    expect(modelFormat('glb')).toBeNull()
  })

  it('keeps a plausible natural size, as glTF files are in metres', () => {
    const size = { width: 0.6, depth: 0.55, height: 0.9 }
    expect(fitSize(size)).toEqual(size)
  })

  it('scales an absurdly large or small model so its longest side is 1 m', () => {
    // Modelled in millimetres: 600 x 550 x 900.
    expect(fitSize({ width: 600, depth: 550, height: 900 })).toEqual({ width: 600 / 900, depth: 550 / 900, height: 1 })
    const tiny = fitSize({ width: 0.002, depth: 0.001, height: 0.001 })
    expect(tiny.width).toBeCloseTo(1, 9)
    expect(tiny.depth).toBeCloseTo(0.5, 9)
  })

  it('resizing one dimension in proportion scales the others to match', () => {
    const size = { width: 2, depth: 1, height: 0.5 }
    expect(resizeProportional(size, 'width', 3)).toEqual({ width: 3, depth: 1.5, height: 0.75 })
    expect(resizeProportional(size, 'height', 1)).toEqual({ width: 4, depth: 2, height: 1 })
  })

  it('a placed model refers to its file, has no library parts, and can be duplicated', () => {
    const o = createModelObject('m1', { width: 1, depth: 2, height: 3 }, p(4, 5))
    expect(o).toMatchObject({ kind: 'model', modelId: 'm1', position: p(4, 5), rotation: 0, size: { width: 1, depth: 2, height: 3 } })
    expect(objectParts(o)).toEqual([])
    expect(duplicateObject(o).modelId).toBe('m1')
  })
})
