'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const t = useTranslations('theme');
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="size-11"
      aria-label={t('toggle')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {/* Both icons rendered; CSS picks one so SSR and client markup match. */}
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="block dark:hidden" />
    </Button>
  );
}
