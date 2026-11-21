import { ACCENT_PRESETS, THEME_MODES, isHexColor } from '@open-workouts/shared';
import { setAppearance, useAppearance } from './theme';

/** Theme settings: light/dark/black and an accent colour (preset or any custom colour). */
export function AppearanceSection() {
  const a = useAppearance();
  const custom = isHexColor(a.accent);
  return (
    <section className="card">
      <h3>Appearance</h3>
      <div className="theme-preview" aria-hidden>
        <div className="row between">
          <strong>Bench Press</strong>
          <span className="chip-soft">PR</span>
        </div>
        <div className="preview-row done">
          <span className="set-badge">1</span>
          <span>80 kg × 8</span>
          <span className="check on">✓</span>
        </div>
        <div className="preview-row">
          <span className="set-badge">2</span>
          <span>82.5 kg × 6</span>
          <span className="check">✓</span>
        </div>
        <button className="primary block" tabIndex={-1}>
          Finish workout
        </button>
      </div>

      <p className="eyebrow">Mode</p>
      <div className="segmented" role="radiogroup" aria-label="Mode">
        {THEME_MODES.map((m) => (
          <button key={m.value} role="radio" aria-checked={a.mode === m.value} className={a.mode === m.value ? 'on' : ''} onClick={() => setAppearance({ mode: m.value })}>
            {m.label}
          </button>
        ))}
      </div>

      <p className="eyebrow">Colour</p>
      <div className="swatches">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`swatch ${a.accent === p.id ? 'on' : ''} ${p.color ? '' : 'mono'}`}
            style={p.color ? { ['--sw' as string]: p.color } : undefined}
            aria-pressed={a.accent === p.id}
            onClick={() => setAppearance({ accent: p.id })}
          >
            <span className="dot" />
            <span className="name">{p.name}</span>
          </button>
        ))}
        <label className={`swatch ${custom ? 'on' : ''}`} style={custom ? { ['--sw' as string]: a.accent } : undefined}>
          <span className="dot custom-dot">
            <input
              type="color"
              aria-label="Custom colour"
              value={custom ? a.accent : '#2ee6a6'}
              onChange={(e) => setAppearance({ accent: e.target.value })}
            />
          </span>
          <span className="name">{custom ? a.accent.toUpperCase() : 'Custom'}</span>
        </label>
      </div>
      <p className="muted small">Saved in this browser. Text colours adjust automatically so every colour stays readable.</p>
    </section>
  );
}
