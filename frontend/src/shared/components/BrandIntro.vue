<script setup lang="ts">
/**
 * Animación de marca (≈4 s, solo CSS + SVG, sin librerías):
 * cometa → impacto con salpicadura líquida → cinta que revela la palabra →
 * órbitas, partículas y subtítulo. Luego queda un movimiento sutil en reposo.
 * Es decorativa (aria-hidden) y con prefers-reduced-motion muestra el estado final.
 */
import { useId } from 'vue';
import wordmarkUrl from '@/assets/brand/fastco-wordmark.webp';
import { BRAND_COLORS, BRAND_ICON } from '@/shared/brand/brandIcon';

withDefaults(defineProps<{ tagline?: string }>(), { tagline: 'GESTOR DE TAREAS OPERATIVAS' });

const { blue: BLUE, orange: ORANGE, sky: SKY } = BRAND_COLORS;
const uid = useId();
const ids = {
  goo: `${uid}-goo`,
  iconClip: `${uid}-icon`,
  reveal: `${uid}-reveal`,
  icon: `${uid}-symbol`,
};

const ORBIT_CENTER = { x: 800, y: 480 };
const ORBITS = [
  {
    rx: 700,
    ry: 280,
    width: 4,
    arcs: [
      [160, 252],
      [288, 380],
      [40, 140],
    ],
  },
  {
    rx: 620,
    ry: 240,
    width: 4,
    arcs: [
      [172, 246],
      [294, 368],
      [18, 82],
      [98, 162],
    ],
  },
  {
    rx: 540,
    ry: 200,
    width: 3.5,
    arcs: [
      [186, 240],
      [300, 354],
    ],
  },
] as const;

