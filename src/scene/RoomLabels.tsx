import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { useRooms } from '../useRooms'
import { formatArea } from '../units'

/** A name and area label at the centre of each room, in Top view. In 3D they would float over the walls. */
export function RoomLabels() {
  const units = useStore((s) => s.units)
  const rooms = useRooms()
  const topView = useStore((s) => s.viewMode === 'top' && s.tool !== 'walk')
  if (!topView) return null

  return (
    <>
      {rooms.map((room, i) => (
        <Html key={room.id} position={[room.centre.x, 0.05, room.centre.z]} center style={{ pointerEvents: 'none' }}>
          <div className="room-label">
            <strong>Room {i + 1}</strong>
            {formatArea(room.area, units)}
          </div>
        </Html>
      ))}
    </>
  )
}
