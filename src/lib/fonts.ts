import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Resvg, ResvgRenderOptions } from "@resvg/resvg-js";

// resvg rebuilds its font database on every `new Resvg()`. With
// `loadSystemFonts: true` that is a scan of every system font, about two
// seconds per render on a Mac. Instead the system fonts are indexed once here,
// and each render loads only the configured family plus the fallback fonts that
// cover characters the family lacks, so output matches a full system scan.

interface Face {
  file: string;
  family: string;
  cmapOffset: number;
  /** Colour bitmap glyphs only (Apple Color Emoji, Noto Color Emoji), which resvg draws as nothing. */
  bitmapOnly: boolean;
  ranges?: Array<[number, number]>;
}

const GENERIC_FAMILIES = new Set(["monospace", "serif", "sans-serif", "cursive", "fantasy", "system-ui"]);

function systemFontDirs(): string[] {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return ["/Library/Fonts", "/System/Library/Fonts", "/Network/Library/Fonts", path.join(home, "Library/Fonts")];
  }
  if (process.platform === "win32") {
    const windir = process.env.WINDIR || "C:\\Windows";
    return [path.join(windir, "Fonts"), path.join(process.env.LOCALAPPDATA || "", "Microsoft/Windows/Fonts")];
  }
  return ["/usr/share/fonts", "/usr/local/share/fonts", path.join(home, ".local/share/fonts"), path.join(home, ".fonts")];
}

function listFontFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFontFiles(full, out);
    else if (/\.(ttf|otf|ttc|otc)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function read(fd: number, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  const n = fs.readSync(fd, buf, 0, length, offset);
  return n === length ? buf : buf.subarray(0, n);
}

function decodeName(platformId: number, raw: Buffer): string {
  if (platformId === 1) return raw.toString("latin1");
  let s = "";
  for (let i = 0; i + 1 < raw.length; i += 2) s += String.fromCharCode(raw.readUInt16BE(i));
  return s;
}

function readFamily(fd: number, nameOffset: number): string | undefined {
  const header = read(fd, nameOffset, 6);
  const count = header.readUInt16BE(2);
  const stringOffset = header.readUInt16BE(4);
  const records = read(fd, nameOffset + 6, count * 12);
  let family: string | undefined;
  let typographic: string | undefined;
  for (let i = 0; i + 12 <= records.length; i += 12) {
    const platformId = records.readUInt16BE(i);
    const languageId = records.readUInt16BE(i + 4);
    const nameId = records.readUInt16BE(i + 6);
    if (nameId !== 1 && nameId !== 16) continue;
    // English names only: Windows en-US, or Mac/Unicode language 0
    if (platformId === 3 && languageId !== 0x409) continue;
    if (platformId !== 3 && languageId !== 0) continue;
    const length = records.readUInt16BE(i + 8);
    const offset = records.readUInt16BE(i + 10);
    const value = decodeName(platformId, read(fd, nameOffset + stringOffset + offset, length));
    if (nameId === 16) typographic ??= value;
    else family ??= value;
  }
  return typographic ?? family;
}

function readFaces(file: string): Face[] {
  const fd = fs.openSync(file, "r");
  try {
    const head = read(fd, 0, 12);
    if (head.length < 12) return [];
    const offsets: number[] = [];
    if (head.toString("latin1", 0, 4) === "ttcf") {
      const numFonts = head.readUInt32BE(8);
      const table = read(fd, 12, numFonts * 4);
      for (let i = 0; i + 4 <= table.length; i += 4) offsets.push(table.readUInt32BE(i));
    } else {
      offsets.push(0);
    }

    const faces: Face[] = [];
    for (const offset of offsets) {
      const numTables = read(fd, offset + 4, 2).readUInt16BE(0);
      const dir = read(fd, offset + 12, numTables * 16);
      let nameOffset = -1;
      let cmapOffset = -1;
      let bitmapOnly = false;
      for (let i = 0; i + 16 <= dir.length; i += 16) {
        const tag = dir.toString("latin1", i, i + 4);
        if (tag === "name") nameOffset = dir.readUInt32BE(i + 8);
        if (tag === "cmap") cmapOffset = dir.readUInt32BE(i + 8);
        if (tag === "sbix" || tag === "CBDT") bitmapOnly = true;
      }
      if (nameOffset < 0 || cmapOffset < 0) continue;
      const family = readFamily(fd, nameOffset);
      if (family) faces.push({ file, family, cmapOffset, bitmapOnly });
    }
    return faces;
  } finally {
    fs.closeSync(fd);
  }
}

function readCoverage(face: Face): Array<[number, number]> {
  const fd = fs.openSync(face.file, "r");
  try {
    const header = read(fd, face.cmapOffset, 4);
    const numTables = header.readUInt16BE(2);
    const records = read(fd, face.cmapOffset + 4, numTables * 8);
    let best: { offset: number; score: number } | undefined;
    for (let i = 0; i + 8 <= records.length; i += 8) {
      const platformId = records.readUInt16BE(i);
      const encodingId = records.readUInt16BE(i + 2);
      const offset = face.cmapOffset + records.readUInt32BE(i + 4);
      const format = read(fd, offset, 2).readUInt16BE(0);
      const unicode = platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
      if (!unicode || (format !== 4 && format !== 12)) continue;
      // Format 12 covers characters beyond the BMP, so prefer it
      const score = format === 12 ? 2 : 1;
      if (!best || score > best.score) best = { offset, score };
    }
    if (!best) return [];

    const ranges: Array<[number, number]> = [];
    if (best.score === 2) {
      const numGroups = read(fd, best.offset + 12, 4).readUInt32BE(0);
      const groups = read(fd, best.offset + 16, numGroups * 12);
      for (let i = 0; i + 12 <= groups.length; i += 12) {
        ranges.push([groups.readUInt32BE(i), groups.readUInt32BE(i + 4)]);
      }
    } else {
      const length = read(fd, best.offset + 2, 2).readUInt16BE(0);
      const table = read(fd, best.offset, length);
      const segCount = table.readUInt16BE(6) / 2;
      const ends = 14;
      const starts = ends + segCount * 2 + 2;
      const deltas = starts + segCount * 2;
      const rangeOffsets = deltas + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const end = table.readUInt16BE(ends + s * 2);
        const start = table.readUInt16BE(starts + s * 2);
        if (start === 0xffff) continue;
        const rangeOffset = table.readUInt16BE(rangeOffsets + s * 2);
        if (rangeOffset === 0) {
          ranges.push([start, end]);
          continue;
        }
        // Glyph ids come from glyphIdArray here, and 0 there means "no glyph"
        for (let c = start; c <= end; c++) {
          const at = rangeOffsets + s * 2 + rangeOffset + (c - start) * 2;
          if (at + 2 <= table.length && table.readUInt16BE(at) !== 0) ranges.push([c, c]);
        }
      }
    }
    return ranges.sort((a, b) => a[0] - b[0]);
  } finally {
    fs.closeSync(fd);
  }
}

