'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/** Password input with a show/hide toggle (a real button with a label). */
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        aria-pressed={visible}
        className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-fg"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-5" />
        ) : (
          <Eye aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  );
}