const pointOn = (rx: number, ry: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(ORBIT_CENTER.x + rx * Math.cos(rad)).toFixed(1)} ${(ORBIT_CENTER.y + ry * Math.sin(rad)).toFixed(1)}`;
};

const orbitArcs = ORBITS.flatMap(({ rx, ry, width, arcs }, ring) =>
  arcs.map(([from, to], index) => ({
    d: `M${pointOn(rx, ry, from)} A${rx} ${ry} 0 ${to - from > 180 ? 1 : 0} 1 ${pointOn(rx, ry, to)}`,
    width,
    delay: `${(2.45 + ring * 0.12 + index * 0.06).toFixed(2)}s`,
  })),
);

const TRAIL = [-0.507, 0.862] as const;
const PERP = [0.862, 0.507] as const;
const streaks = [-2, -1, 0, 1, 2].map((lane, i) => {
  const start = 120 + (i % 2) * 40;
  const length = 110 + ((i * 37) % 70);
  const x1 = TRAIL[0] * start + PERP[0] * lane * 42;
  const y1 = TRAIL[1] * start + PERP[1] * lane * 42;
  const color = i % 2 ? ORANGE : BLUE;
  return {
    x1,
    y1,
    x2: x1 + TRAIL[0] * length,
    y2: y1 + TRAIL[1] * length,
    dotX: x1 + TRAIL[0] * (length + 34),
    dotY: y1 + TRAIL[1] * (length + 34),
    dotR: 9 + (i % 3) * 3,
    hollow: i % 3 === 1,
    color,
    delay: `${(0.08 + i * 0.05).toFixed(2)}s`,
  };
});

const DROPLETS: [number, number, number, string][] = [
  [-270, -160, 26, BLUE],
  [-195, -235, 18, BLUE],
  [-115, -270, 14, BLUE],
  [-55, -205, 21, BLUE],
  [45, -255, 16, BLUE],
  [125, -220, 22, BLUE],
  [215, -190, 18, BLUE],
  [285, -140, 24, BLUE],
  [-330, -60, 16, BLUE],
  [335, -50, 15, BLUE],
  [-150, -150, 15, ORANGE],
  [90, -175, 17, ORANGE],
  [0, -290, 12, ORANGE],
  [200, -110, 13, ORANGE],
];
const toDroplet = ([dx, dy, r]: [number, number, number, string], i: number) => ({
  r,
  style: {
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    animationDelay: `${(1.15 + (i % 4) * 0.025).toFixed(3)}s`,
  },
});
const blueDroplets = DROPLETS.filter(([, , , color]) => color === BLUE).map(toDroplet);
const orangeDroplets = DROPLETS.filter(([, , , color]) => color === ORANGE).map(toDroplet);

type ParticleShape = 'dot' | 'drop';
const PARTICLES: [ParticleShape, number, number, string, number, number][] = [
  ['drop', 420, 300, BLUE, -40, 1],
  ['dot', 508, 322, ORANGE, 0, 9],
  ['dot', 128, 532, ORANGE, 0, 13],
  ['dot', 102, 575, BLUE, 0, 9],
  ['dot', 252, 800, BLUE, 0, 13],
  ['drop', 305, 835, BLUE, 215, 1.1],
  ['dot', 400, 845, ORANGE, 0, 9],
  ['dot', 886, 862, BLUE, 0, 12],
  ['dot', 1180, 852, ORANGE, 0, 9],
  ['dot', 1470, 838, ORANGE, 0, 12],
  ['drop', 1525, 812, BLUE, 145, 1.1],
  ['dot', 1500, 770, BLUE, 0, 8],
  ['dot', 1452, 402, BLUE, 0, 13],
  ['drop', 1508, 468, ORANGE, 35, 1],
  ['dot', 1560, 552, BLUE, 0, 8],
];
const particles = PARTICLES.map(([shape, x, y, color, rotation, size], i) => ({
  shape,
  x,
  y,
  color,
  rotation,
  size,
  popDelay: `${(2.7 + i * 0.05).toFixed(2)}s`,
  floatStyle: {
    '--float-duration': `${4 + (i % 4)}s`,
    '--float-delay': `${(4 + (i % 5) * 0.3).toFixed(1)}s`,
  },
}));

const DROP_PATH = 'M0,-24 C9,-12 16,-2 16,8 A16,16 0 1 1 -16,8 C-16,-2 -9,-12 0,-24 Z';
</script>

<template>
  <svg class="brand-intro" viewBox="0 0 1600 900" aria-hidden="true" focusable="false">
    <defs>
      <!-- Filtro "gooey": fusiona círculos cercanos para que parezcan líquido -->
      <filter :id="ids.goo" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
        <feColorMatrix
          in="blur"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          result="goo"
        />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
      <clipPath :id="ids.iconClip">
        <circle :cx="BRAND_ICON.radius" :cy="BRAND_ICON.radius" :r="BRAND_ICON.radius" />
      </clipPath>
      <clipPath :id="ids.reveal">
        <polygon class="sweep" points="-2400,320 0,320 -100,650 -2400,650" />
      </clipPath>
      <symbol :id="ids.icon" :viewBox="BRAND_ICON.viewBox">
        <g :clip-path="`url(#${ids.iconClip})`">
          <circle
            :cx="BRAND_ICON.radius"
            :cy="BRAND_ICON.radius"
            :r="BRAND_ICON.radius"
            :fill="BLUE"
          />
          <polygon :fill="ORANGE" :points="BRAND_ICON.orangeBar" />
          <polygon fill="#fff" :points="BRAND_ICON.numberOne" />
        </g>
      </symbol>
    </defs>

    <g class="orbits" fill="none" :stroke="BLUE" stroke-linecap="round">
      <path
        v-for="(arc, index) in orbitArcs"
        :key="index"
        class="orbit"
        pathLength="1"
        :d="arc.d"
        :stroke-width="arc.width"
        :style="{ animationDelay: arc.delay }"
      />
    </g>

    <g transform="translate(800 520)" fill="none" :stroke="SKY">
      <ellipse
        class="ripple anim"
        rx="220"
        ry="42"
        stroke-width="10"
        style="animation-delay: 1.15s"
      />
      <ellipse
        class="ripple anim"
        rx="220"
        ry="42"
        stroke-width="7"
        style="animation-delay: 1.32s"
      />
      <ellipse
        class="ripple anim"
        rx="220"
        ry="42"
        stroke-width="5"
        style="animation-delay: 1.5s"
      />
    </g>

    <g fill="none" stroke-linecap="round">
      <path
        class="swoosh"
        pathLength="1"
        :stroke="BLUE"
        stroke-width="34"
        d="M-60 250 C 300 110, 620 390, 930 290 S 1420 120, 1680 210"
      />
      <path
        class="swoosh"
        pathLength="1"
        :stroke="ORANGE"
        stroke-width="14"
        style="animation-delay: 1.55s"
        d="M-60 290 C 300 150, 620 430, 930 330 S 1420 160, 1680 250"
      />
      <path
        class="swoosh"
        pathLength="1"
        :stroke="BLUE"
        stroke-width="34"
        style="animation-delay: 1.6s"
        d="M-60 720 C 350 840, 700 620, 1000 700 S 1460 830, 1680 730"
      />
      <path
        class="swoosh"
        pathLength="1"
        :stroke="ORANGE"
        stroke-width="14"
        style="animation-delay: 1.7s"
        d="M-60 760 C 350 880, 700 660, 1000 740 S 1460 870, 1680 770"
      />
    </g>

    <image
      :href="wordmarkUrl"
      x="320"
      y="365"
      width="960"
      height="235"
      :clip-path="`url(#${ids.reveal})`"
    />

    <!-- Cinta líquida que avanza junto al borde de revelado -->
    <g class="sweep">
      <g class="ribbon" stroke-linecap="round" fill="none">
        <path :stroke="ORANGE" stroke-width="22" d="M100 310 C 62 420, 112 525, -18 680" />
        <circle cx="120" cy="560" r="12" :fill="ORANGE" stroke="none" />
        <g :filter="`url(#${ids.goo})`" class="vanish" style="--vanish-at: 2.8s">
          <path :stroke="BLUE" stroke-width="64" d="M40 300 C 0 410, 60 520, -85 690" />
          <circle cx="-30" cy="290" r="16" :fill="BLUE" stroke="none" />
          <circle cx="-120" cy="640" r="14" :fill="BLUE" stroke="none" />
        </g>
      </g>
    </g>

    <g transform="translate(800 500)">
      <g :filter="`url(#${ids.goo})`" :fill="BLUE" class="vanish">
        <ellipse class="crown anim" rx="95" ry="26" />
        <circle
          v-for="(drop, index) in blueDroplets"
          :key="index"
          class="droplet anim"
          :r="drop.r"
          :style="drop.style"
        />
      </g>
      <g :filter="`url(#${ids.goo})`" :fill="ORANGE" class="vanish">
        <circle
          v-for="(drop, index) in orangeDroplets"
          :key="index"
          class="droplet anim"
          :r="drop.r"
          :style="drop.style"
        />
      </g>
    </g>

    <g
      v-for="(particle, index) in particles"
      :key="index"
      :transform="`translate(${particle.x} ${particle.y})`"
    >
      <g class="pop anim" :style="{ animationDelay: particle.popDelay }">
        <g class="float anim" :style="particle.floatStyle">
          <circle v-if="particle.shape === 'dot'" :r="particle.size" :fill="particle.color" />
          <path
            v-else
            :d="DROP_PATH"
            :fill="particle.color"
            :transform="`rotate(${particle.rotation}) scale(${particle.size})`"
          />
        </g>
      </g>
    </g>

    <g transform="translate(800 210)">
      <g class="icon-idle">
        <g class="icon-move">
          <g class="streaks" stroke-linecap="round" fill="none" stroke-width="7">
            <template v-for="(streak, index) in streaks" :key="index">
              <line
                class="streak"
                pathLength="1"
                :stroke="streak.color"
                :x1="streak.x1"
                :y1="streak.y1"
                :x2="streak.x2"
                :y2="streak.y2"
                :style="{ animationDelay: streak.delay }"
              />
              <circle
                :cx="streak.dotX"
                :cy="streak.dotY"
                :r="streak.dotR"
                :fill="streak.hollow ? 'none' : streak.color"
                :stroke="streak.color"
                stroke-width="4"
              />
            </template>
          </g>
          <g class="icon-squash anim">
            <use :href="`#${ids.icon}`" x="-105" y="-105" width="210" height="210" />
          </g>
        </g>
      </g>
    </g>

    <text
      class="tagline anim"
      x="800"
      y="655"
      text-anchor="middle"
      font-size="28"
      font-weight="600"
      letter-spacing="7"
    >
      {{ tagline }}
    </text>
  </svg>
</template>

<style scoped>
.brand-intro {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.55, 0, 0.9, 0.4);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  display: block;
  width: 100%;
  height: auto;
}

