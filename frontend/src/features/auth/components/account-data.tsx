'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Notice } from '@/components/common/notice';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { useErrorText } from '@/lib/forms';
import { authKeys } from '../api';

function saveJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountData() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  const exportData = useMutation({
    mutationFn: () => unwrap(api.GET('/api/v1/auth/me/export')),
    onSuccess: (data) => saveJson(data, 'skillproof-data.json'),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/me/delete', { body: { password } })),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(authKeys.me(), null);
      router.replace('/');
    },
  });

  return (
    <section aria-labelledby="account-data-title" className="mt-10 border-t border-border pt-8">
      <h2 id="account-data-title" className="font-display text-xl font-semibold tracking-tight">
        {t('dataTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('dataLead')}</p>
      {exportData.error ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {errorText(exportData.error)}
        </Notice>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          {t('dataExport')}
        </Button>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setPassword('');
              remove.reset();
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" className="min-h-11">
              {t('deleteAccount')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
            <form
              id="delete-account"
              onSubmit={(e) => {
                e.preventDefault();
                if (password) remove.mutate();
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                {t('deletePassword')}
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </form>
            {remove.error ? (
              <Notice tone="danger" role="alert">
                {errorText(remove.error)}
              </Notice>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <Button
                type="submit"
                form="delete-account"
                variant="destructive"
                disabled={!password || remove.isPending}
              >
                {t('deleteConfirm')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
