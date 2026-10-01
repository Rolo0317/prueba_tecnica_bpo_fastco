<script setup lang="ts">
import { useId } from 'vue';
import { BRAND_COLORS, BRAND_ICON } from '@/shared/brand/brandIcon';

withDefaults(defineProps<{ size?: number }>(), { size: 32 });

const clipId = useId();
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="BRAND_ICON.viewBox"
    aria-hidden="true"
    focusable="false"
  >
    <clipPath :id="clipId">
      <circle :cx="BRAND_ICON.radius" :cy="BRAND_ICON.radius" :r="BRAND_ICON.radius" />
    </clipPath>
    <g :clip-path="`url(#${clipId})`">
      <circle
        :cx="BRAND_ICON.radius"
        :cy="BRAND_ICON.radius"
        :r="BRAND_ICON.radius"
        :fill="BRAND_COLORS.blue"
      />
      <polygon :fill="BRAND_COLORS.orange" :points="BRAND_ICON.orangeBar" />
      <polygon fill="#fff" :points="BRAND_ICON.numberOne" />
    </g>
  </svg>
</template>
