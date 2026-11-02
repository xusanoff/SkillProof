import { ApiError } from './errors';

/**
 * Validation details → `{ field: type }`. Backend: `details.fields = [{loc, msg, type}]`,
 * `loc` like `["body", "email"]`. Only the last string segment is used as the form field.
 */
export type FieldErrors = Record<string, string>;

export function fieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') return {};
  const fields = error.details.fields;
  if (!Array.isArray(fields)) return {};
  const out: FieldErrors = {};
  for (const f of fields) {
    if (typeof f !== 'object' || f === null) continue;
    const { loc, type } = f as { loc?: unknown; type?: unknown };
    if (!Array.isArray(loc)) continue;
    const name = [...loc].reverse().find((s): s is string => typeof s === 'string' && s !== 'body');
    if (name && !out[name]) out[name] = typeof type === 'string' ? type : 'invalid';
  }
  return out;
}

/**
 * Multipart body for openapi-fetch. The generated type says `file: string` (format: binary);
 * the serializer replaces it with real FormData, so the browser sets the boundary.
 */
export function fileUpload(file: File) {
  return {
    body: { file: file as unknown as string },
    bodySerializer: () => {
      const form = new FormData();
      form.append('file', file);
      return form;
    },
  };
}

/** API asset paths (`/api/v1/companies/{id}/logo`) → browser URL through the `/api` proxy. */
export function apiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
