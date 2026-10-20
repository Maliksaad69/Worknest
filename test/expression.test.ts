import { describe, expect, it } from "vitest";
import { evaluateExpression } from "../lib/math";

describe("Arithmetic Formula & Expression Evaluation", () => {
  it("evaluates =(40-(40*0.2)) to 32 as requested by user", () => {
    const result = evaluateExpression("=(40-(40*0.2))");
    expect(result).toBe(32);
  });

  it("evaluates expressions without leading equals sign", () => {
    expect(evaluateExpression("(40-(40*0.2))")).toBe(32);
    expect(evaluateExpression("40 - 8")).toBe(32);
  });

  it("handles percentages properly", () => {
    expect(evaluateExpression("=(40-(40*20%))")).toBe(32);
    expect(evaluateExpression("=100 * 15%")).toBe(15);
  });

  it("handles comma-formatted numbers", () => {
    expect(evaluateExpression("=1,000 - 200")).toBe(800);
    expect(evaluateExpression("=(2,500 * 2) + 500")).toBe(5500);
  });

  it("handles standard math operations and order of operations", () => {
    expect(evaluateExpression("=43*277")).toBe(11911);
    expect(evaluateExpression("=10 + 20 * 3")).toBe(70);
    expect(evaluateExpression("=(10 + 20) * 3")).toBe(90);
    expect(evaluateExpression("=100 / (2 + 3)")).toBe(20);
    expect(evaluateExpression("=2^3")).toBe(8);
  });

  it("eliminates IEEE floating point inaccuracies", () => {
    expect(evaluateExpression("=0.1 + 0.2")).toBe(0.3);
  });

  it("safely handles regular numbers and fallback inputs", () => {
    expect(evaluateExpression(500)).toBe(500);
    expect(evaluateExpression("500")).toBe(500);
    expect(evaluateExpression("")).toBe(0);
    expect(evaluateExpression(null)).toBe(0);
    expect(evaluateExpression("invalid text")).toBe(0);
    expect(evaluateExpression("=(40-")).toBe(0);
  });
});
