import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Equipment, type EquipmentSim, type TwinResult } from '../lib/api.js';
import { Schematic } from './Schematic.js';

interface Control {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

function controlsFor(category: string, e: Equipment): Control[] {
  const n = (k: string, d: number): number => (typeof e[k] === 'number' ? (e[k] as number) : d);
  switch (category) {
    case 'pump':
      return [
        { key: 'speedPercent', label: 'Speed %', min: 40, max: 120, step: 1, fallback: 100 },
        { key: 'densityKgM3', label: 'Fluid density kg/m3', min: 700, max: 1100, step: 10, fallback: (e.service ?? '').toLowerCase().includes('water') ? 998 : 850 },
      ];
    case 'compressor':
      return [
        { key: 'speedPercent', label: 'Speed %', min: 50, max: 110, step: 1, fallback: 100 },
        { key: 'suctionPressureBar', label: 'Suction bar', min: 0.5, max: 10, step: 0.1, fallback: 1 },
        { key: 'dischargePressureBar', label: 'Discharge bar', min: 2, max: Math.max(60, n('dischargePressureBar', 20)), step: 1, fallback: n('dischargePressureBar', 8) },
        { key: 'suctionTemperatureC', label: 'Suction °C', min: 5, max: 80, step: 1, fallback: 35 },
      ];
    case 'blower':
      return [
        { key: 'speedPercent', label: 'Speed %', min: 40, max: 120, step: 1, fallback: 100 },
        { key: 'pressureRiseBar', label: 'Pressure rise bar', min: 0.2, max: 4, step: 0.1, fallback: n('pressureRiseBar', 1) },
        { key: 'efficiency', label: 'Efficiency', min: 0.4, max: 0.9, step: 0.01, fallback: 0.72 },
      ];
    case 'heat-exchanger':
      return [
        { key: 'hotFlowKgs', label: 'Hot flow kg/s', min: 20, max: 300, step: 5, fallback: 120 },
        { key: 'cpJkgK', label: 'cp J/kgK', min: 1500, max: 4000, step: 50, fallback: 2100 },
      ];
    case 'valve':
      return [
        { key: 'flowRateM3h', label: 'Flow m3/h', min: 20, max: 900, step: 10, fallback: n('flowM3Hr', 180) },
        { key: 'deltaPBar', label: 'Pressure drop bar', min: 0.5, max: 12, step: 0.1, fallback: 2.5 },
        { key: 'specificGravity', label: 'Specific gravity', min: 0.6, max: 1.2, step: 0.01, fallback: 0.85 },
      ];
    case 'turbine':
      return [
        { key: 'loadPercent', label: 'Load %', min: 20, max: 110, step: 1, fallback: 100 },
        { key: 'enthalpyDropKJkg', label: 'Isentropic drop kJ/kg', min: 300, max: 900, step: 10, fallback: 620 },
      ];
    case 'boiler':
    case 'furnace':
      return [
        { key: 'loadPercent', label: 'Load %', min: 30, max: 105, step: 1, fallback: category === 'boiler' ? 85 : 100 },
        { key: 'efficiency', label: 'Efficiency', min: 0.6, max: 0.95, step: 0.01, fallback: category === 'boiler' ? 0.88 : 0.85 },
      ];
    case 'vessel':
      return [
        { key: 'internalPressureBar', label: 'Internal pressure bar', min: 5, max: 80, step: 1, fallback: n('designPressureBar', 20) },
        { key: 'shellThicknessMm', label: 'Shell thickness mm', min: 6, max: 60, step: 1, fallback: 16 },
      ];
    case 'tank':
      return [
        { key: 'fillPercent', label: 'Fill %', min: 5, max: 100, step: 1, fallback: 65 },
        { key: 'consumptionM3Day', label: 'Consumption m3/day', min: 100, max: 3000, step: 50, fallback: 800 },
      ];
    case 'cooling-tower':
      return [{ key: 'loadPercent', label: 'Load %', min: 20, max: 110, step: 1, fallback: 100 }];
    case 'column':
      return [{ key: 'vaporFlowM3Hr', label: 'Vapour flow m3/h', min: 5000, max: 60000, step: 1000, fallback: 30000 }];
    case 'reactor':
      return [{ key: 'feedFlowM3Hr', label: 'Feed flow m3/h', min: 50, max: 500, step: 10, fallback: 220 }];
    case 'motor':
      return [
        { key: 'loadPercent', label: 'Load %', min: 20, max: 110, step: 1, fallback: 80 },
        { key: 'powerFactor', label: 'Power factor', min: 0.6, max: 1, step: 0.01, fallback: 0.88 },
      ];
    case 'transformer':
      return [{ key: 'loadPercent', label: 'Load %', min: 10, max: 110, step: 1, fallback: 75 }];
    default:
      return [{ key: 'loadPercent', label: 'Load %', min: 10, max: 110, step: 1, fallback: 100 }];
  }
}

/** Synthesize realistic sensor readings from the computed operating point. */
function liveTags(result: EquipmentSim): Array<{ tag: string; value: string; status: 'ok' | 'warn' }> {
  const o = (name: string): number | undefined =>
    result.outputs.find((x) => x.name.toLowerCase().includes(name.toLowerCase()))?.value;
  const warn = result.warnings.length > 0;
  const tags: Array<{ tag: string; value: string; status: 'ok' | 'warn' }> = [];

  const power = o('shaft power') ?? o('electrical input') ?? o('power') ?? 0;
  const rated = Number(result.equipment['powerKW'] ?? result.equipment['powerMW'] ? Number(result.equipment['powerMW']) * 1000 : 100);
  const loadRatio = rated > 0 ? Math.min(1.4, power / rated) : 0.8;

  switch (result.category) {
    case 'pump':
    case 'compressor':
    case 'blower': {
      tags.push({ tag: 'vibration', value: `${(2.1 + loadRatio * 1.6).toFixed(2)} mm/s`, status: loadRatio > 1.05 ? 'warn' : 'ok' });
      tags.push({ tag: 'bearing temp', value: `${(42 + loadRatio * 28).toFixed(1)} °C`, status: loadRatio > 1.1 ? 'warn' : 'ok' });
      tags.push({ tag: 'motor current', value: `${(power * 1000 / (1.732 * 6600 * 0.88)).toFixed(0)} A`, status: 'ok' });
      tags.push({ tag: 'speed', value: `${result.equipment['rpm'] ?? 2980} rpm`, status: 'ok' });
      break;
    }
    case 'heat-exchanger':
      tags.push({ tag: 'hot in', value: `${result.inputs['hotInletC'] ?? 0} °C`, status: 'ok' });
      tags.push({ tag: 'hot out', value: `${result.inputs['hotOutletC'] ?? 0} °C`, status: 'ok' });
      tags.push({ tag: 'fouling', value: `${(o('Design margin') !== undefined ? Math.max(0, 100 - (o('Design margin') ?? 0)) : 5).toFixed(1)} %`, status: warn ? 'warn' : 'ok' });
      break;
    case 'valve':
      tags.push({ tag: 'travel', value: `${o('Travel / opening') ?? 0} %`, status: warn ? 'warn' : 'ok' });
      tags.push({ tag: 'dP', value: `${result.inputs['deltaPBar'] ?? 0} bar`, status: 'ok' });
      tags.push({ tag: 'cv', value: `${o('Required Cv') ?? 0}`, status: 'ok' });
      break;
    case 'tank':
      tags.push({ tag: 'level', value: `${o('Liquid level') ?? 0} m`, status: warn ? 'warn' : 'ok' });
      tags.push({ tag: 'volume', value: `${o('Stored volume') ?? 0} m³`, status: 'ok' });
      tags.push({ tag: 'inventory', value: `${o('Inventory days') ?? 0} days`, status: 'ok' });
      break;
    case 'motor':
    case 'transformer':
      tags.push({ tag: 'current', value: `${o('Line current') ?? o('Primary current') ?? 0} A`, status: warn ? 'warn' : 'ok' });
      tags.push({ tag: 'load', value: `${result.inputs['loadPercent'] ?? 0} %`, status: 'ok' });
      tags.push({ tag: 'slip', value: `${o('Slip') ?? o('Loading') ?? 0}`, status: 'ok' });
      break;
    default:
      for (const out of result.outputs.slice(0, 4)) {
        tags.push({ tag: out.name.toLowerCase(), value: `${out.value} ${out.unit}`, status: 'ok' });
      }
  }
  if (warn && tags.length > 0) tags[0]!.status = 'warn';
  return tags;
}

function Sparkline({ values, unit }: { values: number[]; unit: string }): React.ReactElement {
  const w = 260;
  const h = 46;
  if (values.length < 2) {
    return (
      <div className="hint" style={{ height: h, display: 'flex', alignItems: 'center' }}>
        run again to build a trend
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (w - 8) + 4,
    y: h - 5 - ((v - min) / span) * (h - 16),
  }));
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x} ${pts[i - 1]!.y} L ${pts[i]!.x} ${pts[i]!.y}`;
  }
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
        <line x1="0" y1={h - 5} x2={w} y2={h - 5} stroke="#333" strokeDasharray="4 4" />
        <line x1="0" y1="6" x2={w} y2="6" stroke="#333" strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="#00ff66" strokeWidth="1.5" />
        {pts.map((p, i) => (
          <rect key={i} x={p.x - 2} y={p.y - 2} width="4" height="4" fill="#00ff66" />
        ))}
      </svg>
      <div className="hint">
        {values[values.length - 1]!.toFixed(2)} {unit} · range {min.toFixed(2)}–{max.toFixed(2)}
      </div>
    </div>
  );
}

const SCENARIOS = [
  { id: 'pressure_change', label: 'Pressure change', blurb: 'Raise the upstream setpoint and propagate it' },
  { id: 'shutdown', label: 'Shutdown', blurb: 'Isolate a machine and find what loses feed' },
  { id: 'feedstock_change', label: 'New feedstock', blurb: 'Heavier crude, recomputed hydraulics' },
  { id: 'equipment_replacement', label: 'Replacement', blurb: 'Swap nameplate values before purchase' },
] as const;

export const MachineSimulation: React.FC = () => {
  const [tab, setTab] = useState<'equipment' | 'plant'>('equipment');

  return (
    <section className="center" style={{ flex: 1 }}>
      <div className="center-head">
        <span className="center-title">Machine Simulation</span>
        <div className="mode-toggle" style={{ marginLeft: 8 }}>
          <button className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>
            equipment
          </button>
          <button className={tab === 'plant' ? 'active' : ''} onClick={() => setTab('plant')}>
            plant scenarios
          </button>
        </div>
        <span className="center-sub" style={{ marginLeft: 'auto' }}>
          virtual plant · no field device actuated
        </span>
      </div>
      {tab === 'equipment' ? <EquipmentSim /> : <PlantScenarios />}
    </section>
  );
};

const EquipmentSim: React.FC = () => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [result, setResult] = useState<EquipmentSim | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    api
      .equipment()
      .then((d) => {
        setEquipment(d.equipment);
        if (d.equipment[0]) setSelectedId(d.equipment[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!result) return;
    const primary = result.outputs[0]?.value;
    if (typeof primary === 'number') {
      setHistory((prev) => [...prev.slice(-19), primary]);
    }
  }, [result]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(equipment.map((e) => e.category)))],
    [equipment],
  );

  const selected = equipment.find((e) => e.id === selectedId);
  const controls = useMemo(() => (selected ? controlsFor(selected.category, selected) : []), [selected]);

  useEffect(() => {
    setOverrides({});
    setResult(null);
  }, [selectedId]);

  const run = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.simulateEquipment(selected.id, overrides));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selected, overrides]);

  const visible = equipment.filter(
    (e) =>
      (category === 'all' || e.category === category) &&
      (query === '' || `${e.tag} ${e.equipmentType} ${e.manufacturer} ${e.service ?? ''}`.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="sim-layout">
      <div className="sim-list">
        <div className="pane">
          <div className="field" style={{ marginBottom: 8 }}>
            <input type="text" placeholder="search tag / type / vendor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {categories.map((c) => (
              <button key={c} className="btn-ghost" style={{ color: category === c ? 'var(--ok)' : undefined }} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {visible.map((e) => (
          <button key={e.id} className={`sim-item ${e.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(e.id)}>
            <div className="sim-item-tag">{e.tag}</div>
            <div className="sim-item-type">{e.equipmentType}</div>
          </button>
        ))}
      </div>

      <div className="sim-stage">
        {selected && (
          <>
            <div className="schematic">
              <Schematic kind={result?.category ?? selected.category} data={result?.visual.data ?? {}} warnings={result?.warnings ?? []} />
              {result && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {liveTags(result).map((t) => (
                    <span
                      key={t.tag}
                      className={`badge ${t.status === 'warn' ? 'warn' : ''}`}
                      style={{ height: 24 }}
                      title="live tag overlay"
                    >
                      {t.tag} {t.value}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pane-head">
              <span>
                {selected.tag} · {selected.equipmentType}
              </span>
              <span className="pane-index">{selected.manufacturer}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {controls.map((c) => {
                const value = overrides[c.key] ?? c.fallback;
                return (
                  <div className="field" key={c.key}>
                    <div className="field-label">
                      <span>{c.label}</span>
                      <span className="field-value">{value}</span>
                    </div>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      value={value}
                      onChange={(e) => setOverrides((o) => ({ ...o, [c.key]: Number(e.target.value) }))}
                      onDoubleClick={() => setOverrides((o) => ({ ...o, [c.key]: c.fallback }))}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-primary" onClick={run} disabled={loading}>
                {loading ? 'computing…' : 'run simulation'}
              </button>
              <button className="btn-secondary" onClick={() => setOverrides({})}>
                reset
              </button>
              {result && (
                <span className="hint">
                  {result.source} · {result.correlation}
                </span>
              )}
            </div>

            {error && <div className="warn-box" style={{ marginTop: 12 }}>{error}</div>}
          </>
        )}
      </div>

      <div className="inspector-scroll" style={{ borderLeft: '1px solid var(--border)' }}>
        <div className="pane-head" style={{ padding: '4px 0 10px' }}>
          <span>Live output</span>
        </div>
        {!result && <div className="inspector-empty">Run the simulation to compute the operating point.</div>}
        {result && (
          <>
            {result.warnings.map((w, i) => (
              <div className="warn-box" key={i}>
                {w}
              </div>
            ))}
            {result.warnings.length === 0 && <div className="ok-box">All computed values within rated envelope.</div>}
            <div className="pane-head" style={{ padding: '4px 0 10px' }}>
              <span>Live trend · {result.outputs[0]?.name ?? 'metric'}</span>
            </div>
            <Sparkline values={history} unit={result.outputs[0]?.unit ?? ''} />
            <div className="divider" />
            <table className="data-table" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num">Value</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {result.outputs.map((o) => (
                  <tr key={o.name}>
                    <td>{o.name}</td>
                    <td className="num">{o.value}</td>
                    <td style={{ color: '#888' }}>{o.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pane-head" style={{ padding: '4px 0 10px' }}>
              <span>Working</span>
            </div>
            <table className="data-table">
              <tbody>
                {result.steps.map((s) => (
                  <tr key={s.step}>
                    <td style={{ color: '#444', width: 24 }}>{String(s.step).padStart(2, '0')}</td>
                    <td>
                      {s.name}
                      <div className="hint">{s.formula}</div>
                    </td>
                    <td className="num">{s.value}</td>
                    <td style={{ color: '#888' }}>{s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};

const PlantScenarios: React.FC = () => {
  const [result, setResult] = useState<TwinResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState(2);
  const [target, setTarget] = useState('P-101A');

  const run = async (scenario: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.twinSimulate(scenario));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sim-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px' }}>
      <div className="sim-stage">
        <div className="pane-head">
          <span>Virtual plant · CDU feed train</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className="btn-secondary"
              disabled={busy}
              title={s.blurb}
              onClick={() =>
                run(
                  s.id === 'pressure_change'
                    ? { type: s.id, deltaPressureBar: delta, description: `Upstream setpoint ${delta > 0 ? '+' : ''}${delta} bar` }
                    : s.id === 'shutdown'
                      ? { type: s.id, target, description: `Shutdown and isolation of ${target}` }
                      : s.id === 'feedstock_change'
                        ? { type: s.id, flowM3h: 210, densityKgM3: 890, viscosityPaS: 0.006, description: 'Heavier crude feedstock' }
                        : { type: s.id, target, replacement: { ratedFlowM3Hr: 240, designPressureBar: 24 }, description: `Replacement evaluation for ${target}` },
                )
              }
            >
              {s.label}
            </button>
          ))}
          <button className="btn-primary" disabled={busy} onClick={() => run({ type: 'pressure_change', deltaPressureBar: delta, description: `upstream +${delta} bar` })}>
            {busy ? 'running…' : 'run scenario'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div className="field">
            <div className="field-label">
              <span>upstream delta bar</span>
              <span className="field-value">{delta}</span>
            </div>
            <input type="range" min={-2} max={5} step={0.5} value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>target equipment</span>
            </div>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {['P-101A', 'V-102', 'FV-2034', 'GV-1002'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="warn-box">{error}</div>}
        {result && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className={`badge ${result.safetyVerdict === 'fail' ? 'bad' : result.safetyVerdict === 'warn' ? 'warn' : ''}`}>
                verdict {result.safetyVerdict}
              </span>
              <span className="badge neutral">engine {result.calculationSource}</span>
              <span className="badge neutral">{result.twinId}</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num">Baseline</th>
                  <th className="num">Simulated</th>
                  <th className="num">Delta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {result.deltas.map((d) => (
                  <tr key={d.metric}>
                    <td>{d.metric}</td>
                    <td className="num">{d.baseline}</td>
                    <td className="num">{d.simulated}</td>
                    <td className={`num ${d.delta > 0 ? 'warn' : ''}`}>
                      {d.delta > 0 ? '+' : ''}
                      {d.delta}
                    </td>
                    <td className={d.withinDesign ? 'ok' : 'bad'}>{d.withinDesign ? 'in-envelope' : 'OUT'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="inspector-scroll" style={{ borderLeft: '1px solid var(--border)' }}>
        <div className="pane-head" style={{ padding: '4px 0 10px' }}>
          <span>Findings</span>
        </div>
        {!result && <div className="inspector-empty">Run a plant scenario to see findings and recommendations.</div>}
        {result?.findings.map((f, i) => (
          <div className="hint" key={i} style={{ marginBottom: 8, color: 'var(--text)' }}>
            {f}
          </div>
        ))}
        {result && result.recommendations.length > 0 && (
          <>
            <div className="divider" />
            <div className="pane-head" style={{ padding: '4px 0 10px' }}>
              <span>Recommendations</span>
            </div>
            {result.recommendations.map((r, i) => (
              <div className="hint" key={i} style={{ marginBottom: 8 }}>
                {r}
              </div>
            ))}
          </>
        )}
        {result && result.affectedEquipment.length > 0 && (
          <>
            <div className="divider" />
            <div className="pane-head" style={{ padding: '4px 0 10px' }}>
              <span>Affected equipment</span>
            </div>
            <div>
              {result.affectedEquipment.map((t) => (
                <span className="metric-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
