import type { BeforeMount } from '@monaco-editor/react';

const DARK_THEME = 'skillproof-dark';

/** `vs-dark` draws comments below 4.5:1 contrast; everything else in it passes. */
export const defineEditorThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: '7ca668' }],
    colors: {},
  });
};

export function editorTheme(resolvedTheme: string | undefined): string {
  return resolvedTheme === 'dark' ? DARK_THEME : 'vs';
}
