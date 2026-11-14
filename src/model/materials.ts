// Surface appearance, as physically based (PBR) parameters.

export interface Material {
  /** Hex colour, e.g. "#e8e4dc". Tints the texture when one is set. */
  color: string
  /** 0 = mirror-smooth, 1 = fully matte. */
  roughness: number
  /** 0 = non-metal, 1 = metal. */
  metalness: number
  /** Id of an uploaded photo texture, or null for a plain colour. */
  textureId: string | null
  /** Real-world size, in metres, that one copy of the texture covers. */
  tileSize: number
}

export interface Preset {
  name: string
  color: string
  roughness: number
  metalness: number
}

export const PRESETS: Preset[] = [
  { name: 'Paint', color: '#e8e4dc', roughness: 0.9, metalness: 0 },
  { name: 'Plaster', color: '#d6cfc0', roughness: 1, metalness: 0 },
  { name: 'Concrete', color: '#9a9a96', roughness: 0.95, metalness: 0 },
  { name: 'Brick', color: '#a4513a', roughness: 0.9, metalness: 0 },
  { name: 'Wood', color: '#a8773f', roughness: 0.6, metalness: 0 },
  { name: 'Stone', color: '#8b8478', roughness: 0.8, metalness: 0 },
  { name: 'Steel', color: '#b8bcc2', roughness: 0.35, metalness: 0.6 },
]

export const DEFAULT_MATERIAL: Material = { ...withoutName(PRESETS[0]), textureId: null, tileSize: 1 }

/** Apply a preset. Presets are plain colours, so any photo texture is removed. */
export function applyPreset(material: Material, preset: Preset): Material {
  return { ...material, ...withoutName(preset), textureId: null }
}

/** The preset a material currently matches, if any. */
export function matchingPreset(material: Material): Preset | undefined {
  if (material.textureId) return undefined
  return PRESETS.find(
    (p) =>
      p.color.toLowerCase() === material.color.toLowerCase() &&
      p.roughness === material.roughness &&
      p.metalness === material.metalness,
  )
}

function withoutName({ color, roughness, metalness }: Preset) {
  return { color, roughness, metalness }
}

/** Floor and ceiling finishes of one room. */
export interface RoomMaterials {
  floor: Material
  ceiling: Material
}

const wood = PRESETS.find((p) => p.name === 'Wood')!

export const ROOM_DEFAULTS: RoomMaterials = {
  floor: applyPreset(DEFAULT_MATERIAL, wood),
  ceiling: DEFAULT_MATERIAL,
}
