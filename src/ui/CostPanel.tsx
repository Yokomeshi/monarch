import { useStore } from '../store'
import { useTakeoff } from '../useTakeoff'
import { estimate, formatMoney, rateForDisplay, rateFromDisplay } from '../model/cost'
import { formatArea } from '../units'

/** A rough cost: the quantities multiplied by unit rates the user sets. */
export function CostPanel() {
  const units = useStore((s) => s.units)
  const hasWalls = useStore((s) => s.walls.length > 0)
  const rates = useStore((s) => s.costRates)
  const setCostRate = useStore((s) => s.setCostRate)
  const takeoff = useTakeoff()
  if (!hasWalls) return null
  const { lines, total } = estimate(takeoff, rates)

  return (
    <section>
      <h2>Cost estimate</h2>
      <table className="cost">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Rate per {units === 'metric' ? 'm²' : 'sq ft'} or each</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key}>
              <th>{line.label}</th>
              <td>{line.unit === 'area' ? formatArea(line.quantity, units) : line.quantity}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="any"
                  aria-label={`${line.label} rate`}
                  // Two decimals: a rate per square foot is a fraction of the stored rate per square metre.
                  value={Number(rateForDisplay(line.rate, line.unit, units).toFixed(2))}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber
                    if (value >= 0) setCostRate(line.key, rateFromDisplay(value, line.unit, units))
                  }}
                />
              </td>
              <td data-testid={`cost-${line.key}`}>{formatMoney(line.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total</th>
            <td data-testid="cost-total">{formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="hint">
        The starting rates are placeholders, not market prices: enter your own. Amounts are in whatever currency the
        rates are in. Furniture is not included.
      </p>
    </section>
  )
}
