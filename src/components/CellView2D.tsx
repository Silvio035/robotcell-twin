// Top view of the cell, drawn to scale from src/model/layout.ts (mm).
// Arms come from forward kinematics of the joints (live when available,
// otherwise estimated from the PLC), plate, parts, marker and ink from the
// item estimator.
// Tool height is shown on a gauge next to each robot because a top view
// cannot show it.

import { useRobotView } from '../hooks/useRobotView';
import { pointsOfRobot, type RobotId, type SignalId } from '../model/cell';
import { jakaFk, SCARA, scaraFk } from '../model/kinematics';
import { LAYOUT, onPlate, toCellFrame, type ConveyorLayout, type Point2, type Point3 } from '../model/layout';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';
import { useTwinStore } from '../state/store';

const PANEL = 100; // side columns with the robot signals
const MARGIN = 28;
const { bounds } = LAYOUT;
const K = 0.295; // SVG units per mm
const VIEW = {
  w: PANEL * 2 + (bounds.maxX - bounds.minX) * K,
  h: MARGIN * 2 + (bounds.maxY - bounds.minY) * K,
};

const sx = (x: number) => PANEL + (x - bounds.minX) * K;
const sy = (y: number) => MARGIN + (bounds.maxY - y) * K;
const sp = (p: Point2) => ({ x: sx(p.x), y: sy(p.y) });

const JAKA_REACH = 580;
const Z_RANGE: Record<RobotId, { min: number; max: number }> = {
  staubli: { min: SCARA.zTop - SCARA.stroke, max: SCARA.zTop },
  jaka: { min: 0, max: 450 },
};
const NAMES: Record<RobotId, string> = { staubli: 'Stäubli', jaka: 'Jaka' };

const CONVEYORS: { id: SignalId; layout: ConveyorLayout; label: string }[] = [
  { id: 'conveyorJakaToStaubli', layout: LAYOUT.conveyors.jakaToStaubli, label: 'Conveyor Jaka → Stäubli' },
];
/** The belt runs past both plate positions (same as the 3D view). */
const BELT_OVERRUN = 110;

function ledClass(value: boolean | null): string {
  return value === null ? 'svg-led-unknown' : value ? 'svg-led-on' : 'svg-led-off';
}

function Led({ x, y, value, label }: { x: number; y: number; value: boolean | null; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5} className={ledClass(value)} />
      {label && (
        <text x={x + 10} y={y + 4} className="svg-small">
          {label}
        </text>
      )}
    </g>
  );
}

/** A square part seen from above: dark body with its grey cap. */
function Part({ at }: { at: Point2 }) {
  const p = sp(at);
  const s = LAYOUT.part.size * K;
  return (
    <g>
      <rect x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} rx={1} className="svg-part" />
      <rect x={p.x - s / 2 + 1.2} y={p.y - s / 2 + 1.2} width={s - 2.4} height={s - 2.4} className="svg-part-body" />
    </g>
  );
}

/** The plate seen from above, with its 3 square holes. `at` is its grip hole. */
function Plate({ at }: { at: Point2 }) {
  const { length, width, centre, holes, holeSize } = LAYOUT.plate;
  const p = sp(onPlate(at, centre));
  const h = holeSize * K;
  return (
    <g>
      <rect x={p.x - (length * K) / 2} y={p.y - (width * K) / 2} width={length * K} height={width * K} rx={2} className="svg-plate" />
      {holes.map((offset, i) => {
        const c = sp(onPlate(at, offset));
        return <rect key={i} x={c.x - h / 2} y={c.y - h / 2} width={h} height={h} className="svg-plate-hole" />;
      })}
    </g>
  );
}

/** L-shaped corner guides around the plate outline at its start on the Jaka table. */
function PlateGuides() {
  const { length, width, centre } = LAYOUT.plate;
  const c = sp(onPlate(LAYOUT.jakaPlateStart, centre));
  const hx = (length / 2 + 8) * K;
  const hy = (width / 2 + 8) * K;
  const leg = LAYOUT.plateGuide.leg * K;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return (
    <g>
      {corners.map(([dx, dy]) => {
        const x = c.x + dx * hx;
        const y = c.y + dy * hy;
        return (
          <polyline key={`${dx}${dy}`} points={`${x - dx * leg},${y} ${x},${y} ${x},${y - dy * leg}`} className="svg-guide" />
        );
      })}
    </g>
  );
}

