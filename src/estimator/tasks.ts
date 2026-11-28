// Robot tasks of the whiteboard application as seen from the PLC
// (NewProgram in plc/ProjetoFinalRobotica, docs/whiteboard-application.md).
// See docs/robot-estimation.md for the reasoning behind each event.
//
// Every command uses a four-phase handshake, so most segments end on an exact
// PLC event. Optional events are progress pulses the robot programs may set:
//   Jaka DO5    = plate gripped
//   Stäubli DO6 = one part placed      Stäubli DO7 = one square drawn
// Until a pulse has been seen once, its segment advances on time.

import type { RobotId } from '../model/cell';
import { PART_COUNT } from '../model/layout';
import { JAKA_POSES as J, STAUBLI_PART_POSES, STAUBLI_POSES as S, STAUBLI_SQUARES } from '../model/poses';
import type { SegmentDef, TaskDef } from './engine';

/** "part 1" with several parts, "the part" with one. */
const partName = (i: number) => (PART_COUNT > 1 ? `part ${i + 1}` : 'the part');
const squareName = (i: number) => (PART_COUNT > 1 ? `square ${i + 1}` : 'the square');

/**
 * Stäubli: pick each part from the plate and place it on the board. The last
 * one goes home before DONE (Stäubli DO4); the others end on the optional
 * "part placed" pulse (Stäubli DO6).
 */
const partSegments: SegmentDef[] = STAUBLI_PART_POSES.flatMap((p, i): SegmentDef[] => {
  const last = i === PART_COUNT - 1;
  return [
    {
      label: `Picking ${partName(i)}`,
      path: [p.aboveOnPlate, p.pickOnPlate, p.aboveOnPlate],
      defaultMs: 1500,
      grip: { at: 1, closed: true },
      meta: { item: 'part', part: i },
      endsOn: [],
    },
    {
      label: `Placing ${partName(i)} on the board`,
      path: last ? [p.aboveSlot, p.placeSlot, p.aboveSlot, S.home] : [p.aboveSlot, p.placeSlot, p.aboveSlot],
      defaultMs: last ? 2000 : 1500,
      grip: { at: 1, closed: false },
      meta: { item: 'part', part: i },
      endsOn: last ? [{ signal: 'staubliDo4', when: 'rise' }] : [{ signal: 'staubliDo6', when: 'rise', optional: true }],
    },
  ];
});

/** Stäubli: one square around each part, ending on the optional "square drawn" pulse (Stäubli DO7). */
const squareSegments: SegmentDef[] = STAUBLI_SQUARES.map((path, i) => ({
  label: `Drawing ${squareName(i)}`,
  path,
  // The real Stäubli takes about 8 s per square (timed on the cell).
  defaultMs: 8000,
  noLift: true,
  meta: { square: i },
  endsOn: [{ signal: 'staubliDo7', when: 'rise', optional: true }],
}));

export const TASKS: Record<RobotId, TaskDef> = {
  jaka: {
    robot: 'jaka',
    // Cobot joints, deg/s (nominal, for timing the moves only).
    jointSpeeds: [90, 90, 90, 120, 120, 120],
    segments: [
      {
        // PLC step 0 sets Jaka DI3: put the plate on the conveyor.
        label: 'Home, waiting for the PLC',
        path: [J.home],
        defaultMs: 2000,
        learn: false,
        // DI3 stays on for the whole cycle, so only its rise starts a pick.
        endsOn: [{ signal: 'jakaDi3', when: 'rise' }],
      },
      {
        label: 'Picking the plate',
        // Measured on the cell: about 14 s from Jaka DI3 to the plate released
        // on the conveyor (Jaka DO7), split over the three segments below.
        path: [J.abovePlate, J.pickPlate, J.abovePlate],
        defaultMs: 6000,
        grip: { at: 1, closed: true },
        meta: { item: 'plate' },
        endsOn: [{ signal: 'jakaDo5', when: 'rise', optional: true }],
      },
      {
        label: 'Putting the plate on the conveyor',
        path: [J.aboveConveyor, J.placeConveyor],
        defaultMs: 6500,
        endsOn: [{ signal: 'jakaSensor', when: 'rise' }],
      },
      {
        // DONE: Jaka DO7. The PLC then clears DI3 and starts the conveyor.
        label: 'Releasing the plate',
        path: [J.placeConveyor, J.aboveConveyor],
        defaultMs: 1500,
        grip: { at: 0, closed: false },
        meta: { item: 'plate' },
        endsOn: [{ signal: 'jakaDo7', when: 'rise' }],
      },
      {
        label: 'Returning home',
        path: [J.aboveConveyor, J.home],
        defaultMs: 2000,
        endsOn: [],
      },
    ],
  },
  staubli: {
    robot: 'staubli',
    // J1, J2, J4 in deg/s and J3 in mm/s (nominal, for timing the moves only).
    jointSpeeds: [300, 300, 400, 600],
    // Lift J3 to the top before J1/J2/J4 move, like VAL3 approach points.
    travelAxis: { axis: 2, safe: 0 },
    segments: [
      {
        // PLC step 2 sets Stäubli DI12 once the plate has arrived.
        label: 'Home, waiting for the plate',
        path: [S.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'staubliDi12', when: 'high' }],
      },
      {
        // The plate leaves Sensor Stäubli when it is lifted.
        label: 'Picking the plate',
        path: [S.abovePickPlate, S.pickPlate, S.abovePickPlate],
        defaultMs: 1500,
        grip: { at: 1, closed: true },
        meta: { item: 'plate' },
        endsOn: [{ signal: 'staubliSensor', when: 'fall' }],
      },
      {
        label: 'Putting the plate on the table',
        path: [S.abovePlateSpot, S.placePlate, S.abovePlateSpot],
        defaultMs: 2000,
        grip: { at: 1, closed: false },
        meta: { item: 'plate' },
        endsOn: [],
      },
      // Pick and place each part; DONE: Stäubli DO4, after going home.
      ...partSegments,
      {
        // PLC step 4 sets Stäubli DI14.
        label: 'Home, waiting for the PLC',
        path: [S.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'staubliDi14', when: 'high' }],
      },
      {
        label: 'Picking the marker',
        path: [S.aboveHolder, S.pickHolder, S.aboveHolder],
        defaultMs: 1500,
        grip: { at: 1, closed: true },
        meta: { item: 'marker' },
        endsOn: [],
      },
      ...squareSegments,
      {
        // DONE: Stäubli DO5, after going home.
        label: 'Storing the marker',
        path: [S.aboveHolder, S.pickHolder, S.aboveHolder, S.home],
        defaultMs: 2000,
        grip: { at: 1, closed: false },
        meta: { item: 'marker' },
        endsOn: [{ signal: 'staubliDo5', when: 'rise' }],
      },
    ],
  },
};
