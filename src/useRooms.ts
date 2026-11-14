import { useMemo } from 'react'
import { useStore } from './store'
import { detectRooms } from './model/rooms'

/** The rooms enclosed by the current walls. */
export function useRooms() {
  const walls = useStore((s) => s.walls)
  return useMemo(() => detectRooms(walls), [walls])
}
