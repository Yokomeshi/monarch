import { useEffect } from 'react'
import { useStore } from '../store'
import { EDGE_CLEARANCE, fitOpening, type Opening } from '../model/openings'
import { wallLength, type Wall } from '../model/walls'
import { LengthControl, type LengthRange } from './LengthControl'

const INCH = 0.0254
const range = (min: number, max: number): LengthRange => ({
  metric: { min, max, step: 0.01 },
  imperial: { min, max, step: INCH / 2 },
})

/** Position and size of the selected door or window. */
export function OpeningPanel({ opening, wall }: { opening: Opening; wall: Wall }) {
  const updateOpening = useStore((s) => s.updateOpening)
  const deleteOpening = useStore((s) => s.deleteOpening)
  const length = wallLength(wall)
  const o = fitOpening(opening, length, wall.height) // what is actually drawn
  const set = (patch: Partial<Opening>) => updateOpening(opening.id, patch)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteOpening(opening.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opening.id, deleteOpening])

  return (
    <section>
      <h2>Selected {o.type}</h2>
      <LengthControl
        label="Position"
        value={o.position}
        range={range(EDGE_CLEARANCE + o.width / 2, length - EDGE_CLEARANCE - o.width / 2)}
        onChange={(position) => set({ position })}
      />
      <LengthControl
        label="Width"
        value={o.width}
        range={range(0.3, length - 2 * EDGE_CLEARANCE)}
        onChange={(width) => set({ width })}
      />
      <LengthControl
        label="Height"
        value={o.height}
        range={range(0.3, wall.height - o.sill)}
        onChange={(height) => set({ height })}
      />
      {o.type === 'window' && (
        <LengthControl label="Sill" value={o.sill} range={range(0, wall.height - 0.3)} onChange={(sill) => set({ sill })} />
      )}
      <p className="hint">Position is measured along the wall, from its start to the middle of the {o.type}.</p>
      {o.type === 'door' && (
        <dl className="facts door-sides">
          <dt>Hinge</dt>
          <dd data-testid="hinge">{o.hinge} side</dd>
          <dd>
            <button onClick={() => set({ hinge: o.hinge === 'start' ? 'end' : 'start' })}>Flip hinge</button>
          </dd>
          <dt>Opens</dt>
          <dd data-testid="swing">{o.swing}</dd>
          <dd>
            <button onClick={() => set({ swing: o.swing === 'left' ? 'right' : 'left' })}>Flip swing</button>
          </dd>
        </dl>
      )}
      <p>
        <button onClick={() => deleteOpening(opening.id)}>Delete {o.type}</button>
      </p>
    </section>
  )
}
