export type LegacySummaryFields = {
  occurrences?: number
  general_arm_occurrences?: number
  general_drug_occurrences?: number
  seized_arms?: number
  drug_weight_grams?: number
  weighted_drug_records?: number
  source_coverage?: Record<string, number>
  occurrence_charts?: Record<'monthly' | 'cities' | 'natures', { name: string; total: number }[]>
}
