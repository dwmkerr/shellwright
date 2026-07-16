/**
 * Render PNG frames to animated GIF using gifenc
 */

import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export interface RenderGifOptions {
  fps?: number;
  loop?: number; // 0 = infinite
  holdLastMs?: number; // extra display time for the final frame
}

export interface RenderGifResult {
  frameCount: number;
  duplicatesSkipped: number;
  durationMs: number;
}

function computeFrameHash(data: Uint8Array): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Render a directory of PNG frames to an animated GIF
 */
export async function renderGif(
  framesDir: string,
  outputPath: string,
  options: RenderGifOptions = {}
): Promise<RenderGifResult> {
  const { Jimp } = await import("jimp");

  const fps = options.fps || 10;
  const delay = Math.round(1000 / fps);

  const files = await fs.readdir(framesDir);
  const pngFiles = files
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });

  if (pngFiles.length === 0) {
    throw new Error(`No PNG frames found in ${framesDir}`);
  }

  // Read first frame to get dimensions
  const firstFramePath = path.join(framesDir, pngFiles[0]);
  const firstImage = await Jimp.read(firstFramePath);
  const width = firstImage.width;
  const height = firstImage.height;

  const gif = GIFEncoder();

  let framesWritten = 0;
  let duplicatesSkipped = 0;
  let totalDurationMs = 0;

  let lastFrameHash: string | null = null;
  let pendingFrame: {
    indexed: Uint8Array;
    palette: number[][];
    accumulatedDelay: number;
  } | null = null;

  for (const file of pngFiles) {
    const framePath = path.join(framesDir, file);
    const image = await Jimp.read(framePath);
    const rgba = new Uint8Array(image.bitmap.data);

    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    const frameHash = computeFrameHash(rgba);

    if (frameHash === lastFrameHash && pendingFrame) {
      pendingFrame.accumulatedDelay += delay;
      duplicatesSkipped++;
    } else {
      if (pendingFrame) {
        gif.writeFrame(pendingFrame.indexed, width, height, {
          palette: pendingFrame.palette,
          delay: pendingFrame.accumulatedDelay,
        });
        totalDurationMs += pendingFrame.accumulatedDelay;
        framesWritten++;
      }
      pendingFrame = { indexed, palette, accumulatedDelay: delay };
      lastFrameHash = frameHash;
    }
  }

  if (pendingFrame) {
    // Hold the final frame so viewers see the end state before the loop
    // restarts - without this the closing moment flashes past.
    const finalDelay = pendingFrame.accumulatedDelay + (options.holdLastMs || 0);
    gif.writeFrame(pendingFrame.indexed, width, height, {
      palette: pendingFrame.palette,
      delay: finalDelay,
    });
    totalDurationMs += finalDelay;
    framesWritten++;
  }

  gif.finish();

  await fs.writeFile(outputPath, gif.bytes());

  return {
    frameCount: framesWritten,
    duplicatesSkipped,
    durationMs: totalDurationMs,
  };
}
