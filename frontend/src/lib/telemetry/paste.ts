/**
 * Paste and edit-source classification (spec §7.1). Pure: no DOM, no Monaco. The editor adapter
 * collects the facts (was there a key press, did Monaco report undo/redo, is this our own
 * internal paste) and this module decides the `source` that goes to the server.
 *
 * The one risk that matters: an honest edit labelled `unknown` above the paste limit
 * disqualifies the candidate. Everything the editor can explain must NOT be `unknown`.
 */

export type EditSource =
  'keyboard' | 'auto_close' | 'undo' | 'redo' | 'internal_paste' | 'format' | 'unknown';

/** `\r\n` and lone `\r` → `\n`, so a copy made on Windows matches the clipboard text on paste. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Size as the server counts it for the paste rule. */
export function textSize(text: string): { length: number; lines: number } {
  const t = normalizeEol(text);
  return { length: t.length, lines: t.split('\n').length };
}

/** What the browser told us about the key press (or IME / virtual-keyboard input) behind a change. */
export interface KeyContext {
  /** `KeyboardEvent.key`, or `'Input'` for beforeinput / composition input. */
  key: string;
  /** Text the key itself produces (single printable character, or composed text), if any. */
  data?: string;
  /** Ctrl / Meta / Alt held. */
  modified: boolean;
}

export interface ChangeFacts {
  text: string;
  isUndoing: boolean;
  isRedoing: boolean;
  /** Set while we insert text for an allowed internal paste. */
  internalPaste: boolean;
  /** Set while a (disabled-by-default) format action runs. */
  formatting: boolean;
  /** The key context if a key / input event happened just before this change. */
  key: KeyContext | null;
}

export function classifyChange(f: ChangeFacts): EditSource {
  if (f.internalPaste) return 'internal_paste';
  if (f.isUndoing) return 'undo';
  if (f.isRedoing) return 'redo';
  if (f.formatting) return 'format';
  const k = f.key;
  if (!k) return 'unknown';
  // Editor commands bound to keys (Enter auto-indent, Tab, Backspace, Alt+Up, Ctrl+/, Ctrl+X …):
  // the text is the editor's own, a key press explains it.
  if (k.modified || k.key.length > 1 || k.data === undefined) return 'keyboard';
  // A printable key: exactly what was typed is keyboard; the editor adding the closing
  // bracket / quote or wrapping a selection around it is auto_close.
  return f.text === k.data || f.text === '' ? 'keyboard' : 'auto_close';
}

/** Copies made in this editor session, newest last. */
export class CopyLog {
  private copies: string[] = [];
  constructor(private readonly max = 50) {}

  add(text: string) {
    const t = normalizeEol(text);
    if (!t) return;
    this.copies.push(t);
    if (this.copies.length > this.max) this.copies.shift();
  }

  /** The exact text recorded by an earlier `copy` that equals the clipboard text, or null. */
  match(clipboardText: string): string | null {
    const t = normalizeEol(clipboardText);
    for (let i = this.copies.length - 1; i >= 0; i--) {
      if (this.copies[i] === t) return this.copies[i];
    }
    return null;
  }
}

export type PasteDecision =
  | { kind: 'internal'; text: string }
  | { kind: 'blocked'; length: number; lines: number }
  | { kind: 'ignore' };

/** Paste (or drop) of `incoming` text: internal copies go through, everything else is blocked. */
export function decidePaste(incoming: string, log: CopyLog): PasteDecision {
  if (incoming.length === 0) return { kind: 'ignore' };
  const hit = log.match(incoming);
  if (hit !== null) return { kind: 'internal', text: hit };
  return { kind: 'blocked', ...textSize(incoming) };
}
