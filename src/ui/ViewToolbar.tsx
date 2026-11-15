import { useStore } from '../store'

export function ViewToolbar() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const requestFrame = useStore((s) => s.requestFrame)
  const showFloors = useStore((s) => s.showFloors)
  const showCeilings = useStore((s) => s.showCeilings)
  const setShowFloors = useStore((s) => s.setShowFloors)
  const setShowCeilings = useStore((s) => s.setShowCeilings)
  const cutaway = useStore((s) => s.cutaway)
  const setCutaway = useStore((s) => s.setCutaway)
  const walking = useStore((s) => s.tool === 'walk')
  const setTool = useStore((s) => s.setTool)
  const requestCapture = useStore((s) => s.requestCapture)

  return (
    <div className="view-toolbar">
      <button
        aria-pressed={walking}
        className={walking ? 'active' : ''}
        title="Walk through the plan at eye height"
        onClick={() => setTool(walking ? 'none' : 'walk')}
      >
        Walk
      </button>
      <button
        aria-pressed={cutaway}
        className={cutaway ? 'active' : ''}
        title="Cut the walls down to 1.2 m in the view, to see into the rooms"
        onClick={() => setCutaway(!cutaway)}
      >
        Cutaway
      </button>
      <button aria-pressed={showFloors} className={showFloors ? 'active' : ''} onClick={() => setShowFloors(!showFloors)}>
        Floors
      </button>
      <button
        aria-pressed={showCeilings}
        className={showCeilings ? 'active' : ''}
        onClick={() => setShowCeilings(!showCeilings)}
      >
        Ceilings
      </button>
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
      <button title="Save the current view as a large image" onClick={() => requestCapture('image')}>
        Save image
      </button>
      {walking && (
        <button title="Save a 360° panorama from where you stand, for a panorama viewer or headset" onClick={() => requestCapture('panorama')}>
          Save 360°
        </button>
      )}
    </div>
  )
}
