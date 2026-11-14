import { useEffect } from 'react'
import { useStore } from '../store'
import { wallLength } from '../model/walls'
import { formatLength } from '../units'
import { LengthControl, type LengthRange } from './LengthControl'

const INCH = 0.0254
const FOOT = 0.3048

const HEIGHT_RANGE: LengthRange = {
  metric: { min: 0.5, max: 6, step: 0.01 },
  imperial: { min: 2 * FOOT, max: 20 * FOOT, step: INCH / 2 },
}
const THICKNESS_RANGE: LengthRange = {
  metric: { min: 0.05, max: 1, step: 0.005 },
  imperial: { min: 2 * INCH, max: 36 * INCH, step: INCH / 8 },
}

/** Edits the selected wall, or the defaults for new walls when nothing is selected. */
export function WallPanel() {
  const units = useStore((s) => s.units)
  const wall = useStore((s) => s.walls.find((w) => w.id === s.selectedWallId))
  const wallCount = useStore((s) => s.walls.length)
  const defaults = useStore((s) => s.wallDefaults)
  const updateWall = useStore((s) => s.updateWall)
  const deleteWall = useStore((s) => s.deleteWall)
  const setWallDefaults = useStore((s) => s.setWallDefaults)
  const applyDefaultsToAll = useStore((s) => s.applyDefaultsToAll)

  useEffect(() => {
    if (!wall) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteWall(wall.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wall, deleteWall])

  const props = wall ?? defaults
  const set = wall
    ? (p: Partial<typeof defaults>) => updateWall(wall.id, p)
    : setWallDefaults

  return (
    <section>
      <h2>{wall ? 'Selected wall' : 'New walls'}</h2>
      {!wall && wallCount > 0 && <p className="hint">Click a wall to edit it.</p>}
      <LengthControl label="Height" value={props.height} range={HEIGHT_RANGE} onChange={(height) => set({ height })} />
      <LengthControl
        label="Thickness"
        value={props.thickness}
        range={THICKNESS_RANGE}
        onChange={(thickness) => set({ thickness })}
      />
      {wall ? (
        <>
          <dl className="facts">
            <dt>Length</dt>
            <dd data-testid="selected-length">{formatLength(wallLength(wall), units)}</dd>
          </dl>
          <p>
            <button onClick={() => deleteWall(wall.id)}>Delete wall</button>
          </p>
        </>
      ) : (
        wallCount > 0 && <button onClick={applyDefaultsToAll}>Apply to all walls</button>
      )}
    </section>
  )
}
