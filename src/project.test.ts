import { describe, expect, it } from 'vitest'
import { parseProject, PROJECT_VERSION, usedTextureIds, type ProjectFile } from './project'
import { DEFAULT_MATERIAL, ROOM_DEFAULTS } from './model/materials'
import { createWall, WALL_DEFAULTS } from './model/walls'
import { createModelObject, createObject } from './model/objects'
import { DEFAULT_SUN } from './model/sun'

const IMG = 'data:image/png;base64,AAAA'
const MODEL = 'data:application/octet-stream;base64,AAAA'
const p = (x: number, z: number) => ({ x, z })

function sample(): ProjectFile {
  const textured = { ...DEFAULT_MATERIAL, textureId: 'tex1', tileSize: 0.5, color: '#ffffff' }
  const walls = [
    createWall(p(0, 0), p(4, 0), { height: 3, thickness: 0.2, material: textured }),
    createWall(p(4, 0), p(4, 3)),
  ]
  return {
    app: 'monarch',
    version: PROJECT_VERSION,
    units: 'imperial',
    plan: {
      name: 'plan.png',
      widthPx: 1000,
      heightPx: 800,
      metresPerPx: 0.006096,
      calibrated: true,
      calibrationLine: [{ x: 250, y: 400 }, { x: 750, y: 400 }],
      image: IMG,
    },
    walls,
    openings: [
      { id: 'o1', wallId: walls[0].id, type: 'door', position: 2, width: 0.9, height: 2.1, sill: 0, hinge: 'end', swing: 'right' },
    ],
    objects: [
      { ...createObject('sofa', p(1, 2)), rotation: 90 },
      createModelObject('m1', { width: 1, depth: 2, height: 3 }, p(0, 0)),
    ],
    models: { m1: { name: 'lamp.glb', format: 'glb', naturalSize: { width: 1, depth: 2, height: 3 }, data: MODEL } },
    sun: { enabled: true, latitude: 51.5, day: 172, hour: 14.5, north: 30 },
    lights: [{ id: 'l1', position: p(2, 1), lumens: 1200, kelvin: 4000 }],
    wallDefaults: WALL_DEFAULTS,
    rooms: {
      defaults: ROOM_DEFAULTS,
      materials: { 'a|b': { floor: { ...DEFAULT_MATERIAL, color: '#112233' }, ceiling: DEFAULT_MATERIAL } },
    },
    textures: { tex1: { name: 'tile.png', image: IMG } },
  }
}

const parse = (edit: (d: any) => void) => {
  const d = JSON.parse(JSON.stringify(sample()))
  edit(d)
  return () => parseProject(JSON.stringify(d))
}

