// Usuario de la sesión. El rol solo decide qué se enseña: el servidor vuelve a comprobarlo.
import {computed, ref} from 'vue';

export interface User { id: string; email: string; role: 'admin' | 'member' }
export const user = ref<User | null>(null);
export const isAdmin = computed(() => user.value?.role === 'admin');
