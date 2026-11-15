import { useEffect, useId, useState } from 'react'
import { useStore } from '../store'
import { fitSize, isCabinet, LIBRARY, resizeProportional, type PlacedObject, type Size3 } from '../model/objects'
import { LengthControl, type LengthRange } from './LengthControl'
import { MaterialControls } from './MaterialControls'

const INCH = 0.0254
const SIZE_RANGE: LengthRange = {
  metric: { min: 0.1, max: 6, step: 0.01 },
  imperial: { min: 4 * INCH, max: 240 * INCH, step: INCH / 2 },
}

/** A wall cabinet hangs anywhere from the floor to just under a high ceiling. */
const ELEVATION_RANGE: LengthRange = {
  metric: { min: 0, max: 3, step: 0.01 },
  imperial: { min: 0, max: 120 * INCH, step: INCH / 2 },
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}
/** Arrow-key steps in metres: 5 cm and 50 cm, or 2 in and 1 ft. */
const NUDGE = {
  metric: { small: 0.05, large: 0.5 },
  imperial: { small: 2 * INCH, large: 12 * INCH },
}

/** Size, rotation and material of the selected piece of furniture. */
export function ObjectPanel({ object }: { object: PlacedObject }) {
  const updateObject = useStore((s) => s.updateObject)
  const deleteObject = useStore((s) => s.deleteObject)
  const duplicateObject = useStore((s) => s.duplicateObject)
  const units = useStore((s) => s.units)
  const rotationId = useId()
  const model = useStore((s) => (object.modelId ? s.models[object.modelId] : undefined))
  // An imported model distorts if one side is changed alone, so its sides start out linked.
  const [keepProportions, setKeepProportions] = useState(true)
  const name = object.kind === 'model' ? (model?.name ?? 'model') : LIBRARY[object.kind].name.toLowerCase()
  const set = (patch: Partial<PlacedObject>) => updateObject(object.id, patch)
  const setSize = (dimension: keyof Size3, value: number) =>
    set({
      size: model && keepProportions ? resizeProportional(object.size, dimension, value) : { ...object.size, [dimension]: value },
    })

  // Keyboard: Delete removes, Ctrl/Cmd+D duplicates, arrows nudge (Shift for a bigger step).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteObject(object.id)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        return duplicateObject(object.id)
      }
      // Top view: right is +x and down is +z.
      const direction = ARROWS[e.key]
      if (!direction) return
      e.preventDefault()
      const step = NUDGE[units][e.shiftKey ? 'large' : 'small']
      const { x, z } = useStore.getState().objects.find((o) => o.id === object.id)!.position
      updateObject(object.id, { position: { x: x + direction[0] * step, z: z + direction[1] * step } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [object.id, units, deleteObject, duplicateObject, updateObject])

  return (
    <section>
      <h2>Selected {name}</h2>
      <p className="hint">
        Drag the {name} to move it. Near a wall it snaps flush, back to the wall; hold <kbd>Alt</kbd> to place it
        freely. Arrow keys nudge it.
      </p>
      <LengthControl label="Width" value={object.size.width} range={SIZE_RANGE} onChange={(v) => setSize('width', v)} />
      <LengthControl label="Depth" value={object.size.depth} range={SIZE_RANGE} onChange={(v) => setSize('depth', v)} />
      <LengthControl label="Height" value={object.size.height} range={SIZE_RANGE} onChange={(v) => setSize('height', v)} />
      {model && (
        <div className="row model-size">
          <label>
            <input type="checkbox" checked={keepProportions} onChange={(e) => setKeepProportions(e.target.checked)} />
            Keep proportions
          </label>
          <button onClick={() => set({ size: fitSize(model.naturalSize) })}>Reset size</button>
        </div>
      )}
      {isCabinet(object.kind) && (
        <>
          <LengthControl label="Off floor" value={object.elevation ?? 0} range={ELEVATION_RANGE} onChange={(elevation) => set({ elevation })} />
          <div className="segmented" role="radiogroup" aria-label="Fronts">
            {(['doors', 'drawers'] as const).map((fronts) => (
              <button
                key={fronts}
                role="radio"
                aria-checked={object.cabinet?.fronts === fronts}
                className={object.cabinet?.fronts === fronts ? 'active' : ''}
                onClick={() => set({ cabinet: { fronts } })}
              >
                {fronts === 'doors' ? 'Doors' : 'Drawers'}
              </button>
            ))}
          </div>
        </>
      )}
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
      {model && model.format !== 'obj' ? (
        <p className="hint">This model uses the materials saved in its file.</p>
      ) : (
        <MaterialControls material={object.material} onChange={(material) => set({ material })} />
      )}
      <div className="row">
        <button onClick={() => duplicateObject(object.id)}>Duplicate</button>
        <button onClick={() => deleteObject(object.id)}>Delete {name}</button>
      </div>
    </section>
  )
}
