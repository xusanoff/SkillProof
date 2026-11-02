'use client';

import { useTranslations } from 'next-intl';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, fieldErrors } from '@/lib/api';

/** Pydantic error `type` → our `validation.*` code. */
const SERVER_TYPE_TO_CODE: Record<string, string> = {
  missing: 'required',
  string_too_short: 'tooShort',
  string_too_long: 'tooLong',
  value_error: 'invalid',
  url_parsing: 'url',
  url_scheme: 'url',
  int_parsing: 'integer',
  int_type: 'integer',
  greater_than_equal: 'range',
  less_than_equal: 'range',
};

/** Translate an API/network error into a user-facing sentence (`errors.<code>`). */
export function useErrorText() {
  const t = useTranslations('errors');
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.isNetwork) return t('network');
      const key = error.code as Parameters<typeof t>[0];
      if (t.has(key)) return t(key);
    }
    return t('unknown');
  };
}

/** Translate a zod/validation code into text (undefined when there is no error). */
export function useValidationText() {
  const t = useTranslations('validation');
  return (code: string | undefined): string | undefined => {
    if (!code) return undefined;
    const key = code as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('invalid');
  };
}

/**
 * Put API errors on form fields. `validation_error` details go to their fields; codes in
 * `codeToField` (e.g. `email_taken` → `email`) go to one field with `errors.<code>` text.
 * Returns true when something was attached (so no form-level message is needed).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  codeToField: Partial<Record<string, Path<T>>> = {},
): boolean {
  if (!(error instanceof ApiError)) return false;
  const target = codeToField[error.code];
  if (target) {
    setError(target, { type: 'server', message: `@errors.${error.code}` }, { shouldFocus: true });
    return true;
  }
  let applied = false;
  for (const [name, type] of Object.entries(fieldErrors(error))) {
    if (!(fields as readonly string[]).includes(name)) continue;
    setError(
      name as Path<T>,
      { type: 'server', message: SERVER_TYPE_TO_CODE[type] ?? 'invalid' },
      { shouldFocus: !applied },
    );
    applied = true;
  }
  return applied;
}

/**
 * Field message resolver: plain codes → `validation.*`; `@errors.<code>` → `errors.*`.
 */
export function useFieldError() {
  const validation = useValidationText();
  const te = useTranslations('errors');
  return (message: string | undefined): string | undefined => {
    if (!message) return undefined;
    if (message.startsWith('@errors.')) {
      const key = message.slice('@errors.'.length) as Parameters<typeof te>[0];
      return te.has(key) ? te(key) : te('unknown');
    }
    return validation(message);
  };
}
