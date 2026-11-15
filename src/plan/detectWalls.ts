// TEMPORARY STUB: replaced by the real module before commit.
import type { Px } from './geometry'
export interface Raster { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface DetectedWall { start: Px; end: Px; thickness: number }
export interface DetectOptions { minThickness: number; minLength: number; maxGap: number }
export function detectWalls(_image: Raster, _options: DetectOptions): DetectedWall[] {
  return []
}
