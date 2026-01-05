#!/usr/bin/env bash
#
# Generate a cycling GIF demo of all themes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
THEMES_DIR="$PROJECT_ROOT/docs/themes"
OUTPUT="$THEMES_DIR/themes-demo.gif"

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is required but not installed."
    echo "Install with: brew install imagemagick"
    exit 1
fi

SVGS=(
    "$THEMES_DIR/one-dark.svg"
    "$THEMES_DIR/one-light.svg"
    "$THEMES_DIR/dracula.svg"
    "$THEMES_DIR/nord.svg"
    "$THEMES_DIR/solarized-dark.svg"
)

echo "Generating theme demo GIF..."
magick -density 200 -delay 300 -loop 0 "${SVGS[@]}" -scale 200% "$OUTPUT"

echo "Created: $OUTPUT"
