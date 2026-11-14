import { useId } from 'react'
import { useStore } from '../store'
import { compassPoint, dayLabel, sunPosition, timeLabel } from '../model/sun'

/** The sun study: where and when the sun is. */
export function SunPanel() {
  const sun = useStore((s) => s.sun)
  const setSun = useStore((s) => s.setSun)
  const at = sunPosition(sun.latitude, sun.day, sun.hour)

  return (
    <section>
      <h2>Sun</h2>
      <label className="check">
        <input type="checkbox" checked={sun.enabled} onChange={(e) => setSun({ enabled: e.target.checked })} />
        Sun study
      </label>
      {sun.enabled && (
        <>
          <Slider
            label="Latitude"
            min={-90}
            max={90}
            step={0.5}
            value={sun.latitude}
            text={`${Math.abs(sun.latitude)}° ${sun.latitude < 0 ? 'S' : 'N'}`}
            onChange={(latitude) => setSun({ latitude })}
          />
          <Slider label="Date" min={1} max={365} step={1} value={sun.day} text={dayLabel(sun.day)} onChange={(day) => setSun({ day })} />
          <Slider label="Time" min={0} max={24} step={0.25} value={sun.hour} text={timeLabel(sun.hour)} onChange={(hour) => setSun({ hour })} />
          <Slider label="North" min={0} max={355} step={5} value={sun.north} text={`${sun.north}°`} onChange={(north) => setSun({ north })} />
          <p data-testid="sun-readout">
            {at.altitude > 0
              ? `The sun is ${Math.round(at.altitude)}° above the horizon, to the ${compassPoint(at.azimuth)}.`
              : 'The sun is below the horizon.'}
          </p>
          <p className="hint">
            Time is solar time: 12:00 is when the sun is highest, which can differ from clock time by an hour or so.
            North is where north points on the plan, clockwise from the top of Top view.
          </p>
        </>
      )}
    </section>
  )
}

interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  /** The value as shown beside the slider. */
  text: string
  onChange: (value: number) => void
}

function Slider({ label, min, max, step, value, text, onChange }: SliderProps) {
  const id = useId()
  return (
    <div className="field-row sun-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <code>{text}</code>
    </div>
  )
}
