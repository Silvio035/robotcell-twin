// Static cell and moving objects for the 3D view (mm, z up). Shapes and
// colours follow photos of the cell; sizes and positions are the placeholder
// layout in src/model/layout.ts.

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, RepeatWrapping, Shape } from 'three';
import type { SignalId } from '../model/cell';
import { LAYOUT, onPlate, PART_COUNT, type ConveyorLayout, type Point2 } from '../model/layout';
import { signalValue } from '../model/messages';
import { useTwinStore } from '../state/store';
import { frameTime, robotAt } from './frame';

const { board, part, plate, plateGuide, marker } = LAYOUT;
const TABLE_THICKNESS = 30;
const TABLE_LEG = 700;
/** Belt travel time measured on the cell, for the belt animation. */
const BELT_TRAVEL_MS = 7000;

const COLORS = {
  wood: '#7b4a2c',
  tableLeg: '#2a2e33',
  floor: '#1a2028',
  aluminium: '#c5cad0',
  belt: '#1d6a45',
  beltStripe: '#24784f',
  sensor: '#43c95a',
  sensorDark: '#1c2126',
  plate: '#9aa1a8',
  partBody: '#1e2226',
  partCap: '#8f969d',
  guide: '#8f969d',
  boardFrame: '#2b2f34',
  holder: '#1e2226',
};

function stripeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = COLORS.belt;
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = COLORS.beltStripe;
  ctx.fillRect(0, 0, 6, 8);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

function Table({ t }: { t: (typeof LAYOUT.tables)[number] }) {
  const w = t.maxX - t.minX;
  const d = t.maxY - t.minY;
  const legs: Point2[] = [
    { x: t.minX + 40, y: t.minY + 40 },
    { x: t.maxX - 40, y: t.minY + 40 },
    { x: t.minX + 40, y: t.maxY - 40 },
    { x: t.maxX - 40, y: t.maxY - 40 },
  ];
  return (
    <group>
      <mesh position={[(t.minX + t.maxX) / 2, (t.minY + t.maxY) / 2, -TABLE_THICKNESS / 2]}>
        <boxGeometry args={[w, d, TABLE_THICKNESS]} />
        <meshStandardMaterial color={COLORS.wood} roughness={0.55} />
      </mesh>
      {legs.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, -TABLE_THICKNESS - TABLE_LEG / 2]}>
          <boxGeometry args={[40, 40, TABLE_LEG]} />
          <meshStandardMaterial color={COLORS.tableLeg} />
        </mesh>
      ))}
    </group>
  );
}

