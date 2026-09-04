export interface NamedConstant {
  label: string;
  value: number;
  tolerance?: number;
}

export const DEFAULT_NAMED_CONSTANTS: readonly NamedConstant[] = [
  // { label: 'π', value: Math.PI },
  { label: 'φ', value: (1 + Math.sqrt(5)) / 2 },
  { label: '√2', value: Math.SQRT2 },
];

export function nearestFraction(
  value: number,
  maxNumerator: number = 21,
  maxDenominator: number = 16,
  namedConstants: ReadonlyArray<NamedConstant> = DEFAULT_NAMED_CONSTANTS,
): string {
  const denominatorLimit = Math.max(1, Math.floor(maxDenominator));
  const numeratorLimit = Math.max(1, Math.floor(maxNumerator));

  let bestNumerator = Math.round(value);
  bestNumerator = Math.max(-numeratorLimit, Math.min(numeratorLimit, bestNumerator));

  let bestDenominator = 1;
  let smallestError = Math.abs(value - bestNumerator / bestDenominator);

  for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
    const idealNumerator = Math.round(value * denominator);
    const numerator = Math.max(-numeratorLimit, Math.min(numeratorLimit, idealNumerator));
    const error = Math.abs(value - numerator / denominator);

    if (error < smallestError) {
      bestNumerator = numerator;
      bestDenominator = denominator;
      smallestError = error;
    }
  }

  const fraction = `${bestNumerator}/${bestDenominator}`;
  const isExact = smallestError < 0.001;
  const isVeryClose = smallestError < 0.01;

  const defaultConstantTolerance = 0.005;
  type NamedMatch = { expression: string; error: number; tolerance: number };
  const namedCandidates: NamedMatch[] = [];

  const usableConstants = namedConstants.filter(
    (constant) => Number.isFinite(constant.value) && !!constant.label?.trim() && constant.value !== 0,
  );

  for (const constant of usableConstants) {
    const label = constant.label.trim();
    const constantTolerance = constant.tolerance ?? defaultConstantTolerance;

    // value ≈ constant
    namedCandidates.push({
      expression: label,
      error: Math.abs(value - constant.value),
      tolerance: constantTolerance,
    });

    // value ≈ integer / constant
    for (let numerator = -numeratorLimit; numerator <= numeratorLimit; numerator++) {
      const approx = numerator / constant.value;
      namedCandidates.push({
        expression: `${numerator}/${label}`,
        error: Math.abs(value - approx),
        tolerance: constantTolerance,
      });
    }

    // value ≈ constant / integer
    for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
      const approx = constant.value / denominator;
      namedCandidates.push({
        expression: `${label}/${denominator}`,
        error: Math.abs(value - approx),
        tolerance: constantTolerance,
      });
    }
  }

  const nearestNamedMatch = namedCandidates.sort((a, b) => a.error - b.error)[0];
  const maybeNamedTag = nearestNamedMatch && nearestNamedMatch.error <= nearestNamedMatch.tolerance
    ? nearestNamedMatch.expression
    : '';
  const absoluteImprovement = nearestNamedMatch ? (smallestError - nearestNamedMatch.error) : 0;
  const relativeImprovement = nearestNamedMatch && smallestError > 0
    ? absoluteImprovement / smallestError
    : 0;

  // Require a meaningful improvement over the fraction to prefer the named constant, to avoid cluttering with named tags that are only slightly better than a simple fraction
  const isNamedBetterThanFraction = !!nearestNamedMatch
    && absoluteImprovement > 0.002
    && relativeImprovement > 0.25;

  if (maybeNamedTag && isNamedBetterThanFraction) {
    if (nearestNamedMatch.error < 0.001) return maybeNamedTag;
    if (nearestNamedMatch.error < 0.01) return `≈ ${maybeNamedTag}`;
    return `~ ${maybeNamedTag}`;
  }

  if (isExact) return fraction;
  if (isVeryClose) return `≈ ${fraction}`;
  return `~ ${fraction}`; // rough approximation
}

