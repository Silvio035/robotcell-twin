// Cell layout seen from above, in millimetres.
// Every Stäubli point is kept between -90° and +135° around its base so the
// joint interpolation never wraps through ±180°.
// Origin at the Stäubli base, +x towards the Jaka, z up from the table top.
//
// PLACEHOLDER VALUES: chosen so both robots can reach their points, not
// measured on the cell. Measure the real positions and set
// LAYOUT_IS_PLACEHOLDER to false.

import type { RobotId } from './cell';

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 extends Point2 {
  z: number;
}

export interface RobotMount extends Point2 {
  /** Rotation of the robot base frame around z, degrees counter-clockwise. */
  yaw: number;
}

export interface ConveyorLayout {
  /** Belt centre line, in the direction the belt moves. */
  from: Point2;
  to: Point2;
  width: number;
  /** Belt surface height above the table. */
  height: number;
}

export const LAYOUT_IS_PLACEHOLDER = true;

export const LAYOUT = {
  /** Area drawn in the 2D view. */
  bounds: { minX: -650, maxX: 2050, minY: -650, maxY: 650 },
  robots: {
    staubli: { x: 0, y: 0, yaw: 0 },
    jaka: { x: 1500, y: 0, yaw: 0 },
  } satisfies Record<RobotId, RobotMount>,
  /**
   * Two tables side by side (Stäubli and Jaka) with a gap between them; the
   * conveyor crosses the gap, as on the cell.
   */
  tables: [
    { minX: -650, maxX: 820, minY: -650, maxY: 650 },
    { minX: 880, maxX: 2050, minY: -650, maxY: 650 },
  ],
  /**
   * The cell's one conveyor, green belt on an aluminium frame, with an end
   * stop bar and a sensor pair (green boxes on both sides) at each end.
   * Output `Esteira_StaubliJaka` is wired but has no belt.
   */
  conveyors: {
    jakaToStaubli: { from: { x: 1150, y: -150 }, to: { x: 450, y: -150 }, width: 120, height: 100 },
  } satisfies Record<string, ConveyorLayout>,
  /**
   * Square block (dark body, grey cap) standing upright on the plate. The
   * Stäubli grips it by two sides at `gripZ` above its bottom.
   */
  part: { size: 25, height: 25, capHeight: 5, gripZ: 15 },
  /**
   * Grey plate with 3 square holes in a triangle: two at the far edge and
   * one in the middle of the near edge. Every plate position in this file is
   * the centre of that near hole (the grip hole), where both grippers take
   * the plate with the fingers opening inside it. Offsets below are from it:
   * `centre` of the plate outline, `holes`, and `partSpots`, where each part
   * stands on the plate (one for now, between the far holes; see PART_COUNT).
   */
  plate: {
    length: 150,
    width: 100,
    thickness: 8,
    holeSize: 25,
    centre: { x: 0, y: 22 },
    holes: [
      { x: -45, y: 44 },
      { x: 45, y: 44 },
      { x: 0, y: 0 },
    ],
    partSpots: [{ x: 0, y: 44 }],
  },
  /** L-shaped corner guides that locate the plate at its start on the Jaka table. */
  plateGuide: { leg: 35, width: 12 },
  /** Marker standing tip down in its holder; tipReach = tip below the gripper tip. */
  marker: { length: 130, diameter: 18, tipReach: 60, standOffset: 5 },
  /** Whiteboard on the Stäubli table (centre, size, top surface height). */
  board: { x: -200, y: 300, width: 300, depth: 200, z: 5 },
  /** Part centres on the board, one per part; a square is drawn around each one. */
  boardSlots: [{ x: -200, y: 300 }],
  /** Half side of the drawn squares. */
  squareHalf: 45,
  /** Plate centre at the start (Jaka table) and on the Stäubli stand (z = stand top). */
  jakaPlateStart: { x: 1500, y: -380, z: 0 },
  staubliPlateSpot: { x: 280, y: 330, z: 30 },
  /** Marker holder on the Stäubli table (start and end of every run). */
  staubliMarkerHolder: { x: 150, y: -380, z: 40 },
  /** Approach height above pick and place points. */
  approach: 80,
  /** Tool positions at home. */
  staubliHome: { x: 350, y: 100 },
  jakaHome: { x: 1300, y: 200, z: 300 },
};

const rad = (deg: number) => (deg * Math.PI) / 180;

export function toCellFrame(robot: RobotId, p: Point3): Point3 {
  const m: RobotMount = LAYOUT.robots[robot];
  const c = Math.cos(rad(m.yaw));
  const s = Math.sin(rad(m.yaw));
  return { x: m.x + c * p.x - s * p.y, y: m.y + s * p.x + c * p.y, z: p.z };
}

export function toRobotFrame(robot: RobotId, p: Point3): Point3 {
  const m: RobotMount = LAYOUT.robots[robot];
  const c = Math.cos(rad(m.yaw));
  const s = Math.sin(rad(m.yaw));
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy, z: p.z };
}

/** A point given as an offset in LAYOUT.plate, for a plate whose grip hole is at `ref`. */
export function onPlate(ref: Point2, offset: Point2): Point2 {
  return { x: ref.x + offset.x, y: ref.y + offset.y };
}

/**
 * Parts per run: one part on the plate, placed on the board, one square
 * around it. Matches NUM_PECAS in NewProgram.var. To go back to more parts,
 * add a spot to plate.partSpots and a slot to boardSlots for each one.
 */
export const PART_COUNT = LAYOUT.boardSlots.length;
if (LAYOUT.plate.partSpots.length !== PART_COUNT) throw new Error('LAYOUT: one plate spot per board slot');
