import { useEffect } from 'react'
import { useStore } from '../store'
import { KELVIN_RANGE, LUMENS_RANGE, type CeilingLight } from '../model/lights'
import { Slider } from './SunPanel'

/** Brightness and colour of the selected ceiling light. */
export function LightPanel({ light }: { light: CeilingLight }) {
  const updateLight = useStore((s) => s.updateLight)
  const deleteLight = useStore((s) => s.deleteLight)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteLight(light.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [light.id, deleteLight])

  return (
    <section>
      <h2>Selected light</h2>
      <p className="hint">Drag the light to move it. It sits on the ceiling of the room it is in.</p>
      <Slider
        label="Brightness"
        {...LUMENS_RANGE}
        value={light.lumens}
        text={`${light.lumens} lm`}
        onChange={(lumens) => updateLight(light.id, { lumens })}
      />
      <Slider
        label="Colour"
        {...KELVIN_RANGE}
        value={light.kelvin}
        text={`${light.kelvin} K`}
        onChange={(kelvin) => updateLight(light.id, { kelvin })}
      />
      <p className="hint">
        A 60 W bulb gives about 800 lm. 2700 K is a warm white bulb, 4000 K a cool white, 6500 K daylight.
      </p>
      <button onClick={() => deleteLight(light.id)}>Delete light</button>
    </section>
  )
}
