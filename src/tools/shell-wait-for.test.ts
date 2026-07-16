import { bufferSatisfies } from "./shell-wait-for.js";

describe("bufferSatisfies", () => {
  it("passes when no conditions are given", () => {
    expect(bufferSatisfies("anything", {})).toBe(true);
  });

  it("requires pattern to match", () => {
    expect(bufferSatisfies("bash-5.2$ ", { pattern: "\\$ $" })).toBe(true);
    expect(bufferSatisfies("still running...", { pattern: "\\$ $" })).toBe(false);
  });

  it("requires absent pattern to be absent", () => {
    const busy = "✳ Churned for 12s · esc to interrupt";
    const idle = "response text\n> ";
    const absentPattern = "esc to interrupt| for \\d+s";
    expect(bufferSatisfies(busy, { absentPattern })).toBe(false);
    expect(bufferSatisfies(idle, { absentPattern })).toBe(true);
  });

  it("matches spinner shape regardless of the gerund", () => {
    const absentPattern = " for \\d+s";
    for (const verb of ["Churned", "Cooked", "Brewed", "Percolated"]) {
      expect(bufferSatisfies(`✳ ${verb} for 34s`, { absentPattern })).toBe(false);
    }
  });

  it("combines pattern and absent pattern", () => {
    const conditions = { pattern: "> $", absentPattern: "esc to interrupt" };
    expect(bufferSatisfies("done\n> ", conditions)).toBe(true);
    expect(bufferSatisfies("done, esc to interrupt\n> ", conditions)).toBe(false);
    expect(bufferSatisfies("no prompt here", conditions)).toBe(false);
  });
});