/** The marker stands upright, so from above it is a circle. */
function Marker({ at }: { at: Point2 }) {
  const d = LAYOUT.marker.diameter * K;
  const p = sp(at);
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={d / 2 + 1} className="svg-marker" />
      <circle cx={p.x} cy={p.y} r={d / 4} className="svg-marker-tip" />
    </g>
  );
}

/** Tool position and drawing of one arm, in cell coordinates. */
function armGeometry(robot: RobotId, joints: readonly number[]): { chain: Point3[]; tool: Point3; toolYaw: number | null } {
  if (robot === 'staubli') {
    const fk = scaraFk(joints);
    const base = { x: 0, y: 0, z: SCARA.zTop };
    const chain = [base, fk.elbow, fk.tool].map((p) => toCellFrame('staubli', p));
    return { chain, tool: chain[2]!, toolYaw: fk.toolYaw + LAYOUT.robots.staubli.yaw };
  }
  const chain = jakaFk(joints).points.map((p) => toCellFrame('jaka', p));
  return { chain, tool: chain[chain.length - 1]!, toolYaw: null };
}

function ZGauge({ robot, z, x, y }: { robot: RobotId; z: number; x: number; y: number }) {
  const { min, max } = Z_RANGE[robot];
  const h = 70;
  const k = Math.min(Math.max((z - min) / (max - min), 0), 1);
  return (
    <g>
      <rect x={x - 3} y={y} width={6} height={h} rx={3} className="svg-progress-track" />
      <circle cx={x} cy={y + h * (1 - k)} r={5} className="svg-tool" />
      <text x={x} y={y - 6} textAnchor="middle" className="svg-small">
        Z {z.toFixed(0)} mm
      </text>
    </g>
  );
}

function Robot({ robot, now, gaugeX }: { robot: RobotId; now: number; gaugeX: number }) {
  const base = sp(LAYOUT.robots[robot]);
  const { joints, estimate } = useRobotView(robot, now);
  const geo = joints ? armGeometry(robot, joints) : null;
  const reach = robot === 'staubli' ? SCARA.l1 + SCARA.l2 : JAKA_REACH;
  const barWidth = 120;
  // Label block below the base, except the Staubli: the whiteboard is in front of it, so its labels go above.
  const ly = robot === 'staubli' ? base.y - 100 : base.y;

  return (
    <g>
      <circle cx={base.x} cy={base.y} r={reach * K} className="svg-reach" />
      <circle cx={base.x} cy={base.y} r={16} className="svg-robot" />
      {geo && (
        <g>
          <polyline points={geo.chain.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} className="svg-arm" />
          {geo.chain.slice(1, -1).map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} className="svg-joint" />
          ))}
          {geo.toolYaw !== null && (
            <line
              x1={sx(geo.tool.x) - 9 * Math.cos((geo.toolYaw * Math.PI) / 180)}
              y1={sy(geo.tool.y) + 9 * Math.sin((geo.toolYaw * Math.PI) / 180)}
              x2={sx(geo.tool.x) + 9 * Math.cos((geo.toolYaw * Math.PI) / 180)}
              y2={sy(geo.tool.y) - 9 * Math.sin((geo.toolYaw * Math.PI) / 180)}
              className="svg-gripper"
            />
          )}
          <circle cx={sx(geo.tool.x)} cy={sy(geo.tool.y)} r={4} className="svg-tool" />
          <ZGauge robot={robot} z={geo.tool.z} x={gaugeX} y={base.y - 35} />
        </g>
      )}
      {/* Labels last, outlined, so they stay readable when the arm crosses them. */}
      <text x={base.x} y={ly + 44} textAnchor="middle" className="svg-title svg-halo">
        {NAMES[robot]}
      </text>
      {estimate && (
        <g>
          <text x={base.x} y={ly + 60} textAnchor="middle" className="svg-phase svg-halo">
            {estimate.phase}
          </text>
          <rect x={base.x - barWidth / 2} y={ly + 67} width={barWidth} height={4} rx={2} className="svg-progress-track" />
          <rect
            x={base.x - barWidth / 2}
            y={ly + 67}
            width={barWidth * estimate.progress}
            height={4}
            rx={2}
            className="svg-progress"
          />
        </g>
      )}
    </g>
  );
}

