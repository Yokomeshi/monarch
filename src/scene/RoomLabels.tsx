import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { detectRooms } from '../model/rooms'
import { formatArea } from '../units'

/** A name and area label at the centre of each room. */
export function RoomLabels() {
  const walls = useStore((s) => s.walls)
  const units = useStore((s) => s.units)
  const rooms = useMemo(() => detectRooms(walls), [walls])

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
