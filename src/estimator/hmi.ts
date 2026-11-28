// What the HMI page (Init_Page in plc/ProjetoFinalRobotica) shows, computed
// from the PLC I/O and the item estimator with the same rules as the iCor*
// colours and counters in NewProgramCyclic.st. Shared by the cycle panel and
// the HMI replica so both always agree. Pure: values in, values out.

import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';
import { plcStep, type ItemsEstimate } from './items';

/** Assignment limit for one run. */
export const MAX_CYCLE_S = 7 * 60;

/** grey = waiting, yellow = running, green = done, red = alarm (HMI palette 250 / 46 / 155 / 51). */
export type Lamp = 'wait' | 'run' | 'done' | 'alarm';

export type PlatePlaceHmi = 'jaka' | 'conveyor' | 'staubli';

export interface HmiState {
  step: number | null;
  /** Jaka, conveyor, Stäubli part, drawing, cycle done. */
  steps: [Lamp, Lamp, Lamp, Lamp, Lamp];
  partsOnBoard: number | null;
  squares: number | null;
  /** Cycle time in seconds, null before the first run. */
  seconds: number | null;
  overLimit: boolean;
  count: number | null;
  plateAt: PlatePlaceHmi;
  emergency: boolean;
  /** Start request (Ligar), when the bridge sends it. */
  start: boolean;
}

/**
 * Run state once a run is over. A completed run keeps its "done" state
 * (CicloConcluido) until the next start; a stopped or E-stopped run resets
 * the lamps, counters and cycle time.
 */
function runEnd(step: number | null, items: ItemsEstimate | null): 'completed' | 'reset' | null {
  if (step !== 0 || !items || items.cycleEndedAt === null) return null;
  return items.cycleCompleted ? 'completed' : 'reset';
}

export function hmiState(io: PlcIoSnapshot | null, items: ItemsEstimate | null, now: number): HmiState {
  const step = plcStep(io);
  const end = runEnd(step, items);
  const reset = end === 'reset';
  const s = step ?? 0;
  const lamp = (done: boolean, run: boolean): Lamp =>
    end === 'completed' ? 'done' : reset ? 'wait' : done ? 'done' : run ? 'run' : 'wait';
  const plateLeftJaka = items !== null && !['jakaTable', 'jakaGripper'].includes(items.plate);

  const started = items?.cycleStartedAt ?? null;
  const seconds =
    started === null ? null : reset ? 0 : Math.max(0, Math.floor(((items?.cycleEndedAt ?? now) - started) / 1000));

  let plateAt: PlatePlaceHmi = 'jaka';
  if (items && !reset) {
    if (items.plate === 'staubliGripper' || items.plate === 'staubliTable') plateAt = 'staubli';
    else if (items.plate === 'belt') plateAt = 'conveyor';
  }

  return {
    step,
    steps: [
      lamp(s >= 2 || (s === 1 && plateLeftJaka), signalValue(io, 'jakaDi3') === true),
      lamp(s >= 2, signalValue(io, 'conveyorJakaToStaubli') === true),
      lamp(s >= 3, s === 2),
      lamp(s === 5, s === 4),
      lamp(false, s === 5),
    ],
    partsOnBoard: items ? (reset ? 0 : items.partsOnBoard) : null,
    squares: items ? (reset ? 0 : items.squaresDone) : null,
    seconds,
    overLimit: seconds !== null && seconds > MAX_CYCLE_S,
    count: io?.count ?? null,
    plateAt,
    emergency: isEmergencyActive(io) === true,
    start: io?.running === true,
  };
}
