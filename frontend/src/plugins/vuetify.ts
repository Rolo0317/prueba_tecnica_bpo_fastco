import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { es } from 'vuetify/locale';
import 'vuetify/styles';
import { darkTheme, initialThemeMode, lightTheme, THEME_NAMES } from './theme';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: THEME_NAMES[initialThemeMode()],
    themes: { [THEME_NAMES.light]: lightTheme, [THEME_NAMES.dark]: darkTheme },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'es', messages: { es } },
  defaults: {
    VBtn: { rounded: 'lg', class: 'text-none' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VCard: { rounded: 'lg' },
  },
});
