// Carga de datos de una pantalla con sus estados: cargando, error y con datos.
// `reload` vuelve a pedirlos sin vaciar lo que ya se ve (no parpadea al refrescar).
import {onMounted, ref, type Ref} from 'vue';
import {errorMessage} from './api';

export function useLoad<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(true);
  const error = ref('');
  async function reload() {
    loading.value = data.value === null;
    error.value = '';
    try { data.value = await fetcher(); } catch (e) { error.value = errorMessage(e); } finally { loading.value = false; }
  }
  onMounted(reload);
  return {data, loading, error, reload};
}
