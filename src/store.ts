import { create } from 'zustand'
import type { Units } from './units'
import { metresPerPixel, type Px } from './plan/geometry'
import { scaleWalls, wallsFromChain, WALL_DEFAULTS, type Vec2, type Wall, type WallProps } from './model/walls'

import { parseProject, PROJECT_VERSION, usedTextureIds, type ProjectFile } from './project'
import { ROOM_DEFAULTS, type Material, type RoomMaterials } from './model/materials'
import { editOpening, openingAt, scaleOpenings, type Opening } from './model/openings'
import {
  createModelObject, createObject, duplicateObject, fitSize, resizeObject, scaleObjects, type ModelInfo, type ObjectKind,
  type PlacedObject,
} from './model/objects'
import { inspectModelFile } from './model3d'
import { DEFAULT_SUN, type SunSettings } from './model/sun'
import { createLight, scaleLights, type CeilingLight } from './model/lights'
import { DEFAULT_RATES, type CostKey, type CostRates } from './model/cost'
import { detectPlan } from './plan/detectWalls'
import { cropPng, readRaster, type Crop } from './plan/readRaster'
import { cropSquare, gapMark, gapSuggestions, MIN_CONFIDENCE, openingGaps, openingsFromGaps, type GapSuggestion } from './plan/suggestOpenings'
import { askJev, JevError } from './ai/jevClient'
import { gapQuestion, parseGapAnswer } from './ai/jevOpenings'
import { detectOptions, thinWalls, toWalls } from './plan/suggestWalls'

export interface Texture {
  url: string
  name: string
}

export interface Plan {
  url: string
  name: string
  widthPx: number
  heightPx: number
  metresPerPx: number
  calibrated: boolean
}

export type Tool = 'none' | 'calibrate' | 'wall' | 'door' | 'window' | 'object' | 'light' | 'walk'

/** Nothing selected. Spread before setting one selection, so the kinds replace each other. */
const NO_SELECTION = { selectedWallId: null, selectedRoomId: null, selectedOpeningId: null, selectedObjectId: null, selectedLightId: null }
export type ViewMode = '3d' | 'top'

/** No walls or gaps on offer. */
const NO_SUGGESTION = { suggestedWalls: null, suggestedGaps: [], suggestedGapCrops: [], identifying: 'idle' as const }

// Before calibration the plan is shown 20 m wide so it fits the default view.
const UNCALIBRATED_WIDTH_M = 20

interface State {
  units: Units
  viewMode: ViewMode
  /** Bumped to ask the camera to frame the plan. */
  frameRequest: number
  /** A picture to save: the current view, or a 360° panorama from the camera. A new object for each request. */
  captureRequest: { kind: 'image' | 'panorama' } | null
  tool: Tool
  plan: Plan | null
  /** Points being picked while calibrating, in plan pixels (0-2). */
  calibrationPoints: Px[]
  /** The span the current scale was set from, kept on screen as a check. */
  calibrationLine: [Px, Px] | null
  walls: Wall[]
  /** Walls detected in the plan image, waiting to be added or discarded. Null when there is no suggestion. */
  suggestedWalls: Wall[] | null
  /** Gaps in the suggested walls: doors and windows, once identified. */
  suggestedGaps: GapSuggestion[]
  /** For each suggested gap, the part of the plan image (in its own pixels) that shows it, and the gap marked on it. */
  suggestedGapCrops: Crop[]
  /** 'busy' while the gaps are being identified; a message if that failed. */
  identifying: 'idle' | 'busy' | { error: string; needsPassword: boolean }
  /** The hosted app's shared access password for the door and window service. Kept in this browser. */
  accessPassword: string
  /** Doors and windows, each attached to a wall. */
  openings: Opening[]
  /** Height and thickness given to newly drawn walls. */
  wallDefaults: WallProps
  selectedWallId: string | null
  selectedRoomId: string | null
  selectedOpeningId: string | null
  /** Furniture and other placed objects. */
  objects: PlacedObject[]
  selectedObjectId: string | null
  /** The library piece the furniture tool will place, unless a model is chosen. */
  placingKind: ObjectKind
  /** The imported model the furniture tool will place, if any. */
  placingModelId: string | null
  /** Imported 3D model files, by id. `url` is a blob: URL, or a data: URL after opening a project. */
  models: Record<string, ModelInfo & { url: string }>
  /** The last attempt to place a door or window found no room for it. */
  placementFailed: boolean
  /** Floor and ceiling materials for rooms without their own. */
  roomDefaults: RoomMaterials
  /** Rooms whose materials differ from the defaults, by room id. */
  roomMaterials: Record<string, RoomMaterials>
  /** The sun study: where and when the sun is, for light and shadows. */
  sun: SunSettings
  /** Ceiling lights. */
  lights: CeilingLight[]
  selectedLightId: string | null
  /** Unit rates for the cost estimate. */
  costRates: CostRates
  showFloors: boolean
  showCeilings: boolean
  /** Draw walls cut off low, so the rooms can be seen into. Display only. */
  cutaway: boolean
  /** Uploaded photo textures, by id. */
  textures: Record<string, Texture>
  /** Corners of the wall chain being drawn, in world metres. */
  draft: Vec2[]

