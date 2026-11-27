// Taught poses of each robot, in joint space. The estimator moves the robots
// between these poses following the PLC signals (see src/estimator/tasks.ts).
//
// PLACEHOLDER VALUES, computed from the placeholder layout (src/model/layout.ts)
// with the inverse kinematics in src/model/kinematics.ts. Replace each entry
// with the real joint values written as plain numbers:
//   - Jaka: jog to each point (or open the taught point) in the Jaka app on the
//     cell tablet and copy J1..J6 in degrees.
//   - Stäubli: on the SP2 pendant, jog in joint mode to each point (or check the
//     VAL3 point) and copy J1, J2, J4 in degrees and J3 in mm.
// Then set POSES_ARE_PLACEHOLDERS to false.

import { jakaIkDown, SCARA, scaraIk } from './kinematics';
import { LAYOUT, onPlate, toRobotFrame, type Point2, type Point3 } from './layout';

export type Pose = readonly number[];

export const POSES_ARE_PLACEHOLDERS = true;

const { approach, part, plate, marker, board } = LAYOUT;
const beltTop = LAYOUT.conveyors.jakaToStaubli.height;
const top = SCARA.zTop;
const at = (p: Point2, z: number): Point3 => ({ x: p.x, y: p.y, z });

const staubli = (p: Point3) => scaraIk(toRobotFrame('staubli', p));
const jaka = (p: Point3) => jakaIkDown(toRobotFrame('jaka', p));

/** Gripper tip height that grips the plate's handle block; the plate lies on `surface`. */
export const plateGrip = (surface: number) => surface + plate.thickness + part.gripZ;
/** Gripper tip height that grips a part by its sides; the part stands on `surface`. */
const partGrip = (surface: number) => surface + part.gripZ;
/** Gripper tip height that grips the upright marker standing on `surface`. */
const markerGrip = (surface: number) => surface + marker.standOffset + marker.tipReach;
/** Gripper tip height while the marker tip touches the board. */
export const DRAW_Z = board.z + marker.tipReach;

const plateStart = LAYOUT.jakaPlateStart;
const beltStart = LAYOUT.conveyors.jakaToStaubli.from;
const beltEnd = LAYOUT.conveyors.jakaToStaubli.to;
const spot = LAYOUT.staubliPlateSpot;
const holder = LAYOUT.staubliMarkerHolder;

/** Jaka Minicobo, [J1..J6] in degrees. */
export const JAKA_POSES = {
  home: jaka(LAYOUT.jakaHome),
  abovePlate: jaka(at(plateStart, plateGrip(plateStart.z) + approach)),
  pickPlate: jaka(at(plateStart, plateGrip(plateStart.z))),
  aboveConveyor: jaka(at(beltStart, plateGrip(beltTop) + approach)),
  placeConveyor: jaka(at(beltStart, plateGrip(beltTop))),
} satisfies Record<string, Pose>;

/** Stäubli SCARA, [J1 deg, J2 deg, J3 mm, J4 deg]. J3 = 0 is fully up. */
export const STAUBLI_POSES = {
  home: staubli(at(LAYOUT.staubliHome, top)),
  abovePickPlate: staubli(at(beltEnd, top)),
  pickPlate: staubli(at(beltEnd, plateGrip(beltTop))),
  abovePlateSpot: staubli(at(spot, top)),
  placePlate: staubli(at(spot, plateGrip(spot.z))),
  aboveHolder: staubli(at(holder, top)),
  pickHolder: staubli(at(holder, markerGrip(holder.z))),
} satisfies Record<string, Pose>;

export interface PartPoses {
  aboveOnPlate: Pose;
  pickOnPlate: Pose;
  aboveSlot: Pose;
  placeSlot: Pose;
}

/**
 * Stäubli poses for each part: pick it from its plate hole (the part stands
 * on the table through the hole) and place it on its board slot.
 */
export const STAUBLI_PART_POSES: readonly PartPoses[] = plate.partSpots.map((offset, i) => {
  const inHole = onPlate(spot, offset);
  const slot = LAYOUT.boardSlots[i]!;
  return {
    aboveOnPlate: staubli(at(inHole, top)),
    pickOnPlate: staubli(at(inHole, partGrip(spot.z))),
    aboveSlot: staubli(at(slot, top)),
    placeSlot: staubli(at(slot, partGrip(board.z))),
  };
});

const EDGE_STEPS = 4;

/**
 * Path that draws a square around `centre`: approach above the first corner,
 * pen down, the four edges (several points per edge so the joint
 * interpolation stays close to a straight line), pen up.
 */
function squarePath(centre: Point2): Pose[] {
  const h = LAYOUT.squareHalf;
  const corners: Point2[] = [
    { x: centre.x - h, y: centre.y - h },
    { x: centre.x + h, y: centre.y - h },
    { x: centre.x + h, y: centre.y + h },
    { x: centre.x - h, y: centre.y + h },
  ];
  const first = corners[0]!;
  const path: Pose[] = [staubli(at(first, DRAW_Z + 40)), staubli(at(first, DRAW_Z))];
  for (let c = 0; c < 4; c++) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    for (let k = 1; k <= EDGE_STEPS; k++) {
      const t = k / EDGE_STEPS;
      path.push(staubli(at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, DRAW_Z)));
    }
  }
  path.push(staubli(at(first, DRAW_Z + 40)));
  return path;
}

/** Drawing path of the square around each part. */
export const STAUBLI_SQUARES: readonly Pose[][] = LAYOUT.boardSlots.map(squarePath);
