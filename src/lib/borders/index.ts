export type { BorderResult, BorderFunction } from "./types.js";
export { macosBorder } from "./macos.js";

import type { BorderFunction } from "./types.js";
import { macosBorder } from "./macos.js";

const borders: Record<string, BorderFunction> = {
  macos: macosBorder,
};

export function getBorder(style: string): BorderFunction {
  const fn = borders[style];
  if (!fn) {
    const available = Object.keys(borders).join(", ");
    throw new Error(`Unknown border style "${style}". Available: ${available}`);
  }
  return fn;
}
