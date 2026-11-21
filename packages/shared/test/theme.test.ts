import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, buildTheme, contrast, hueColor, parseAppearance, type ThemeMode } from '../src/theme';

const MODES: ThemeMode[] = ['light', 'dark', 'black'];

describe('themes', () => {
  const accents = [...ACCENT_PRESETS.map((p) => p.id), ...Array.from({ length: 12 }, (_, i) => hueColor(i * 30)), '#ffffff', '#000000', '#777'];
  for (const mode of MODES)
    for (const accent of accents)
      it(`${accent} on ${mode} stays readable`, () => {
        const t = buildTheme({ mode, accent }, false);
        expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(7);
        expect(contrast(t.text, t.doneRow)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.accentText, t.surface)).toBeGreaterThanOrEqual(4.4);
        expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(t.onAccent === '#ffffff' ? 3 : 4.5);
      });

  it('system mode follows the device', () => {
    expect(buildTheme({ mode: 'system', accent: 'grape' }, true).dark).toBe(true);
    expect(buildTheme({ mode: 'system', accent: 'grape' }, false).dark).toBe(false);
  });

  it('rejects bad stored values', () => {
    expect(parseAppearance({ mode: 'neon', accent: 'url(x)' })).toEqual({ mode: 'black', accent: 'mint' });
    expect(parseAppearance({ mode: 'black', accent: '#A1B2C3' })).toEqual({ mode: 'black', accent: '#A1B2C3' });
    expect(parseAppearance(null)).toEqual({ mode: 'black', accent: 'mint' });
  });
});

describe('hueOf', () => {
  it('round-trips hueColor', async () => {
    const { hueOf } = await import('../src/theme');
    for (const h of [0, 40, 120, 200, 300]) expect(Math.abs(hueOf(hueColor(h)).hue - h)).toBeLessThanOrEqual(2);
  });
});
