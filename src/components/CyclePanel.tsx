// Cycle state as a list: the same items as the HMI page, computed by
// src/estimator/hmi.ts (shared with the HMI replica).

import { config } from '../config';
import { hmiState, type Lamp } from '../estimator/hmi';
import { STEP_LABELS } from '../estimator/items';
import { PART_COUNT } from '../model/layout';
import { useTwinStore } from '../state/store';

const LAMP_TEXT: Record<Lamp, string> = { wait: 'waiting', run: 'running', done: 'done' };

const ONE = PART_COUNT === 1;
const STEP_NAMES = [
  'Jaka: plate on the conveyor',
  'Conveyor: carrying the plate',
  ONE ? 'Stäubli: plate on the table, part on the board' : 'Stäubli: plate on the table, parts on the board',
  ONE ? 'Stäubli: drawing the square' : 'Stäubli: drawing the squares',
  'Cycle done',
];

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
  const hmi = hmiState(fresh, items, now);

  return (
    <section className="panel">
      <h2>Cycle</h2>
      <h3 className="panel-sub">Steps</h3>
      <ol className="steps">
        {hmi.steps.map((lamp, i) => (
          <LampItem key={STEP_NAMES[i]} label={STEP_NAMES[i]!} lamp={lamp} />
        ))}
      </ol>
      <dl className="cycle">
        <dt>Part on the board</dt>
        <dd>{hmi.partsOnBoard === null ? '—' : `${hmi.partsOnBoard} of ${PART_COUNT}`}</dd>
        <dt>Square</dt>
        <dd>{hmi.squares === null ? '—' : `${hmi.squares} of ${PART_COUNT}`}</dd>
        <dt>Cycle time</dt>
        <dd className={hmi.overLimit ? 'error' : ''}>{hmi.seconds === null ? '—' : `${hmi.seconds} s`}</dd>
        <dt>Completed cycles</dt>
        <dd>{hmi.count ?? '—'}</dd>
        <dt>PLC step</dt>
        <dd>{hmi.step === null ? '—' : `${hmi.step} · ${STEP_LABELS[hmi.step] ?? 'unknown'}`}</dd>
      </dl>
      <h3 className="panel-sub">Plate is at</h3>
      <ul className="steps steps-row">
        <LampItem label="Jaka" lamp={hmi.plateAt === 'jaka' ? 'done' : 'wait'} />
        <LampItem label="Conveyor" lamp={hmi.plateAt === 'conveyor' ? 'done' : 'wait'} />
        <LampItem label="Stäubli" lamp={hmi.plateAt === 'staubli' ? 'done' : 'wait'} />
      </ul>
    </section>
  );
}