/** Green box sensor; the indicator lights and a beam crosses the belt when it sees the plate. */
function SensorPair({ id, layout, at }: { id: SignalId; layout: ConveyorLayout; at: Point2 }) {
  const led = useRef<MeshStandardMaterial>(null);
  const beam = useRef<Mesh>(null);
  useFrame(() => {
    const on = signalValue(useTwinStore.getState().io, id) === true;
    led.current?.color.set(on ? '#ffcf3f' : '#3a3f45');
    led.current?.emissive.set(on ? '#ffb000' : '#000000');
    if (beam.current) beam.current.visible = on;
  });
  const side = layout.width / 2 + 28;
  const z = layout.height + 30;
  return (
    <group position={[at.x, at.y, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, s * side, z]}>
          <mesh>
            <boxGeometry args={[45, 34, 50]} />
            <meshStandardMaterial color={COLORS.sensor} roughness={0.6} />
          </mesh>
          <mesh position={[0, -s * 17.5, 0]}>
            <boxGeometry args={[30, 2, 22]} />
            <meshStandardMaterial color={COLORS.sensorDark} />
          </mesh>
          {s === 1 && (
            <mesh position={[0, 0, 26]}>
              <boxGeometry args={[8, 8, 3]} />
              <meshStandardMaterial ref={led} color="#3a3f45" />
            </mesh>
          )}
        </group>
      ))}
      <mesh ref={beam} position={[0, 0, z]} visible={false}>
        <boxGeometry args={[3, side * 2 - 34, 3]} />
        <meshBasicMaterial color="#ff4040" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function Conveyor({ id, layout }: { id: SignalId; layout: ConveyorLayout }) {
  const dx = layout.to.x - layout.from.x;
  const dy = layout.to.y - layout.from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const tex = useMemo(() => {
    const t = stripeTexture();
    t.repeat.set(length / 120, 1);
    return t;
  }, [length]);

  useFrame((_, delta) => {
    const running = signalValue(useTwinStore.getState().io, id) === true;
    // One texture period is 120 mm; the belt runs its length in BELT_TRAVEL_MS.
    if (running) tex.offset.x -= (delta * 1000 * length) / BELT_TRAVEL_MS / 120;
  });

  const cx = (layout.from.x + layout.to.x) / 2;
  const cy = (layout.from.y + layout.to.y) / 2;
  // The belt runs past both plate positions so the end stops sit beyond the plate.
  const total = length + 220;
  const h = layout.height;
  return (
    <group position={[cx, cy, 0]} rotation-z={angle}>
      {/* Frame under the belt and the two side rails. */}
      <mesh position={[0, 0, (h - 30) / 2]}>
        <boxGeometry args={[total, layout.width, h - 30]} />
        <meshStandardMaterial color="#3a4048" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, s * (layout.width / 2 + 10), h - 12]}>
          <boxGeometry args={[total, 20, 40]} />
          <meshStandardMaterial color={COLORS.aluminium} metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
      {/* Belt. */}
      <mesh position={[0, 0, h - 3]}>
        <boxGeometry args={[total - 20, layout.width, 6]} />
        <meshStandardMaterial map={tex} roughness={0.4} />
      </mesh>
      {/* End blocks, drive motor at the Jaka end and the end stop bars. */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (total / 2 + 25), 0, 0]}>
          <mesh position={[0, 0, h / 2]}>
            <boxGeometry args={[50, layout.width + 40, h]} />
            <meshStandardMaterial color={COLORS.aluminium} metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[-s * 30, 0, h + 14]}>
            <boxGeometry args={[6, layout.width + 30, 4]} />
            <meshStandardMaterial color="#d9dde2" metalness={0.7} roughness={0.25} />
          </mesh>
        </group>
      ))}
      <group position={[-(total / 2 + 25), -(layout.width / 2 + 75), h / 2]}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[40, 40, 110, 24]} />
          <meshStandardMaterial color="#15181b" />
        </mesh>
      </group>
    </group>
  );
}

