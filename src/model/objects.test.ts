import { describe, expect, it } from 'vitest'
import {
  createModelObject, createObject, duplicateObject, fitSize, LIBRARY, modelFormat, objectParts, resizeObject,
  resizeProportional, scaleObjects, type ObjectKind, type Size3,
} from './objects'

const kinds = Object.keys(LIBRARY) as ObjectKind[]
const p = (x: number, z: number) => ({ x, z })

/** Every part must stay inside the object's stated size: that is what makes the sliders truthful. */
function expectWithin(kind: ObjectKind, size: Size3) {
  const parts = objectParts({ ...createObject(kind, p(0, 0)), size })
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
  it('has the eight starter pieces, each with a name and a realistic default size', () => {
    expect(kinds.sort()).toEqual(['bed', 'bookshelf', 'chair', 'counter', 'desk', 'sofa', 'table', 'wardrobe'])
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
