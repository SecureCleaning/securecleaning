export interface MatchableOperator {
  id: string
  city: string
  is_verified: boolean
  is_active: boolean
  premises_types?: string[] | null
}

export function getRelevantOperators<T extends MatchableOperator>(
  operators: T[],
  city?: string,
  premisesType?: string
): T[] {
  return operators.filter((operator) => {
    if (!operator.is_active) return false
    if (city && operator.city !== city) return false

    if (premisesType && Array.isArray(operator.premises_types) && operator.premises_types.length > 0) {
      return operator.premises_types.includes(premisesType)
    }

    return true
  })
}
