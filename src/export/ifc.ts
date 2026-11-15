// Export the model as an IFC4 file (ISO 10303-21, "STEP"), kept to what a BIM viewer needs
// to show the building: walls with their openings, doors, windows, floors and furniture.
//
// Axes: the app is Y-up with the floor in the X-Z plane; IFC is Z-up. The app's
// (x, y_up, z) becomes IFC (x, -z, y_up). Negating z keeps the model from being mirrored,
// and an angle counter-clockwise seen from above stays counter-clockwise.

import type { PlacedObject } from '../model/objects'
import { fitOpening, type Opening } from '../model/openings'
import { detectRooms } from '../model/rooms'
import { wallFootprints } from '../model/wallGeometry'
import { wallLength, type Vec2, type Wall } from '../model/walls'

export interface IfcInput {
  name: string
  walls: Wall[]
  openings: Opening[]
  objects: PlacedObject[]
}

/** Thickness of the floor slabs, below floor level. */
const SLAB_THICKNESS = 0.2
/** How far the box that cuts an opening sticks out of each face of the wall, so it cuts cleanly. */
const CUT_MARGIN = 0.01
/** Thickness of the box standing in for a door leaf or a window. */
const FILLING_THICKNESS = 0.05

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/**
 * An IFC GlobalId: 128 bits as 22 characters. Derived from `key` by hashing, so the
 * same element gets the same id in every export.
 */
export function ifcGuid(key: string): string {
  let bits = 0n
  for (let seed = 0; seed < 4; seed++) {
    // FNV-1a from a different starting value per word, then murmur3's final mix.
    let h = 0x811c9dc5 ^ Math.imul(seed, 0x9e3779b1)
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    bits = (bits << 32n) | BigInt((h ^ (h >>> 16)) >>> 0)
  }
  let guid = ''
  for (let shift = 126n; shift >= 0n; shift -= 6n) guid += GUID_CHARS[Number((bits >> shift) & 63n)]
  return guid
}

/** A STEP string literal: apostrophes and backslashes doubled, anything outside printable ASCII encoded. */
export function stepString(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    const hex = (digits: number) => code.toString(16).toUpperCase().padStart(digits, '0')
    if (ch === "'" || ch === '\\') out += ch + ch
    else if (code < 0x20) out += `\\X\\${hex(2)}`
    else if (code < 0x7f) out += ch
    else if (code <= 0xffff) out += `\\X2\\${hex(4)}\\X0\\`
    else out += `\\X4\\${hex(8)}\\X0\\`
  }
  return `'${out}'`
}

/** A STEP real: rounded to 6 decimals, always with a decimal point, never an exponent. */
export function stepReal(n: number): string {
  const s = n.toFixed(6).replace(/0+$/, '')
  return s === '-0.' ? '0.' : s
}

