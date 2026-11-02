export interface FileRule {
  maxBytes: number;
  extensions: readonly string[];
  mimeTypes: readonly string[];
}

export type FileProblem = 'unsupported_file_type' | 'file_too_large' | 'empty_file';

/**
 * Client-side pre-check before upload (fast feedback). Codes match the API's error codes,
 * so one `errors.<code>` message serves both. Some OSes give `.doc` an empty MIME type,
 * so the extension decides when the type is missing.
 */
export function checkFile(file: File, rule: FileRule): FileProblem | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!rule.extensions.includes(ext)) return 'unsupported_file_type';
  if (file.type && !rule.mimeTypes.includes(file.type)) return 'unsupported_file_type';
  if (file.size === 0) return 'empty_file';
  if (file.size > rule.maxBytes) return 'file_too_large';
  return null;
}

/** `accept` attribute for a file input. */
export function acceptOf(rule: FileRule): string {
  return [...rule.extensions.map((e) => `.${e}`), ...rule.mimeTypes].join(',');
}

export function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