/** L-shaped corner guides around the plate outline at its start on the Jaka table. */
function PlateGuides() {
  const c = onPlate(LAYOUT.jakaPlateStart, plate.centre);
  const hx = plate.length / 2 + plateGuide.width / 2 + 2;
  const hy = plate.width / 2 + plateGuide.width / 2 + 2;
  const { leg, width } = plateGuide;
  return (
    <group position={[c.x, c.y, 2]}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy]) => (
        <group key={`${sx}${sy}`} position={[sx! * hx, sy! * hy, 0]}>
          <mesh position={[-sx! * (leg / 2 - width / 2), 0, 0]}>
            <boxGeometry args={[leg, width, 4]} />
            <meshStandardMaterial color={COLORS.guide} />
          </mesh>
          <mesh position={[0, -sy! * (leg / 2 - width / 2), 0]}>
            <boxGeometry args={[width, leg, 4]} />
            <meshStandardMaterial color={COLORS.guide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function StaticCell() {
  const belt = LAYOUT.conveyors.jakaToStaubli;
  const holder = LAYOUT.staubliMarkerHolder;
  return (
    <group>
      <mesh position={[700, 0, -TABLE_THICKNESS - TABLE_LEG]}>
        <boxGeometry args={[6000, 4000, 2]} />
        <meshStandardMaterial color={COLORS.floor} />
      </mesh>
      {LAYOUT.tables.map((t, i) => (
        <Table key={i} t={t} />
      ))}
      <Conveyor id="conveyorJakaToStaubli" layout={belt} />
      <SensorPair id="jakaSensor" layout={belt} at={{ x: belt.from.x - 40, y: belt.from.y }} />
      <SensorPair id="staubliSensor" layout={belt} at={{ x: belt.to.x + 60, y: belt.to.y }} />
      {/* Whiteboard: white sheet in a dark frame. */}
      <mesh position={[board.x, board.y, board.z / 2]}>
        <boxGeometry args={[board.width + 16, board.depth + 16, board.z - 0.5]} />
        <meshStandardMaterial color={COLORS.boardFrame} />
      </mesh>
      <mesh position={[board.x, board.y, board.z / 2]}>
        <boxGeometry args={[board.width, board.depth, board.z]} />
        <meshStandardMaterial color="#f7f8f9" roughness={0.3} />
      </mesh>
      <PlateGuides />
      {/* Marker holder (the plate lies on the Stäubli table, no stand). */}
      <mesh position={[holder.x, holder.y, holder.z / 2]}>
        <boxGeometry args={[45, 45, holder.z]} />
        <meshStandardMaterial color={COLORS.holder} />
      </mesh>
    </group>
  );
}

/** Ink of the squares, a thin line just above the board. */
export function Ink() {
  const ink = useTwinStore((s) => s.items?.ink);
  if (!ink) return null;
  return (
    <group>
      {ink.map((line, i) =>
        line.length > 1 ? (
          <Line key={i} points={line.map((p) => [p.x, p.y, board.z + 0.8] as [number, number, number])} color="#1d2b8f" lineWidth={3} />
        ) : null,
      )}
    </group>
  );
}

/** Plate outline with its 3 square holes, extruded; origin under the handle, bottom face. */
function usePlateGeometry(): ExtrudeGeometry {
  return useMemo(() => {
    const { length, width, thickness, holeSize, centre, holes } = plate;
    const r = 6;
    const x0 = centre.x - length / 2;
    const y0 = centre.y - width / 2;
    const outline = new Shape();
    outline.moveTo(x0 + r, y0);
    outline.lineTo(x0 + length - r, y0);
    outline.quadraticCurveTo(x0 + length, y0, x0 + length, y0 + r);
    outline.lineTo(x0 + length, y0 + width - r);
    outline.quadraticCurveTo(x0 + length, y0 + width, x0 + length - r, y0 + width);
    outline.lineTo(x0 + r, y0 + width);
    outline.quadraticCurveTo(x0, y0 + width, x0, y0 + width - r);
    outline.lineTo(x0, y0 + r);
    outline.quadraticCurveTo(x0, y0, x0 + r, y0);
    const h = holeSize / 2;
    for (const c of holes) {
      const hole = new Path();
      hole.moveTo(c.x - h, c.y - h);
      hole.lineTo(c.x - h, c.y + h);
      hole.lineTo(c.x + h, c.y + h);
      hole.lineTo(c.x + h, c.y - h);
      hole.closePath();
      outline.holes.push(hole);
    }
    return new ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false });
  }, []);
}

/** One square part, origin at the centre of its bottom face. */
function PartMesh({ refCb }: { refCb?: (g: Group | null) => void }) {
  const body = part.height - part.capHeight;
  return (
    <group ref={refCb}>
      <mesh position={[0, 0, body / 2]}>
        <boxGeometry args={[part.size, part.size, body]} />
        <meshStandardMaterial color={COLORS.partBody} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, body + part.capHeight / 2]}>
        <boxGeometry args={[part.size - 3, part.size - 3, part.capHeight]} />
        <meshStandardMaterial color={COLORS.partCap} />
      </mesh>
    </group>
  );
}