/** The model as the text of an IFC4 file (ISO 10303-21, "STEP"). */
export function toIfc({ name, walls, openings, objects }: IfcInput): string {
  const lines: string[] = []
  const add = (entity: string) => {
    lines.push(`#${lines.length + 1}=${entity};`)
    return `#${lines.length}`
  }
  const list = (refs: string[]) => `(${refs.join(',')})`
  const reals = (values: number[]) => list(values.map(stepReal))
  /** An entity with a GlobalId. `rest` are its attributes after Name and Description. */
  const rooted = (type: string, key: string, label: string | null, ...rest: string[]) =>
    add(`${type}('${ifcGuid(key)}',$,${label === null ? '$' : stepString(label)},$,${rest.join(',')})`)

  const point = (...c: number[]) => add(`IFCCARTESIANPOINT(${reals(c)})`)
  const direction = (...c: number[]) => add(`IFCDIRECTION(${reals(c)})`)
  const up = direction(0, 0, 1)
  /** A coordinate system at `location`, upright, its x axis along `xAxis` (default: the parent's). */
  const axes = (location: string, xAxis?: string) =>
    add(`IFCAXIS2PLACEMENT3D(${location},${xAxis ? up : '$'},${xAxis ?? '$'})`)
  const placement = (relativeTo: string, at: string) => add(`IFCLOCALPLACEMENT(${relativeTo},${at})`)
  const origin = axes(point(0, 0, 0))
  const origin2d = add(`IFCAXIS2PLACEMENT2D(${point(0, 0)},$)`)

  // ---- Project, units and the spatial structure ----
  const units = [
    add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'),
    add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
    add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ]
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,${origin},$)`)
  // The file has no ids of its own for these, so they follow the model's name.
  const project = rooted('IFCPROJECT', `${name}/project`, name, '$,$,$', list([context]), add(`IFCUNITASSIGNMENT(${list(units)})`))
  const sitePlacement = placement('$', origin)
  const site = rooted('IFCSITE', `${name}/site`, 'Site', '$', sitePlacement, '$,$,.ELEMENT.,$,$,$,$,$')
  const buildingPlacement = placement(sitePlacement, origin)
  const building = rooted('IFCBUILDING', `${name}/building`, name, '$', buildingPlacement, '$,$,.ELEMENT.,$,$,$')
  const storeyPlacement = placement(buildingPlacement, origin)
  const storey = rooted('IFCBUILDINGSTOREY', `${name}/storey`, 'Ground floor', '$', storeyPlacement, '$,$,.ELEMENT.,0.')
  rooted('IFCRELAGGREGATES', `${name}/project>site`, null, project, list([site]))
  rooted('IFCRELAGGREGATES', `${name}/site>building`, null, site, list([building]))
  rooted('IFCRELAGGREGATES', `${name}/building>storey`, null, building, list([storey]))

  // ---- Shapes ----
  /** A 'Body' shape: `profile` swept upwards by `depth`, starting from `position`. */
  const extrusion = (profile: string, depth: number, position = origin) => {
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${position},${up},${stepReal(depth)})`)
    const body = add(`IFCSHAPEREPRESENTATION(${context},'Body','SweptSolid',${list([solid])})`)
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([body])})`)
  }
  /** A plan outline in app coordinates as a closed profile, counter-clockwise in IFC. */
  const outlineProfile = (outline: Vec2[]) => {
    const mapped = outline.map((p) => ({ x: p.x, y: -p.z }))
    const area = mapped.reduce((sum, a, i) => {
      const b = mapped[(i + 1) % mapped.length]
      return sum + a.x * b.y - b.x * a.y
    }, 0)
    if (area < 0) mapped.reverse()
    const points = mapped.map((p) => point(p.x, p.y))
    return add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE(${list([...points, points[0]])})`)})`)
  }
  /** A box standing on its local origin, centred on it in plan. */
  const box = (xSize: number, ySize: number, height: number) =>
    extrusion(add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${origin2d},${stepReal(xSize)},${stepReal(ySize)})`), height)

  /** Everything that stands in the storey. Openings do not: they belong to their wall. */
  const contained: string[] = []

  // ---- Walls, with their doors and windows ----
  const footprints = wallFootprints(walls)
  for (const wall of walls) {
    const wallPlacement = placement(storeyPlacement, origin)
    const shape = extrusion(outlineProfile(footprints.get(wall.id)!), wall.height)
    const ifcWall = rooted('IFCWALL', `${wall.id}/wall`, 'Wall', '$', wallPlacement, shape, '$,$')
    contained.push(ifcWall)

    const length = wallLength(wall)
    const along = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
    for (const opening of openings) {
      if (opening.wallId !== wall.id) continue
      const o = fitOpening(opening, length, wall.height) // as drawn
      // Local axes: x along the wall, z up, the origin at the middle of the opening's bottom edge.
      const centre = point(wall.start.x + along.x * o.position, -(wall.start.z + along.z * o.position), o.sill)
      const voidPlacement = placement(wallPlacement, axes(centre, direction(along.x, -along.z, 0)))
      const cut = box(o.width, wall.thickness + 2 * CUT_MARGIN, o.height)
      const ifcVoid = rooted('IFCOPENINGELEMENT', `${o.id}/opening`, 'Opening', '$', voidPlacement, cut, '$,.OPENING.')
      rooted('IFCRELVOIDSELEMENT', `${o.id}/voids`, null, ifcWall, ifcVoid)

      const door = o.type === 'door'
      const filling = rooted(
        door ? 'IFCDOOR' : 'IFCWINDOW',
        `${o.id}/${o.type}`,
        door ? 'Door' : 'Window',
        '$',
        placement(voidPlacement, origin),
        box(o.width, FILLING_THICKNESS, o.height),
        '$',
        stepReal(o.height),
        stepReal(o.width),
        door ? '.DOOR.,$,$' : '.WINDOW.,$,$',
      )
      rooted('IFCRELFILLSELEMENT', `${o.id}/fills`, null, ifcVoid, filling)
      contained.push(filling)
    }
  }

  // ---- Floors: one slab per room, its top at floor level ----
  const rooms = detectRooms(walls)
  const below = rooms.length > 0 ? axes(point(0, 0, -SLAB_THICKNESS)) : ''
  for (const room of rooms) {
    const shape = extrusion(outlineProfile(room.outline), SLAB_THICKNESS, below)
    contained.push(rooted('IFCSLAB', `${room.id}/slab`, 'Floor', '$', placement(storeyPlacement, origin), shape, '$,.FLOOR.'))
  }

  // ---- Furniture: a box of each piece's size ----
  for (const o of objects) {
    const turn = (o.rotation * Math.PI) / 180
    const elevation = (o as { elevation?: number }).elevation ?? 0
    const at = axes(point(o.position.x, -o.position.z, elevation), direction(Math.cos(turn), Math.sin(turn), 0))
    const shape = box(o.size.width, o.size.depth, o.size.height)
    contained.push(rooted('IFCFURNITURE', `${o.id}/furniture`, o.kind, '$', placement(storeyPlacement, at), shape, '$,$'))
  }

  if (contained.length > 0) rooted('IFCRELCONTAINEDINSPATIALSTRUCTURE', `${name}/contained`, null, list(contained), storey)

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');",
    `FILE_NAME(${stepString(`${name}.ifc`)},'',(''),(''),'Monarch','Monarch','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
