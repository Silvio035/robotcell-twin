// Mirrors the HMI page (Init_Page in plc/ProjetoFinalRobotica): step lamps,
// part and square counters, cycle time, completed cycles, where the plate is
// and the E-stop lamp, with the same rules as the iCor* colours and counters
// in NewProgramCyclic.st. Values come from the PLC I/O and the item estimator.

import { config } from '../config';
import { plcStep, STEP_LABELS, type ItemsEstimate } from '../estimator/items';
import { PART_COUNT } from '../model/layout';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';
import { useTwinStore } from '../state/store';

/** Assignment limit for one run. */
const MAX_CYCLE_S = 7 * 60;

type Lamp = 'wait' | 'run' | 'done' | 'alarm';

const LAMP_TEXT: Record<Lamp, string> = { wait: 'waiting', run: 'running', done: 'done', alarm: 'active' };

/**
 * Run state as the PLC sees it once a run is over. A completed run keeps its
 * "done" state on the HMI (CicloConcluido) until the next start; a stopped or
 * E-stopped run resets the lamps, counters and cycle time.
 */
function runEnd(step: number | null, items: ItemsEstimate | null): 'completed' | 'reset' | null {
  if (step !== 0 || !items || items.cycleEndedAt === null) return null;
  return items.cycleCompleted ? 'completed' : 'reset';
}

function stepLamps(io: PlcIoSnapshot | null, step: number | null, items: ItemsEstimate | null) {
  const end = runEnd(step, items);
  const s = step ?? 0;
  const lamp = (done: boolean, run: boolean): Lamp =>
    end === 'completed' ? 'done' : end === 'reset' ? 'wait' : done ? 'done' : run ? 'run' : 'wait';
  const plateLeftJaka = items !== null && !['jakaTable', 'jakaGripper'].includes(items.plate);
  const one = PART_COUNT === 1;
  return [
    { label: 'Jaka: plate on the conveyor', lamp: lamp(s >= 2 || (s === 1 && plateLeftJaka), signalValue(io, 'jakaDi3') === true) },
    { label: 'Conveyor: carrying the plate', lamp: lamp(s >= 2, signalValue(io, 'conveyorJakaToStaubli') === true) },
    {
      label: one ? 'Stäubli: plate on the table, part on the board' : 'Stäubli: plate on the table, parts on the board',
      lamp: lamp(s >= 3, s === 2),
    },
    { label: one ? 'Stäubli: drawing the square' : 'Stäubli: drawing the squares', lamp: lamp(s === 5, s === 4) },
    { label: 'Cycle done', lamp: lamp(false, s === 5) },
  ];
}

/** "Placa está em": Jaka until the Jaka's DONE, conveyor until it arrives, then Stäubli. */
function plateAt(step: number | null, items: ItemsEstimate | null): 'jaka' | 'conveyor' | 'staubli' {
  if (!items || runEnd(step, items) === 'reset') return 'jaka';
  if (items.plate === 'staubliGripper' || items.plate === 'staubliTable') return 'staubli';
  if (items.plate === 'belt') return 'conveyor';
  return 'jaka';
}

function LampItem({ label, lamp }: { label: string; lamp: Lamp }) {
  return (
    <li className={`step is-${lamp}`}>
      <span className="step-lamp" aria-hidden="true" />
      <span>{label}</span>
      <span className="visually-hidden">{LAMP_TEXT[lamp]}</span>
    </li>
  );
}

export function CyclePanel({ now }: { now: number }) {
  const io = useTwinStore((s) => s.io);
  const items = useTwinStore((s) => s.items);
  const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
  const step = plcStep(fresh);
  const end = runEnd(step, items);
  const reset = end === 'reset';

  const started = items?.cycleStartedAt ?? null;
  const elapsed = started === null || reset ? null : (items?.cycleEndedAt ?? now) - started;
  const seconds = elapsed === null ? 0 : Math.max(0, Math.floor(elapsed / 1000));
  const overLimit = seconds > MAX_CYCLE_S;
  const plate = plateAt(step, items);
  const emergency = isEmergencyActive(fresh);

  return (
    <section className="panel">
      <h2>Cycle</h2>
      <h3 className="panel-sub">Steps</h3>
      <ol className="steps">
        {stepLamps(fresh, step, items).map((s) => (
          <LampItem key={s.label} label={s.label} lamp={s.lamp} />
        ))}
      </ol>
      <dl className="cycle">
        <dt>Part on the board</dt>
        <dd>{items ? `${reset ? 0 : items.partsOnBoard} of ${PART_COUNT}` : '—'}</dd>
        <dt>Square</dt>
        <dd>{items ? `${reset ? 0 : items.squaresDone} of ${PART_COUNT}` : '—'}</dd>
        <dt>Cycle time</dt>
        <dd className={overLimit ? 'error' : ''}>{started === null ? '—' : `${seconds} s`}</dd>
        <dt>Completed cycles</dt>
        <dd>{fresh?.count ?? '—'}</dd>
        <dt>PLC step</dt>
        <dd>{step === null ? '—' : `${step} · ${STEP_LABELS[step] ?? 'unknown'}`}</dd>
      </dl>
      <h3 className="panel-sub">Plate is at</h3>
      <ul className="steps steps-row">
        <LampItem label="Jaka" lamp={plate === 'jaka' ? 'done' : 'wait'} />
        <LampItem label="Conveyor" lamp={plate === 'conveyor' ? 'done' : 'wait'} />
        <LampItem label="Stäubli" lamp={plate === 'staubli' ? 'done' : 'wait'} />
      </ul>
      <ul className="steps">
        <LampItem label="Emergency stop (red = pressed)" lamp={emergency ? 'alarm' : 'wait'} />
      </ul>
    </section>
  );
}
