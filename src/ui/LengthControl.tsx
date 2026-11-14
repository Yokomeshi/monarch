import { useId, useState } from 'react'
import { useStore } from '../store'
import { formatLength, parseLength, type Units } from '../units'

/** Slider range and step, in metres, for each unit system. */
export type LengthRange = Record<Units, { min: number; max: number; step: number }>

interface Props {
  label: string
  /** metres */
  value: number
  range: LengthRange
  onChange: (metres: number) => void
}

/** A slider paired with a typed length field. Both edit the same value. */
export function LengthControl({ label, value, range, onChange }: Props) {
  const units = useStore((s) => s.units)
  const { min, max, step } = range[units]
  const id = useId()
  // null = not editing: the field shows the formatted value.
  const [text, setText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    if (text === null) return
    const metres = parseLength(text, units)
    if (metres === null) {
      setInvalid(true)
      return
    }
    onChange(Math.min(max, Math.max(min, metres)))
    setText(null)
    setInvalid(false)
  }

  return (
    <div className="length-control">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          id={id}
          className={invalid ? 'invalid' : ''}
          value={text ?? formatLength(value, units)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
          }}
          onBlur={() => {
            commit()
            setText(null)
            setInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(null)
              setInvalid(false)
            }
          }}
        />
      </div>
      {invalid && (
        <p className="error">{units === 'metric' ? 'Enter a length, e.g. 2.7 m' : `Enter a length, e.g. 9' 0"`}</p>
      )}
    </div>
  )
}
