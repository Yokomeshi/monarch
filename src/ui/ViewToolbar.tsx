import { useStore } from '../store'

export function ViewToolbar() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const requestFrame = useStore((s) => s.requestFrame)

  return (
    <div className="view-toolbar">
      <div className="segmented" role="radiogroup" aria-label="View">
        {(['3d', 'top'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={viewMode === m}
            className={viewMode === m ? 'active' : ''}
            onClick={() => setViewMode(m)}
          >
            {m === '3d' ? '3D' : 'Top'}
          </button>
        ))}
      </div>
      <button onClick={requestFrame}>Frame plan</button>
    </div>
  )
}