describe('parseProject', () => {
  it('round-trips a full project unchanged', () => {
    const project = sample()
    expect(parseProject(JSON.stringify(project))).toEqual(project)
  })

  it('accepts a project with no plan, walls or textures', () => {
    const empty = { ...sample(), plan: null, walls: [], openings: [], objects: [], models: {}, textures: {}, rooms: { defaults: ROOM_DEFAULTS, materials: {} } }
    expect(parseProject(JSON.stringify(empty))).toEqual(empty)
  })

  it('rejects files that are not Monarch projects', () => {
    expect(() => parseProject('not json')).toThrow(/isn't valid JSON/)
    expect(() => parseProject('{"hello":1}')).toThrow(/isn't a Monarch project/)
    expect(() => parseProject('[]')).toThrow(/isn't a Monarch project/)
  })

  it('rejects a file from a newer format version', () => {
    expect(parse((d) => (d.version = PROJECT_VERSION + 1))).toThrow(/newer version/)
  })

  it.each([
    ['a non-numeric coordinate', (d: any) => (d.walls[0].start.x = 'left')],
    ['a missing wall end', (d: any) => delete d.walls[0].end],
    ['zero height', (d: any) => (d.walls[1].height = 0)],
    ['negative thickness', (d: any) => (d.walls[1].thickness = -0.1)],
    ['a bad colour', (d: any) => (d.walls[0].material.color = 'red')],
    ['roughness out of range', (d: any) => (d.walls[0].material.roughness = 2)],
    ['duplicate wall ids', (d: any) => (d.walls[1].id = d.walls[0].id)],
    ['unknown units', (d: any) => (d.units = 'cubits')],
    ['a plan image that is not an image', (d: any) => (d.plan.image = 'javascript:alert(1)')],
    ['a zero plan scale', (d: any) => (d.plan.metresPerPx = 0)],
    ['a texture that is not an image', (d: any) => (d.textures.tex1.image = 'https://example.com/x.png')],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('opens a version 1 file, which has no room materials, with the defaults', () => {
    const project = parse((d) => {
      d.version = 1
      delete d.rooms
    })()
    expect(project.rooms).toEqual({ defaults: ROOM_DEFAULTS, materials: {} })
    expect(project.walls).toHaveLength(2)
  })

  it('opens a version 2 file, which has no openings', () => {
    const project = parse((d) => {
      d.version = 2
      delete d.openings
    })()
    expect(project.openings).toEqual([])
  })

  it('opens a version 6 file, which has no sun study, with the study off', () => {
    const project = parse((d) => {
      d.version = 6
      delete d.sun
    })()
    expect(project.sun).toEqual(DEFAULT_SUN)
    expect(project.sun.enabled).toBe(false)
  })

  it.each([
    ['a latitude beyond the poles', (d: any) => (d.sun.latitude = 120)],
    ['a day outside the year', (d: any) => (d.sun.day = 400)],
    ['an hour outside the day', (d: any) => (d.sun.hour = -1)],
    ['a non-numeric north', (d: any) => (d.sun.north = 'up')],
    ['a sun switch that is not on or off', (d: any) => (d.sun.enabled = 'yes')],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('opens a version 7 file, which has no lights', () => {
    const project = parse((d) => {
      d.version = 7
      delete d.lights
    })()
    expect(project.lights).toEqual([])
  })

  it.each([
    ['a light with no position', (d: any) => delete d.lights[0].position],
    ['a light with no brightness', (d: any) => (d.lights[0].lumens = 0)],
    ['a light with a non-numeric colour temperature', (d: any) => (d.lights[0].kelvin = 'warm')],
    ['two lights with the same id', (d: any) => d.lights.push(d.lights[0])],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('opens a version 5 file, which has no imported models', () => {
    const project = parse((d) => {
      d.version = 5
      delete d.models
      d.objects.pop()
    })()
    expect(project.models).toEqual({})
    expect(project.objects).toHaveLength(1)
  })

  it.each([
    ['a placed model whose file is missing', (d: any) => delete d.models.m1],
    ['a placed model with no file reference', (d: any) => delete d.objects[1].modelId],
    ['a model file that is not embedded data', (d: any) => (d.models.m1.data = 'https://example.com/lamp.glb')],
    ['an unknown model format', (d: any) => (d.models.m1.format = 'fbx')],
    ['a model with a zero natural size', (d: any) => (d.models.m1.naturalSize.height = 0)],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('opens a version 4 file, which has no furniture', () => {
    const project = parse((d) => {
      d.version = 4
      delete d.objects
      delete d.models
    })()
    expect(project.objects).toEqual([])
  })

  it.each([
    ['an unknown kind of furniture', (d: any) => (d.objects[0].kind = 'spaceship')],
    ['a zero-size piece', (d: any) => (d.objects[0].size.depth = 0)],
    ['a piece with no position', (d: any) => delete d.objects[0].position],
    ['a non-numeric rotation', (d: any) => (d.objects[0].rotation = 'sideways')],
    ['a piece with a bad colour', (d: any) => (d.objects[0].material.color = 'red')],
    ['duplicate furniture ids', (d: any) => d.objects.push({ ...d.objects[0] })],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('opens a version 3 file, whose doors have no hinge or swing, with the defaults', () => {
    const project = parse((d) => {
      d.version = 3
      delete d.openings[0].hinge
      delete d.openings[0].swing
    })()
    expect(project.openings[0]).toMatchObject({ hinge: 'start', swing: 'left' })
  })

  it.each([
    ['an unknown hinge side', (d: any) => (d.openings[0].hinge = 'top')],
    ['an unknown swing side', (d: any) => (d.openings[0].swing = 'up')],
    ['an opening on a wall that does not exist', (d: any) => (d.openings[0].wallId = 'nope')],
    ['an unknown opening type', (d: any) => (d.openings[0].type = 'portal')],
    ['a zero-width opening', (d: any) => (d.openings[0].width = 0)],
    ['a negative sill', (d: any) => (d.openings[0].sill = -1)],
    ['a non-numeric position', (d: any) => (d.openings[0].position = 'middle')],
    ['duplicate opening ids', (d: any) => d.openings.push({ ...d.openings[0] })],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('rejects a damaged room material', () => {
    expect(parse((d) => (d.rooms.materials['a|b'].floor.color = 'red'))).toThrow(/damaged/)
    expect(parse((d) => delete d.rooms.defaults.ceiling)).toThrow(/damaged/)
  })

  it('falls back to the plain colour when a texture is missing from the file', () => {
    const project = parse((d) => (d.textures = {}))()
    expect(project.walls[0].material.textureId).toBeNull()
    expect(project.walls[0].material.color).toBe('#ffffff')
  })
})

describe('usedTextureIds', () => {
  it('lists each referenced texture once, including the defaults', () => {
    const { walls } = sample()
    const defaults = { ...WALL_DEFAULTS, material: { ...DEFAULT_MATERIAL, textureId: 'tex2' } }
    const noRooms = { defaults: ROOM_DEFAULTS, materials: {} }
    expect(usedTextureIds([...walls, walls[0]], defaults, noRooms, []).sort()).toEqual(['tex1', 'tex2'])
    expect(usedTextureIds([walls[1]], WALL_DEFAULTS, noRooms, [])).toEqual([])
    const sofa = createObject('sofa', p(0, 0))
    sofa.material.textureId = 'tex4'
    expect(usedTextureIds([], WALL_DEFAULTS, noRooms, [sofa])).toEqual(['tex4'])
    const rooms = {
      defaults: ROOM_DEFAULTS,
      materials: { r: { floor: { ...DEFAULT_MATERIAL, textureId: 'tex3' }, ceiling: DEFAULT_MATERIAL } },
    }
    expect(usedTextureIds([], WALL_DEFAULTS, rooms, [])).toEqual(['tex3'])
  })
})