  setUnits: (units: Units) => void
  setViewMode: (mode: ViewMode) => void
  requestFrame: () => void
  requestCapture: (kind: 'image' | 'panorama') => void
  setTool: (tool: Tool) => void
  loadPlan: (file: File) => Promise<void>
  addCalibrationPoint: (p: Px) => void
  applyCalibration: (metres: number) => void
  addDraftPoint: (p: Vec2) => void
  removeDraftPoint: () => void
  /** Turn the draft into walls. `close` adds a segment back to the first corner. */
  finishDraft: (close?: boolean) => void
  clearWalls: () => void
  /** Find the walls drawn on the plan and offer them as a suggestion. */
  suggestWalls: () => Promise<void>
  /** Ask the model what each gap in the suggested walls is. Sends a small image of each gap to the service. */
  identifyGaps: () => Promise<void>
  /** Add the suggested walls to the model, with a door or window for each gap identified as one. */
  acceptSuggestedWalls: () => void
  discardSuggestedWalls: () => void
  /** Drop one wall, and its gaps, from the suggestion. */
  removeSuggestedWall: (id: string) => void
  /** Drop the thin walls from the suggestion, leaving the heavy outer shell. */
  keepThickSuggestedWalls: () => void
  /** Set by hand what a suggested gap is: each call moves on through door, window, plain wall. */
  cycleSuggestedGap: (index: number) => void
  setAccessPassword: (password: string) => void
  selectWall: (id: string | null) => void
  updateWall: (id: string, props: Partial<WallProps>) => void
  deleteWall: (id: string) => void
  setWallDefaults: (props: Partial<WallProps>) => void
  applyDefaultsToAll: () => void
  /**
   * With the door or window tool: place one on the wall at `position` metres from its
   * start, then select it and end the tool. False if it doesn't fit there.
   */
  placeOpening: (wallId: string, position: number) => boolean
  selectOpening: (id: string | null) => void
  /** Change an opening. Ignored if the result would run into another opening. */
  updateOpening: (id: string, patch: Partial<Opening>) => void
  deleteOpening: (id: string) => void
  /** Arm the furniture tool: the next click on the ground places this piece. */
  startPlacingObject: (kind: ObjectKind) => void
  /** Read a 3D model file, then arm the furniture tool with it. Throws if the file can't be used. */
  importModel: (file: File) => Promise<void>
  /** Arm the furniture tool with an already imported model. */
  startPlacingModel: (id: string) => void
  /** With the furniture tool: place the piece, select it and end the tool. */
  placeObject: (position: Vec2) => void
  selectObject: (id: string | null) => void
  updateObject: (id: string, patch: Partial<PlacedObject>) => void
  deleteObject: (id: string) => void
  /** Copy a piece and select the copy. */
  duplicateObject: (id: string) => void
  selectRoom: (id: string | null) => void
  setRoomMaterial: (id: string, part: keyof RoomMaterials, material: Material) => void
  /** Give every room this room's floor and ceiling. */
  applyRoomToAll: (id: string) => void
  setSun: (patch: Partial<SunSettings>) => void
  /** With the light tool: place a ceiling light, select it and end the tool. */
  placeLight: (position: Vec2) => void
  selectLight: (id: string | null) => void
  updateLight: (id: string, patch: Partial<CeilingLight>) => void
  deleteLight: (id: string) => void
  setCostRate: (key: CostKey, rate: number) => void
  setShowFloors: (show: boolean) => void
  setShowCeilings: (show: boolean) => void
  setCutaway: (on: boolean) => void
  /** Load an image as a texture and return its id. */
  addTexture: (file: File) => Promise<string>
  /** The whole project as the text of a project file. */
  saveProject: () => Promise<string>
  /** Replace the project with a saved one. Throws, changing nothing, if the file is invalid. */
  loadProject: (text: string) => void
}

