'use client';

import { defineEditorThemes, editorTheme } from '@/components/editor/theme';
import type { OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import {
  classifyChange,
  CopyLog,
  decidePaste,
  normalizeEol,
  type KeyContext,
  type TelemetryEventType,
} from '@/lib/telemetry';
import { MONACO_LANG } from '../model';

/** Monaco is loaded only here (dynamic, client only) from our own `/monaco/vs` copy. */
const MonacoEditor = dynamic(
  () =>
    import('@monaco-editor/react').then((m) => {
      m.loader.config({ paths: { vs: '/monaco/vs' } });
      return m.default;
    }),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-80 w-full rounded-lg" /> },
);

export type Emit = (type: TelemetryEventType, payload: Record<string, unknown>) => void;

const KEY_WINDOW_MS = 150;
const TYPING_INPUT =
  /^(insertText|insertCompositionText|insertReplacementText|insertLineBreak|insertParagraph|delete)/;

/**
 * Editor with the Stage 1 rules (spec §7.1): suggestions off, outside paste / drop blocked,
 * inside paste allowed (only text copied in this editor), every change reported with an honest
 * `source`. The decisions live in `@/lib/telemetry` (pure, unit tested); this is the adapter.
 * `emit` is undefined in the warm-up: nothing is recorded there.
 */
export function CodeEditor({
  language,
  defaultValue,
  onChange,
  emit,
  label,
  readOnly,
  announceReset,
}: {
  language: string;
  defaultValue: string;
  onChange: (code: string) => void;
  emit?: Emit;
  label: string;
  readOnly?: boolean;
  /** Tell the server the editor starts with this content (replay needs it unless it is the plain starter). */
  announceReset?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations('interview.editor');

  const onMount: OnMount = (editor, monaco) => {
    const dom = editor.getDomNode();
    const model = editor.getModel();
    if (!dom || !model) return;
    const out: Emit = (type, payload) => emit?.(type, payload);
    // The content was set without an edit event (language switch, restored draft): say so first.
    if (announceReset) out('editor_reset', { language, code: model.getValue() });
    const copies = new CopyLog();
    let key: { ctx: KeyContext; at: number } | null = null;
    let internalPaste = false;
    const recentKey = () => (key && performance.now() - key.at < KEY_WINDOW_MS ? key.ctx : null);

    const onKeyDown = (e: KeyboardEvent) => {
      const modified = e.ctrlKey || e.metaKey || e.altKey;
      key = {
        ctx: { key: e.key, data: e.key.length === 1 && !modified ? e.key : undefined, modified },
        at: performance.now(),
      };
    };
    const onBeforeInput = (e: InputEvent) => {
      if (TYPING_INPUT.test(e.inputType) && !recentKey()) {
        key = { ctx: { key: 'Input', modified: false }, at: performance.now() };
      }
    };
    const selectedText = () =>
      (editor.getSelections() ?? []).map((s) => model.getValueInRange(s)).join('\n');
    const onCopy = (cut: boolean) => () => {
      const text = selectedText();
      if (!text) return;
      copies.add(text);
      out('copy', cut ? { text: normalizeEol(text), cut: true } : { text: normalizeEol(text) });
    };
    const onCut = onCopy(true);
    const onCopyEvt = onCopy(false);

    const incoming = (text: string, insertAllowed: boolean) => {
      const d = decidePaste(text, copies);
      if (d.kind === 'blocked') out('paste_external_blocked', { length: d.length, lines: d.lines });
      if (d.kind === 'internal' && insertAllowed) {
        out('paste_internal', { text: d.text });
        internalPaste = true;
        try {
          editor.executeEdits(
            'internal-paste',
            (editor.getSelections() ?? []).map((range) => ({
              range,
              text: d.text,
              forceMoveMarkers: true,
            })),
          );
        } finally {
          internalPaste = false;
        }
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      incoming(e.clipboardData?.getData('text/plain') ?? '', true);
    };
    // Drag-and-drop from outside is "the same as paste": blocked, never inserted.
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      incoming(e.dataTransfer?.getData('text/plain') ?? '', false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();

    dom.addEventListener('keydown', onKeyDown, true);
    dom.addEventListener('beforeinput', onBeforeInput as EventListener, true);
    dom.addEventListener('copy', onCopyEvt, true);
    dom.addEventListener('cut', onCut, true);
    dom.addEventListener('paste', onPaste, true);
    dom.addEventListener('drop', onDrop, true);
    dom.addEventListener('dragover', onDragOver, true);

    editor.onDidChangeModelContent((e) => {
      onChange(model.getValue());
      if (e.isFlush) {
        // Programmatic reset, not candidate input: the replay needs the new content.
        out('editor_reset', { language, code: model.getValue() });
        return;
      }
      for (const c of e.changes) {
        const source = classifyChange({
          text: c.text,
          isUndoing: e.isUndoing,
          isRedoing: e.isRedoing,
          internalPaste,
          formatting: false,
          key: recentKey(),
        });
        const range = c.range;
        if (c.text === '') out('delete', { range, length: c.rangeLength, source });
        else out(c.rangeLength > 0 ? 'replace' : 'insert', { range, text: c.text, source });
      }
    });

    let lastCursor = 0;
    editor.onDidChangeCursorPosition((e) => {
      const now = performance.now();
      if (now - lastCursor < 300) return;
      lastCursor = now;
      out('cursor', { line: e.position.lineNumber, column: e.position.column });
    });

    // Formatting and the command palette would rewrite code without a keystroke we can explain.
    const none = () => {};
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, none);
    editor.addCommand(
      monaco.KeyMod.chord(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF,
      ),
      none,
    );
    editor.addCommand(monaco.KeyCode.F1, none);
    editor.focus();
  };

  return (
    <div className="flex h-full min-h-80 flex-col gap-1.5">
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <MonacoEditor
          language={MONACO_LANG[language] ?? 'plaintext'}
          defaultValue={defaultValue}
          beforeMount={defineEditorThemes}
          theme={editorTheme(resolvedTheme)}
          onMount={onMount}
          options={{
            ariaLabel: label,
            // The classic hidden textarea: paste, copy and beforeinput events are what we rely on.
            editContext: false,
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            // No help from the editor: the task is to write the code.
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            acceptSuggestionOnCommitCharacter: false,
            tabCompletion: 'off',
            wordBasedSuggestions: 'off',
            snippetSuggestions: 'none',
            parameterHints: { enabled: false },
            inlineSuggest: { enabled: false },
            hover: { enabled: 'off' },
            // Clipboard and drag-and-drop go through our handlers only.
            contextmenu: false,
            dragAndDrop: false,
            dropIntoEditor: { enabled: false },
            emptySelectionClipboard: false,
            copyWithSyntaxHighlighting: false,
            selectionClipboard: false,
            formatOnPaste: false,
            formatOnType: false,
            links: false,
          }}
        />
      </div>
      <p className="text-xs text-muted">{t('tabHint')}</p>
    </div>
  );
}
