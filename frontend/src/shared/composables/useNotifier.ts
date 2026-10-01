import { ref } from 'vue';

export interface Notification {
  text: string;
  color: 'success' | 'error' | 'info';
  timeout: number;
}

/** Cola global de avisos (snackbars). Se muestra con <AppNotifier /> en App.vue. */
const queue = ref<Notification[]>([]);

export function useNotifier() {
  const push = (text: string, color: Notification['color'], timeout = 4000) => {
    queue.value.push({ text, color, timeout });
  };

  return {
    queue,
    success: (text: string) => {
      push(text, 'success');
    },
    error: (text: string) => {
      push(text, 'error', 6000);
    },
    info: (text: string) => {
      push(text, 'info');
    },
  };
}
