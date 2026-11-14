import { create } from 'zustand'
import type { Units } from './units'
import { metresPerPixel, type Px } from './plan/geometry'

export interface Plan {
  url: string
  name: string
  widthPx: number
  heightPx: number
  metresPerPx: number
  calibrated: boolean
}

// Before calibration the plan is shown 20 m wide so it fits the default view.
const UNCALIBRATED_WIDTH_M = 20

interface State {
  units: Units
  plan: Plan | null
  /** Points being picked while calibrating, in plan pixels (0-2). */
  calibrating: boolean
  calibrationPoints: Px[]
  /** The span the current scale was set from, kept on screen as a check. */
  calibrationLine: [Px, Px] | null

  setUnits: (units: Units) => void
  loadPlan: (file: File) => Promise<void>
  startCalibration: () => void
  addCalibrationPoint: (p: Px) => void
  cancelCalibration: () => void
  applyCalibration: (metres: number) => void
}

export const useStore = create<State>()((set, get) => ({
  units: 'metric',
  plan: null,
  calibrating: false,
  calibrationPoints: [],
  calibrationLine: null,

  setUnits: (units) => set({ units }),

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
    set({
      plan: {
        url,
        name: file.name,
        widthPx: img.naturalWidth,
        heightPx: img.naturalHeight,
        metresPerPx: UNCALIBRATED_WIDTH_M / img.naturalWidth,
        calibrated: false,
      },
      calibrating: false,
      calibrationPoints: [],
      calibrationLine: null,
    })
  },

  startCalibration: () => set({ calibrating: true, calibrationPoints: [] }),

  addCalibrationPoint: (p) => {
    const points = get().calibrationPoints
    if (points.length < 2) set({ calibrationPoints: [...points, p] })
  },

  cancelCalibration: () => set({ calibrating: false, calibrationPoints: [] }),

  applyCalibration: (metres) => {
    const { plan, calibrationPoints } = get()
    if (!plan || calibrationPoints.length !== 2) return
    const [a, b] = calibrationPoints
    set({
      plan: { ...plan, metresPerPx: metresPerPixel(a, b, metres), calibrated: true },
      calibrating: false,
      calibrationPoints: [],
      calibrationLine: [a, b],
    })
  },
}))
