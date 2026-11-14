import { useEffect, useId } from 'react'
import { useStore } from '../store'
import { LIBRARY, type PlacedObject, type Size3 } from '../model/objects'
import { LengthControl, type LengthRange } from './LengthControl'
import { MaterialControls } from './MaterialControls'

const INCH = 0.0254
const SIZE_RANGE: LengthRange = {
  metric: { min: 0.1, max: 6, step: 0.01 },
  imperial: { min: 4 * INCH, max: 240 * INCH, step: INCH / 2 },
}

/** Size, rotation and material of the selected piece of furniture. */
export function ObjectPanel({ object }: { object: PlacedObject }) {
  const updateObject = useStore((s) => s.updateObject)
  const deleteObject = useStore((s) => s.deleteObject)
  const rotationId = useId()
  const name = LIBRARY[object.kind].name.toLowerCase()
  const set = (patch: Partial<PlacedObject>) => updateObject(object.id, patch)
  const setSize = (patch: Partial<Size3>) => set({ size: { ...object.size, ...patch } })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteObject(object.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [object.id, deleteObject])

  return (
    <section>
      <h2>Selected {name}</h2>
      <p className="hint">Drag the {name} in the view to move it.</p>
      <LengthControl label="Width" value={object.size.width} range={SIZE_RANGE} onChange={(width) => setSize({ width })} />
      <LengthControl label="Depth" value={object.size.depth} range={SIZE_RANGE} onChange={(depth) => setSize({ depth })} />
      <LengthControl label="Height" value={object.size.height} range={SIZE_RANGE} onChange={(height) => setSize({ height })} />
      <div className="field-row">
        <label htmlFor={rotationId}>Rotation</label>
        <input
          id={rotationId}
          type="range"
          min={0}
          max={355}
          step={5}
          value={object.rotation}
          onChange={(e) => set({ rotation: Number(e.target.value) })}
        />
        <code data-testid="rotation">{Math.round(object.rotation)}°</code>
      </div>
      <p>
        <button onClick={() => set({ rotation: object.rotation + 90 })}>Rotate 90°</button>
      </p>
      <MaterialControls material={object.material} onChange={(material) => set({ material })} />
      <p>
        <button onClick={() => deleteObject(object.id)}>Delete {name}</button>
      </p>
    </section>
  )
}