function SignalPanel({ robot, io, x }: { robot: RobotId; io: PlcIoSnapshot | null; x: number }) {
  const fromRobot = pointsOfRobot(robot, 'di');
  const toRobot = pointsOfRobot(robot, 'do');
  return (
    <g>
      <text x={x} y={MARGIN + 6} className="svg-caption">
        {NAMES[robot]} → PLC
      </text>
      {fromRobot.map((p, i) => (
        <Led key={p.id} x={x + 6} y={MARGIN + 24 + i * 17} value={signalValue(io, p.id)} label={p.label} />
      ))}
      <text x={x} y={VIEW.h / 2 + 40} className="svg-caption">
        PLC → {NAMES[robot]}
      </text>
      {toRobot.map((p, i) => (
        <Led key={p.id} x={x + 6} y={VIEW.h / 2 + 58 + i * 17} value={signalValue(io, p.id)} label={p.label} />
      ))}
    </g>
  );
}

function Fixtures() {
  const { board, boardSlots, jakaPlateStart, staubliPlateSpot, staubliMarkerHolder, squareHalf, plate } = LAYOUT;
  const b = sp({ x: board.x - board.width / 2, y: board.y + board.depth / 2 });
  const area = (at: Point2, w: number, h: number, label: string) => {
    const p = sp(at);
    return (
      <g>
        <rect x={p.x - (w * K) / 2} y={p.y - (h * K) / 2} width={w * K} height={h * K} className="svg-area" />
        <text x={p.x} y={p.y + (h * K) / 2 + 11} textAnchor="middle" className="svg-small">
          {label}
        </text>
      </g>
    );
  };
  return (
    <g>
      <rect x={b.x} y={b.y} width={board.width * K} height={board.depth * K} rx={2} className="svg-board" />
      <text x={b.x + 4} y={b.y + 11} className="svg-small">
        Whiteboard
      </text>
      {boardSlots.map((slot, i) => {
        const c = sp({ x: slot.x - squareHalf, y: slot.y + squareHalf });
        return <rect key={i} x={c.x} y={c.y} width={2 * squareHalf * K} height={2 * squareHalf * K} className="svg-square-guide" />;
      })}
      <PlateGuides />
      {area(onPlate(jakaPlateStart, plate.centre), plate.length + 30, plate.width + 30, 'Plate (start)')}
      {area(onPlate(staubliPlateSpot, plate.centre), plate.length + 10, plate.width + 10, 'Plate drop')}
      {area(staubliMarkerHolder, 50, 50, 'Marker holder')}
    </g>
  );
}

function lerpPoint(a: Point2, b: Point2, t: number): Point2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function Items({ now }: { now: number }) {
  const items = useTwinStore((s) => s.items);
  const jaka = useRobotView('jaka', now);
  const staubli = useRobotView('staubli', now);
  if (!items) return null;
  const belt = LAYOUT.conveyors.jakaToStaubli;
  const jakaTool = jaka.joints ? armGeometry('jaka', jaka.joints).tool : null;
  const staubliTool = staubli.joints ? armGeometry('staubli', staubli.joints).tool : null;

  const plateAt: Point2 | null =
    items.plate === 'jakaTable'
      ? LAYOUT.jakaPlateStart
      : items.plate === 'staubliTable'
        ? LAYOUT.staubliPlateSpot
        : items.plate === 'belt'
          ? lerpPoint(belt.from, belt.to, items.belt)
          : items.plate === 'jakaGripper'
            ? jakaTool
            : staubliTool;
  const markerAt = items.marker === 'holder' ? LAYOUT.staubliMarkerHolder : staubliTool;

  return (
    <g>
      {items.ink.map((line, i) =>
        line.length > 1 ? (
          <polyline key={i} points={line.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} className="svg-ink" />
        ) : null,
      )}
      {plateAt && <Plate at={plateAt} />}
      {items.parts.map((place, i) => {
        if (place === 'plate') return plateAt ? <Part key={i} at={onPlate(plateAt, LAYOUT.plate.partSpots[i]!)} /> : null;
        if (place === 'board') return <Part key={i} at={LAYOUT.boardSlots[i]!} />;
        return staubliTool ? <Part key={i} at={staubliTool} /> : null;
      })}
      {markerAt && <Marker at={markerAt} />}
    </g>
  );
}

