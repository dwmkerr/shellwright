import type { Theme } from "../themes.js";

/** Result of applying a border style to terminal content. */
export interface BorderResult {
  /** Total outer width including border chrome */
  width: number;
  /** Total outer height including border chrome */
  height: number;
  /** SVG transform string for the <g> wrapping terminal content */
  contentTransform: string;
  /** SVG <defs> elements (filters, gradients, etc.) */
  defs: string;
  /** SVG elements rendered before (below) terminal content */
  beforeContent: string;
  /** SVG elements rendered after (above) terminal content */
  afterContent: string;
}

/** A function that wraps terminal content with border decorations. */
export type BorderFunction = (
  innerWidth: number,
  innerHeight: number,
  theme: Theme,
  title?: string
) => BorderResult;
