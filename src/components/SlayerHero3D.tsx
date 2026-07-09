import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useReducedMotion } from 'motion/react';

/**
 * SlayerHero3D — the landing hero's living 3D backdrop: an instanced field of
 * dealer-pressure columns whose heights ripple as a radial standing wave, tinted
 * along the GEX palette (deep purple → magenta → red) and slowly rotating on a
 * low oblique camera. It's the terminal's core idea — dealer positioning by
 * strike — rendered as sculpture, not decoration. gsap drives a one-time camera
 * dolly-in; the field degrades to nothing under prefers-reduced-motion.
 *
 * Rendered lazily (three.js is heavy) behind the hero content with a scrim.
 */

const GEX = [
  new THREE.Color('#3B2A86'),
  new THREE.Color('#792CA2'),
  new THREE.Color('#C13383'),
  new THREE.Color('#E05454'),
];

function gexColor(t: number, out: THREE.Color) {
  const x = Math.min(0.9999, Math.max(0, t)) * 3;
  const i = Math.floor(x);
  const f = x - i;
  return out.copy(GEX[i]).lerp(GEX[i + 1], f);
}

const COLS = 46;
const ROWS = 30;
const GAP = 0.46;

function PressureField() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = COLS * ROWS;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Seed per-instance colour once (radial gradient from centre outward).
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = (c - COLS / 2) * GAP;
        const z = (r - ROWS / 2) * GAP;
        const d = Math.sqrt(x * x + z * z);
        const t = Math.min(1, d / (COLS * GAP * 0.52));
        mesh.setColorAt(i, gexColor(1 - t, tmpColor));
        i++;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tmpColor]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    let i = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = (c - COLS / 2) * GAP;
        const z = (r - ROWS / 2) * GAP;
        const d = Math.sqrt(x * x + z * z);
        // radial standing wave × a slow cross ripple — a "dealer pressure" terrain
        const h =
          0.35 +
          1.5 * Math.abs(Math.sin(d * 0.52 - t * 0.7)) * (0.55 + 0.45 * Math.cos(c * 0.16 + t * 0.22));
        dummy.position.set(x, h / 2, z);
        dummy.scale.set(0.3, h, 0.3);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.rotation.y = t * 0.045;
  });

  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, count]} castShadow={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* vertex-coloured GEX bars with a lifted emissive floor so the field
          glows on black instead of sinking into it */}
      <meshStandardMaterial
        vertexColors
        metalness={0.2}
        roughness={0.4}
        emissive={'#3a2270'}
        emissiveIntensity={0.5}
      />
    </instancedMesh>
  );
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 13, 21);
    camera.lookAt(0, 1.4, 0);
    const tl = gsap.to(camera.position, {
      x: 0,
      y: 4.6,
      z: 13,
      duration: 2.2,
      ease: 'power3.out',
      onUpdate: () => camera.lookAt(0, 1.4, 0),
    });
    return () => {
      tl.kill();
    };
  }, [camera]);
  return null;
}

export default function SlayerHero3D() {
  const reduce = useReducedMotion();
  if (reduce) {
    // Static structural wash — no WebGL, no motion.
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% 12%, rgba(121,44,162,0.16), transparent 70%)' }}
      />
    );
  }
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 4.6, 13], fov: 46 }}
        style={{ background: 'transparent' }}
      >
        <fog attach="fog" args={['#08090A', 16, 40]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 12, 8]} intensity={1.7} color="#F8F8FF" />
        <directionalLight position={[-9, 5, -4]} intensity={1.0} color="#C13383" />
        <CameraRig />
        <PressureField />
      </Canvas>
      {/* light legibility scrim behind the hero copy (left), then a bottom fade
          so the field dissolves cleanly into the sections below */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 32% 46%, rgba(8,9,10,0.62) 0%, rgba(8,9,10,0.18) 46%, transparent 80%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(to bottom, transparent, #08090A)' }} />
    </div>
  );
}
