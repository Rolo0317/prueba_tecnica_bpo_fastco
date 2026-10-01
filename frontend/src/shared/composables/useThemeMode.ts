import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { saveThemeMode, THEME_NAMES, type ThemeMode } from '@/plugins/theme';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Alterna entre modo claro y oscuro y recuerda la elección de la persona. */
export function useThemeMode() {
  const theme = useTheme();
  const isDark = computed(() => theme.global.name.value === THEME_NAMES.dark);

  function setMode(mode: ThemeMode): void {
    // Transición suave nativa del navegador, salvo que se pida reducir el movimiento.
    void theme.change(THEME_NAMES[mode], !prefersReducedMotion());
    saveThemeMode(mode);
  }

  function toggle(): void {
    setMode(isDark.value ? 'light' : 'dark');
  }

  return { isDark, setMode, toggle };
}
