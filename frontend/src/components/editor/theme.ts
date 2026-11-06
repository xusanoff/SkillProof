import type { BeforeMount, OnMount } from '@monaco-editor/react';

const DARK_THEME = 'skillproof-dark';

/** Monaco requires colour strings: read them from the same CSS tokens as the UI. */
export const defineEditorThemes: BeforeMount = (monaco) => {
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(name).trim();
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: color('--dark-muted').replace('#', '') }],
    colors: {
      'editor.background': color('--editor-bg'),
      'editor.foreground': color('--dark-text'),
      'editorLineNumber.foreground': color('--dark-muted'),
      'editorCursor.foreground': color('--signal'),
      'editor.lineHighlightBackground': color('--dark-2'),
    },
  });
};

export function editorTheme(resolvedTheme: string | undefined): string {
  return resolvedTheme === 'dark' ? DARK_THEME : 'vs';
}

/** Resolve next/font's local family names before Monaco measures glyph widths. */
export const applyEditorFont: OnMount = (editor) => {
  editor.updateOptions({
    fontFamily:
      getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim() ||
      'monospace',
  });
};
