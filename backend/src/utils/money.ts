/**
 * Formats/rounds a number to 2 decimal places deterministically.
 * Uses Number.EPSILON to avoid floating point precision issues.
 */
export const round2 = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
