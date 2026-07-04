export type CapacityPrediction =
  | { kind: 'not_approaching' }
  | { kind: 'at_capacity' }
  | { kind: 'days_until_full'; days: number }

// Days-until-godown-is-full prediction for empty cylinder storage, per the
// trailing-14-day net accumulation rate. See
// docs/superpowers/specs/2026-07-04-purchases-godown-inventory-design.md
// ("Prediction: days until godown is full") for the exact formula.
export function predictDaysUntilFull(
  godownCapacity: number,
  emptyCylinders: number,
  netRatePerDay: number,
): CapacityPrediction {
  const remainingCapacity = godownCapacity - emptyCylinders

  if (netRatePerDay <= 0) return { kind: 'not_approaching' }
  if (remainingCapacity <= 0) return { kind: 'at_capacity' }
  return { kind: 'days_until_full', days: Math.ceil(remainingCapacity / netRatePerDay) }
}
