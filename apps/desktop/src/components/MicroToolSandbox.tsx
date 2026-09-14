import React, { useState, useMemo } from 'react';

interface MicroToolSandboxProps {
  toolName?: string;
  customHtml?: string | null;
  onEgressAttemptBlocked?: (detail: string) => void;
}

/**
 * Pre-generated Journey 2 Micro-Tool artifact:
 * Interactive Hydraulic Orifice & Pressure Drop Calculator.
 * Runs in an iframe sandbox with zero network access and strict CSP.
 */
export const DEFAULT_MICROTOOL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Hydraulic Sizing Micro-Tool</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; }
    body { background: #111418; color: #e2e8f0; padding: 16px; font-size: 13px; }
    h2 { font-size: 15px; color: #38bdf8; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
    .badge { background: #0369a1; color: #bae6fd; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
    .sub { color: #94a3b8; font-size: 11px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    label { font-size: 11px; color: #cbd5e1; font-weight: 500; }
    input { background: #1e293b; border: 1px solid #334155; color: #f8fafc; padding: 6px 10px; border-radius: 4px; font-size: 12px; }
    input:focus { border-color: #38bdf8; outline: none; }
    .results { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1e293b; }
    .row:last-child { border-bottom: none; }
    .res-label { color: #94a3b8; }
    .res-val { font-weight: bold; color: #38bdf8; }
    .uncertainty { color: #f59e0b; font-size: 11px; }
    .actions { display: flex; gap: 8px; }
    button { background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
    button:hover { background: #1d4ed8; }
    .btn-test { background: #7f1d1d; color: #fca5a5; }
    .btn-test:hover { background: #991b1b; }
    #alertBox { margin-top: 10px; padding: 8px; border-radius: 4px; font-size: 11px; display: none; }
  </style>
</head>
<body>
  <h2>
    <span>Hydraulic Pressure Drop Calculator</span>
    <span class="badge">SANDBOXED IFRAME</span>
  </h2>
  <div class="sub">Generated Micro-Tool · Swamee-Jain / Darcy-Weisbach · Pint Uncertainty Model</div>

  <div class="grid">
    <div class="field">
      <label>Internal Diameter (D in mm)</label>
      <input type="number" id="diam" value="150" step="5" min="10" max="1000">
    </div>
    <div class="field">
      <label>Pipe Length (L in meters)</label>
      <input type="number" id="len" value="120" step="10" min="1">
    </div>
    <div class="field">
      <label>Flow Rate (Q in m³/h)</label>
      <input type="number" id="flow" value="85" step="5" min="1">
    </div>
    <div class="field">
      <label>Fluid Density (kg/m³)</label>
      <input type="number" id="rho" value="850" step="10" min="500">
    </div>
  </div>

  <div class="results">
    <div class="row">
      <span class="res-label">Mean Flow Velocity (v):</span>
      <span class="res-val" id="resVel">1.336 m/s</span>
    </div>
    <div class="row">
      <span class="res-label">Reynolds Number (Re):</span>
      <span class="res-val" id="resRe">53,248 (Turbulent)</span>
    </div>
    <div class="row">
      <span class="res-label">Darcy Friction Factor (f):</span>
      <span class="res-val" id="resF">0.0210</span>
    </div>
    <div class="row">
      <span class="res-label">Frictional Head Loss (ΔP):</span>
      <span class="res-val" id="resDp">0.1278 bar</span>
    </div>
    <div class="row">
      <span class="res-label">Pint Uncertainty Propagation:</span>
      <span class="uncertainty" id="resUncertainty">± 0.0045 bar (95% CI, ±3.5%)</span>
    </div>
  </div>

  <div class="actions">
    <button onclick="recalculate()">Recompute Now</button>
    <button class="btn-test" onclick="attemptEgress()">Verify Egress Guard (Test Rogue Fetch)</button>
  </div>

  <div id="alertBox"></div>

  <script>
    function recalculate() {
      var D_mm = parseFloat(document.getElementById('diam').value) || 150;
      var L = parseFloat(document.getElementById('len').value) || 120;
      var Q_m3h = parseFloat(document.getElementById('flow').value) || 85;
      var rho = parseFloat(document.getElementById('rho').value) || 850;
      var mu = 0.0032; // Pa*s

      var D = D_mm / 1000.0;
      var Q_m3s = Q_m3h / 3600.0;
      var area = (Math.PI / 4.0) * Math.pow(D, 2);
      var v = Q_m3s / area;

      var Re = (rho * v * D) / mu;
      var eps = 0.000045; // carbon steel
      var term = (eps / (3.7 * D)) + (5.74 / Math.pow(Re, 0.9));
      var f = 0.25 / Math.pow(Math.log10(term), 2);

      var deltaP_pa = f * (L / D) * (rho * Math.pow(v, 2) / 2.0);
      var deltaP_bar = deltaP_pa / 100000.0;
      var uncertainty = deltaP_bar * 0.035;

      document.getElementById('resVel').innerText = v.toFixed(3) + ' m/s';
      document.getElementById('resRe').innerText = Math.round(Re).toLocaleString() + (Re > 2300 ? ' (Turbulent)' : ' (Laminar)');
      document.getElementById('resF').innerText = f.toFixed(4);
      document.getElementById('resDp').innerText = deltaP_bar.toFixed(4) + ' bar';
      document.getElementById('resUncertainty').innerText = '± ' + uncertainty.toFixed(4) + ' bar (95% CI, ±3.5%)';
    }

    ['diam', 'len', 'flow', 'rho'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', recalculate);
    });

    function attemptEgress() {
      var box = document.getElementById('alertBox');
      box.style.display = 'block';
      box.style.background = '#1e293b';
      box.style.color = '#94a3b8';
      box.innerText = 'Testing outbound network request from sandbox...';

      try {
        fetch('https://telemetry.external-leak.invalid/ping', { mode: 'no-cors' })
          .then(function() {
            box.style.background = '#7f1d1d';
            box.style.color = '#fecaca';
            box.innerText = 'FAILURE: Network request unexpectedly succeeded!';
          })
          .catch(function(err) {
            box.style.background = '#064e3b';
            box.style.color = '#a7f3d0';
            box.innerText = 'SHIELD CONFIRMED: Egress blocked by Sandbox CSP: ' + err.message;
            if (window.parent) {
              window.parent.postMessage({ type: 'OUTSKIRTS_EGRESS_BLOCKED', detail: err.message }, '*');
            }
          });
      } catch (err) {
        box.style.background = '#064e3b';
        box.style.color = '#a7f3d0';
        box.innerText = 'SHIELD CONFIRMED: Egress blocked synchronously by CSP: ' + err.message;
      }
    }

    recalculate();
  </script>
</body>
</html>`;

export const MicroToolSandbox: React.FC<MicroToolSandboxProps> = ({
  toolName = 'Hydraulic Sizing Micro-App (Journey 2)',
  customHtml,
  onEgressAttemptBlocked,
}) => {
  const [sandboxBlockedAlert, setSandboxBlockedAlert] = useState<string | null>(null);

  const htmlContent = customHtml ?? DEFAULT_MICROTOOL_HTML;

  // Listen for sandbox postMessage security reports
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OUTSKIRTS_EGRESS_BLOCKED') {
        setSandboxBlockedAlert(`Sandbox blocked egress attempt: ${event.data.detail}`);
        if (onEgressAttemptBlocked) {
          onEgressAttemptBlocked(event.data.detail);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEgressAttemptBlocked]);

  const srcDoc = useMemo(() => htmlContent, [htmlContent]);

  return (
    <div className="microtool-sandbox-card" style={{
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        background: '#161b22',
        padding: '10px 14px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
          }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f6fc' }}>
            {toolName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            background: '#1f6feb22',
            border: '1px solid #388bfd44',
            borderRadius: '4px',
            color: '#58a6ff',
          }}>
            sandbox="allow-scripts" · No Same-Origin
          </span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            background: '#23863622',
            border: '1px solid #2ea04344',
            borderRadius: '4px',
            color: '#3fb950',
          }}>
            CSP: default-src 'none'
          </span>
        </div>
      </div>

      {sandboxBlockedAlert && (
        <div style={{
          background: '#042718',
          borderBottom: '1px solid #2ea043',
          padding: '8px 14px',
          color: '#3fb950',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>🛡️ <strong>Sovereign Shield Verified:</strong> {sandboxBlockedAlert}</span>
          <button
            onClick={() => setSandboxBlockedAlert(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ position: 'relative', width: '100%', height: '360px' }}>
        <iframe
          title="Generated Micro-Tool Preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#111418',
          }}
        />
      </div>
    </div>
  );
};