function covers(face: Face, codepoint: number): boolean {
  face.ranges ??= readCoverage(face);
  const ranges = face.ranges;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (codepoint < ranges[mid][0]) hi = mid - 1;
    else if (codepoint > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

export function parseFamilyList(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => f && !GENERIC_FAMILIES.has(f.toLowerCase()));
}

export interface FontSet {
  /** Families from the configured list that were found, in order. */
  families: string[];
  /** Render options for an SVG: the family's files plus fallbacks for its characters. */
  optionsFor(svg: string): ResvgRenderOptions;
}

/**
 * Index fonts once and resolve `fontFamily` (a CSS font-family list) to files.
 * Returns undefined when none of the families is installed, so the caller can
 * keep resvg's own system font lookup.
 */
export function createFontSet(fontFamily: string, base: ResvgRenderOptions, dirs = systemFontDirs()): FontSet | undefined {
  const files = [...new Set(dirs.flatMap((d) => listFontFiles(d)))];
  const faces: Face[] = [];
  for (const file of files) {
    try {
      faces.push(...readFaces(file));
    } catch {
      // A damaged or unsupported font file is skipped, as resvg skips it
    }
  }

  const wanted = parseFamilyList(fontFamily);
  const families = wanted.filter((w) => faces.some((f) => f.family.toLowerCase() === w.toLowerCase()));
  if (families.length === 0) return undefined;

  const primary = faces.filter((f) => families.some((w) => w.toLowerCase() === f.family.toLowerCase()));
  const primaryFiles = [...new Set(primary.map((f) => f.file))];
  // Apple's LastResort covers every codepoint with a placeholder box, so it is
  // only the fallback of last resort, as its name says. Bitmap-only fonts would
  // win the lookup for emoji and symbols and then draw nothing.
  const fallbacks = [
    ...faces.filter((f) => !primaryFiles.includes(f.file) && !f.bitmapOnly && f.family !== "LastResort"),
    ...faces.filter((f) => f.family === "LastResort"),
  ];

  const fallbackFor = new Map<number, string | null>();
  const optionsCache = new Map<string, ResvgRenderOptions>();

  function fallbackFile(codepoint: number): string | null {
    let file = fallbackFor.get(codepoint);
    if (file !== undefined) return file;
    file = primary.some((f) => covers(f, codepoint)) ? null : (fallbacks.find((f) => covers(f, codepoint))?.file ?? null);
    fallbackFor.set(codepoint, file);
    return file;
  }

  return {
    families,
    optionsFor(svg: string): ResvgRenderOptions {
      const extra = new Set<string>();
      const seen = new Set<number>();
      for (const ch of svg) {
        const cp = ch.codePointAt(0)!;
        // Markup and escapes are ASCII, which any terminal font covers
        if (cp < 0x80 || seen.has(cp)) continue;
        seen.add(cp);
        const file = fallbackFile(cp);
        if (file) extra.add(file);
      }
      const key = [...extra].sort().join("\n");
      let options = optionsCache.get(key);
      if (!options) {
        options = {
          ...base,
          font: {
            loadSystemFonts: false,
            fontFiles: [...primaryFiles, ...[...extra].sort()],
            defaultFontFamily: families[0],
            monospaceFamily: families[0],
          },
        };
        optionsCache.set(key, options);
      }
      return options;
    },
  };
}

export type PngRenderer = (svg: string) => Buffer;

export function createPngRenderer(fontFamily: string, log: (message: string) => void): PngRenderer {
  const base: ResvgRenderOptions = { fitTo: { mode: "zoom", value: 2 } };
  const started = Date.now();
  const fontSet = createFontSet(fontFamily, base);
  if (fontSet) {
    log(`[shellwright] Fonts indexed in ${Date.now() - started}ms, using ${fontSet.families.join(", ")}`);
    return (svg) => new Resvg(svg, fontSet.optionsFor(svg)).render().asPng();
  }
  // None of the families is installed: let resvg search all system fonts on
  // each render, which is slow but finds whatever it can
  log(`[shellwright] WARNING: none of "${fontFamily}" is installed; rendering will scan system fonts each time and be slow`);
  const options: ResvgRenderOptions = { ...base, font: { loadSystemFonts: true } };
  return (svg) => new Resvg(svg, options).render().asPng();
}
