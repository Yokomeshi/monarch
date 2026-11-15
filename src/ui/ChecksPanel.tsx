import { useStore } from '../store'
import { useClashes } from '../useClashes'
import { LIBRARY, type PlacedObject } from '../model/objects'
import type { Clash } from '../model/clash'

/** Layout problems: furniture that runs into other furniture, a wall, or the swing of a door. */
export function ChecksPanel() {
  const objects = useStore((s) => s.objects)
  const models = useStore((s) => s.models)
  const selectObject = useStore((s) => s.selectObject)
  const clashes = useClashes()
  if (objects.length === 0) return null

  const name = (id: string) => {
    const o = objects.find((x) => x.id === id) as PlacedObject
    return o.kind === 'model' ? (models[o.modelId!]?.name ?? 'Model') : LIBRARY[o.kind].name
  }
  const describe = ({ kind, ids }: Clash) =>
    kind === 'furniture-furniture'
      ? `${name(ids[0])} overlaps ${name(ids[1]).toLowerCase()}`
      : kind === 'furniture-wall'
        ? `${name(ids[0])} runs into a wall`
        : `${name(ids[0])} blocks a door`

  return (
    <section>
      <h2>Checks</h2>
      {clashes.length === 0 ? (
        <p className="hint" data-testid="checks-ok">
          No problems found.
        </p>
      ) : (
        <>
          <ul className="checks" data-testid="checks">
            {clashes.map((clash) => (
              <li key={`${clash.kind}:${clash.ids.join(':')}`}>
                <button onClick={() => selectObject(clash.ids[0])}>{describe(clash)}</button>
              </li>
            ))}
          </ul>
          <p className="hint">Click a problem to select the piece. Pieces with a problem are outlined in red.</p>
        </>
      )}
    </section>
  )
}
