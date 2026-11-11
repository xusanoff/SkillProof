'use client';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Notice } from '@/components/common/notice';
import { Link } from '@/i18n/navigation';
import { useMe } from '@/features/auth';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { useErrorText } from '@/lib/forms';
import type { components } from '@/lib/api/schema';

type Message = components['schemas']['MessageOut'];
const POLL_MS = 3000;
export function HrChatPage({ applicationId }: { applicationId?: string }) {
  const { active } = useActiveCompany();
  return active ? (
    <ChatPage applicationId={applicationId} companyId={active.id} />
  ) : (
    <NeedsCompany />
  );
}
export function ChatPage({
  applicationId,
  companyId,
}: {
  applicationId?: string;
  companyId?: string;
}) {
  const me = useMe();
  const t = useTranslations('chat');
  if (!me.data) return <p role="status">…</p>;
  return (
    <div className="grid min-w-0 gap-5">
      <h1 className="sp-page-title flex items-center gap-2">
        <MessageCircle aria-hidden="true" />
        {t('title')}
      </h1>
      {applicationId ? (
        <Conversation
          key={`${me.data.id}-${applicationId}`}
          applicationId={applicationId}
          userId={me.data.id}
          hr={me.data.role === 'hr'}
        />
      ) : (
        <Inbox
          key={`${me.data.id}-${companyId}`}
          userId={me.data.id}
          companyId={companyId}
          hr={me.data.role === 'hr'}
        />
      )}
    </div>
  );
}
function Inbox({ userId, companyId, hr }: { userId: string; companyId?: string; hr: boolean }) {
  const api = useApi();
  const t = useTranslations('chat');
  const ts = useTranslations('applicationStatus');
  const errorText = useErrorText();
  const list = useInfiniteQuery({
    queryKey: ['chat', userId, 'threads', companyId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/chat/threads', {
          params: { query: { page: pageParam, ...(companyId ? { company_id: companyId } : {}) } },
        }),
      ),
    getNextPageParam: (page) =>
      page.page * page.page_size < page.total ? page.page + 1 : undefined,
    refetchInterval: POLL_MS,
  });
  if (list.isError)
    return (
      <Notice tone="danger" role="alert">
        {errorText(list.error)}
        <Button onClick={() => list.refetch()}>{t('retry')}</Button>
      </Notice>
    );
  if (!list.data) return <p role="status">…</p>;
  return (
    <div className="grid gap-3">
      {list.data.pages[0].total === 0 ? <p>{t('empty')}</p> : null}
      {list.data.pages
        .flatMap((page) => page.items)
        .map((thread) => (
          <Link
            key={thread.application_id}
            href={`/${hr ? 'hr' : 'candidate'}/messages/${thread.application_id}`}
            className="sp-card grid min-w-0 gap-2 p-5 hover:border-accent"
          >
            <span className="font-semibold">
              {hr ? thread.candidate_name : thread.company_name}
            </span>
            <span>{thread.vacancy_title}</span>
            <span className="text-sm text-muted">
              {ts(thread.application_status as Parameters<typeof ts>[0])}
            </span>
            {thread.last_message?.kind === 'message' ? (
              <p className="truncate text-sm">{thread.last_message.text}</p>
            ) : null}
            {thread.unread_count > 0 ? (
              <span className="text-sm font-semibold text-accent">
                {t('unread', { count: thread.unread_count })}
              </span>
            ) : null}
          </Link>
        ))}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {t('more')}
        </Button>
      ) : null}
    </div>
  );
}
function Conversation({
  applicationId,
  userId,
  hr,
}: {
  applicationId: string;
  userId: string;
  hr: boolean;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const t = useTranslations('chat');
  const ts = useTranslations('applicationStatus');
  const format = useFormatter();
  const errorText = useErrorText();
  const [text, setText] = useState('');
  const [failure, setFailure] = useState(false);
  const retry = useRef<{ text: string; client_id: string } | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const lastRead = useRef(0);
  const list = useInfiniteQuery({
    queryKey: ['chat', userId, 'messages', applicationId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/chat/threads/{application_id}/messages', {
          params: {
            path: { application_id: applicationId },
            query: pageParam ? { before: pageParam } : {},
          },
        }),
      ),
    getNextPageParam: (page) => (page.has_more ? page.items[0]?.sequence : undefined),
    refetchInterval: POLL_MS,
  });
  const messages = [
    ...new Map(
      (list.data?.pages.flatMap((page) => page.items) ?? []).map((m) => [m.sequence, m]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
  const latest = messages.at(-1)?.sequence;
  useEffect(() => {
    if (!latest) return;
    const read = () => {
      if (document.visibilityState === 'hidden' || lastRead.current >= latest) return;
      lastRead.current = latest;
      if (pane.current) pane.current.scrollTop = pane.current.scrollHeight;
      void unwrap(
        api.POST('/api/v1/chat/threads/{application_id}/read', {
          params: { path: { application_id: applicationId } },
          body: { through_sequence: latest },
        }),
      )
        .then(() => qc.invalidateQueries({ queryKey: ['chat', userId, 'threads'] }))
        .catch(() => {
          lastRead.current = 0;
        });
    };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [latest, api, applicationId, qc, userId]);
  const send = useMutation({
    mutationFn: async () => {
      const value = text.trim();
      if (!retry.current || retry.current.text !== value)
        retry.current = { text: value, client_id: crypto.randomUUID() };
      return unwrap(
        api.POST('/api/v1/chat/threads/{application_id}/messages', {
          params: { path: { application_id: applicationId } },
          body: retry.current,
        }),
      );
    },
    onSuccess: () => {
      setText('');
      setFailure(false);
      retry.current = null;
      void list.refetch();
      void qc.invalidateQueries({ queryKey: ['chat', userId, 'threads'] });
    },
    onError: () => setFailure(true),
  });
  const thread = list.data?.pages[0].thread;
  if (list.isError && !thread)
    return (
      <Notice tone="danger" role="alert">
        {errorText(list.error)}
        <Button onClick={() => list.refetch()}>{t('retry')}</Button>
      </Notice>
    );
  return (
    <div className="grid min-w-0 gap-4">
      <Link
        href={`/${hr ? 'hr' : 'candidate'}/messages`}
        className="inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft aria-hidden="true" />
        {t('title')}
      </Link>
      {thread ? (
        <div className="sp-card grid gap-2 p-4">
          <h2 className="text-xl font-semibold">
            {hr ? thread.candidate_name : thread.company_name}
          </h2>
          <p>{thread.vacancy_title}</p>
          <p className="text-sm text-muted">
            {t('status', { status: ts(thread.application_status as Parameters<typeof ts>[0]) })}
          </p>
          {thread.cover_note ? (
            <details>
              <summary className="cursor-pointer">{t('coverNote')}</summary>
              <p className="break-words whitespace-pre-wrap">{thread.cover_note}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p role="status">…</p>
      )}
      <div
        ref={pane}
        role="log"
        tabIndex={0}
        aria-label={t('title')}
        aria-live="polite"
        className="sp-card grid max-h-[55dvh] min-h-52 content-start gap-3 overflow-y-auto p-4"
      >
        {list.hasNextPage ? (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => list.fetchNextPage()}
          >
            {t('older')}
          </Button>
        ) : null}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            own={m.sender_id === userId}
            peer={hr ? t('candidate') : t('company')}
            status={(s) => ts(s as Parameters<typeof ts>[0])}
            time={format.dateTime(new Date(m.created_at), {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          />
        ))}
      </div>
      {failure ? (
        <Notice tone="danger" role="alert">
          {t('failed')}
        </Notice>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !send.isPending) send.mutate();
        }}
      >
        <label htmlFor="chat-message" className="text-sm font-semibold">
          {t('placeholder')}
        </label>
        <Textarea
          id="chat-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          rows={3}
          disabled={send.isPending}
        />
        <Button
          type="submit"
          className="justify-self-end"
          disabled={!text.trim() || send.isPending || !thread}
        >
          <Send aria-hidden="true" />
          {send.isPending ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  );
}
function Bubble({
  message,
  own,
  peer,
  status,
  time,
}: {
  message: Message;
  own: boolean;
  peer: string;
  status: (value: string) => string;
  time: string;
}) {
  const t = useTranslations('chat');
  if (message.kind === 'status')
    return (
      <p className="rounded-lg bg-surface-2 p-3 text-center text-sm text-muted">
        {t('status', { status: status(message.application_status ?? 'applied') })}
        <span className="block text-xs">{time}</span>
      </p>
    );
  return (
    <article
      className={`max-w-[90%] rounded-xl border border-border p-3 ${own ? 'bg-primary-soft justify-self-end' : 'justify-self-start bg-surface'}`}
    >
      <p className="text-xs font-semibold text-muted">{own ? t('you') : peer}</p>
      <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">{message.text}</p>
      <time className="mt-1 block text-xs text-muted" dateTime={message.created_at}>
        {time}
      </time>
    </article>
  );
}
