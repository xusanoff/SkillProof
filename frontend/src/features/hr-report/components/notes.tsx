'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { useAddNote, useNotes } from '../api';

const MAX = 4000;

/** Private notes of the company about this candidate: newest first, plus an add form. */
export function Notes({ companyId, applicationId }: { companyId: string; applicationId: string }) {
  const t = useTranslations('hrReport.notes');
  const errorText = useErrorText();
  const format = useFormat();
  const notes = useNotes(companyId, applicationId);
  const add = useAddNote(companyId, applicationId);
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);

  return (
    <section aria-labelledby="notes-h" className="grid gap-3">
      <h3 id="notes-h" className="font-semibold">
        {t('title')}
      </h3>
      <p className="text-sm text-muted">{t('private')}</p>
      <form
        noValidate
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          setEmpty(value === '');
          if (!value) return;
          add.mutate(value, { onSuccess: () => setText('') });
        }}
      >
        <label htmlFor="note-text" className="text-sm font-medium">
          {t('label')}
        </label>
        <Textarea
          id="note-text"
          rows={3}
          maxLength={MAX}
          value={text}
          aria-invalid={empty || undefined}
          aria-describedby={empty ? 'note-error' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setEmpty(false);
          }}
        />
        {empty ? (
          <p id="note-error" className="text-sm text-danger">
            {t('empty')}
          </p>
        ) : null}
        {add.isError ? (
          <Notice tone="danger" role="alert">
            {errorText(add.error)}
          </Notice>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="min-h-11 px-4"
            disabled={add.isPending}
          >
            {add.isPending ? t('adding') : t('add')}
          </Button>
        </div>
      </form>

      {notes.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(notes.error)}
        </Notice>
      ) : notes.data && notes.data.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : (
        <ul className="grid gap-2">
          {(notes.data ?? []).map((n) => (
            <li key={n.id} className="rounded-lg bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-line">{n.text}</p>
              <p className="mt-1 text-xs text-muted">
                {n.author_name ?? t('unknownAuthor')} ·{' '}
                <time dateTime={n.created_at}>{format.dateTime(n.created_at)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
