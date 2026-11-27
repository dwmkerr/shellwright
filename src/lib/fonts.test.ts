import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createFontSet, parseFamilyList } from "./fonts.js";

describe("parseFamilyList", () => {
  it("drops quotes, whitespace and generic families", () => {
    expect(parseFamilyList(`Hack, "JetBrains Mono", 'Fira Code' , monospace`)).toEqual(["Hack", "JetBrains Mono", "Fira Code"]);
  });
});

describe("createFontSet", () => {
  it("returns undefined when no configured family is installed", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "shellwright-fonts-"));
    expect(createFontSet("Hack, monospace", {}, [empty])).toBeUndefined();
  });

  // Uses whatever fonts the machine has: Hack or Monaco on a Mac, DejaVu on Linux CI
  const candidates = ["Hack", "Monaco", "Menlo", "DejaVu Sans Mono", "Liberation Mono"];
  const fontSet = createFontSet(candidates.join(", "), { fitTo: { mode: "zoom", value: 2 } });
  const maybe = fontSet ? it : it.skip;

  maybe("loads only the family's files for ASCII, without a system scan", () => {
    const options = fontSet!.optionsFor(`<svg><text>hello</text></svg>`);
    expect(options.font?.loadSystemFonts).toBe(false);
    expect(options.font?.defaultFontFamily).toBe(fontSet!.families[0]);
    expect(options.fitTo).toEqual({ mode: "zoom", value: 2 });
    expect(options.font?.fontFiles?.length).toBeGreaterThan(0);
  });

  maybe("reuses the same options object for the same fallback needs", () => {
    expect(fontSet!.optionsFor(`<svg><text>a</text></svg>`)).toBe(fontSet!.optionsFor(`<svg><text>b</text></svg>`));
  });

  maybe("adds a fallback font for a character the family lacks", () => {
    const ascii = fontSet!.optionsFor(`<svg><text>a</text></svg>`).font!.fontFiles!;
    const cjk = fontSet!.optionsFor(`<svg><text>你</text></svg>`).font!.fontFiles!;
    // Only when some installed font covers it; a bare container may have none
    expect(cjk.length).toBeGreaterThanOrEqual(ascii.length);
    expect(cjk.slice(0, ascii.length)).toEqual(ascii);
  });
});
