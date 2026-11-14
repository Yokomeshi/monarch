import { create } from 'zustand'
import type { Units } from './units'
import { metresPerPixel, type Px } from './plan/geometry'
import { scaleWalls, wallsFromChain, WALL_DEFAULTS, type Vec2, type Wall, type WallProps } from './model/walls'

import { parseProject, PROJECT_VERSION, usedTextureIds, type ProjectFile } from './project'

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

export type Tool = 'none' | 'calibrate' | 'wall'
export type ViewMode = '3d' | 'top'

// Before calibration the plan is shown 20 m wide so it fits the default view.
const UNCALIBRATED_WIDTH_M = 20

interface State {
  units: Units
  viewMode: ViewMode
  /** Bumped to ask the camera to frame the plan. */
  frameRequest: number
  tool: Tool
  plan: Plan | null
  /** Points being picked while calibrating, in plan pixels (0-2). */
  calibrationPoints: Px[]
  /** The span the current scale was set from, kept on screen as a check. */
  calibrationLine: [Px, Px] | null
  walls: Wall[]
  /** Height and thickness given to newly drawn walls. */
  wallDefaults: WallProps
  selectedWallId: string | null
  /** Uploaded photo textures, by id. */
  textures: Record<string, Texture>
  /** Corners of the wall chain being drawn, in world metres. */
  draft: Vec2[]

  setUnits: (units: Units) => void
  setViewMode: (mode: ViewMode) => void
  requestFrame: () => void
  setTool: (tool: Tool) => void
  loadPlan: (file: File) => Promise<void>
  addCalibrationPoint: (p: Px) => void
  applyCalibration: (metres: number) => void
  addDraftPoint: (p: Vec2) => void
  removeDraftPoint: () => void
  /** Turn the draft into walls. `close` adds a segment back to the first corner. */
  finishDraft: (close?: boolean) => void
  clearWalls: () => void
  selectWall: (id: string | null) => void
  updateWall: (id: string, props: Partial<WallProps>) => void
  deleteWall: (id: string) => void
  setWallDefaults: (props: Partial<WallProps>) => void
  applyDefaultsToAll: () => void
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function revoke(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

export const useStore = create<State>()((set, get) => ({
  units: 'metric',
  viewMode: '3d',
  frameRequest: 0,
  tool: 'none',
  plan: null,
  calibrationPoints: [],
  calibrationLine: null,
  walls: [],
  wallDefaults: { ...WALL_DEFAULTS },
  selectedWallId: null,
  textures: {},
  draft: [],

  setUnits: (units) => set({ units }),
  setViewMode: (viewMode) => set((s) => ({ viewMode, frameRequest: s.frameRequest + 1 })),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),

  setTool: (tool) => {
    // Leaving the wall tool keeps what was drawn so far.
    if (get().tool === 'wall') get().finishDraft()
    set({ tool, calibrationPoints: [], selectedWallId: tool === 'none' ? get().selectedWallId : null })
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

  clearWalls: () => set({ walls: [], draft: [], selectedWallId: null }),

  selectWall: (selectedWallId) => set({ selectedWallId }),

  updateWall: (id, props) =>
    set((s) => ({ walls: s.walls.map((w) => (w.id === id ? { ...w, ...props } : w)) })),

  deleteWall: (id) =>
    set((s) => ({
      walls: s.walls.filter((w) => w.id !== id),
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
    const { units, plan, calibrationLine, walls, wallDefaults, textures } = get()
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
      wallDefaults,
      textures: {},
    }
    for (const id of usedTextureIds(walls, wallDefaults)) {
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
      wallDefaults: file.wallDefaults,
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
