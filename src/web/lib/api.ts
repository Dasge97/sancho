// Cliente de la API del servidor. Guarda el token CSRF que devuelve cada respuesta y lo envía
// en las peticiones que cambian algo; el servidor las rechaza sin él.
let csrf = '';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  if (csrf) headers.set('x-csrf-token', csrf);
  let response: Response;
  try {
    response = await fetch('/api' + path, {...opts, headers, credentials: 'include'});
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.', 0);
  }
  csrf = response.headers.get('x-csrf-token') || csrf;
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error || `El servidor respondió con un error (${response.status}).`, response.status);
  return body as T;
}

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, {method: 'POST', body: JSON.stringify(body)});
export const put = <T = any>(path: string, body: unknown) => api<T>(path, {method: 'PUT', body: JSON.stringify(body)});
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, {method: 'PATCH', body: JSON.stringify(body)});

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Ha ocurrido un error inesperado.';
}
