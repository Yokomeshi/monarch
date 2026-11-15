import { useMemo } from 'react'
import { useStore } from './store'
import { useRooms } from './useRooms'
import { takeoff } from './model/takeoff'

/** The quantities in the current model. */
export function useTakeoff() {
  const walls = useStore((s) => s.walls)
  const openings = useStore((s) => s.openings)
  const objects = useStore((s) => s.objects)
  const lights = useStore((s) => s.lights)
  const rooms = useRooms()
  return useMemo(() => takeoff(walls, openings, rooms, objects, lights), [walls, openings, rooms, objects, lights])
}
