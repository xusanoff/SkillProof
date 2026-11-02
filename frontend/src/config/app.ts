/**
 * Single source of truth for app-wide, non-translatable configuration.
 * The product name is configurable (PROJECT_SPEC: "rename via config") —
 * never hard-code it anywhere else; pass `appConfig.name` into messages as `{appName}`.
 *
 * NEXT_PUBLIC_* values are inlined at build time (Docker: build arg).
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'SkillProof',
  /** Display timezone until users can pick their own (Phase 1). Backend stores UTC. */
  defaultTimeZone: 'Asia/Tashkent',
  /**
   * Client-side pre-checks only (fast feedback); the API re-validates and is authoritative.
   * Keep in sync with docs/API.md.
   */
  uploads: {
    resume: {
      maxBytes: 5 * 1024 * 1024,
      extensions: ['pdf', 'doc', 'docx'],
      mimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
    logo: {
      maxBytes: 2 * 1024 * 1024,
      extensions: ['png', 'jpg', 'jpeg', 'webp'],
      mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  },
  /** Currencies offered for desired salary (UZS first = default). */
  currencies: ['UZS', 'USD', 'EUR', 'RUB'],
} as const;
