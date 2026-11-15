import { describe, expect, it } from 'vitest'
import { IfcAPI, IFCDOOR, IFCFURNITURE, IFCOPENINGELEMENT, IFCSLAB, IFCWALL, IFCWINDOW } from 'web-ifc'
import { createObject, type PlacedObject } from '../model/objects'
import type { Opening } from '../model/openings'
import { createWall, wallsFromChain, type Wall } from '../model/walls'
import { ifcGuid, stepReal, stepString, toIfc } from './ifc'

const opening = (wall: Wall, patch: Partial<Opening>): Opening => ({
  id: crypto.randomUUID(),
  wallId: wall.id,
  type: 'door',
  position: 1,
  width: 0.9,
  height: 2.1,
  sill: 0,
  hinge: 'start',
  swing: 'left',
  ...patch,
})

/** A 4 m x 3 m room with a door and a window in its first wall, a sofa and a raised, turned table. */
function house() {
  const walls = wallsFromChain(
    [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
      { x: 0, z: 0 },
    ],
    { thickness: 0.2, height: 2.5 },
  )
  const openings = [
    opening(walls[0], { type: 'door', position: 1 }),
    opening(walls[0], { type: 'window', position: 3, width: 1.2, height: 1.2, sill: 0.9 }),
  ]
  const table = { ...createObject('table', { x: 2, z: 1 }), rotation: 90, elevation: 0.5 } as PlacedObject
  const objects = [createObject('sofa', { x: 1, z: 2 }), table]
  return { name: 'House', walls, openings, objects }
}

