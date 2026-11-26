import { config } from '../config';
import { plcStep, STEP_LABELS, type ItemsEstimate } from '../estimator/items';
import { PART_COUNT } from '../model/layout';
import { signalValue, type PlcIoSnapshot } from '../model/messages';
import { useTwinStore } from '../state/store';

/** Assignment limit for one run. */
const MAX_CYCLE_S = 7 * 60;

type Lamp = 'wait' | 'run' | 'done';

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The step lamps of the HMI page (Init_Page): grey = waiting, yellow =
 * running, green = done. Same rules as the iCor* colours in NewProgramCyclic.st,
 * computed here from the I/O, the PLC step and the estimated plate position.
 */
function stepLamps(io: PlcIoSnapshot | null, step: number | null, items: ItemsEstimate | null) {
  const finished = step === 0 && items?.cycleEndedAt != null;
  const s = step ?? 0;
  const lamp = (done: boolean, run: boolean): Lamp => (finished || done ? 'done' : run ? 'run' : 'wait');
  const plateLeftJaka = items !== null && !['jakaTable', 'jakaGripper'].includes(items.plate);
  const one = PART_COUNT === 1;
  return [
    { label: 'Jaka: plate on the conveyor', lamp: lamp(s >= 2 || (s === 1 && plateLeftJaka), signalValue(io, 'jakaDi3') === true) },
    { label: 'Conveyor: carrying the plate', lamp: lamp(s >= 2, signalValue(io, 'conveyorJakaToStaubli') === true) },
    { label: one ? 'Stäubli: plate on the table, part on the board' : 'Stäubli: plate on the table, parts on the board', lamp: lamp(s >= 3, s === 2) },
    { label: one ? 'Stäubli: drawing the square' : 'Stäubli: drawing the squares', lamp: lamp(s === 5, s === 4) },
    { label: 'Cycle done', lamp: lamp(false, s === 5) },
  ];
}

export function CyclePanel({ now }: { now: number }) {
  const io = useTwinStore((s) => s.io);
  const items = useTwinStore((s) => s.items);
  const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
  const step = plcStep(fresh);

  const started = items?.cycleStartedAt ?? null;
  const elapsed = started === null ? null : (items?.cycleEndedAt ?? now) - started;
  const overLimit = elapsed !== null && elapsed / 1000 > MAX_CYCLE_S;
  const progress = items ? (items.partsOnBoard + items.squaresDone) / (2 * PART_COUNT) : 0;

  return (
    <section className="panel">
      <h2>Cycle</h2>
      <ol className="steps">
        {stepLamps(fresh, step, items).map((s) => (
          <li key={s.label} className={`step is-${s.lamp}`}>
            <span className="step-lamp" aria-hidden="true" />
            <span>{s.label}</span>
            <span className="visually-hidden">{s.lamp === 'done' ? 'done' : s.lamp === 'run' ? 'running' : 'waiting'}</span>
          </li>
        ))}
      </ol>
      <div
        className="progress cycle-progress"
        role="progressbar"
        aria-label="Parts placed and squares drawn"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <dl className="cycle">
        <dt>Step</dt>
        <dd>{step === null ? '—' : `${step} · ${STEP_LABELS[step] ?? 'unknown'}`}</dd>
        <dt>Parts on the board</dt>
        <dd>{items ? `${items.partsOnBoard} / ${PART_COUNT}` : '—'}</dd>
        <dt>Squares drawn</dt>
        <dd>{items ? `${items.squaresDone} / ${PART_COUNT}` : '—'}</dd>
        <dt>Cycle time</dt>
        <dd className={overLimit ? 'error' : ''}>
          {elapsed === null ? '—' : `${formatDuration(elapsed)} of 7:00`}
        </dd>
        <dt>Completed cycles</dt>
        <dd>{fresh?.count ?? '—'}</dd>
      </dl>
    </section>
  );
}
