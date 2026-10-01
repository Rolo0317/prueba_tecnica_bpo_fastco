import { createVuetify, type ThemeDefinition } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { es } from 'vuetify/locale';
import 'vuetify/styles';

/**
 * Tema corporativo. Colores de marca medidos del logo; los semánticos (error, success,
 * warning) se eligieron oscuros para cumplir contraste AA como texto sobre fondo claro.
 * El naranja de marca es solo decorativo: sobre blanco no alcanza contraste para texto.
 */
const fastcoTheme: ThemeDefinition = {
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

export const vuetify = createVuetify({
  theme: { defaultTheme: 'fastco', themes: { fastco: fastcoTheme } },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'es', messages: { es } },
  defaults: {
    VBtn: { rounded: 'lg', class: 'text-none' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VCard: { rounded: 'lg' },
  },
});
