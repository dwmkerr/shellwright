# Video Export (MPEG/MP4)

## Status: Not Started

## Goal

Add video export (MP4/MOV) to `shell_record_stop` using ffmpeg.

## Approach

```javascript
// In shell_record_stop, detect format from extension
if (output.endsWith(".mp4") || output.endsWith(".mov")) {
  await renderVideo(framesDir, outputPath, { fps });
}
```

```typescript
// src/lib/render-video.ts
export async function renderVideo(framesDir: string, output: string, opts: { fps: number }) {
  // Check ffmpeg is available
  // ffmpeg -framerate {fps} -i frame%06d.png -c:v libx264 -pix_fmt yuv420p output.mp4
}
```

## Requirements

- ffmpeg must be installed on the system
- Throw helpful error if ffmpeg not found
- Support .mp4 and .mov extensions
- Clean up temp frames after encoding
