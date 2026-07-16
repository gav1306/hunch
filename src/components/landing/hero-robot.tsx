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

/**
 * Where the bot looks once the intro settles:
 *   cursor — follows the pointer (landing hero).
 *   form   — turns to face the sign-in form (auth left panel).
 *   away   — turns away to the side, pointedly looking off the form, so she
 *            isn't looking while you type your password.
 */
export type Gaze = "cursor" | "form" | "away";

/** The little confirm-bot. `play` starts the spin-in intro. */
function Robot({ play, gaze }: { play: boolean; gaze: Gaze }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);

  const startRef = useRef<number | null>(null);
  // track gaze changes to seed the one-shot look-away bounce
  const gazeRef = useRef<Gaze>(gaze);
  const awayStartRef = useRef<number>(-1);
  // damped base rotations, kept separate so the bounce can ride on top of them
  // without the damp filter smoothing the bounce away
  const baseYaw = useRef(0);
  const baseRoll = useRef(0);

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

    const look = p; // ease head motion in as it settles

    // seed the wiggle the instant she's asked to look away
    if (gaze !== gazeRef.current) {
      if (gaze === "away") awayStartRef.current = t;
      gazeRef.current = gaze;
    }

    // yaw/pitch/roll are the *settle* targets (damped); bYaw/bRoll are one-shot
    // bounce offsets applied on top, after the damp, so they aren't smoothed out.
    let yaw: number;
    let pitch: number;
    let roll: number;
    let eyeOpen: number;
    let bYaw = 0;
    let bRoll = 0;

    if (gaze === "away") {
      // snap away to the side — pointedly looking off, away from the form
      // (the form sits at +yaw, so she springs to -yaw). Eyes stay on.
      yaw = -1.15;
      pitch = 0.04;
      roll = -0.05;
      eyeOpen = blink;
      // bounce: overshoot the turn, then settle — slow and smooth
      const since = t - awayStartRef.current;
      if (awayStartRef.current >= 0 && since < 1.0) {
        const decay = 1 - since / 1.0;
        bYaw = -Math.sin(since * 12) * 0.16 * decay; // first swing overshoots outward
        bRoll = -Math.sin(since * 12) * 0.06 * decay;
      }
    } else if (gaze === "form") {
      // face the form (screen-right), gentle idle sway + the confirm nod
      yaw = 0.32 + Math.sin(t * 0.9) * 0.05 * idleAmp;
      pitch = 0.06 + nod;
      roll = Math.sin(t * 0.7) * 0.02 * idleAmp;
      eyeOpen = blink;
    } else {
      // cursor tracking (landing hero) — unchanged
      yaw = pointer.x * 0.5;
      pitch = -pointer.y * 0.32 + nod;
      roll = pointer.x * 0.08;
      eyeOpen = blink;
    }

    // ease into the turn (slow, smooth) with the un-damped bounce riding on top.
    const yawLambda = gaze === "away" ? 6 : 5;
    baseYaw.current = damp(baseYaw.current, yaw * look, yawLambda, delta);
    baseRoll.current = damp(baseRoll.current, roll * look, 6, delta);
    h.rotation.y = baseYaw.current + bYaw * look;
    h.rotation.z = baseRoll.current + bRoll * look;
    h.rotation.x = damp(h.rotation.x, pitch * look, 6, delta);

    for (const e of [leftEye.current, rightEye.current]) {
      if (!e) continue;
      // damp so the eyelids ease shut/open rather than snap
      e.scale.y = damp(e.scale.y, eyeOpen, 12, delta);
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

export function HeroRobot({
  play = true,
  gaze = "cursor",
}: {
  play?: boolean;
  gaze?: Gaze;
}) {
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

      <Robot play={play} gaze={gaze} />

      {/* self-contained reflections — no remote HDR fetch */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.2} position={[2, 3, 4]} scale={6} color="#ffffff" />
        <Lightformer form="rect" intensity={1.4} position={[-3, 1, 3]} scale={5} color={S2} />
        <Lightformer form="circle" intensity={1.2} position={[0, -2, 3]} scale={4} color={S1} />
      </Environment>
    </Canvas>
  );
}
