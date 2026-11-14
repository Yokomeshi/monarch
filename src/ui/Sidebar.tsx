import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { formatLength, parseLength } from '../units'
import { wallLength } from '../model/walls'

export function Sidebar() {
  const units = useStore((s) => s.units)
  const plan = useStore((s) => s.plan)
  const setUnits = useStore((s) => s.setUnits)
  const loadPlan = useStore((s) => s.loadPlan)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      await loadPlan(file)
    } catch {
      setError(`Couldn't read "${file.name}" as an image.`)
    }
  }

  return (
    <aside className="sidebar">
      <h1>Monarch</h1>

      <section>
        <h2>Units</h2>
        <div className="segmented" role="radiogroup" aria-label="Units">
          {(['metric', 'imperial'] as const).map((u) => (
            <button
              key={u}
              role="radio"
              aria-checked={units === u}
              className={units === u ? 'active' : ''}
              onClick={() => setUnits(u)}
            >
              {u === 'metric' ? 'Metric' : 'Imperial'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Floor plan</h2>
        <label className="button">
          {plan ? 'Replace plan…' : 'Upload plan…'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {plan && (
          <dl className="facts">
            <dt>File</dt>
            <dd>{plan.name}</dd>
            <dt>Size</dt>
            <dd data-testid="plan-size">
              {formatLength(plan.widthPx * plan.metresPerPx, units)} ×{' '}
              {formatLength(plan.heightPx * plan.metresPerPx, units)}
            </dd>
            <dt>Scale</dt>
            <dd>{plan.calibrated ? 'Calibrated' : <span className="warn">Not calibrated</span>}</dd>
          </dl>
        )}
      </section>

      {plan && <CalibrationPanel />}
      <WallsPanel />
    </aside>
  )
}

function CalibrationPanel() {
  const units = useStore((s) => s.units)
  const calibrating = useStore((s) => s.tool === 'calibrate')
  const points = useStore((s) => s.calibrationPoints)
  const setTool = useStore((s) => s.setTool)
  const start = () => setTool('calibrate')
  const cancel = useCallback(() => setTool('none'), [setTool])
  const apply = useStore((s) => s.applyCalibration)
  const [distance, setDistance] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!calibrating) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibrating, cancel])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const metres = parseLength(distance, units)
    if (metres === null || metres <= 0) {
      setError(units === 'metric' ? 'Enter a length, e.g. 3.2 m' : `Enter a length, e.g. 10' 6"`)
      return
    }
    setError(null)
    setDistance('')
    apply(metres)
  }

  return (
    <section>
      <h2>Scale</h2>
      {!calibrating && (
        <>
          <p className="hint">
            Click two points on the plan whose real distance you know. The Top view is most precise.
          </p>
          <button onClick={start}>Calibrate scale</button>
        </>
      )}
      {calibrating && points.length < 2 && (
        <>
          <p className="hint">
            Click point {points.length + 1} of 2 on the plan. Drag to orbit. Esc cancels.
          </p>
          <button onClick={cancel}>Cancel</button>
        </>
      )}
      {calibrating && points.length === 2 && (
        <form onSubmit={onSubmit}>
          <label htmlFor="cal-distance">Real distance between the points</label>
          <input
            id="cal-distance"
            autoFocus
            value={distance}
            placeholder={units === 'metric' ? '3.2 m' : `10' 6"`}
            onChange={(e) => setDistance(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">Set scale</button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function WallsPanel() {
  const units = useStore((s) => s.units)
  const walls = useStore((s) => s.walls)
  const drawing = useStore((s) => s.tool === 'wall')
  const draft = useStore((s) => s.draft)
  const setTool = useStore((s) => s.setTool)
  const clearWalls = useStore((s) => s.clearWalls)
  const total = walls.reduce((sum, w) => sum + wallLength(w), 0)

  return (
    <section>
      <h2>Walls</h2>
      {drawing ? (
        <>
          <p className="hint">
            {draft.length === 0
              ? 'Click to place the first corner.'
              : 'Click to place the next corner. Click the first corner to close the room.'}
          </p>
          <ul className="keys">
            <li>
              <kbd>Shift</kbd> lock to 45° steps
            </li>
            <li>
              <kbd>Backspace</kbd> remove last corner
            </li>
            <li>
              <kbd>Enter</kbd> / <kbd>Esc</kbd> finish
            </li>
          </ul>
          <button onClick={() => setTool('none')}>Done</button>
        </>
      ) : (
        <button onClick={() => setTool('wall')}>Draw walls</button>
      )}
      {walls.length > 0 && (
        <>
          <dl className="facts">
            <dt>Walls</dt>
            <dd data-testid="wall-count">{walls.length}</dd>
            <dt>Length</dt>
            <dd data-testid="wall-length">{formatLength(total, units)}</dd>
          </dl>
          <p>
            <button onClick={clearWalls}>Clear walls</button>
          </p>
        </>
      )}
    </section>
  )
}
