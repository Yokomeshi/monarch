import { useMemo } from 'react'
import { useStore } from './store'
import { findClashes } from './model/clash'

/** The layout problems in the current plan. */
export function useClashes() {
  const walls = useStore((s) => s.walls)
  const openings = useStore((s) => s.openings)
  const objects = useStore((s) => s.objects)
  return useMemo(() => findClashes(walls, openings, objects), [walls, openings, objects])
}
