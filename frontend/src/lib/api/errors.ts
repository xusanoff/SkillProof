/** Error envelope returned by the FastAPI backend (and by our /api proxy). */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string | null;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** 0 = request never reached a server (offline, DNS, CORS). */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const err = (value as { error: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

export function toApiError(status: number, body: unknown): ApiError {
  if (isApiErrorEnvelope(body)) {
    const { code, message, details, request_id } = body.error;
    return new ApiError(status, code, message, details ?? {}, request_id ?? null);
  }
  return new ApiError(status, status >= 500 ? 'internal_error' : 'unknown', `HTTP ${status}`);
}

/** i18n key under `errors.*` for an error; unknown codes fall back to `errors.unknown`. */
export function errorMessageKey(error: unknown, known: readonly string[]): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'network';
    if (known.includes(error.code)) return error.code;
  }
  return 'unknown';
}
