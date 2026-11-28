// Replica of the HMI page on the Power Panel (Init_Page in
// plc/ProjetoFinalRobotica/Logical/Visualisation/Visu/Pages): same 640 x 480
// layout, texts and palette colours, driven by src/estimator/hmi.ts. Read-only:
// the Ligar button only shows the start request, it sends nothing.
// Positions copied from the page file; update them when the page changes.

import { config } from '../config';
import { hmiState, type Lamp } from '../estimator/hmi';
import { PART_COUNT } from '../model/layout';
import { useTwinStore } from '../state/store';

/** HMI palette (Palette.vcr) entries used by the page. */
const PAL = {
  black: '#000000',
  green: '#00AA00',
  white: '#FFFFFF',
  yellow: '#FFFF00',
  done: '#66CC00',
  blue: '#0099CC',
  grey: '#D9D9D9',
  lightGrey: '#F2F2F2',
};

const LAMP_FILL: Record<Lamp, string> = { wait: PAL.grey, run: PAL.yellow, done: PAL.done };

const FONT = 13;

function Txt({ x, y, w, children, center }: { x: number; y: number; w?: number; children: string; center?: boolean }) {
  return (
    <text
      x={center && w ? x + w / 2 : x}
      y={y + FONT}
      textAnchor={center ? 'middle' : 'start'}
      className="hmi-text"
    >
      {children}
    </text>
  );
}

function Box({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  return <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} fill={fill} stroke={PAL.black} strokeWidth={1} />;
}

function Numeric({ x, y, value }: { x: number; y: number; value: number | null }) {
  return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={59} height={21} fill={PAL.white} stroke="#9a9a9a" />
      <text x={x + 54} y={y + 16} textAnchor="end" className="hmi-value">
        {value === null ? '' : String(value)}
      </text>
    </g>
  );
}

export function HmiPanel({ now }: { now: number }) {
  const io = useTwinStore((s) => s.io);
  const items = useTwinStore((s) => s.items);
  const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
  const hmi = hmiState(fresh, items, now);
  const steps = [
    'Jaka: placa na esteira',
    'Esteira: levando a placa',
    PART_COUNT === 1 ? 'Stäubli: placa na mesa, peça no quadro' : 'Stäubli: placa na mesa, peças no quadro',
    PART_COUNT === 1 ? 'Stäubli: desenhando o quadrado' : 'Stäubli: desenhando os quadrados',
    'Ciclo concluído',
  ];
  const plateLamp = (at: typeof hmi.plateAt) => (hmi.plateAt === at ? PAL.done : PAL.grey);
  const squareDrawn = (hmi.squares ?? 0) >= 1;
  const partOnBoard = (hmi.partsOnBoard ?? 0) >= 1;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>HMI</h2>
        <span className="muted small-inline">Replica of the panel page, read-only</span>
      </div>
      <div className="hmi-bezel">
        <svg viewBox="0 0 640 480" className="hmi-screen" role="img" aria-label="HMI page replica">
          <rect x={0} y={0} width={640} height={480} fill="#EEF0F5" />

          {/* Ligar (start). Shown pressed while the start request is on. */}
          <g>
            <rect
              x={112.5}
              y={10.5}
              width={423}
              height={69}
              rx={3}
              className={`hmi-button ${hmi.start ? 'is-pressed' : ''}`}
            />
            <text x={324} y={51} textAnchor="middle" className="hmi-button-text" fill={PAL.green}>
              Ligar
            </text>
          </g>

          {/* Step lamps */}
          <Txt x={19} y={102}>Etapas</Txt>
          {steps.map((label, i) => (
            <g key={label}>
              <Box x={29} y={128 + i * 30} w={20} h={20} fill={LAMP_FILL[hmi.steps[i]!]} />
              <Txt x={59} y={128 + i * 30}>{label}</Txt>
            </g>
          ))}

          {/* Counters */}
          <Txt x={23} y={302}>Peça no quadro</Txt>
          <Numeric x={193} y={301} value={hmi.partsOnBoard} />
          <Txt x={261} y={302}>{`de ${PART_COUNT}`}</Txt>
          <Txt x={23} y={332}>Quadrado</Txt>
          <Numeric x={193} y={331} value={hmi.squares} />
          <Txt x={261} y={332}>{`de ${PART_COUNT}`}</Txt>
          <Txt x={23} y={362}>Tempo de ciclo</Txt>
          <Numeric x={193} y={361} value={hmi.seconds} />
          <Txt x={261} y={362}>s</Txt>
          <Txt x={23} y={392}>Ciclos concluídos</Txt>
          <Numeric x={193} y={391} value={hmi.count} />

          {/* Whiteboard: square (black frame when drawn) and the part */}
          <Txt x={349} y={102} w={270} center>
            Quadro
          </Txt>
          <Box x={349} y={125} w={270} h={150} fill={PAL.white} />
          <Box x={444} y={160} w={80} h={80} fill={squareDrawn ? PAL.black : PAL.white} />
          <Box x={449} y={165} w={70} h={70} fill={PAL.white} />
          <Box x={466} y={182} w={36} h={36} fill={partOnBoard ? PAL.blue : PAL.lightGrey} />

          {/* Plate position */}
          <Txt x={343} y={302}>Placa está em:</Txt>
          <Box x={343} y={326} w={20} h={20} fill={plateLamp('jaka')} />
          <Txt x={368} y={326}>Jaka</Txt>
          <Box x={433} y={326} w={20} h={20} fill={plateLamp('conveyor')} />
          <Txt x={458} y={326}>Esteira</Txt>
          <Box x={523} y={326} w={20} h={20} fill={plateLamp('staubli')} />
          <Txt x={548} y={326}>Stäubli</Txt>

          {/* Legend */}
          <Txt x={16} y={450}>Legenda:</Txt>
          {(
            [
              [91, PAL.grey, 'Aguardando'],
              [201, PAL.yellow, 'Em andamento'],
              [326, PAL.done, 'Feito'],
              [401, PAL.blue, 'Peça'],
            ] as const
          ).map(([x, fill, label]) => (
            <g key={label}>
              <Box x={x} y={453} w={14} h={14} fill={fill} />
              <Txt x={x + 20} y={450}>{label}</Txt>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