export function CellView2D({ io, stale, now }: { io: PlcIoSnapshot | null; stale: boolean; now: number }) {
  const data = stale ? null : io;
  const emergency = isEmergencyActive(data);
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="cell-view" role="img" aria-label="Robot cell, top view to scale">
      <rect x={1} y={1} width={VIEW.w - 2} height={VIEW.h - 2} rx={12} className={`svg-frame ${emergency ? 'is-emergency' : ''}`} />
      {LAYOUT.tables.map((t, i) => (
        <rect
          key={i}
          x={sx(t.minX)}
          y={sy(t.maxY)}
          width={(t.maxX - t.minX) * K}
          height={(t.maxY - t.minY) * K}
          rx={6}
          className="svg-table"
        />
      ))}

      {CONVEYORS.map((c) => {
        const running = signalValue(data, c.id) === true;
        const a = sp(c.layout.from);
        const b = sp(c.layout.to);
        const half = (c.layout.width * K) / 2;
        const rail = 20 * K;
        const x0 = Math.min(a.x, b.x) - BELT_OVERRUN * K;
        const len = Math.abs(b.x - a.x) + 2 * BELT_OVERRUN * K;
        return (
          <g key={c.id}>
            <rect x={x0} y={a.y - half - rail} width={len} height={2 * (half + rail)} rx={3} className="svg-conveyor" />
            <rect x={x0} y={a.y - half} width={len} height={half * 2} className="svg-belt-surface" />
            {[x0 + 4, x0 + len - 4].map((x) => (
              <line key={x} x1={x} y1={a.y - half - 2} x2={x} y2={a.y + half + 2} className="svg-end-stop" />
            ))}
            <line x1={x0 + 8} y1={a.y} x2={x0 + len - 8} y2={a.y} className={`svg-belt ${running ? 'run-backward' : ''}`} />
            <text x={(a.x + b.x) / 2} y={a.y + half + rail + 13} textAnchor="middle" className="svg-small">
              {c.label} {running ? '(running)' : ''}
            </text>
          </g>
        );
      })}

      {(['jakaSensor', 'staubliSensor'] as const).map((id) => {
        const belt = LAYOUT.conveyors.jakaToStaubli;
        const end = id === 'jakaSensor' ? { x: belt.from.x - 40, y: belt.from.y } : { x: belt.to.x + 60, y: belt.to.y };
        const on = signalValue(data, id);
        const side = belt.width / 2 + 28;
        const top = sp({ x: end.x, y: end.y + side });
        const bottom = sp({ x: end.x, y: end.y - side });
        const w = 45 * K;
        const h = 34 * K;
        return (
          <g key={id}>
            {on && <line x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} className="svg-beam" />}
            {[top, bottom].map((q, i) => (
              <rect key={i} x={q.x - w / 2} y={q.y - h / 2} width={w} height={h} rx={1.5} className="svg-sensor" />
            ))}
            <Led x={bottom.x} y={bottom.y + h / 2 + 9} value={on} label="" />
            <text x={bottom.x} y={bottom.y + h / 2 + 26} textAnchor="middle" className="svg-small">
              {id === 'jakaSensor' ? 'Sensor Jaka' : 'Sensor Stäubli'}
            </text>
          </g>
        );
      })}

      <Fixtures />

      <SignalPanel robot="staubli" io={data} x={8} />
      <SignalPanel robot="jaka" io={data} x={VIEW.w - PANEL + 8} />

      <Items now={now} />
      <Robot robot="staubli" now={now} gaugeX={sx(-560)} />
      <Robot robot="jaka" now={now} gaugeX={sx(1960)} />

      {emergency && (
        <text x={VIEW.w / 2} y={VIEW.h - 10} textAnchor="middle" className="svg-emergency">
          EMERGENCY STOP
        </text>
      )}
      {stale && (
        <g>
          <rect x={0} y={0} width={VIEW.w} height={VIEW.h} rx={12} className="svg-stale" />
          <text x={VIEW.w / 2} y={VIEW.h / 2} textAnchor="middle" className="svg-title">
            No live PLC data
          </text>
        </g>
      )}
    </svg>
  );
}
