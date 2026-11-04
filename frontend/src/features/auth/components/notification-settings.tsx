'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/lib/forms';
import { useMe, useTelegramLink, useTelegramUnlink, useUpdateMe } from '../api';
import type { Me } from '../model';

const LINK_POLL_MS = 3000;

function ChannelRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function NotificationSettings({ me }: { me: Me }) {
  const t = useTranslations('settings');
  const errorText = useErrorText();
  const update = useUpdateMe();
  const link = useTelegramLink();
  const unlink = useTelegramUnlink();
  const { refetch } = useMe();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const waiting = linkUrl !== null && !me.telegram_linked;
  const failure = update.error ?? link.error ?? unlink.error;

  // The link is confirmed inside Telegram, so this page only learns about it by asking.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refetch(), LINK_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refetch]);

  return (
    <section aria-labelledby="notifications-title" className="mt-10 border-t border-border pt-8">
      <h2 id="notifications-title" className="font-display text-xl font-semibold tracking-tight">
        {t('notifications')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('notificationsLead')}</p>
      {failure ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {errorText(failure)}
        </Notice>
      ) : null}
      <div className="mt-5 grid gap-4">
        <ChannelRow
          label={t('notifyEmail')}
          hint={me.is_email_verified ? undefined : t('notifyEmailUnverified')}
          checked={me.notify_email}
          disabled={update.isPending}
          onChange={(notify_email) => update.mutate({ notify_email })}
        />
        {me.telegram_available ? (
          <div className="grid gap-3">
            <ChannelRow
              label={t('notifyTelegram')}
              hint={me.telegram_linked ? t('telegramLinked') : t('telegramNotLinked')}
              checked={me.notify_telegram && me.telegram_linked}
              disabled={update.isPending || !me.telegram_linked}
              onChange={(notify_telegram) => update.mutate({ notify_telegram })}
            />
            <div className="flex flex-wrap items-center gap-3">
              {me.telegram_linked ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={unlink.isPending}
                  onClick={() => {
                    setLinkUrl(null);
                    unlink.mutate();
                  }}
                >
                  {t('telegramDisconnect')}
                </Button>
              ) : waiting ? (
                <>
                  <Button asChild>
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                      {t('telegramOpen')}
                    </a>
                  </Button>
                  <p role="status" className="text-sm text-muted">
                    {t('telegramWaiting')}
                  </p>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => link.mutate(undefined, { onSuccess: (r) => setLinkUrl(r.url) })}
                >
                  {t('telegramConnect')}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