.anim {
  transform-box: fill-box;
  transform-origin: center;
}

/* 1. Cometa */
.icon-move {
  animation: icon-move 1.75s both;
}
@keyframes icon-move {
  0% {
    transform: translate(-500px, 790px);
    opacity: 0;
    animation-timing-function: var(--ease-out);
  }
  6% {
    opacity: 1;
  }
  45.7% {
    transform: translate(0, -70px);
    animation-timing-function: var(--ease-in);
  }
  65.7% {
    transform: translate(0, 270px);
    animation-timing-function: var(--ease-out);
  }
  86% {
    transform: translate(0, -18px);
    animation-timing-function: ease-in-out;
  }
  100% {
    transform: translate(0, 0);
    opacity: 1;
  }
}
.icon-squash {
  animation: icon-squash 0.5s 1.12s both;
}
@keyframes icon-squash {
  0% {
    transform: scale(1, 1);
  }
  20% {
    transform: scale(1.18, 0.78);
  }
  55% {
    transform: scale(0.94, 1.07);
  }
  100% {
    transform: scale(1, 1);
  }
}
.streaks {
  animation: streaks 1.75s both;
}
@keyframes streaks {
  0%,
  8% {
    opacity: 0;
  }
  15%,
  38% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
.streak {
  stroke-dasharray: 1;
  animation: draw 0.5s var(--ease-out) both;
}

/* 2. Impacto */
.droplet {
  animation: droplet 0.85s 1.15s var(--ease-out) both;
}
@keyframes droplet {
  0% {
    transform: translate(0, 0) scale(0.3);
    opacity: 1;
  }
  55% {
    transform: translate(var(--dx), var(--dy)) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(calc(var(--dx) * 1.15), calc(var(--dy) * 0.4 + 140px)) scale(0.15);
    opacity: 0;
  }
}
.crown {
  animation: crown 0.7s 1.15s var(--ease-out) both;
}
@keyframes crown {
  0% {
    transform: scale(0, 0);
    opacity: 1;
  }
  40% {
    transform: scale(1, 1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1.3, 0);
    opacity: 0;
  }
}
.ripple {
  animation: ripple 1.2s var(--ease-out) both;
}
@keyframes ripple {
  0% {
    transform: scale(0.25);
    opacity: 0;
  }
  15% {
    opacity: 0.95;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
.vanish {
  animation: vanish 0.01s var(--vanish-at, 2.2s) both;
}
@keyframes vanish {
  to {
    visibility: hidden;
  }
}

/* 3. Flujo líquido */
.swoosh {
  stroke-dasharray: 0.42 1.5;
  animation: swoosh 1.4s 1.45s var(--ease-in-out) both;
}
@keyframes swoosh {
  from {
    stroke-dashoffset: 0.42;
  }
  to {
    stroke-dashoffset: -1.5;
  }
}
.sweep {
  animation: sweep 1.05s 1.7s var(--ease-in-out) both;
}
@keyframes sweep {
  from {
    transform: translateX(250px);
  }
  to {
    transform: translateX(1420px);
  }
}
.ribbon {
  animation: ribbon 1.05s 1.7s linear both;
}
@keyframes ribbon {
  0% {
    opacity: 0;
  }
  12%,
  78% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* 4. Cierre */
.orbit {
  stroke-dasharray: 1;
  animation: draw 0.9s var(--ease-out) both;
}
@keyframes draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.pop {
  animation: pop 0.55s var(--ease-back) both;
}
@keyframes pop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.tagline {
  fill: rgb(var(--v-theme-secondary));
  animation: rise 0.7s 3.05s var(--ease-out) both;
}
@keyframes rise {
  from {
    transform: translateY(14px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Reposo */
.icon-idle {
  animation: float 4.5s 4s ease-in-out infinite;
}
.float {
  animation: float var(--float-duration, 5s) var(--float-delay, 4s) ease-in-out infinite;
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
.orbits {
  transform-box: view-box;
  transform-origin: 800px 480px;
  animation: sway 9s 4s ease-in-out infinite;
}
@keyframes sway {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(1.2deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-intro *,
  .brand-intro {
    animation-duration: 1ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
