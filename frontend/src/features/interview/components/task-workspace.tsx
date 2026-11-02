'use client';

import { CircleAlert, CircleCheck, Clock, Play, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { Notice } from '@/components/common/notice';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useErrorText } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { starterFor, type TestResult } from '../model';
import { CodeEditor, type Emit } from './code-editor';

interface Props {
  title: string;
  statement: string;
  languages: string[];
  /** `language_labels` from the server: "Python 3.8" etc. */
  labels?: Record<string, string>;
  starterCode: Record<string, string>;
  visibleTests: { name: string; input: string; output: string }[];
  /** Language and code to start from (saved draft or starter). */
  initial: { language: string; code: string };
  results: TestResult[] | null;
  running: boolean;
  runError: unknown;
  onRun: (language: string, code: string) => void;
  /** Absent in the warm-up (nothing is submitted there). */
  onSubmit?: (language: string, code: string) => void;
  submitting?: boolean;
  submitError?: unknown;
  emit?: Emit;
  onDraft?: (language: string, code: string) => void;
  /** Slot above the editor: timers and banners. */
  top?: ReactNode;
  extraActions?: ReactNode;
}

/** Statement + visible tests on the left, editor + results on the right (desktop only). */
export function TaskWorkspace(p: Props) {
  const t = useTranslations('interview.task');
  const errorText = useErrorText();
  const [language, setLanguage] = useState(
    p.languages.includes(p.initial.language) ? p.initial.language : p.languages[0],
  );
  // Code per language survives switching back and forth; starter code only for untouched ones.
  const codes = useRef<Record<string, string>>({ [language]: p.initial.code });
  const [code, setCode] = useState(p.initial.code);
  const [confirm, setConfirm] = useState(false);
  // The first editor needs no reset when it shows the plain starter of the first language.
  const [announce, setAnnounce] = useState(
    () => !(language === p.languages[0] && p.initial.code === starterFor(p.starterCode, language)),
  );

  const change = (value: string) => {
    codes.current[language] = value;
    setCode(value);
    p.onDraft?.(language, value);
  };
  const switchLanguage = (next: string) => {
    const start = codes.current[next] ?? starterFor(p.starterCode, next);
    codes.current[next] = start;
    setLanguage(next);
    setAnnounce(true);
    setCode(start);
    p.onDraft?.(next, start);
  };

  const passed = p.results?.filter((r) => r.passed).length ?? 0;

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section
        aria-labelledby="task-h"
        className="grid content-start gap-4 overflow-y-auto lg:max-h-[calc(100dvh-9rem)]"
      >
        <h2 id="task-h" className="text-xl font-semibold">
          {p.title}
        </h2>
        <p className="max-w-prose text-base whitespace-pre-line">{p.statement}</p>
        <div>
          <h3 className="text-sm font-semibold">{t('visibleTests')}</h3>
          <ul className="mt-2 grid gap-2">
            {p.visibleTests.map((v, i) => (
              <li key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{v.name || t('testN', { n: i + 1 })}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted">{t('input')}</dt>
                  <dd>
                    <pre className="font-mono whitespace-pre-wrap">{v.input || '—'}</pre>
                  </dd>
                  <dt className="text-muted">{t('output')}</dt>
                  <dd>
                    <pre className="font-mono whitespace-pre-wrap">{v.output}</pre>
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label={t('editorRegion')} className="grid min-h-0 content-start gap-3">
        {p.top}
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">
            {t('language')}
            <NativeSelect
              value={language}
              onChange={(e) => switchLanguage(e.target.value)}
              className="min-w-40"
            >
              {p.languages.map((l) => (
                <option key={l} value={l}>
                  {p.labels?.[l] ?? t(`languages.${l as 'python'}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11 gap-2 px-4"
              disabled={p.running || p.submitting}
              aria-busy={p.running || undefined}
              onClick={() => p.onRun(language, code)}
            >
              <Play aria-hidden="true" />
              {p.running ? t('running') : t('run')}
            </Button>
            {p.onSubmit ? (
              <Button
                className="min-h-11 gap-2 px-4"
                disabled={p.submitting || p.running}
                onClick={() => setConfirm(true)}
              >
                <Send aria-hidden="true" />
                {t('submit')}
              </Button>
            ) : null}
            {p.extraActions}
          </div>
        </div>
        <div className="h-[28rem] lg:h-[calc(100dvh-24rem)] lg:min-h-80">
          <CodeEditor
            key={language}
            announceReset={announce}
            language={language}
            defaultValue={code}
            onChange={change}
            emit={p.emit}
            label={t('editorLabel')}
          />
        </div>

        <div aria-live="polite" className="grid gap-2">
          {p.runError ? (
            <Notice tone="danger" role="alert">
              {errorText(p.runError)}
            </Notice>
          ) : null}
          {p.results ? (
            <section
              aria-labelledby="results-h"
              className="grid gap-2 rounded-lg border border-border p-3"
            >
              <h3 id="results-h" className="text-sm font-semibold tabular-nums">
                {t('resultsSummary', { passed, total: p.results.length })}
              </h3>
              <ul className="grid gap-1.5">
                {p.results.map((r, i) => (
                  <li key={i} className="text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      {r.passed ? (
                        <CircleCheck aria-hidden="true" className="size-4 text-success" />
                      ) : r.status === 'timeout' ? (
                        <Clock aria-hidden="true" className="size-4 text-warning" />
                      ) : (
                        <CircleAlert aria-hidden="true" className="size-4 text-danger" />
                      )}
                      <span>{r.name || t('testN', { n: i + 1 })}</span>
                      <span className={cn('text-muted')}>
                        {t(`status.${r.status as 'passed'}`)}
                      </span>
                      <span className="ml-auto text-xs text-muted tabular-nums">
                        {r.time_ms} ms
                      </span>
                    </p>
                    {!r.passed && (r.stderr || r.stdout) ? (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-2 p-2 font-mono text-xs whitespace-pre-wrap">
                        {r.stderr || r.stdout}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {p.onSubmit ? (
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogTitle>{t('submitTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('submitBody')}</AlertDialogDescription>
              {p.submitError ? (
                <Notice tone="danger" role="alert">
                  {errorText(p.submitError)}
                </Notice>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>{t('keepWorking')}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={p.submitting}
                  onClick={(e) => {
                    e.preventDefault();
                    p.onSubmit?.(language, code);
                    setConfirm(false);
                  }}
                >
                  {t('submitConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </section>
    </div>
  );
}
