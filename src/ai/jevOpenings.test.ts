import { describe, expect, it } from 'vitest'
import { gapQuestion, parseGapAnswer } from './jevOpenings'

// A real reply from Jev 1.14.0 to gapQuestion, for a crop of a door in a synthetic plan.
const DOOR_REPLY = {
  model: 'jev-1.14.0',
  answers: {
    kind: { type: 'choice', choice: 'door', confidence: 0.99, probabilities: { door: 0.99, window: 0, opening: 0.01, none: 0 } },
  },
  usage: { input_tokens: 1302, output_tokens: 22 },
}

describe('gapQuestion', () => {
  const body = gapQuestion('AAAA')

  it('sends the crop once and refers to it from the state', () => {
    const [[ref, asset], ...others] = Object.entries(body.assets)
    expect(others).toEqual([])
    expect(asset).toEqual({ type: 'image', format: 'png', data_base64: 'AAAA' })
    expect(body.state.crop).toBe(ref)
  })

  it('offers the four kinds of gap', () => {
    expect(Object.keys(body.questions.kind.criteria)).toEqual(['door', 'window', 'opening', 'none'])
  })

  it('does not use the image reference by accident in the instructions', () => {
    const [ref] = Object.keys(body.assets)
    expect(JSON.stringify(body.questions)).not.toContain(ref)
  })
})

describe('parseGapAnswer', () => {
  it('reads the choice and its confidence from a real reply', () => {
    expect(parseGapAnswer(DOOR_REPLY)).toEqual({ kind: 'door', confidence: 0.99 })
  })

  it.each([
    ['no answers', {}],
    ['an error body', { error: { message: 'Disallowed CORS origin' } }],
    ['a kind that was not offered', { answers: { kind: { choice: 'stairs', confidence: 0.9 } } }],
    ['no confidence', { answers: { kind: { choice: 'door' } } }],
    ['a confidence outside 0 to 1', { answers: { kind: { choice: 'door', confidence: 7 } } }],
    ['null', null],
    ['text', 'door'],
  ])('rejects %s', (_name, reply) => {
    expect(parseGapAnswer(reply)).toBeNull()
  })
})
