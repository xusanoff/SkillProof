import type { components } from '@/lib/api';

export type Health = components['schemas']['HealthResponse'];
export type ApiState = 'ok' | 'degraded' | 'unavailable';

/** Display state derived from the server's own report (no client-side judgement). */
export function apiState(health: Health | undefined): ApiState {
  if (!health) return 'unavailable';
  if (health.status !== 'ok') return 'degraded';
  return Object.values(health.checks).every((v) => v === 'ok') ? 'ok' : 'degraded';
}