/** The DATA section as a map from '#n' to the entity's text. Fails on an id defined twice. */
function entities(ifc: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of ifc.matchAll(/^(#\d+)=(.*);$/gm)) {
    expect(map.has(m[1]), `${m[1]} defined twice`).toBe(false)
    map.set(m[1], m[2])
  }
  return map
}

const count = (ifc: string, type: string) => ifc.split(`=${type}(`).length - 1
const args = (entity: string) => entity.slice(entity.indexOf('(') + 1, -1)
const refs = (entity: string): string[] => args(entity).match(/#\d+/g) ?? []
const only = (map: Map<string, string>, type: string) => {
  const found = [...map.values()].filter((e) => e.startsWith(`${type}(`))
  expect(found, type).toHaveLength(1)
  return found[0]
}
/** The coordinates of a point or direction. */
const coords = (map: Map<string, string>, ref: string) => args(map.get(ref)!).slice(1, -1).split(',').map(Number)

describe('ifcGuid', () => {
  it('is 22 characters of the IFC alphabet, the first one 0 to 3', () => {
    for (const id of [crypto.randomUUID(), 'wall-1', '', 'ü']) {
      expect(ifcGuid(id)).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)
    }
  })

  it('gives the same id for the same key and different ids for different keys', () => {
    expect(ifcGuid('wall-1')).toBe(ifcGuid('wall-1'))
    const keys = Array.from({ length: 2000 }, (_, i) => `wall-${i}`)
    expect(new Set(keys.map(ifcGuid)).size).toBe(keys.length)
  })
})

describe('stepString', () => {
  it('doubles apostrophes and backslashes', () => {
    expect(stepString("Anna's house")).toBe("'Anna''s house'")
    expect(stepString('a\\b')).toBe("'a\\\\b'")
  })

  it('encodes characters outside printable ASCII', () => {
    expect(stepString('Büro')).toBe("'B\\X2\\00FC\\X0\\ro'")
    expect(stepString('a\nb')).toBe("'a\\X\\0Ab'")
    expect(stepString('🏠')).toBe("'\\X4\\0001F3E0\\X0\\'")
  })
})

describe('stepReal', () => {
  it('always has a decimal point and never an exponent', () => {
    expect(stepReal(4)).toBe('4.')
    expect(stepReal(-3)).toBe('-3.')
    expect(stepReal(0.15)).toBe('0.15')
    expect(stepReal(1e-7)).toBe('0.')
    expect(stepReal(-1e-7)).toBe('0.')
    expect(stepReal(0.1 + 0.2)).toBe('0.3')
    expect(stepReal(1234567.125)).toBe('1234567.125')
  })
})

describe('toIfc', () => {
  it('is an IFC4 STEP file in metres', () => {
    const ifc = toIfc(house())
    expect(ifc.startsWith('ISO-10303-21;\nHEADER;\n')).toBe(true)
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));")
    expect(ifc.trimEnd().endsWith('ENDSEC;\nEND-ISO-10303-21;')).toBe(true)
    expect(ifc).toContain('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')
    expect(ifc).toContain('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')
    expect(ifc).toContain('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')
    // No exponents in the numbers. Quoted text is left out: an id such as '2e7Xk...' is not a number.
    expect(ifc.replace(/'[^']*'/g, "''")).not.toMatch(/\d[eE][-+]?\d/)
  })

  it('has one entity of each expected type per element', () => {
    const ifc = toIfc(house())
    const expected = {
      IFCPROJECT: 1,
      IFCSITE: 1,
      IFCBUILDING: 1,
      IFCBUILDINGSTOREY: 1,
      IFCRELAGGREGATES: 3,
      IFCRELCONTAINEDINSPATIALSTRUCTURE: 1,
      IFCWALL: 4,
      IFCOPENINGELEMENT: 2,
      IFCRELVOIDSELEMENT: 2,
      IFCRELFILLSELEMENT: 2,
      IFCDOOR: 1,
      IFCWINDOW: 1,
      IFCSLAB: 1,
      IFCFURNITURE: 2,
    }
    for (const [type, n] of Object.entries(expected)) expect(count(ifc, type), type).toBe(n)
  })

  it('defines every reference it uses exactly once and uses everything it defines', () => {
    const map = entities(toIfc(house()))
    expect([...map.keys()]).toEqual(Array.from(map.keys(), (_, i) => `#${i + 1}`))
    const used = new Set([...map.values()].flatMap(refs))
    for (const ref of used) expect(map.has(ref), `${ref} is not defined`).toBe(true)
    // Only rooted entities (products and relations) stand on their own.
    for (const [ref, entity] of map) if (!used.has(ref)) expect(entity).toMatch(/^IFC\w+\('[^']{22}',/)
  })

  it('gives every rooted entity its own GlobalId, the same in every export', () => {
    const input = house()
    const ifc = toIfc(input)
    const guids = [...ifc.matchAll(/=IFC\w+\('([^']{22})',\$,/g)].map((m) => m[1])
    expect(guids).toHaveLength(4 + 3 + 1 + 4 + 2 * 4 + 1 + 2)
    expect(new Set(guids).size).toBe(guids.length)
    expect(toIfc(input)).toBe(ifc)
  })

  it('puts the elements in the storey, but not the openings', () => {
    const map = entities(toIfc(house()))
    const [elements, storey] = args(only(map, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).split(',$,$,')[1].split('),')
    expect(map.get(storey)).toMatch(/^IFCBUILDINGSTOREY\(/)
    const types = elements.match(/#\d+/g)!.map((ref) => map.get(ref)!.split('(')[0])
    expect(types.sort()).toEqual(
      ['IFCDOOR', 'IFCFURNITURE', 'IFCFURNITURE', 'IFCSLAB', 'IFCWALL', 'IFCWALL', 'IFCWALL', 'IFCWALL', 'IFCWINDOW'].sort(),
    )
  })

  it('maps a wall to IFC axes: x stays, z becomes -y, height becomes z', () => {
    // Centreline along +x at z = 1, so the footprint spans z 0.9 to 1.1: y -1.1 to -0.9 in IFC.
    const wall = createWall({ x: 0, z: 1 }, { x: 4, z: 1 }, { thickness: 0.2, height: 2.5 })
    const map = entities(toIfc({ name: 'One wall', walls: [wall], openings: [], objects: [] }))
    const loop = refs(only(map, 'IFCPOLYLINE')).map((ref) => coords(map, ref))
    expect(loop).toEqual([
      [0, -1.1],
      [4, -1.1],
      [4, -0.9],
      [0, -0.9],
      [0, -1.1],
    ])
    const solid = only(map, 'IFCEXTRUDEDAREASOLID')
    expect(solid.endsWith(',2.5)')).toBe(true)
    expect(coords(map, refs(solid)[2])).toEqual([0, 0, 1])
    expect(only(map, 'IFCSHAPEREPRESENTATION')).toContain("'Body','SweptSolid'")
    expect(only(map, 'IFCWALL')).toContain("'Wall'")
  })

  /** The opening's placement, and the size of its cutting box: along the wall, through it, up. */
  function openingPlacement(map: Map<string, string>) {
    const [placement, shape] = refs(only(map, 'IFCOPENINGELEMENT'))
    const [relativeTo, axesRef] = refs(map.get(placement)!)
    const [location, zAxis, xAxis] = refs(map.get(axesRef)!)
    const solid = map.get(refs(map.get(refs(map.get(shape)!)[0])!)[1])!
    const profile = map.get(refs(solid)[0])!
    return {
      relativeTo: relativeTo === refs(only(map, 'IFCWALL'))[0] ? 'wall' : relativeTo,
      location: coords(map, location),
      zAxis: coords(map, zAxis),
      xAxis: coords(map, xAxis).map((v) => v + 0), // -0 to 0
      box: [...args(profile).split(',').slice(-2).map(Number), Number(args(solid).split(',').pop())],
    }
  }

  it('places a door opening on its wall, at the floor, through the whole wall', () => {
    // A wall running towards +z in the app, so towards -y in IFC.
    const wall = createWall({ x: 2, z: 1 }, { x: 2, z: 5 }, { thickness: 0.2, height: 2.5 })
    const door = opening(wall, { type: 'door', position: 1.5 })
    const ifc = toIfc({ name: 'Door', walls: [wall], openings: [door], objects: [] })
    const map = entities(ifc)
    expect(openingPlacement(map)).toEqual({
      relativeTo: 'wall',
      location: [2, -2.5, 0],
      zAxis: [0, 0, 1],
      xAxis: [0, -1, 0],
      box: [0.9, 0.22, 2.1],
    })
    const [wallRef, voidRef] = refs(only(map, 'IFCRELVOIDSELEMENT'))
    expect(map.get(wallRef)).toMatch(/^IFCWALL\(/)
    expect(map.get(voidRef)).toMatch(/^IFCOPENINGELEMENT\(/)
    const [filledRef, doorRef] = refs(only(map, 'IFCRELFILLSELEMENT'))
    expect(filledRef).toBe(voidRef)
    // OverallHeight, then OverallWidth.
    expect(map.get(doorRef)).toMatch(/^IFCDOOR\(.*,\$,2\.1,0\.9,\.DOOR\.,\$,\$\)$/)
    expect(count(ifc, 'IFCWINDOW')).toBe(0)
  })

  it('places a window opening at its sill', () => {
    const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 }, { thickness: 0.3, height: 2.5 })
    const window = opening(wall, { type: 'window', position: 3, width: 1.2, height: 1.2, sill: 0.9 })
    const map = entities(toIfc({ name: 'Window', walls: [wall], openings: [window], objects: [] }))
    expect(openingPlacement(map)).toEqual({
      relativeTo: 'wall',
      location: [3, 0, 0.9],
      zAxis: [0, 0, 1],
      xAxis: [1, 0, 0],
      box: [1.2, 0.32, 1.2],
    })
    expect(only(map, 'IFCWINDOW')).toMatch(/,\$,1\.2,1\.2,\.WINDOW\.,\$,\$\)$/)
  })

  it('fits an opening to its wall as the scene does', () => {
    const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 }, { thickness: 0.2, height: 2 })
    // Too near the end and too tall: drawn 0.55 m from the end and 2 m high.
    const door = opening(wall, { position: 3.9, height: 2.1 })
    const placed = openingPlacement(entities(toIfc({ name: 'Fit', walls: [wall], openings: [door], objects: [] })))
    expect(placed.location).toEqual([3.45, 0, 0])
    expect(placed.box).toEqual([0.9, 0.22, 2])
  })

  it('leaves out an opening whose wall is gone', () => {
    const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 })
    const ifc = toIfc({ name: 'Orphan', walls: [wall], openings: [opening(wall, { wallId: 'gone' })], objects: [] })
    expect(count(ifc, 'IFCOPENINGELEMENT')).toBe(0)
  })

  it('makes a floor slab from the room outline, 0.2 m thick with its top at the floor', () => {
    const { walls } = house()
    const map = entities(toIfc({ name: 'Room', walls, openings: [], objects: [] }))
    const slab = only(map, 'IFCSLAB')
    expect(slab.endsWith(',.FLOOR.)')).toBe(true)
    const solid = map.get(refs(map.get(refs(map.get(refs(slab)[1])!)[0])!)[1])!
    expect(solid.endsWith(',0.2)')).toBe(true)
    const [profile, position] = refs(solid)
    expect(coords(map, refs(map.get(position)!)[0])).toEqual([0, 0, -0.2])
    // The inside faces of 0.2 m walls around a 4 x 3 room, counter-clockwise.
    const loop = refs(map.get(refs(map.get(profile)!)[0])!).map((ref) => coords(map, ref))
    expect(loop).toHaveLength(5)
    expect(loop[4]).toEqual(loop[0])
    const area = loop.slice(0, 4).reduce((sum, a, i) => sum + (a[0] * loop[i + 1][1] - loop[i + 1][0] * a[1]) / 2, 0)
    expect(area).toBeCloseTo(3.8 * 2.8)
    const corners = loop.slice(0, 4).map((p) => p.join()).sort()
    expect(corners).toEqual(['0.1,-0.1', '0.1,-2.9', '3.9,-0.1', '3.9,-2.9'])
  })

  it('places furniture as a box: centred, turned counter-clockwise and raised', () => {
    const table = { ...createObject('table', { x: 2, z: 1 }), rotation: 90, elevation: 0.5 } as PlacedObject
    const map = entities(toIfc({ name: 'Table', walls: [], openings: [], objects: [table] }))
    const furniture = only(map, 'IFCFURNITURE')
    expect(furniture).toContain("'table'")
    const [placement, shape] = refs(furniture)
    const [location, , xAxis] = refs(map.get(refs(map.get(placement)!)[1])!)
    expect(coords(map, location)).toEqual([2, -1, 0.5])
    // Three's rotation-y of 90 degrees turns the piece's x axis to -z: +y in IFC.
    expect(coords(map, xAxis)).toEqual([0, 1, 0])
    const solid = map.get(refs(map.get(refs(map.get(shape)!)[0])!)[1])!
    expect(args(map.get(refs(solid)[0])!)).toMatch(/,1\.6,0\.9$/)
    expect(solid.endsWith(',0.75)')).toBe(true)
  })

  it('stands furniture without an elevation on the floor', () => {
    const map = entities(toIfc({ name: 'Sofa', walls: [], openings: [], objects: [createObject('sofa', { x: 1, z: 2 })] }))
    const [location] = refs(map.get(refs(map.get(refs(only(map, 'IFCFURNITURE'))[0])!)[1])!)
    expect(coords(map, location)).toEqual([1, -2, 0])
  })

  it('escapes the name', () => {
    const ifc = toIfc({ name: "Zoë's house", walls: [], openings: [], objects: [] })
    expect(ifc).toContain("IFCPROJECT('")
    expect(ifc).toContain("'Zo\\X2\\00EB\\X0\\''s house'")
    expect(ifc).toMatch(/^[\x20-\x7e\n]*$/)
    expect(count(ifc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(0) // nothing to contain
  })

  it('is read by a real IFC parser (web-ifc), geometry included', async () => {
    const api = new IfcAPI()
    await api.Init()
    const model = api.OpenModel(new TextEncoder().encode(toIfc(house())))
    expect(api.GetModelSchema(model)).toBe('IFC4')
    const ids = (type: number) => api.GetLineIDsWithType(model, type)
    expect(ids(IFCWALL).size()).toBe(4)
    expect(ids(IFCDOOR).size()).toBe(1)
    expect(ids(IFCWINDOW).size()).toBe(1)
    expect(ids(IFCOPENINGELEMENT).size()).toBe(2)
    expect(ids(IFCSLAB).size()).toBe(1)
    expect(ids(IFCFURNITURE).size()).toBe(2)

    const door = api.GetLine(model, ids(IFCDOOR).get(0))
    expect(door.OverallWidth.value).toBeCloseTo(0.9)
    expect(door.OverallHeight.value).toBeCloseTo(2.1)

    /** The bounding box of an element's mesh in IFC coordinates (web-ifc itself hands out Y-up metres). */
    const bounds = (expressId: number) => {
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      const mesh = api.GetFlatMesh(model, expressId)
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const placed = mesh.geometries.get(g)
        const m = placed.flatTransformation
        const geometry = api.GetGeometry(model, placed.geometryExpressID)
        const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
        for (let i = 0; i < vertices.length; i += 6) {
          const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]]
          const world = [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r])
          const ifc = [world[0], -world[2], world[1]]
          ifc.forEach((v, k) => {
            min[k] = Math.min(min[k], v)
            max[k] = Math.max(max[k], v)
          })
        }
      }
      return [...min, ...max].map((v) => Math.round(v * 1000) / 1000 + 0)
    }
    // The first wall runs from (0,0) to (4,0), mitred into its neighbours, 2.5 m high.
    expect(bounds(ids(IFCWALL).get(0))).toEqual([-0.1, -0.1, 0, 4.1, 0.1, 2.5])
    expect(bounds(ids(IFCSLAB).get(0))).toEqual([0.1, -2.9, -0.2, 3.9, -0.1, 0])
    // The table: 1.6 x 0.9 x 0.75 at (2, 1), turned a quarter and raised by 0.5.
    expect(bounds(ids(IFCFURNITURE).get(1))).toEqual([1.55, -1.8, 0.5, 2.45, -0.2, 1.25])
    // The window: 1.2 wide at 3 m along the first wall, from the sill at 0.9 up to 2.1.
    expect(bounds(ids(IFCWINDOW).get(0))).toEqual([2.4, -0.025, 0.9, 3.6, 0.025, 2.1])
    // The openings are cut out of the first wall: more faces than a plain box's 12 triangles.
    const triangles = (expressId: number) => {
      const placed = api.GetFlatMesh(model, expressId).geometries.get(0)
      return api.GetGeometry(model, placed.geometryExpressID).GetIndexDataSize() / 3
    }
    expect(triangles(ids(IFCWALL).get(1))).toBe(12)
    expect(triangles(ids(IFCWALL).get(0))).toBeGreaterThan(12)
    api.CloseModel(model)
  })
})