// like nearestFraction but for ratios well below 1 (e.g. 1/72), where the standard denominator
// limit collapses everything to 0/1: larger denominator limit, reciprocal always a candidate,
// and closeness judged relative to the value rather than absolutely.
export function nearestSmallFraction(
  value: number,
  maxNumerator: number = 12,
  maxDenominator: number = 400,
  namedConstants: ReadonlyArray<NamedConstant> = DEFAULT_NAMED_CONSTANTS,
): string {
  if (!Number.isFinite(value) || value === 0) return '0/1';

  const signPrefix = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  const numeratorLimit = Math.max(1, Math.floor(maxNumerator));
  const denominatorLimit = Math.max(1, Math.floor(maxDenominator));

  type Candidate = { numerator: number; denominator: number; error: number };
  const candidates: Candidate[] = [];

  const addCandidate = (rawNumerator: number, rawDenominator: number) => {
    if (rawNumerator < 1 || rawDenominator < 1 || !Number.isFinite(rawDenominator)) return;
    const divisor = greatestCommonDivisor(rawNumerator, rawDenominator);
    const numerator = rawNumerator / divisor;
    const denominator = rawDenominator / divisor;
    candidates.push({
      numerator,
      denominator,
      error: Math.abs(magnitude - numerator / denominator) / magnitude,
    });
  };

  // the reciprocal is unbounded by the denominator limit, so 1/5000 still reads as 1/5000
  addCandidate(1, Math.round(1 / magnitude));

  // simplest first, so the search below can stop at the first fraction that is close enough
  for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
    addCandidate(Math.min(numeratorLimit, Math.round(magnitude * denominator)), denominator);
  }

  // simplest candidate within budget wins over the outright closest, so 0.0138 reads "≈ 1/72" not "2/145"
  const simplicityBudget = 0.01;
  const best = candidates.find((candidate) => candidate.error <= simplicityBudget)
    ?? candidates.reduce((a, b) => (b.error < a.error - 1e-12 ? b : a));

  const fraction = `${signPrefix}${best.numerator}/${best.denominator}`;
  const smallestError = best.error;
  const isExact = smallestError < 0.001;
  const isVeryClose = smallestError < simplicityBudget;

  const defaultConstantTolerance = 0.005;
  type NamedMatch = { expression: string; error: number; tolerance: number };
  const namedCandidates: NamedMatch[] = [];

  const usableConstants = namedConstants.filter(
    (constant) => Number.isFinite(constant.value) && !!constant.label?.trim() && constant.value > 0,
  );

  // named forms stay on small integers — φ/117 lands near anything you like and reads as nothing
  const namedDenominatorLimit = Math.min(denominatorLimit, 16);

  for (const constant of usableConstants) {
    const label = constant.label.trim();
    const constantTolerance = constant.tolerance ?? defaultConstantTolerance;

    for (let denominator = 1; denominator <= namedDenominatorLimit; denominator++) {
      namedCandidates.push({
        expression: `${label}/${denominator}`,
        error: Math.abs(magnitude - constant.value / denominator) / magnitude,
        tolerance: constantTolerance,
      });

      namedCandidates.push({
        expression: denominator === 1 ? `1/${label}` : `1/(${denominator}${label})`,
        error: Math.abs(magnitude - 1 / (denominator * constant.value)) / magnitude,
        tolerance: constantTolerance,
      });
    }
  }

  const nearestNamedMatch = namedCandidates.sort((a, b) => a.error - b.error)[0];
  const maybeNamedTag = nearestNamedMatch && nearestNamedMatch.error <= nearestNamedMatch.tolerance
    ? `${signPrefix}${nearestNamedMatch.expression}`
    : '';
  // measured against the closest fraction, not the simplest one the budget settled on
  const closestError = candidates.reduce((a, b) => (b.error < a.error ? b : a)).error;
  const absoluteImprovement = nearestNamedMatch ? (closestError - nearestNamedMatch.error) : 0;
  const relativeImprovement = nearestNamedMatch && closestError > 0
    ? absoluteImprovement / closestError
    : 0;

  // same gate as nearestFraction: a named tag has to beat the plain fraction by a real margin
  const isNamedBetterThanFraction = !!nearestNamedMatch
    && absoluteImprovement > 0.002
    && relativeImprovement > 0.25;

  if (maybeNamedTag && isNamedBetterThanFraction) {
    if (nearestNamedMatch.error < 0.001) return maybeNamedTag;
    if (nearestNamedMatch.error < 0.01) return `≈ ${maybeNamedTag}`;
    return `~ ${maybeNamedTag}`;
  }

  if (isExact) return fraction;
  if (isVeryClose) return `≈ ${fraction}`;
  return `~ ${fraction}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}