/** Plate (origin under its handle, bottom face), the parts and the marker. */
export function Items3D() {
  const plateRef = useRef<Group>(null);
  const markerRef = useRef<Group>(null);
  const partRefs = useRef<(Group | null)[]>([]);
  const plateGeometry = usePlateGeometry();

  useFrame((state) => {
    const items = useTwinStore.getState().items;
    const now = frameTime(state.clock.elapsedTime);
    const visible = items !== null;
    if (plateRef.current) plateRef.current.visible = visible;
    if (markerRef.current) markerRef.current.visible = visible;
    partRefs.current.forEach((g) => g && (g.visible = visible));
    if (!items) return;

    // Plate: under the handle, bottom face.
    const belt = LAYOUT.conveyors.jakaToStaubli;
    let p = { x: 0, y: 0, z: 0 };
    if (items.plate === 'jakaTable') p = { ...LAYOUT.jakaPlateStart };
    else if (items.plate === 'staubliTable') p = { ...LAYOUT.staubliPlateSpot };
    else if (items.plate === 'belt') {
      const t = items.belt;
      p = { x: belt.from.x + (belt.to.x - belt.from.x) * t, y: belt.from.y + (belt.to.y - belt.from.y) * t, z: belt.height };
    } else {
      const tool = robotAt(items.plate === 'jakaGripper' ? 'jaka' : 'staubli', now).tool;
      // Held by its handle.
      p = { x: tool.x, y: tool.y, z: tool.z - plate.thickness - part.gripZ };
    }
    plateRef.current?.position.set(p.x, p.y, p.z);

    // Parts: bottom face. In the plate a part sits in its hole, level with the plate's bottom.
    const staubliTool = robotAt('staubli', now).tool;
    items.parts.forEach((place, i) => {
      const g = partRefs.current[i];
      if (!g) return;
      const at =
        place === 'plate'
          ? { ...onPlate(p, plate.partSpots[i]!), z: p.z }
          : place === 'board'
            ? { ...LAYOUT.boardSlots[i]!, z: board.z }
            : { x: staubliTool.x, y: staubliTool.y, z: staubliTool.z - part.gripZ };
      g.position.set(at.x, at.y, at.z);
    });

    // Marker: position of its tip.
    const holder = LAYOUT.staubliMarkerHolder;
    const tip =
      items.marker === 'holder'
        ? { x: holder.x, y: holder.y, z: holder.z + marker.standOffset }
        : (() => {
            const tool = robotAt('staubli', now).tool;
            return { x: tool.x, y: tool.y, z: tool.z - marker.tipReach };
          })();
    markerRef.current?.position.set(tip.x, tip.y, tip.z);
  });

  return (
    <group>
      <group ref={plateRef}>
        <mesh geometry={plateGeometry}>
          <meshStandardMaterial color={COLORS.plate} roughness={0.6} />
        </mesh>
        {/* Handle: a block fixed on the plate, where both robots grip it. */}
        <group position={[0, 0, plate.thickness]}>
          <PartMesh />
        </group>
      </group>
      {Array.from({ length: PART_COUNT }, (_, i) => (
        <PartMesh key={i} refCb={(g) => void (partRefs.current[i] = g)} />
      ))}
      <group ref={markerRef}>
        <mesh position={[0, 0, marker.length / 2]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[marker.diameter / 2, marker.diameter / 2, marker.length, 16]} />
          <meshStandardMaterial color="#e9edf1" />
        </mesh>
        <mesh position={[0, 0, marker.length - 12]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[marker.diameter / 2 + 1, marker.diameter / 2 + 1, 24, 16]} />
          <meshStandardMaterial color="#1d2b8f" />
        </mesh>
        <mesh position={[0, 0, 4]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[3, marker.diameter / 3, 8, 12]} />
          <meshStandardMaterial color="#1d2b8f" />
        </mesh>
      </group>
    </group>
  );
}
