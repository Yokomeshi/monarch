import { useStore } from '../store'
import type { Room } from '../model/rooms'
import { formatArea } from '../units'
import { MaterialControls } from './MaterialControls'

interface Props {
  room: Room
  name: string
  /** Whether there are other rooms to apply this one's materials to. */
  hasOthers: boolean
}

/** Floor and ceiling materials of the selected room. */
export function RoomPanel({ room, name, hasOthers }: Props) {
  const units = useStore((s) => s.units)
  const materials = useStore((s) => s.roomMaterials[room.id] ?? s.roomDefaults)
  const showCeilings = useStore((s) => s.showCeilings)
  const setRoomMaterial = useStore((s) => s.setRoomMaterial)
  const applyRoomToAll = useStore((s) => s.applyRoomToAll)

  return (
    <section>
      <h2>Selected room</h2>
      <dl className="facts">
        <dt>Name</dt>
        <dd>{name}</dd>
        <dt>Area</dt>
        <dd data-testid="selected-area">{formatArea(room.area, units)}</dd>
      </dl>
      <MaterialControls title="Floor" material={materials.floor} onChange={(m) => setRoomMaterial(room.id, 'floor', m)} />
      <MaterialControls title="Ceiling" material={materials.ceiling} onChange={(m) => setRoomMaterial(room.id, 'ceiling', m)} />
      {!showCeilings && <p className="hint">Ceilings are hidden. Turn on Ceilings above the view to see this one.</p>}
      {hasOthers && <button onClick={() => applyRoomToAll(room.id)}>Apply to all rooms</button>}
    </section>
  )
}
