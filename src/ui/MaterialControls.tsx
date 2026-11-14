import { useId, useState } from 'react'
import { useStore } from '../store'
import { applyPreset, matchingPreset, PRESETS, type Material } from '../model/materials'
import { LengthControl, type LengthRange } from './LengthControl'

const INCH = 0.0254
const TILE_RANGE: LengthRange = {
  metric: { min: 0.1, max: 5, step: 0.05 },
  imperial: { min: 4 * INCH, max: 192 * INCH, step: INCH },
}

interface Props {
  material: Material
  onChange: (material: Material) => void
  /** Names the surface when a panel has more than one, e.g. "Floor". */
  title?: string
}

/** Preset, colour, PBR sliders and photo-texture picker for one material. */
export function MaterialControls({ material, onChange, title = 'Material' }: Props) {
  const texture = useStore((s) => (material.textureId ? s.textures[material.textureId] : undefined))
  const addTexture = useStore((s) => s.addTexture)
  const [error, setError] = useState<string | null>(null)
  const colorId = useId()
  const preset = matchingPreset(material)
  const patch = (p: Partial<Material>) => onChange({ ...material, ...p })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      // White tint, so the photo shows in its own colours.
      patch({ textureId: await addTexture(file), color: '#ffffff' })
    } catch {
      setError(`Couldn't read "${file.name}" as an image.`)
    }
  }

  return (
    <div className="material-controls" data-testid={`material-${title.toLowerCase()}`}>
      <h3>{title}</h3>
      <div className="swatches" role="radiogroup" aria-label="Material preset">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            role="radio"
            aria-checked={preset === p}
            aria-label={p.name}
            title={p.name}
            className={preset === p ? 'swatch active' : 'swatch'}
            style={{ background: p.color }}
            onClick={() => onChange(applyPreset(material, p))}
          />
        ))}
      </div>
      <p className="hint" data-testid="material-name">
        {texture ? `Photo: ${texture.name}` : (preset?.name ?? 'Custom')}
      </p>

      <div className="field-row">
        <label htmlFor={colorId}>{texture ? 'Tint' : 'Color'}</label>
        <input id={colorId} type="color" value={material.color} onChange={(e) => patch({ color: e.target.value })} />
        <code>{material.color}</code>
      </div>
      <UnitSlider label="Roughness" value={material.roughness} onChange={(roughness) => patch({ roughness })} />
      <UnitSlider label="Metalness" value={material.metalness} onChange={(metalness) => patch({ metalness })} />

      <div className="row">
        <label className="button">
          {texture ? 'Replace photo…' : 'Use a photo…'}
          <input
            type="file"
            accept="image/*"
            hidden
            data-testid="texture-input"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {texture && <button onClick={() => patch({ textureId: null })}>Remove</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {texture && (
        <LengthControl
          label="Photo covers"
          value={material.tileSize}
          range={TILE_RANGE}
          onChange={(tileSize) => patch({ tileSize })}
        />
      )}
    </div>
  )
}

function UnitSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId()
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <code>{value.toFixed(2)}</code>
    </div>
  )
}
