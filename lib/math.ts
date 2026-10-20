/**
 * Evaluates an arithmetic expression or formula string (e.g. `=(40-(40*0.2))`, `=43*277`).
 * Supports:
 * - Parentheses and nested operator precedence: `(40-(40*0.2))`
 * - Optional leading `=`: `=(40-(40*0.2))` or `40-(40*0.2)`
 * - Percentage shorthand: `20%` -> `(20/100)`
 * - Formatted numbers with commas: `1,000 - 200` -> `800`
 * - Multiplication with `x` or `X`: `40 x 5` -> `200`
 * - Exponents with `^`: `2^3` -> `8`
 * - Safe numeric rounding to eliminate floating point drift (e.g. `0.1 + 0.2` -> `0.3`)
 */
export function evaluateExpression(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  let source = String(raw).trim();
  if (!source) return 0;

  // If already a pure finite number and doesn't contain formula characters
  if (!isNaN(Number(source)) && !source.includes("=")) {
    return Number(source);
  }

  // Remove leading equals sign if present
  if (source.startsWith("=")) {
    source = source.slice(1).trim();
  }

  // Handle commas in numbers like 1,000 -> 1000
  source = source.replace(/(\d),(\d)/g, "$1$2");

  // Support "x" or "X" as multiplication: e.g. 40 x 5 -> 40 * 5
  source = source.replace(/(\d|\))\s*[xX]\s*(\d|\()/g, "$1*$2");

  // Support percentage: e.g. 20% -> (20/100)
  source = source.replace(/([0-9.]+)\s*%/g, "($1/100)");

  // Support ^ for power: e.g. 2^3 -> 2**3
  source = source.replace(/\^/g, "**");

  // Remove spaces
  source = source.replace(/\s+/g, "");

  // Safety check: only allow digits, arithmetic operators (+, -, *, /), parentheses, and decimal points
  if (!/^[0-9+\-*/().]+$/.test(source)) {
    const num = Number(source);
    return Number.isFinite(num) ? num : 0;
  }

  try {
    const fn = new Function(`"use strict"; return (${source})`);
    const result = fn();
    if (typeof result === "number" && Number.isFinite(result)) {
      // Round to 5 decimal places to eliminate IEEE floating point drift
      return Math.round(result * 100000) / 100000;
    }
    return 0;
  } catch {
    const fallback = Number(source);
    return Number.isFinite(fallback) ? fallback : 0;
  }
}
