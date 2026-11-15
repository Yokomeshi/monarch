// Asking Jev (TypeSafe's System One model) what a gap in a wall is.
// Jev answers typed questions with probabilities and a confidence, so the reply needs no parsing of prose.

export type GapKind = 'door' | 'window' | 'opening' | 'none'

export interface GapAnswer {
  kind: GapKind
  /** Jev's confidence in its choice, 0 to 1. */
  confidence: number
}

const KINDS: Record<GapKind, string> = {
  door: 'A gap in a wall with a door: a thin line for the door leaf and a quarter-circle arc showing its swing.',
  window: 'A gap in a wall filled with thin parallel lines or a thin rectangle: a window.',
  opening: 'A plain gap in a wall with nothing drawn in it: an open doorway.',
  none: 'An unbroken wall, with no gap.',
}

/** Any string that cannot occur in the instructions by accident; Jev swaps it for the image. */
const IMAGE_REF = 'crop-image-5d1e8a'

/** The request body that asks what the gap at the centre of a crop of the plan is. `pngBase64` has no data: prefix. */
export function gapQuestion(pngBase64: string) {
  return {
    model: 'jev-latest',
    state: { crop: IMAGE_REF },
    assets: { [IMAGE_REF]: { type: 'image', format: 'png', data_base64: pngBase64 } },
    questions: {
      kind: {
        type: 'choice',
        instructions:
          'The image `crop` is part of an architectural floor plan. Thick black lines are walls. What does the crop show at its centre?',
        criteria: KINDS,
      },
    },
  }
}

/** Jev needs this header on any request that carries an image. */
export const IMAGE_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' }

/** The answer in Jev's reply, or null if the reply is not what `gapQuestion` asks for. */
export function parseGapAnswer(reply: unknown): GapAnswer | null {
  const answer = (reply as { answers?: { kind?: { choice?: unknown; confidence?: unknown } } } | null)?.answers?.kind
  if (!answer || typeof answer.choice !== 'string' || !(answer.choice in KINDS)) return null
  const { confidence } = answer
  if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return null
  return { kind: answer.choice as GapKind, confidence }
}
