import { describe, expect, it } from 'vitest';
import {
  classifyChange,
  CopyLog,
  decidePaste,
  normalizeEol,
  textSize,
  type ChangeFacts,
} from './paste';

const base: ChangeFacts = {
  text: '',
  isUndoing: false,
  isRedoing: false,
  internalPaste: false,
  formatting: false,
  key: null,
};
const typed = (text: string, key: string, data?: string, modified = false): ChangeFacts => ({
  ...base,
  text,
  key: { key, data, modified },
});

describe('classifyChange: honest edits are never `unknown`', () => {
  it('typing a character is keyboard', () => {
    expect(classifyChange(typed('a', 'a', 'a'))).toBe('keyboard');
  });
  it('auto-closing bracket / quote is auto_close', () => {
    expect(classifyChange(typed('()', '(', '('))).toBe('auto_close');
    expect(classifyChange(typed('""', '"', '"'))).toBe('auto_close');
  });
  it('Enter with auto-indent (multi-char text) is keyboard', () => {
    expect(classifyChange(typed('\n        ', 'Enter'))).toBe('keyboard');
  });
  it('Tab, Backspace, move-line and comment toggles are keyboard', () => {
    expect(classifyChange(typed('    ', 'Tab'))).toBe('keyboard');
    expect(classifyChange(typed('', 'Backspace'))).toBe('keyboard');
    expect(
      classifyChange(typed('line one\nline two\nline three\n', 'ArrowUp', undefined, true)),
    ).toBe('keyboard');
    expect(classifyChange(typed('# a\n# b\n# c\n', '/', '/', true))).toBe('keyboard');
  });
  it('IME / virtual keyboard input is keyboard', () => {
    expect(classifyChange(typed('привет', 'Input', undefined))).toBe('keyboard');
  });
  it('undo and redo come from the editor, even for large text', () => {
    const big = 'x'.repeat(500);
    expect(classifyChange({ ...base, text: big, isUndoing: true })).toBe('undo');
    expect(classifyChange({ ...base, text: big, isRedoing: true })).toBe('redo');
  });
  it('our own internal paste is internal_paste', () => {
    expect(classifyChange({ ...base, text: 'abc', internalPaste: true })).toBe('internal_paste');
  });
  it('a format action is format', () => {
    expect(classifyChange({ ...base, text: 'x', formatting: true })).toBe('format');
  });
});

describe('classifyChange: unexplained insertions stay unknown', () => {
  it('no key, no undo, no internal paste → unknown (autofill / extension)', () => {
    expect(classifyChange({ ...base, text: 'injected text from an extension' })).toBe('unknown');
  });
});

describe('copy log and paste decision', () => {
  it('normalises line endings so a Windows copy matches', () => {
    expect(normalizeEol('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    const log = new CopyLog();
    log.add('def f():\n    return 1');
    expect(decidePaste('def f():\r\n    return 1', log)).toEqual({
      kind: 'internal',
      text: 'def f():\n    return 1',
    });
  });
  it('text that was never copied in the editor is blocked with only length and lines', () => {
    const log = new CopyLog();
    log.add('mine');
    const d = decidePaste('line1\nline2\nline3', log);
    expect(d).toEqual({ kind: 'blocked', length: 17, lines: 3 });
    expect(Object.keys(d)).not.toContain('text');
  });
  it('an empty clipboard is ignored and size counts like the server', () => {
    expect(decidePaste('', new CopyLog())).toEqual({ kind: 'ignore' });
    expect(textSize('a\r\nb')).toEqual({ length: 3, lines: 2 });
  });
  it('a copy that was later replaced by an outside copy is not matched by a different text', () => {
    const log = new CopyLog(2);
    log.add('one');
    log.add('two');
    log.add('three');
    expect(decidePaste('one', log).kind).toBe('blocked');
    expect(decidePaste('three', log).kind).toBe('internal');
  });
});
