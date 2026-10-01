<script setup lang="ts">
/**
 * Indicador circular "líquido": el nivel del agua representa un porcentaje y dos ondas
 * se desplazan en la superficie. Solo SVG + CSS (sin librerías); el color sale del tema
 * de Vuetify, así que funciona en modo claro y oscuro. Es decorativo: el texto accesible
 * lo aporta el componente que lo usa.
 */
import { computed, onMounted, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    percentage: number;
    /** Nombre de un color del tema de Vuetify (primary, success, warning…). */
    color?: string;
    size?: number;
  }>(),
  { color: 'primary', size: 112 },
);

const clipId = useId();
const VESSEL = { top: 6, height: 88 } as const;
// Dos periodos de 100 unidades: desplazar -100 hace un bucle perfecto.
const WAVE_PATH =
  'M0 6 C12.5 0 37.5 0 50 6 S87.5 12 100 6 S137.5 0 150 6 S187.5 12 200 6 V120 H0 Z';

// Arranca vacío y sube al montar, para que el nivel "se llene" la primera vez.
const mounted = ref(false);
onMounted(() => {
  requestAnimationFrame(() => (mounted.value = true));
});

const level = computed(() => {
  const value = Math.min(100, Math.max(0, props.percentage));
  // Un valor pequeño pero mayor que 0 debe verse, aunque sea un hilo de agua.
  return value > 0 ? Math.max(value, 4) : 0;
});
const waterOffset = computed(() => {
  const shown = mounted.value ? level.value : 0;
  const surfaceY = VESSEL.top + VESSEL.height * (1 - shown / 100);
  return surfaceY - 6; // el camino de la onda tiene su línea media en y = 6
});
</script>

<template>
  <div
    class="liquid-gauge"
    :style="{ '--gauge-color': `var(--v-theme-${color})`, width: `${size}px`, height: `${size}px` }"
  >
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <clipPath :id="clipId">
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>
      <circle class="liquid-gauge__ring" cx="50" cy="50" r="47.5" />
      <circle class="liquid-gauge__vessel" cx="50" cy="50" r="44" />
      <g :clip-path="`url(#${clipId})`">
        <g class="liquid-gauge__water" :style="{ transform: `translateY(${waterOffset}px)` }">
          <path class="liquid-gauge__wave liquid-gauge__wave--back" :d="WAVE_PATH" />
          <path class="liquid-gauge__wave liquid-gauge__wave--front" :d="WAVE_PATH" />
        </g>
      </g>
    </svg>
    <div class="liquid-gauge__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.liquid-gauge {
  position: relative;
  flex: none;
}
.liquid-gauge svg {
  display: block;
  width: 100%;
  height: 100%;
}
.liquid-gauge__ring {
  fill: none;
  stroke: rgb(var(--gauge-color));
  stroke-width: 2.5;
  opacity: 0.85;
}
.liquid-gauge__vessel {
  fill: rgb(var(--gauge-color));
  opacity: 0.08;
}
.liquid-gauge__water {
  transition: transform 1.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.liquid-gauge__wave {
  fill: rgb(var(--gauge-color));
}
.liquid-gauge__wave--front {
  opacity: 0.85;
  animation: wave-shift 3.2s linear infinite;
}
.liquid-gauge__wave--back {
  opacity: 0.4;
  animation: wave-shift 5.5s linear infinite reverse;
}
@keyframes wave-shift {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-100px);
  }
}
.liquid-gauge__content {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  line-height: 1.1;
  color: rgb(var(--v-theme-on-surface));
  /* Halo del color de fondo: el texto se lee aunque el agua pase por detrás. */
  text-shadow:
    0 0 3px rgb(var(--v-theme-surface)),
    0 0 6px rgb(var(--v-theme-surface)),
    0 0 10px rgb(var(--v-theme-surface));
}

@media (prefers-reduced-motion: reduce) {
  .liquid-gauge__wave {
    animation: none;
  }
  .liquid-gauge__water {
    transition: none;
  }
}
</style>
