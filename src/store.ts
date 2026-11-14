import { create } from 'zustand'
import type { Units } from './units'
import { metresPerPixel, type Px } from './plan/geometry'
import { scaleWalls, wallsFromChain, type Vec2, type Wall } from './model/walls'

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
  draft: [],

  setUnits: (units) => set({ units }),
  setViewMode: (viewMode) => set((s) => ({ viewMode, frameRequest: s.frameRequest + 1 })),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),

  setTool: (tool) => {
    // Leaving the wall tool keeps what was drawn so far.
    if (get().tool === 'wall') get().finishDraft()
    set({ tool, calibrationPoints: [] })
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
    set((s) => ({ walls: [...s.walls, ...wallsFromChain(chain)], draft: [] }))
  },

  clearWalls: () => set({ walls: [], draft: [] }),
}))
