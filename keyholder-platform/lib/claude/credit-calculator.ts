// Anthropic pricing: $3/M input tokens, $15/M output tokens
// 1 credit ≈ $0.02
const COST_PER_INPUT_TOKEN = 3 / 1_000_000 // $0.000003
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000 // $0.000015
const COST_PER_CREDIT = 0.02 // $0.02
const MIN_CREDITS_PER_TURN = 0.5

export function calculateCreditsUsed(
  tokensIn: number,
  tokensOut: number
): number {
  const totalCost =
    tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN
  const credits = totalCost / COST_PER_CREDIT

  return Math.max(MIN_CREDITS_PER_TURN, Math.ceil(credits * 2) / 2) // Round up to nearest 0.5
}

export function estimateCredits(description: string): number {
  // Rough estimates for different action types
  if (description.includes('report')) return 1
  if (description.includes('edge_function')) return 2
  if (description.includes('custom_page')) return 3
  return 0.5
}