/** Image URLs are blob: URLs after an upload and data: URLs after opening a project. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const blob = await (await fetch(url)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // btoa takes a binary string; build it in chunks to stay within argument limits.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

function revoke(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

const PASSWORD_KEY = 'monarch.accessPassword'

function savedPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? ''
  } catch {
    return '' // no storage (tests, or blocked by the browser)
  }
}

export const useStore = create<State>()((set, get) => ({
  units: 'metric',
  viewMode: '3d',
  frameRequest: 0,
  captureRequest: null,
  tool: 'none',
  plan: null,
  calibrationPoints: [],
  calibrationLine: null,
  walls: [],
  ...NO_SUGGESTION,
  accessPassword: savedPassword(),
  openings: [],
  wallDefaults: { ...WALL_DEFAULTS },
  selectedWallId: null,
  selectedRoomId: null,
  selectedOpeningId: null,
  objects: [],
  selectedObjectId: null,
  placingKind: 'bed',
  placingModelId: null,
  models: {},
  placementFailed: false,
  roomDefaults: { ...ROOM_DEFAULTS },
  roomMaterials: {},
  sun: { ...DEFAULT_SUN },
  lights: [],
  selectedLightId: null,
  costRates: { ...DEFAULT_RATES },
  showFloors: true,
  showCeilings: false,
  cutaway: false,
  textures: {},
  draft: [],

  setUnits: (units) => set({ units }),
  setViewMode: (viewMode) => set((s) => ({ viewMode, frameRequest: s.frameRequest + 1 })),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),
  requestCapture: (kind) => set({ captureRequest: { kind } }),

  setTool: (tool) => {
    // Leaving the wall tool keeps what was drawn so far.
    if (get().tool === 'wall') get().finishDraft()
    const keep = tool === 'none'
    set({ tool, calibrationPoints: [], placementFailed: false, ...(keep ? {} : NO_SELECTION) })
  },

  loadPlan: async (file) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch (err) {
      URL.revokeObjectURL(url)
      throw err
    }
    const previous = get().plan
    if (previous) URL.revokeObjectURL(previous.url)
    set((s) => ({
      plan: {
        url,
        name: file.name,
        widthPx: img.naturalWidth,
        heightPx: img.naturalHeight,
        metresPerPx: UNCALIBRATED_WIDTH_M / img.naturalWidth,
        calibrated: false,
      },
      tool: 'none',
      calibrationPoints: [],
      calibrationLine: null,
      draft: [],
      ...NO_SUGGESTION,
      frameRequest: s.frameRequest + 1,
    }))
  },

  addCalibrationPoint: (p) => {
    const points = get().calibrationPoints
    if (points.length < 2) set({ calibrationPoints: [...points, p] })
  },

  applyCalibration: (metres) => {
    const { plan, calibrationPoints, walls } = get()
    if (!plan || calibrationPoints.length !== 2) return
    const [a, b] = calibrationPoints
    const newScale = metresPerPixel(a, b, metres)
    set((s) => ({
      plan: { ...plan, metresPerPx: newScale, calibrated: true },
      // Walls traced over the plan stay on the drawing.
      walls: scaleWalls(walls, newScale / plan.metresPerPx),
      ...NO_SUGGESTION, // found at the old scale
      openings: scaleOpenings(s.openings, newScale / plan.metresPerPx),
      objects: scaleObjects(s.objects, newScale / plan.metresPerPx),
      lights: scaleLights(s.lights, newScale / plan.metresPerPx),
      tool: 'none',
      calibrationPoints: [],
      calibrationLine: [a, b],
      frameRequest: s.frameRequest + 1,
    }))
  },

  addDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
  removeDraftPoint: () => set((s) => ({ draft: s.draft.slice(0, -1) })),

  finishDraft: (close = false) => {
    const { draft } = get()
    const chain = close && draft.length > 2 ? [...draft, draft[0]] : draft
    set((s) => ({ walls: [...s.walls, ...wallsFromChain(chain, s.wallDefaults)], draft: [] }))
  },

  clearWalls: () => set({ walls: [], openings: [], draft: [], selectedWallId: null, selectedOpeningId: null }),

  suggestWalls: async () => {
    const { plan, wallDefaults } = get()
    if (!plan) return
    const { raster, scale } = await readRaster(plan.url)
    // The raster may be a shrunken copy of the plan: describe it as its own plan covering the same ground.
    const frame = { widthPx: raster.width, heightPx: raster.height, metresPerPx: plan.metresPerPx / scale }
    const detected = detectPlan(raster, detectOptions(frame.metresPerPx))
    if (get().plan !== plan) return
    const suggestedWalls = toWalls(detected.walls, frame, wallDefaults)
    const gaps = openingGaps(detected.gaps, frame.metresPerPx)
    set({
      ...NO_SUGGESTION,
      suggestedWalls,
      suggestedGaps: gapSuggestions(gaps, suggestedWalls, frame.metresPerPx),
      // Squares are found on the raster; the crop is cut from the full image.
      suggestedGapCrops: gaps.map((gap) => {
        const wall = detected.walls[gap.wall]
        const { x, y, size } = cropSquare(gap, wall, frame.metresPerPx)
        const mark = gapMark(gap, wall)
        return {
          square: { x: x / scale, y: y / scale, size: size / scale },
          mark: { x: mark.x / scale, y: mark.y / scale, width: mark.width / scale, height: mark.height / scale },
        }
      }),
    })
  },

  identifyGaps: async () => {
    const { plan, suggestedGaps, suggestedGapCrops, accessPassword } = get()
    if (!plan || suggestedGaps.length === 0) return
    set({ identifying: 'busy' })
    try {
      const answers = await Promise.all(
        suggestedGapCrops.map(async (crop) => parseGapAnswer(await askJev(gapQuestion(await cropPng(plan.url, crop)), accessPassword))),
      )
      if (get().suggestedGaps !== suggestedGaps) return // discarded or redone meanwhile
      if (answers.every((a) => a === null)) throw new Error("Jev's replies could not be read")
      set({
        identifying: 'idle',
        // A reply that can't be read leaves its gap unidentified.
        suggestedGaps: suggestedGaps.map((gap, i) => ({ ...gap, ...(answers[i] ?? {}) })),
      })
    } catch (err) {
      if (get().suggestedGaps !== suggestedGaps) return
      const needsPassword = err instanceof JevError && err.status === 401
      set({ identifying: { error: err instanceof Error ? err.message : String(err), needsPassword } })
    }
  },

  acceptSuggestedWalls: () =>
    set((s) => {
      const walls = s.suggestedWalls ?? []
      return {
        walls: [...s.walls, ...walls],
        openings: [...s.openings, ...openingsFromGaps(s.suggestedGaps, walls)],
        ...NO_SUGGESTION,
      }
    }),

  discardSuggestedWalls: () => set(NO_SUGGESTION),

  removeSuggestedWall: (id) =>
    set((s) => {
      const keep = s.suggestedGaps.map((gap) => gap.wallId !== id)
      return {
        suggestedWalls: s.suggestedWalls && s.suggestedWalls.filter((w) => w.id !== id),
        suggestedGaps: s.suggestedGaps.filter((_, i) => keep[i]),
        suggestedGapCrops: s.suggestedGapCrops.filter((_, i) => keep[i]),
      }
    }),

  keepThickSuggestedWalls: () => thinWalls(get().suggestedWalls ?? []).forEach((w) => get().removeSuggestedWall(w.id)),

  cycleSuggestedGap: (index) =>
    set((s) => ({
      suggestedGaps: s.suggestedGaps.map((gap, i) => {
        if (i !== index) return gap
        // What the gap would become now decides what comes next. The user's word is certain.
        const now = gap.confidence >= MIN_CONFIDENCE ? gap.kind : null
        const kind = now === 'door' || now === 'opening' ? 'window' : now === 'window' ? 'none' : 'door'
        return { ...gap, kind, confidence: 1 }
      }),
    })),

  setAccessPassword: (accessPassword) => {
    set({ accessPassword })
    try {
      localStorage.setItem(PASSWORD_KEY, accessPassword)
    } catch {
      // Storage can be blocked; the password then lasts until the page is closed.
    }
  },

  selectWall: (selectedWallId) => set({ ...NO_SELECTION, selectedWallId }),

  placeOpening: (wallId, position) => {
    const { walls, openings, tool } = get()
    const wall = walls.find((w) => w.id === wallId)
    if (!wall || (tool !== 'door' && tool !== 'window')) return false
    const opening = openingAt(wall, openings, tool, position)
    if (!opening) {
      set({ placementFailed: true })
      return false
    }
    set({
      openings: [...openings, opening],
      tool: 'none',
      placementFailed: false,
      ...NO_SELECTION,
      selectedOpeningId: opening.id,
    })
    return true
  },

  selectOpening: (selectedOpeningId) => set({ ...NO_SELECTION, selectedOpeningId }),

  updateOpening: (id, patch) => {
    const { walls, openings } = get()
    const opening = openings.find((o) => o.id === id)
    const wall = opening && walls.find((w) => w.id === opening.wallId)
    const edited = wall && editOpening(opening, patch, wall, openings)
    if (edited) set({ openings: openings.map((o) => (o.id === id ? edited : o)) })
  },

  deleteOpening: (id) =>
    set((s) => ({
      openings: s.openings.filter((o) => o.id !== id),
      selectedOpeningId: s.selectedOpeningId === id ? null : s.selectedOpeningId,
    })),

  startPlacingObject: (placingKind) => {
    get().setTool('object')
    set({ placingKind, placingModelId: null })
  },

  importModel: async (file) => {
    const { url, format, naturalSize } = await inspectModelFile(file)
    const id = crypto.randomUUID()
    set((s) => ({ models: { ...s.models, [id]: { url, name: file.name, format, naturalSize } } }))
    get().startPlacingModel(id)
  },

  startPlacingModel: (placingModelId) => {
    get().setTool('object')
    set({ placingModelId })
  },

  placeObject: (position) => {
    const { tool, placingKind, placingModelId, models, objects } = get()
    if (tool !== 'object') return
    const model = placingModelId && models[placingModelId]
    const object = model
      ? createModelObject(placingModelId, fitSize(model.naturalSize), position)
      : createObject(placingKind, position)
    set({ objects: [...objects, object], tool: 'none', ...NO_SELECTION, selectedObjectId: object.id })
  },

  selectObject: (selectedObjectId) => set({ ...NO_SELECTION, selectedObjectId }),

  updateObject: (id, patch) =>
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? resizeObject(o, patch) : o)) })),

  deleteObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedObjectId: s.selectedObjectId === id ? null : s.selectedObjectId,
    })),

  duplicateObject: (id) => {
    const original = get().objects.find((o) => o.id === id)
    if (!original) return
    const copy = duplicateObject(original)
    set((s) => ({ objects: [...s.objects, copy], ...NO_SELECTION, selectedObjectId: copy.id }))
  },

  selectRoom: (selectedRoomId) => set({ ...NO_SELECTION, selectedRoomId }),

  setRoomMaterial: (id, part, material) =>
    set((s) => ({
      roomMaterials: { ...s.roomMaterials, [id]: { ...(s.roomMaterials[id] ?? s.roomDefaults), [part]: material } },
    })),

  applyRoomToAll: (id) =>
    set((s) => ({ roomDefaults: s.roomMaterials[id] ?? s.roomDefaults, roomMaterials: {} })),

  setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),

  placeLight: (position) => {
    if (get().tool !== 'light') return
    const light = createLight(position)
    set((s) => ({ lights: [...s.lights, light], tool: 'none', ...NO_SELECTION, selectedLightId: light.id }))
  },

  selectLight: (selectedLightId) => set({ ...NO_SELECTION, selectedLightId }),

  updateLight: (id, patch) => set((s) => ({ lights: s.lights.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),

  deleteLight: (id) =>
    set((s) => ({
      lights: s.lights.filter((l) => l.id !== id),
      selectedLightId: s.selectedLightId === id ? null : s.selectedLightId,
    })),
  setCostRate: (key, rate) => set((s) => ({ costRates: { ...s.costRates, [key]: rate } })),

  setShowFloors: (showFloors) => set({ showFloors }),
  setShowCeilings: (showCeilings) => set({ showCeilings }),
  setCutaway: (cutaway) => set({ cutaway }),

  updateWall: (id, props) =>
    set((s) => ({ walls: s.walls.map((w) => (w.id === id ? { ...w, ...props } : w)) })),

  deleteWall: (id) =>
    set((s) => ({
      walls: s.walls.filter((w) => w.id !== id),
      openings: s.openings.filter((o) => o.wallId !== id),
      selectedOpeningId: s.openings.some((o) => o.id === s.selectedOpeningId && o.wallId === id)
        ? null
        : s.selectedOpeningId,
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
    })),

  setWallDefaults: (props) => set((s) => ({ wallDefaults: { ...s.wallDefaults, ...props } })),

  applyDefaultsToAll: () =>
    set((s) => ({ walls: s.walls.map((w) => ({ ...w, ...s.wallDefaults })) })),

  addTexture: async (file) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch (err) {
      URL.revokeObjectURL(url)
      throw err
    }
    const id = crypto.randomUUID()
    set((s) => ({ textures: { ...s.textures, [id]: { url, name: file.name } } }))
    return id
  },

  saveProject: async () => {
    const { units, plan, calibrationLine, walls, openings, objects, sun, lights, costRates, wallDefaults, textures, roomDefaults, roomMaterials } =
      get()
    const rooms = { defaults: roomDefaults, materials: roomMaterials }
    const file: ProjectFile = {
      app: 'monarch',
      version: PROJECT_VERSION,
      units,
      plan: plan && {
        name: plan.name,
        widthPx: plan.widthPx,
        heightPx: plan.heightPx,
        metresPerPx: plan.metresPerPx,
        calibrated: plan.calibrated,
        calibrationLine,
        image: await toDataUrl(plan.url),
      },
      walls,
      openings,
      objects,
      models: {},
      sun,
      lights,
      costRates,
      wallDefaults,
      rooms,
      textures: {},
    }
    for (const id of new Set(objects.map((o) => o.modelId))) {
      const m = id && get().models[id]
      if (m) file.models[id] = { name: m.name, format: m.format, naturalSize: m.naturalSize, data: await toDataUrl(m.url) }
    }
    for (const id of usedTextureIds(walls, wallDefaults, rooms, objects)) {
      const t = textures[id]
      if (t) file.textures[id] = { name: t.name, image: await toDataUrl(t.url) }
    }
    return JSON.stringify(file)
  },

  loadProject: (text) => {
    const file = parseProject(text)
    const old = get()
    if (old.plan) revoke(old.plan.url)
    Object.values(old.textures).forEach((t) => revoke(t.url))
    Object.values(old.models).forEach((m) => revoke(m.url))
    set((s) => ({
      units: file.units,
      plan: file.plan && {
        url: file.plan.image,
        name: file.plan.name,
        widthPx: file.plan.widthPx,
        heightPx: file.plan.heightPx,
        metresPerPx: file.plan.metresPerPx,
        calibrated: file.plan.calibrated,
      },
      calibrationLine: file.plan?.calibrationLine ?? null,
      calibrationPoints: [],
      walls: file.walls,
      ...NO_SUGGESTION,
      openings: file.openings,
      objects: file.objects,
      models: Object.fromEntries(
        Object.entries(file.models).map(([id, { data, ...info }]) => [id, { ...info, url: data }]),
      ),
      placingModelId: null,
      sun: file.sun,
      lights: file.lights,
      costRates: file.costRates,
      wallDefaults: file.wallDefaults,
      roomDefaults: file.rooms.defaults,
      roomMaterials: file.rooms.materials,
      ...NO_SELECTION,
      textures: Object.fromEntries(
        Object.entries(file.textures).map(([id, t]) => [id, { url: t.image, name: t.name }]),
      ),
      selectedWallId: null,
      draft: [],
      tool: 'none',
      frameRequest: s.frameRequest + 1,
    }))
  },
}))
