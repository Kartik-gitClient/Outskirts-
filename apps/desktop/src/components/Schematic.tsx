import React from 'react';

interface SchematicProps {
  kind: string;
  data: Record<string, number | string>;
  warnings: string[];
}

const GREEN = '#00ff66';
const AMBER = '#f5a623';
const RED = '#ff3333';
const DIM = '#444';
const LINE = '#262626';

function Readout({ x, y, label, value }: { x: number; y: number; label: string; value: string }): React.ReactElement {
  return (
    <g>
      <text x={x} y={y} fill="#888" fontSize="10" fontFamily="monospace">
        {label}
      </text>
      <text x={x} y={y + 16} fill={GREEN} fontSize="15" fontFamily="monospace">
        {value}
      </text>
    </g>
  );
}

function FlowPipe({ d, active = true, color = GREEN }: { d: string; active?: boolean; color?: string }): React.ReactElement {
  return (
    <g>
      <path d={d} stroke={LINE} strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeDasharray="6 10" strokeLinecap="round">
        {active && <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.2s" repeatCount="indefinite" />}
      </path>
    </g>
  );
}

function frame(kind: string): React.ReactElement {
  return (
    <g opacity="0.5">
      <rect x="1" y="1" width="598" height="258" fill="none" stroke={LINE} />
      <text x="10" y="254" fill={DIM} fontSize="9" fontFamily="monospace">
        SCHEMATIC :: {kind.toUpperCase()} :: live
      </text>
    </g>
  );
}

export const Schematic: React.FC<SchematicProps> = ({ kind, data, warnings }) => {
  const warnColor = warnings.length > 0 ? AMBER : GREEN;
  const speed = Number(data['speedPct'] ?? data['loadPct'] ?? 100);
  const dur = `${Math.max(0.25, 1.6 - (speed / 100) * 1.2)}s`;

  const body = ((): React.ReactElement => {
    switch (kind) {
      case 'pump':
        return (
          <g>
            <FlowPipe d="M 20 130 H 200" />
            <FlowPipe d="M 250 100 H 430 V 40 H 560" />
            <circle cx="225" cy="115" r="42" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            <g transform="translate(225,115)">
              <g>
                <line x1="0" y1="0" x2="0" y2="-30" stroke={GREEN} strokeWidth="2" />
                <line x1="0" y1="0" x2="26" y2="15" stroke={GREEN} strokeWidth="2" />
                <line x1="0" y1="0" x2="-26" y2="15" stroke={GREEN} strokeWidth="2" />
                <circle r="4" fill={GREEN} />
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
              </g>
            </g>
            <circle cx="225" cy="115" r="52" fill="none" stroke={warnColor} strokeWidth="1" strokeDasharray="4 4" opacity="0.6">
              <animate attributeName="opacity" values="0.25;0.7;0.25" dur="2s" repeatCount="indefinite" />
            </circle>
            <Readout x={330} y={150} label="FLOW" value={`${data['flow'] ?? 0} m³/h`} />
            <Readout x={450} y={150} label="HEAD" value={`${data['head'] ?? 0} m`} />
            <Readout x={330} y={205} label="SHAFT" value={`${data['powerKw'] ?? 0} kW`} />
            <Readout x={450} y={205} label="SPEED" value={`${speed}%`} />
          </g>
        );
      case 'compressor':
        return (
          <g>
            <FlowPipe d="M 20 120 H 180" />
            <FlowPipe d="M 380 90 H 560" color={AMBER} />
            <rect x="180" y="60" width="200" height="120" rx="8" fill="#0a0a0a" stroke={LINE} />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${210 + i * 55}, 120)`}>
                <g>
                  <circle r="26" fill="none" stroke={GREEN} strokeWidth="2" />
                  <line x1="-26" y1="0" x2="26" y2="0" stroke={GREEN} strokeWidth="2" />
                  <line x1="0" y1="-26" x2="0" y2="26" stroke={GREEN} strokeWidth="2" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
                </g>
              </g>
            ))}
            <text x="280" y="205" fill="#888" fontSize="10" fontFamily="monospace" textAnchor="middle">
              PRESSURISING
            </text>
            <Readout x={30} y={175} label="MASS FLOW" value={`${data['massFlowKgs'] ?? data['flow'] ?? 0} kg/s`} />
            <Readout x={440} y={160} label="PRESSURE RATIO" value={`${data['pressureRatio'] ?? 0}`} />
            <Readout x={440} y={205} label="SHAFT" value={`${data['powerKw'] ?? 0} kW`} />
          </g>
        );
      case 'heat-exchanger':
        return (
          <g>
            <rect x="140" y="55" width="320" height="150" rx="10" fill="#0a0a0a" stroke={LINE} />
            <FlowPipe d="M 20 95 H 140" color={RED} />
            <FlowPipe d="M 460 165 H 580" color={AMBER} />
            <FlowPipe d="M 20 175 H 140" color={GREEN} />
            <FlowPipe d="M 460 85 H 580" color={GREEN} />
            {Array.from({ length: 7 }).map((_, i) => (
              <g key={i}>
                <line x1={160 + i * 44} y1="70" x2={160 + i * 44} y2="190" stroke={LINE} strokeWidth="1.5" />
              </g>
            ))}
            {Array.from({ length: 5 }).map((_, i) => (
              <circle key={i} r="3" fill={RED} cx={160 + i * 60} cy="82">
                <animate attributeName="cx" from="150" to="450" dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
              </circle>
            ))}
            <Readout x={30} y={215} label="HOT IN" value={`${data['hotIn'] ?? 0} °C`} />
            <Readout x={330} y={232} label="HOT OUT" value={`${data['hotOut'] ?? 0} °C`} />
            <Readout x={480} y={232} label="DUTY" value={`${data['dutyMw'] ?? 0} MW`} />
          </g>
        );
      case 'valve':
        return (
          <g>
            <FlowPipe d="M 20 130 H 170" color={GREEN} />
            <FlowPipe d="M 430 130 H 580" color={GREEN} />
            <polygon points="170,90 260,130 170,170" fill="#0a0a0a" stroke={GREEN} strokeWidth="2" />
            <polygon points="430,90 340,130 430,170" fill="#0a0a0a" stroke={GREEN} strokeWidth="2" />
            <line x1="300" y1="60" x2="300" y2="130" stroke={AMBER} strokeWidth="3">
              <animate attributeName="y2" values="130;110;130" dur="2s" repeatCount="indefinite" />
            </line>
            <rect x="270" y="50" width="60" height="14" rx="3" fill="none" stroke={AMBER} />
            <text x="300" y="200" fill="#888" fontSize="10" fontFamily="monospace" textAnchor="middle">
              TRAVEL {data['opening'] ?? 0}%
            </text>
            <Readout x={30} y={200} label="REQ CV" value={`${data['requiredCv'] ?? 0}`} />
            <Readout x={480} y={200} label="RATED CV" value={`${data['ratedCv'] ?? 0}`} />
          </g>
        );
      case 'tank':
        {
          const fill = Number(data['fillPercent'] ?? 50);
          const h = 160;
          const y = 60 + h * (1 - Math.min(100, fill) / 100);
          return (
            <g>
              <rect x="220" y="60" width="160" height="160" rx="6" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
              <rect x="222" y={y} width="156" height={220 - y - 2} fill="rgba(0,255,102,0.18)" stroke={GREEN} strokeWidth="1">
                <animate attributeName="y" from="220" to={y} dur="1.2s" fill="freeze" />
              </rect>
              <FlowPipe d="M 120 100 H 220" />
              <FlowPipe d="M 380 140 H 500" />
              <Readout x={120} y={200} label="LEVEL" value={`${data['level'] ?? 0} m`} />
              <Readout x={420} y={200} label="STORED" value={`${data['stored'] ?? 0} m³`} />
              <Readout x={420} y={240} label="FILL" value={`${fill}%`} />
            </g>
          );
        }
      case 'column':
        return (
          <g>
            <rect x="250" y="30" width="100" height="200" rx="8" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1="250" y1={50 + i * 22} x2="350" y2={50 + i * 22} stroke={LINE} strokeWidth="1.5" />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <circle key={i} r="2.5" fill={GREEN} cx={270 + (i % 3) * 30} cy="220">
                <animate attributeName="cy" from="220" to="40" dur={`${2.2 + i * 0.25}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;0" dur={`${2.2 + i * 0.25}s`} repeatCount="indefinite" />
              </circle>
            ))}
            <FlowPipe d="M 120 120 H 250" />
            <FlowPipe d="M 350 120 H 500" color={AMBER} />
            <Readout x={40} y={190} label="VAPOUR V" value={`${data['velocity'] ?? 0} m/s`} />
            <Readout x={420} y={190} label="FLOODING" value={`${data['flood'] ?? 0}%`} />
          </g>
        );
      case 'vessel':
        return (
          <g>
            <rect x="230" y="50" width="140" height="170" rx="70" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            <circle cx="300" cy="135" r="52" fill="none" stroke={warnColor} strokeWidth="1.5" strokeDasharray="4 4">
              <animate attributeName="r" values="48;56;48" dur="2.4s" repeatCount="indefinite" />
            </circle>
            {Array.from({ length: 5 }).map((_, i) => (
              <circle key={i} r="3" fill={GREEN} cx={250 + i * 25} cy="200">
                <animate attributeName="cy" from="200" to="70" dur={`${2.5 + i * 0.2}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;0" dur={`${2.5 + i * 0.2}s`} repeatCount="indefinite" />
              </circle>
            ))}
            <Readout x={40} y={190} label="PRESSURE" value={`${data['pressure'] ?? 0} bar`} />
            <Readout x={420} y={190} label="UTILISATION" value={`${data['utilization'] ?? 0}%`} />
          </g>
        );
      case 'turbine':
        return (
          <g>
            <FlowPipe d="M 20 110 H 190" color={AMBER} />
            <FlowPipe d="M 410 130 H 560" />
            <g transform="translate(300,120)">
              <circle r="70" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
              <g>
                {Array.from({ length: 10 }).map((_, i) => (
                  <line
                    key={i}
                    x1="0"
                    y1="0"
                    x2={64 * Math.cos((i * 36 * Math.PI) / 180)}
                    y2={64 * Math.sin((i * 36 * Math.PI) / 180)}
                    stroke={AMBER}
                    strokeWidth="3"
                  />
                ))}
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
              </g>
            </g>
            <Readout x={30} y={200} label="POWER" value={`${data['powerMw'] ?? 0} MW`} />
            <Readout x={420} y={200} label="STEAM" value={`${data['steamFlowKgs'] ?? 0} kg/s`} />
          </g>
        );
      case 'motor':
        return (
          <g>
            <rect x="210" y="70" width="180" height="120" rx="10" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            <g transform="translate(300,130)">
              <g>
                <line x1="-40" y1="0" x2="40" y2="0" stroke={GREEN} strokeWidth="3" />
                <line x1="0" y1="-40" x2="0" y2="40" stroke={GREEN} strokeWidth="3" />
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
              </g>
            </g>
            <path d="M 120 130 q 20 -25 40 0 t 40 0" fill="none" stroke={GREEN} strokeWidth="2" strokeDasharray="4 4">
              <animate attributeName="stroke-dashoffset" from="0" to="-48" dur="1s" repeatCount="indefinite" />
            </path>
            <Readout x={420} y={110} label="CURRENT" value={`${data['current'] ?? 0} A`} />
            <Readout x={420} y={160} label="RPM" value={`${data['rpm'] ?? 0}`} />
            <Readout x={420} y={210} label="SLIP" value={`${data['slip'] ?? 0}%`} />
          </g>
        );
      case 'transformer':
        return (
          <g>
            <rect x="220" y="60" width="160" height="140" rx="8" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            {[0, 1, 2].map((i) => (
              <ellipse key={i} cx="260" cy={90 + i * 40} rx="16" ry="12" fill="none" stroke={GREEN} strokeWidth="2" />
            ))}
            {[0, 1, 2].map((i) => (
              <ellipse key={i} cx="340" cy={90 + i * 40} rx="16" ry="12" fill="none" stroke={AMBER} strokeWidth="2" />
            ))}
            <path d="M 380 130 q 30 -18 60 0 t 60 0" fill="none" stroke={AMBER} strokeWidth="1.5" strokeDasharray="3 5">
              <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.4s" repeatCount="indefinite" />
            </path>
            <Readout x={40} y={190} label="PRIMARY" value={`${data['primaryA'] ?? 0} A`} />
            <Readout x={440} y={190} label="SECONDARY" value={`${data['secondaryA'] ?? 0} A`} />
          </g>
        );
      case 'boiler':
      case 'furnace':
        return (
          <g>
            {Array.from({ length: 7 }).map((_, i) => (
              <path
                key={i}
                d={`M ${220 + i * 24} 190 q 8 -22 0 -44 q -8 -22 0 -44`}
                fill="none"
                stroke={AMBER}
                strokeWidth="2"
                opacity="0.8"
              >
                <animate attributeName="opacity" values="0.25;0.9;0.25" dur={`${1.4 + i * 0.2}s`} repeatCount="indefinite" />
              </path>
            ))}
            <rect x="200" y="180" width="200" height="30" rx="4" fill="#0a0a0a" stroke={LINE} />
            <FlowPipe d="M 400 120 H 540" color={AMBER} />
            <Readout x={40} y={140} label="FUEL" value={`${data['fuelKgh'] ?? 0} kg/h`} />
            <Readout x={40} y={200} label="STEAM" value={`${data['steamTph'] ?? data['dutyMw'] ?? 0}`} />
          </g>
        );
      case 'cooling-tower':
        return (
          <g>
            <polygon points="240,220 360,220 340,80 260,80" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            {Array.from({ length: 8 }).map((_, i) => (
              <circle key={i} r="2.5" fill={GREEN} cx={265 + (i % 4) * 24} cy="210">
                <animate attributeName="cy" from="210" to="70" dur={`${2 + i * 0.2}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.9;0" dur={`${2 + i * 0.2}s`} repeatCount="indefinite" />
              </circle>
            ))}
            <FlowPipe d="M 120 180 H 240" />
            <Readout x={30} y={120} label="RANGE" value={`${data['range'] ?? 0} K`} />
            <Readout x={420} y={150} label="DUTY" value={`${data['duty'] ?? 0} MW`} />
          </g>
        );
      default:
        return (
          <g>
            <FlowPipe d="M 20 130 H 180" />
            <rect x="180" y="80" width="240" height="100" rx="8" fill="#0a0a0a" stroke={LINE} strokeWidth="2" />
            <FlowPipe d="M 420 130 H 570" color={AMBER} />
            <text x="300" y="135" fill={GREEN} fontSize="12" fontFamily="monospace" textAnchor="middle">
              {kind.toUpperCase()}
            </text>
            <Readout x={30} y={200} label="INPUT" value={`${data['loadPct'] ?? data['speedPct'] ?? 100}%`} />
          </g>
        );
    }
  })();

  return (
    <svg viewBox="0 0 600 260" role="img" aria-label={`${kind} schematic`}>
      {frame(kind)}
      {body}
    </svg>
  );
};
