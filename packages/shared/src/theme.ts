/**
 * Colour themes shared by the mobile app and the web UI. A theme is a base mode (light, dark or
 * pure black) plus one accent colour; every other colour is derived from those two so any custom
 * accent stays readable.
 */

export type ThemeMode = 'system' | 'light' | 'dark' | 'black';
export type ResolvedMode = Exclude<ThemeMode, 'system'>;

export interface Appearance {
  mode: ThemeMode;
  /** A preset id (see ACCENT_PRESETS) or a custom "#rrggbb" colour. */
  accent: string;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: 'black', accent: 'mint' };

export const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black' },
];

export interface AccentPreset {
  id: string;
  name: string;
  /** Fill colour. `null` for Mono, which uses the text colour. */
  color: string | null;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'mint', name: 'Mint', color: '#2ee6a6' },
  { id: 'ember', name: 'Ember', color: '#ff5b2e' },
  { id: 'volt', name: 'Volt', color: '#b6f22e' },
  { id: 'grape', name: 'Grape', color: '#8b5cf6' },
  { id: 'rose', name: 'Rose', color: '#f43f72' },
  { id: 'sun', name: 'Sun', color: '#ffb31f' },
  { id: 'ocean', name: 'Ocean', color: '#2f7bf6' },
  { id: 'mono', name: 'Mono', color: null },
];

export interface ThemeColors {
  mode: ResolvedMode;
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  /** Fill colour for primary buttons, selected chips, progress, charts. */
  accent: string;
  /** Text/icon colour on top of `accent` (black or white, whichever reads better). */
  onAccent: string;
  /** Accent as text or an icon on a surface; adjusted until it has enough contrast. */
  accentText: string;
  /** Faint accent tint for selected rows, notes and badges. */
  accentSoft: string;
  success: string;
  danger: string;
  warn: string;
  /** Background of a completed set row. */
  doneRow: string;
}

const BASES: Record<ResolvedMode, Pick<ThemeColors, 'bg' | 'surface' | 'surface2' | 'text' | 'muted' | 'border' | 'success' | 'danger' | 'warn'>> = {
  light: {
    bg: '#f3f3f6',
    surface: '#ffffff',
    surface2: '#ececf1',
    text: '#16161a',
    muted: '#6c6c77',
    border: '#e2e2e8',
    success: '#16a34a',
    danger: '#e11d48',
    warn: '#d97706',
  },
  dark: {
    bg: '#0f1013',
    surface: '#1a1b20',
    surface2: '#26272e',
    text: '#f2f2f5',
    muted: '#9c9ca8',
    border: '#2e2f37',
    success: '#22c55e',
    danger: '#fb7185',
    warn: '#fbbf24',
  },
  black: {
    bg: '#000000',
    surface: '#111113',
    surface2: '#1d1d21',
    text: '#f2f2f5',
    muted: '#9c9ca8',
    border: '#27272c',
    success: '#22c55e',
    danger: '#fb7185',
    warn: '#fbbf24',
  },
};

// ---- colour maths ----------------------------------------------------------------------------

type RGB = [number, number, number];

export function isHexColor(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend `a` towards `b`; amount 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * amount) as RGB);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A saturated colour for a hue in degrees, used by the custom colour picker. */
export function hueColor(hue: number, saturation = 0.82, lightness = 0.56): string {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** Moves `color` towards black or white until it reaches `ratio` contrast against `against`. */
function readableOn(color: string, against: string, ratio: number): string {
  const towards = luminance(against) > 0.4 ? '#000000' : '#ffffff';
  let out = color;
  for (let i = 1; i <= 20 && contrast(out, against) < ratio; i++) out = mix(color, towards, i * 0.05);
  return out;
}

// ---- themes ----------------------------------------------------------------------------------

export function resolveMode(mode: ThemeMode, systemDark: boolean): ResolvedMode {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

/** The accent fill for a preset id or custom hex; Mono and unknown ids fall back sensibly. */
export function accentColor(accent: string, mode: ResolvedMode): string {
  if (isHexColor(accent)) return accent.trim().toLowerCase();
  const p = ACCENT_PRESETS.find((x) => x.id === accent) ?? ACCENT_PRESETS[0]!;
  return p.color ?? BASES[mode].text;
}

export function buildTheme(appearance: Appearance, systemDark: boolean): ThemeColors {
  const mode = resolveMode(appearance.mode, systemDark);
  const dark = mode !== 'light';
  const base = BASES[mode];
  const accent = accentColor(appearance.accent, mode);
  // A hint of the accent in the greys ties the screen to the chosen colour.
  const tint = (c: string, amt: number) => (appearance.accent === 'mono' ? c : mix(c, accent, amt));
  const bg = mode === 'black' ? base.bg : tint(base.bg, dark ? 0.03 : 0.035);
  const surface = tint(base.surface, dark ? 0.025 : 0);
  const accentSoft = mix(surface, accent, dark ? 0.2 : 0.14);
  return {
    mode,
    dark,
    ...base,
    bg,
    surface,
    surface2: tint(base.surface2, dark ? 0.04 : 0.05),
    border: tint(base.border, 0.05),
    accent,
    // White reads better on saturated colours even slightly under 4.5:1; light colours (Volt, Sun, Mint) get dark text.
    onAccent: contrast('#ffffff', accent) >= 3 ? '#ffffff' : '#111111',
    accentText: readableOn(accent, surface, 4.5),
    accentSoft,
    doneRow: accentSoft,
  };
}

export function accentName(accent: string): string {
  return ACCENT_PRESETS.find((p) => p.id === accent)?.name ?? 'Custom';
}

export function parseAppearance(raw: unknown): Appearance {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Partial<Appearance>;
  const mode = THEME_MODES.some((m) => m.value === a.mode) ? a.mode! : DEFAULT_APPEARANCE.mode;
  const accent = typeof a.accent === 'string' && (isHexColor(a.accent) || ACCENT_PRESETS.some((p) => p.id === a.accent)) ? a.accent : DEFAULT_APPEARANCE.accent;
  return { mode, accent };
}

/** Hue (0–359) and lightness (0–1) of a hex colour, so the custom picker can show where it is. */
export function hueOf(hex: string): { hue: number; lightness: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as RGB;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: Math.round(((hue * 60) + 360) % 360), lightness: (max + min) / 2 };
}
