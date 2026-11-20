import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { formatArea, formatLength, parseLength } from '../units'
import { useRooms } from '../useRooms'
import { RoomPanel } from './RoomPanel'
import { OpeningPanel } from './OpeningPanel'
import { ObjectPanel } from './ObjectPanel'
import { SunPanel } from './SunPanel'
import { LightPanel } from './LightPanel'
import { TakeoffPanel } from './TakeoffPanel'
import { CostPanel } from './CostPanel'
import { ChecksPanel } from './ChecksPanel'
import { LIBRARY, type ObjectKind } from '../model/objects'
import { wallLength } from '../model/walls'
import { openingsFromGaps } from '../plan/suggestOpenings'
import { thinWalls } from '../plan/suggestWalls'
import { toIfc } from '../export/ifc'
import { FalError, modelFromPhoto, photoDataUrl } from '../ai/falClient'
import { WallPanel } from './WallPanel'

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

      <ProjectPanel />

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
      {plan && <DetectWallsPanel calibrated={plan.calibrated} />}
      <WallsPanel />
      <OpeningsPanel />
      <FurniturePanel />
      <RoomsPanel />
      <TakeoffPanel />
      <CostPanel />
      <ChecksPanel />
      <SunPanel />
      <LightsPanel />
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
            Pick two points on the plan whose real distance you know: click each, or press on one and drag to the
            other. Hold Shift to keep the line straight. The Top view is most precise.
          </p>
          <button onClick={start}>Calibrate scale</button>
        </>
      )}
      {calibrating && points.length < 2 && (
        <>
          <p className="hint">
            {points.length === 0
              ? 'Click the first point, or press on it and drag to the second.'
              : 'Click the second point.'}{' '}
            Shift keeps the line straight. Esc cancels.
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

/** Finds the walls drawn on the plan and offers them for adding. */
function DetectWallsPanel({ calibrated }: { calibrated: boolean }) {
  const suggested = useStore((s) => s.suggestedWalls)
  const suggestWalls = useStore((s) => s.suggestWalls)
  const accept = useStore((s) => s.acceptSuggestedWalls)
  const discard = useStore((s) => s.discardSuggestedWalls)
  const gaps = useStore((s) => s.suggestedGaps)
  const identifying = useStore((s) => s.identifying)
  const identifyGaps = useStore((s) => s.identifyGaps)
  const keepThick = useStore((s) => s.keepThickSuggestedWalls)
  const suggestionClick = useStore((s) => s.suggestionClick)
  const setSuggestionClick = useStore((s) => s.setSuggestionClick)
  const thin = thinWalls(suggested ?? []).length
  const accessPassword = useStore((s) => s.accessPassword)
  const setAccessPassword = useStore((s) => s.setAccessPassword)
  /** Something has been said about a gap, by the model or by hand; and no gap is still waiting for the model. */
  const identified = gaps.some((g) => g.kind !== null)
  const toIdentify = gaps.some((g) => g.kind === null && g.crop)
  const added = openingsFromGaps(gaps, suggested ?? [])
  const doors = added.filter((o) => o.type === 'door').length
  const windows = added.length - doors

  return (
    <section>
      <h2>Detect walls</h2>
      {!suggested ? (
        <>
          <p className="hint">
            {calibrated
              ? 'Finds solid dark walls that run straight across or up the plan. You check the result before it is added.'
              : 'Set the scale first: detection needs to know how big the plan is.'}
          </p>
          <button disabled={!calibrated} onClick={suggestWalls}>
            Detect walls
          </button>
        </>
      ) : suggested.length === 0 ? (
        <>
          <p className="hint" data-testid="detect-result">
            No walls found. Detection needs solid dark walls that run straight across or up the plan.
          </p>
          <button onClick={discard}>OK</button>
        </>
      ) : (
        <>
          <p className="hint" data-testid="detect-result">
            Found {suggested.length} {suggested.length === 1 ? 'wall' : 'walls'}, shown in orange
            {gaps.length > 0 && `, with ${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} bridged`}.
          </p>
          {gaps.length > 0 && (
            <>
              {identified ? (
                <p className="hint" data-testid="identify-result">
                  {doors} {doors === 1 ? 'door' : 'doors'} (green) and {windows} {windows === 1 ? 'window' : 'windows'}{' '}
                  (blue) will be added.
                  {gaps.length > doors + windows && ` ${gaps.length - doors - windows} left as plain wall.`}
                </p>
              ) : (
                <p className="hint">
                  Gaps are where doors and windows are drawn. Identifying them sends a small image of each gap to
                  TypeSafe's Jev service.
                </p>
              )}
              {typeof identifying === 'object' &&
                (identifying.needsPassword ? (
                  <>
                    <p className="error" data-testid="identify-error">
                      {accessPassword ? 'That password was not accepted.' : 'This needs the access password.'}
                    </p>
                    <label htmlFor="access-password">Access password</label>
                    <input
                      id="access-password"
                      type="password"
                      value={accessPassword}
                      onChange={(e) => setAccessPassword(e.target.value)}
                    />
                  </>
                ) : (
                  <p className="error" data-testid="identify-error">
                    Couldn't identify the gaps: {identifying.error}. The README explains the setup this needs.
                  </p>
                ))}
              {toIdentify && (
                <p>
                  <button disabled={identifying === 'busy'} onClick={identifyGaps}>
                    {identifying === 'busy' ? 'Identifying…' : 'Identify doors and windows'}
                  </button>
                </p>
              )}
            </>
          )}
          <p className="hint">A click on the suggestion will:</p>
          <div className="segmented" role="radiogroup" aria-label="A click on the suggestion">
            {(['edit', 'door', 'window'] as const).map((mode) => (
              <button
                key={mode}
                role="radio"
                aria-checked={suggestionClick === mode}
                className={suggestionClick === mode ? 'active' : ''}
                onClick={() => setSuggestionClick(mode)}
              >
                {mode === 'edit' ? 'Remove' : mode === 'door' ? 'Door' : 'Window'}
              </button>
            ))}
          </div>
          <p className="hint">
            {suggestionClick === 'edit'
              ? `Click an orange wall to remove it from the suggestion${gaps.length > 0 ? ', or a gap to change what it is: door, window or plain wall' : ''}.`
              : `Click a wall to mark a ${suggestionClick} there, a gap to make it a ${suggestionClick}, or the space between two walls that line up to join them with a ${suggestionClick}.`}
            {thin > 0 && ' On a busy plan, keep the thick outer walls and trace the rest by hand.'}
          </p>
          {thin > 0 && (
            <p>
              <button onClick={keepThick} title="Removes walls thinner than half the thickest one">
                Keep thick walls only
              </button>
            </p>
          )}
          <div className="row">
            <button onClick={accept}>Add walls</button>
            <button onClick={discard}>Discard</button>
          </div>
        </>
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

function ProjectPanel() {
  const saveProject = useStore((s) => s.saveProject)
  const loadProject = useStore((s) => s.loadProject)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const [error, setError] = useState<string | null>(null)

  // Ctrl/Cmd+Z undoes; with Shift, or Ctrl/Cmd+Y, redoes. In a text field the keys edit the text instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const onSave = async () => {
    setError(null)
    try {
      const url = URL.createObjectURL(new Blob([await saveProject()], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'monarch-project.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Couldn't save the project.")
    }
  }

  const onExport = () => {
    const { plan, walls, openings, objects } = useStore.getState()
    const name = plan?.name.replace(/\.[^.]+$/, '') ?? 'Monarch model'
    const url = URL.createObjectURL(new Blob([toIfc({ name, walls, openings, objects })], { type: 'application/x-step' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'monarch-model.ifc'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onOpen = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      loadProject(await file.text())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the project.")
    }
  }

  return (
    <section>
      <h2>Project</h2>
      <div className="row">
        <button disabled={!canUndo} title="Ctrl+Z" onClick={undo}>
          Undo
        </button>
        <button disabled={!canRedo} title="Ctrl+Shift+Z" onClick={redo}>
          Redo
        </button>
      </div>
      <div className="row">
        <button onClick={onSave}>Save…</button>
        <label className="button">
          Open…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="project-input"
            onChange={(e) => {
              onOpen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p>
        <button title="Walls, doors, windows, floors and furniture as an IFC file, for BIM software" onClick={onExport}>
          Export IFC…
        </button>
      </p>
      {error && (
        <p className="error" data-testid="project-error">
          {error}
        </p>
      )}
    </section>
  )
}

function RoomsPanel() {
  const units = useStore((s) => s.units)
  const hasWalls = useStore((s) => s.walls.length > 0)
  const rooms = useRooms()
  if (!hasWalls) return null
  const total = rooms.reduce((sum, r) => sum + r.area, 0)

  return (
    <section>
      <h2>Rooms</h2>
      {rooms.length === 0 ? (
        <p className="hint">No closed rooms yet. A room appears when walls form a closed loop.</p>
      ) : (
        <dl className="facts" data-testid="rooms">
          {rooms.map((room, i) => (
            <Fragment key={room.id}>
              <dt>Room {i + 1}</dt>
              <dd>{formatArea(room.area, units)}</dd>
            </Fragment>
          ))}
          {rooms.length > 1 && (
            <>
              <dt>Total</dt>
              <dd data-testid="rooms-total">{formatArea(total, units)}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}

/** Edits whatever is selected: furniture, a light, a door or window, a room, or a wall. With nothing selected, the new-wall defaults. */
export function Inspector() {
  const rooms = useRooms()
  const selectedRoomId = useStore((s) => s.selectedRoomId)
  const opening = useStore((s) => s.openings.find((o) => o.id === s.selectedOpeningId))
  const wall = useStore((s) => s.walls.find((w) => w.id === opening?.wallId))
  const object = useStore((s) => s.objects.find((o) => o.id === s.selectedObjectId))
  const light = useStore((s) => s.lights.find((l) => l.id === s.selectedLightId))
  if (object) return <ObjectPanel object={object} />
  if (light) return <LightPanel light={light} />
  if (opening && wall) return <OpeningPanel opening={opening} wall={wall} />
  const i = rooms.findIndex((r) => r.id === selectedRoomId)
  if (i < 0) return <WallPanel />
  return <RoomPanel room={rooms[i]} name={`Room ${i + 1}`} hasOthers={rooms.length > 1} />
}

function OpeningsPanel() {
  const hasWalls = useStore((s) => s.walls.length > 0)
  const tool = useStore((s) => s.tool)
  const failed = useStore((s) => s.placementFailed)
  const doors = useStore((s) => s.openings.filter((o) => o.type === 'door').length)
  const windows = useStore((s) => s.openings.length - doors)
  const setTool = useStore((s) => s.setTool)
  const placing = tool === 'door' || tool === 'window'

  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool('none')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing, setTool])

  if (!hasWalls) return null
  return (
    <section>
      <h2>Doors and windows</h2>
      {placing ? (
        <>
          <p className="hint">Click a wall to place the {tool}. Esc cancels.</p>
          {failed && <p className="error">That spot is taken, or the wall is too small. Try another spot.</p>}
          <button onClick={() => setTool('none')}>Cancel</button>
        </>
      ) : (
        <div className="row">
          <button onClick={() => setTool('door')}>Place door</button>
          <button onClick={() => setTool('window')}>Place window</button>
        </div>
      )}
      {doors + windows > 0 && (
        <p className="hint" data-testid="opening-summary">
          {doors} {doors === 1 ? 'door' : 'doors'}, {windows} {windows === 1 ? 'window' : 'windows'}
        </p>
      )}
    </section>
  )
}

function LightsPanel() {
  const placing = useStore((s) => s.tool === 'light')
  const count = useStore((s) => s.lights.length)
  const setTool = useStore((s) => s.setTool)

  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool('none')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing, setTool])

  return (
    <section>
      <h2>Lights</h2>
      {placing ? (
        <>
          <p className="hint">Click in the view to place the ceiling light. Esc cancels.</p>
          <button onClick={() => setTool('none')}>Cancel</button>
        </>
      ) : (
        <button onClick={() => setTool('light')}>Place ceiling light</button>
      )}
      {count > 0 && (
        <p className="hint" data-testid="light-summary">
          {count} {count === 1 ? 'light' : 'lights'}
        </p>
      )}
    </section>
  )
}

function FurniturePanel() {
  const tool = useStore((s) => s.tool)
  const placingKind = useStore((s) => s.placingKind)
  const placingModelId = useStore((s) => s.placingModelId)
  const models = useStore((s) => s.models)
  const count = useStore((s) => s.objects.length)
  const startPlacingObject = useStore((s) => s.startPlacingObject)
  const startPlacingModel = useStore((s) => s.startPlacingModel)
  const importModel = useStore((s) => s.importModel)
  const setTool = useStore((s) => s.setTool)
  const [error, setError] = useState<string | null>(null)
  const accessPassword = useStore((s) => s.accessPassword)
  const setAccessPassword = useStore((s) => s.setAccessPassword)
  /** The photo being turned into a model, and how that is going. */
  const [photo, setPhoto] = useState<File | null>(null)
  const [making, setMaking] = useState<'idle' | 'busy' | { error: string; needsPassword: boolean }>('idle')
  const placing = tool === 'object'
  const placingName = (placingModelId && models[placingModelId]?.name) || LIBRARY[placingKind].name.toLowerCase()

  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTool('none')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing, setTool])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      await importModel(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't read "${file.name}".`)
    }
  }

  const makeFromPhoto = async (file: File) => {
    setPhoto(file)
    setMaking('busy')
    try {
      const glb = await modelFromPhoto(await photoDataUrl(file), accessPassword)
      await importModel(new File([glb], `${file.name.replace(/\.[^.]*$/, '')}.glb`))
      setPhoto(null)
      setMaking('idle')
    } catch (err) {
      const needsPassword = err instanceof FalError && err.status === 401
      setMaking({ error: err instanceof Error ? err.message : String(err), needsPassword })
    }
  }

  return (
    <section>
      <h2>Furniture</h2>
      {placing ? (
        <>
          <p className="hint">Click in the view to place the {placingName}. Esc cancels.</p>
          <button onClick={() => setTool('none')}>Cancel</button>
        </>
      ) : (
        <>
          <div className="library">
            {(Object.keys(LIBRARY) as ObjectKind[]).map((kind) => (
              <button key={kind} onClick={() => startPlacingObject(kind)}>
                {LIBRARY[kind].name}
              </button>
            ))}
            {Object.entries(models).map(([id, model]) => (
              <button key={id} title="Imported model" onClick={() => startPlacingModel(id)}>
                {model.name}
              </button>
            ))}
          </div>
          <p>
            <label className="button">
              Import 3D model…
              <input
                type="file"
                accept=".glb,.gltf,.obj"
                hidden
                data-testid="model-input"
                onChange={(e) => {
                  onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </p>
          <p>
            <label className="button">
              {making === 'busy' ? 'Making the model…' : '3D model from a photo…'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={making === 'busy'}
                data-testid="photo-input"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) makeFromPhoto(file)
                  e.target.value = ''
                }}
              />
            </label>
          </p>
          <p className="hint">
            {making === 'busy'
              ? 'This takes a minute or two. Keep this page open.'
              : 'A photo of one piece on a plain background works best. The photo is sent to fal, and each model is charged to the fal account behind this app.'}
          </p>
          {typeof making === 'object' &&
            (making.needsPassword ? (
              <>
                <p className="error" data-testid="photo-error">
                  {accessPassword ? 'That password was not accepted.' : 'This needs the access password.'}
                </p>
                <label htmlFor="photo-password">Access password</label>
                <input
                  id="photo-password"
                  type="password"
                  value={accessPassword}
                  onChange={(e) => setAccessPassword(e.target.value)}
                />
                <p>
                  <button onClick={() => photo && makeFromPhoto(photo)}>Try again</button>
                </p>
              </>
            ) : (
              <p className="error" data-testid="photo-error">
                Couldn't make the model: {making.error}. The README explains the setup this needs.
              </p>
            ))}
        </>
      )}
      {error && (
        <p className="error" data-testid="model-error">
          {error}
        </p>
      )}
      {count > 0 && (
        <p className="hint" data-testid="furniture-summary">
          {count} {count === 1 ? 'piece' : 'pieces'}
        </p>
      )}
    </section>
  )
}
