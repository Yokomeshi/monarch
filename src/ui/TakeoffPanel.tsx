import { useMemo } from 'react'
import { useStore } from '../store'
import { useRooms } from '../useRooms'
import { takeoff } from '../model/takeoff'
import { formatArea, formatLength } from '../units'

/** Quantity takeoff: how much of everything the model contains. */
export function TakeoffPanel() {
  const units = useStore((s) => s.units)
  const walls = useStore((s) => s.walls)
  const openings = useStore((s) => s.openings)
  const objects = useStore((s) => s.objects)
  const lights = useStore((s) => s.lights)
  const rooms = useRooms()
  const t = useMemo(() => takeoff(walls, openings, rooms, objects, lights), [walls, openings, rooms, objects, lights])
  if (walls.length === 0) return null

  return (
    <section>
      <h2>Quantities</h2>
      <dl className="facts" data-testid="takeoff">
        <dt>Wall length</dt>
        <dd data-testid="takeoff-wall-length">{formatLength(t.wallLength, units)}</dd>
        <dt>Wall area</dt>
        <dd data-testid="takeoff-wall-area">{formatArea(t.wallArea, units)}</dd>
        <dt>Floor area</dt>
        <dd data-testid="takeoff-floor-area">{formatArea(t.floorArea, units)}</dd>
        <dt>Ceiling area</dt>
        <dd data-testid="takeoff-ceiling-area">{formatArea(t.ceilingArea, units)}</dd>
        <dt>Doors</dt>
        <dd data-testid="takeoff-doors">{t.doors}</dd>
        <dt>Windows</dt>
        <dd data-testid="takeoff-windows">{t.windows}</dd>
        <dt>Furniture</dt>
        <dd data-testid="takeoff-furniture">{t.furniture}</dd>
        <dt>Lights</dt>
        <dd data-testid="takeoff-lights">{t.lights}</dd>
      </dl>
      <p className="hint">
        Wall length follows the centre-lines. Wall area is one face of each wall, less doors and windows. Floors are
        measured to the inside faces of the walls.
      </p>
    </section>
  )
}
