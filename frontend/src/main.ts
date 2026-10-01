import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import './styles/global.css';

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { configureHttp } from './core/http';
import { useAuthStore } from './modules/auth/stores/authStore';
import { vuetify } from './plugins/vuetify';
import { router } from './router';

const app = createApp(App);
app.use(createPinia());

const auth = useAuthStore();

// El cliente HTTP obtiene el token del store y, si la sesión expira (401), vuelve al login.
configureHttp({
  getToken: () => auth.token,
  onUnauthorized: () => {
    auth.logout();
    const current = router.currentRoute.value;
    if (current.name !== 'login') {
      void router.replace({ name: 'login', query: { expired: '1', redirect: current.fullPath } });
    }
  },
});

app.use(router);
app.use(vuetify);
app.mount('#app');
