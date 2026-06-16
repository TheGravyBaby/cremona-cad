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
