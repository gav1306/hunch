"use client";

import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PALETTES } from "./palette";

// Brand accents drive the lighting / reflections (Riso stays even in dark mode).
const S1 = PALETTES.Riso.s1; // red
const S2 = PALETTES.Riso.s2; // blue
// Girly pink for the glassy eyes.
const EYE = "#FF5CAD";

const damp = THREE.MathUtils.damp;

const BASE_Y = -0.55; // resting height in the frame
const INTRO_DUR = 1.2; // entrance length (seconds)

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** The little confirm-bot. `play` starts the spin-in intro. */
function Robot({ play }: { play: boolean }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);

  const startRef = useRef<number | null>(null);

  const { pointer } = useThree();

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const g = group.current;
    const h = head.current;
    if (!g || !h) return;

    // hidden until the intro says go
    if (!play) {
      g.scale.setScalar(0.0001);
      g.position.y = BASE_Y;
      g.rotation.y = 0;
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = t;
    const local = t - startRef.current;
    const p = Math.min(1, local / INTRO_DUR);
    const pe = easeOutCubic(p);

    const idleAmp = Math.min(1, Math.max(0, (local - INTRO_DUR) / 0.5));
    const bob = Math.sin(t * 1.1) * 0.08 * idleAmp;

    // spin-in: scale up + one full turn as it settles
    const scaleMul = 0.6 + 0.4 * pe;
    const rotY = (1 - pe) * Math.PI * 2;

    const breathe = 1 + Math.sin(t * 1.6) * 0.012 * idleAmp;
    g.position.y = BASE_Y + bob;
    g.scale.setScalar(scaleMul * breathe);
    g.rotation.y = rotY;

    // low-key confirm nod (only once landed) + cursor look
    let nod = 0;
    let blink = 1;
    if (p >= 1) {
      const beat = (local - INTRO_DUR) % 6;
      if (beat < 1) {
        nod = Math.sin(beat * Math.PI) * 0.16;
        const b = Math.abs(beat - 0.5) * 2;
        blink = 0.25 + 0.75 * Math.min(1, b * 1.6);
      }
    }

    const look = p; // ease cursor-tracking in as it settles
    h.rotation.y = damp(h.rotation.y, pointer.x * 0.5 * look, 5, delta);
    h.rotation.x = damp(h.rotation.x, -pointer.y * 0.32 * look + nod, 6, delta);
    h.rotation.z = damp(h.rotation.z, pointer.x * 0.08 * look, 5, delta);

    for (const e of [leftEye.current, rightEye.current]) {
      if (!e) continue;
      e.scale.y = blink;
    }
  });

  return (
    <group ref={group} rotation={[0, 0, 0]}>
      <group ref={head}>
        {/* head shell */}
        <RoundedBox args={[1.7, 1.5, 1.35]} radius={0.42} smoothness={6}>
          <meshStandardMaterial
            color="#f5f2ea"
            metalness={0.55}
            roughness={0.22}
            envMapIntensity={1.1}
          />
        </RoundedBox>

        {/* dark glossy visor */}
        <RoundedBox
          args={[1.32, 0.78, 0.22]}
          radius={0.32}
          smoothness={5}
          position={[0, 0.04, 0.64]}
        >
          <meshStandardMaterial
            color="#111016"
            metalness={0.9}
            roughness={0.12}
            envMapIntensity={1.4}
          />
        </RoundedBox>

        {/* eyes */}
        {[-1, 1].map((sx) => (
          <mesh
            key={sx}
            ref={sx < 0 ? leftEye : rightEye}
            position={[sx * 0.3, 0.06, 0.76]}
          >
            <sphereGeometry args={[0.13, 28, 28]} />
            <meshStandardMaterial
              color={EYE}
              emissive={EYE}
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* side bolts */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.92, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.16, 0.18, 24]} />
            <meshStandardMaterial color="#cfc9bd" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function HeroRobot({ play = true }: { play?: boolean }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <directionalLight position={[-4, 1, 2]} intensity={0.5} color={S2} />

      <Robot play={play} />

      {/* self-contained reflections — no remote HDR fetch */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.2} position={[2, 3, 4]} scale={6} color="#ffffff" />
        <Lightformer form="rect" intensity={1.4} position={[-3, 1, 3]} scale={5} color={S2} />
        <Lightformer form="circle" intensity={1.2} position={[0, -2, 3]} scale={4} color={S1} />
      </Environment>
    </Canvas>
  );
}
