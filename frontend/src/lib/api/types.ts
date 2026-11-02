import type { paths } from './paths';

/**
 * Types derived from operations (D-019), so FastAPI schema renames don't break features.
 *   type Me = ResponseOf<'/api/v1/auth/me', 'get'>
 */
type Op<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

type JsonOf<R> = R extends { content: { 'application/json': infer J } } ? J : never;

export type ResponseOf<P extends keyof paths, M extends keyof paths[P]> =
  Op<P, M> extends { responses: infer R }
    ? R extends { 200: infer S }
      ? JsonOf<S>
      : R extends { 201: infer S }
        ? JsonOf<S>
        : never
    : never;

export type BodyOf<P extends keyof paths, M extends keyof paths[P]> =
  Op<P, M> extends { requestBody?: infer B } ? JsonOf<NonNullable<B>> : never;
