// 3D view of the cell (lazy-loaded from App). Level-0 models: primitives
// built from the placeholder layout and kinematics. See docs/3d-plan.md.

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RobotId } from '../model/cell';
import { SCARA } from '../model/kinematics';
import { LAYOUT } from '../model/layout';
import { ROBOTS } from '../model/robots';
import { useTwinStore } from '../state/store';
import { Jaka3D, Staubli3D } from './Robots3D';
import { Ink, Items3D, StaticCell } from './Scene3D';

/** Cell mm (z up) → Three.js metres (y up). */
const toWorld = (x: number, y: number, z: number): [number, number, number] => [x / 1000, z / 1000, -y / 1000];

const PRESETS = {
  overview: { label: 'Overview', camera: toWorld(650, -2000, 1500), target: toWorld(650, 50, 50) },
  staubli: { label: 'Stäubli', camera: toWorld(900, -550, 750), target: toWorld(320, 200, 60) },
  board: { label: 'Whiteboard', camera: toWorld(250, -450, 600), target: toWorld(250, 60, 0) },
  conveyor: { label: 'Conveyor', camera: toWorld(800, -750, 650), target: toWorld(800, -100, 60) },
  jaka: { label: 'Jaka', camera: toWorld(1050, -900, 650), target: toWorld(1450, -250, 60) },
} as const;
type PresetId = keyof typeof PRESETS;

function CameraRig({ preset }: { preset: PresetId }) {
  const camera = useThree((s) => s.camera);
  // drei's OrbitControls registers itself as the default controls (makeDefault).
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  useEffect(() => {
    const p = PRESETS[preset];
    camera.position.set(...p.camera);
    controls?.target.set(...p.target);
    controls?.update();
  }, [preset, camera, controls]);
  return null;
}

const ROBOT_LIST: RobotId[] = ['staubli', 'jaka'];

/** Label anchor above each robot, in cell mm. */
function labelAnchor(robot: RobotId): [number, number, number] {
  const mount = LAYOUT.robots[robot];
  return toWorld(mount.x, mount.y, robot === 'staubli' ? SCARA.zTop + 420 : 650);
}

/**
 * Projects the label anchors to the screen every frame and moves the HTML
 * labels (plain DOM outside the canvas, so no extra React roots).
 */
function LabelProjector({ labels }: { labels: RefObject<Record<RobotId, HTMLDivElement | null>> }) {
  const v = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    for (const robot of ROBOT_LIST) {
      const el = labels.current?.[robot];
      if (!el) continue;
      v.current.set(...labelAnchor(robot)).project(camera);
      const behind = v.current.z > 1;
      el.style.display = behind ? 'none' : '';
      el.style.transform = `translate(-50%, -100%) translate(${((v.current.x + 1) / 2) * size.width}px, ${((1 - v.current.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

function PhaseLabels({ labels }: { labels: RefObject<Record<RobotId, HTMLDivElement | null>> }) {
  const estimates = useTwinStore((s) => s.estimates);
  return (
    <>
      {ROBOT_LIST.map((robot) => (
        <div
          key={robot}
          className="label-3d"
          ref={(el) => {
            if (labels.current) labels.current[robot] = el;
          }}
        >
          <strong>{ROBOTS[robot].name}</strong>
          {estimates[robot] && <span>{estimates[robot]!.phase}</span>}
        </div>
      ))}
    </>
  );
}

/** Full screen for the 3D view (the whole box, so labels and presets come along). */
function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [target]);
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled;
  const toggle = () => {
    // Rejected when the page is embedded without full-screen permission; nothing to do then.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else target.current?.requestFullscreen().catch(() => undefined);
  };
  return { active, supported, toggle };
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  // Four corner brackets pointing out (enter) or in (exit).
  const d = exit
    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Cell3D({ stale, emergency }: { stale: boolean; emergency: boolean }) {
  const [preset, setPreset] = useState<PresetId>('overview');
  const labels = useRef<Record<RobotId, HTMLDivElement | null>>({ staubli: null, jaka: null });
  const box = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(box);

  return (
    <div ref={box} className={`cell-3d ${emergency ? 'is-emergency' : ''}`}>
      <Canvas camera={{ fov: 40, near: 0.01, far: 50, position: PRESETS.overview.camera }} dpr={[1, 2]}>
        <color attach="background" args={['#121a22']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <group rotation-x={-Math.PI / 2} scale={0.001}>
          <StaticCell />
          <Ink />
          <Items3D />
          <Staubli3D />
          <Jaka3D />
        </group>
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.05} />
        <CameraRig preset={preset} />
        <LabelProjector labels={labels} />
      </Canvas>
      <PhaseLabels labels={labels} />
      <div className="presets">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button key={id} type="button" className={id === preset ? '' : 'secondary'} onClick={() => setPreset(id)}>
            {PRESETS[id].label}
          </button>
        ))}
      </div>
      {fullscreen.supported && (
        <button
          type="button"
          className="secondary fullscreen-3d"
          onClick={fullscreen.toggle}
          aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
          title={fullscreen.active ? 'Exit full screen (Esc)' : 'Full screen'}
        >
          <FullscreenIcon exit={fullscreen.active} />
        </button>
      )}
      {emergency && <div className="banner-3d is-emergency">EMERGENCY STOP</div>}
      {stale && <div className="overlay-3d">No live PLC data</div>}
    </div>
  );
}
