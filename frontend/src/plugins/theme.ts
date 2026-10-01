import type { ThemeDefinition } from 'vuetify';

export type ThemeMode = 'light' | 'dark';

export const THEME_NAMES: Readonly<Record<ThemeMode, string>> = {
  light: 'fastco',
  dark: 'fastcoDark',
};

const STORAGE_KEY = 'task-manager.theme';

/**
 * Tema claro. Colores de marca medidos del logo; los semánticos (error, success,
 * warning) son oscuros para cumplir contraste AA como texto sobre fondo claro.
 * El naranja de marca es solo decorativo: sobre blanco no alcanza contraste para texto.
 */
export const lightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#0473B9',
    secondary: '#26739E',
    accent: '#F59E15',
    background: '#F3F9F6',
    surface: '#FFFFFF',
    'on-surface': '#14263A',
    'on-background': '#14263A',
    error: '#C62828',
    success: '#2E7D32',
    warning: '#A35200',
    info: '#0473B9',
    neutral: '#5B6878',
  },
};

/** Tema oscuro: mismos tonos de marca, aclarados para mantener contraste AA sobre fondo oscuro. */
export const darkTheme: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#5AAEEA',
    secondary: '#86BEDC',
    accent: '#F5A83A',
    background: '#0D1721',
    surface: '#14212D',
    'on-surface': '#E3EAF1',
    'on-background': '#E3EAF1',
    error: '#F28B82',
    success: '#7BCF8E',
    warning: '#F3B562',
    info: '#5AAEEA',
    neutral: '#A6B3C0',
    // Sobre estos tonos claros, el texto blanco no llega a 4.5:1: se usa texto oscuro.
    'on-primary': '#0D1721',
    'on-secondary': '#0D1721',
    'on-accent': '#0D1721',
    'on-error': '#0D1721',
    'on-success': '#0D1721',
    'on-warning': '#0D1721',
    'on-info': '#0D1721',
  },
};

/** Preferencia guardada por la persona; si no hay, la del sistema operativo. */
export function initialThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Almacenamiento no disponible: se usa la preferencia del sistema.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Solo es una comodidad: si no se puede guardar, el tema igual cambia en esta sesión.
  }
}
