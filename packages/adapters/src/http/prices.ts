// Static price table (USD per million tokens) for cost estimation (task 130). Kept in its own
// file so it can be updated without touching adapter logic. Approximate; feeds budgets.maxCostUsd.

export interface PriceEntry {
  inputPerM: number;
  outputPerM: number;
}

const TABLE: Array<{ match: RegExp; price: PriceEntry }> = [
  { match: /:free$/i, price: { inputPerM: 0, outputPerM: 0 } },
  { match: /claude.*opus/i, price: { inputPerM: 15, outputPerM: 75 } },
  { match: /claude.*sonnet/i, price: { inputPerM: 3, outputPerM: 15 } },
  { match: /gpt-5|o\d/i, price: { inputPerM: 5, outputPerM: 15 } },
  { match: /gemini.*pro/i, price: { inputPerM: 1.25, outputPerM: 5 } },
  { match: /deepseek/i, price: { inputPerM: 0.3, outputPerM: 1.1 } },
];
const DEFAULT: PriceEntry = { inputPerM: 1, outputPerM: 3 };

export function priceFor(model: string): PriceEntry {
  return TABLE.find((t) => t.match.test(model))?.price ?? DEFAULT;
}

export function estimateCostUsd(model: string, inputTokens = 0, outputTokens = 0): number {
  const p = priceFor(model);
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}
