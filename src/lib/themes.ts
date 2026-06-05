/**
 * Terminal color themes for SVG/PNG rendering
 *
 * Each theme defines the 16 ANSI colors (0-7 standard, 8-15 bright)
 * plus background and foreground colors.
 */

/**
 * A terminal color theme defining the palette for rendered output.
 */
export interface Theme {
  /** Theme identifier (e.g., "one-dark", "dracula") */
  name: string;

  /** Whether this is a dark or light theme */
  type: "dark" | "light";

  /** Brief description of the theme */
  description: string;

  /** Usage tip for when to use this theme */
  tip?: string;

  /**
   * The 16 ANSI colors: indices 0-7 are standard colors (black, red, green,
   * yellow, blue, magenta, cyan, white), indices 8-15 are their bright variants.
   */
  ansiColors: [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string
  ];

  /** Terminal background color */
  background: string;

  /** Default text color */
  foreground: string;
}

export const oneDark: Theme = {
  name: "one-dark",
  type: "dark",
  description: "Dark theme with muted, balanced colors",
  tip: "Works well for most use cases",
  ansiColors: [
    "#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
    "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff",
  ],
  background: "#282c34",
  foreground: "#abb2bf",
};

export const oneLight: Theme = {
  name: "one-light",
  type: "light",
  description: "Light theme with clean, readable colors",
  tip: "Good for presentations and light mode screenshots",
  ansiColors: [
    "#000000", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#a0a1a7",
    "#5c6370", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#ffffff",
  ],
  background: "#fafafa",
  foreground: "#383a42",
};

export const dracula: Theme = {
  name: "dracula",
  type: "dark",
  description: "Dark purple theme with vibrant colors",
  tip: "Popular with developers, good for a more colorful look",
  ansiColors: [
    "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
  ],
  background: "#282a36",
  foreground: "#f8f8f2",
};

export const solarizedDark: Theme = {
  name: "solarized-dark",
  type: "dark",
  description: "Dark blue-green theme, easy on the eyes",
  tip: "Designed for long coding sessions with reduced eye strain",
  ansiColors: [
    "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
    "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
  ],
  background: "#002b36",
  foreground: "#839496",
};

export const nord: Theme = {
  name: "nord",
  type: "dark",
  description: "Arctic-inspired theme with cool blue tones",
  tip: "Clean and modern aesthetic",
  ansiColors: [
    "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
    "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
  ],
  background: "#2e3440",
  foreground: "#d8dee9",
};

export const themes: Record<string, Theme> = {
  "one-dark": oneDark,
  "one-light": oneLight,
  "dracula": dracula,
  "solarized-dark": solarizedDark,
  "nord": nord,
};

export const DEFAULT_THEME = "one-dark";

export function getTheme(name: string): Theme {
  const theme = themes[name];
  if (!theme) {
    const available = Object.keys(themes).join(", ");
    throw new Error(`Unknown theme "${name}". Available: ${available}`);
  }
  return theme;
}

/** Get a formatted list of available themes with descriptions */
export function getThemeList(): string {
  return Object.values(themes)
    .map(t => `- ${t.name}: ${t.description}${t.tip ? ` (${t.tip})` : ""}`)
    .join("\n");
}

/** Get theme names grouped by type */
export function getThemesByType(): { dark: string[]; light: string[] } {
  const dark = Object.values(themes).filter(t => t.type === "dark").map(t => t.name);
  const light = Object.values(themes).filter(t => t.type === "light").map(t => t.name);
  return { dark, light };
}
