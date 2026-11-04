'use client';

import { Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Stage2Telemetry } from '../use-stage2-telemetry';
import type { Turn } from '../model';

/** "Let me think": once per question (the server resets the timer once as well). */
export function ThinkButton({ turn, tel }: { turn: Turn; tel: Stage2Telemetry }) {
  const t = useTranslations('stage2.room');
  const [used, setUsed] = useState(false);
  if (!turn.think_available || used) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 gap-2"
      onClick={() => {
        tel.record('think', turn.id);
        setUsed(true);
      }}
    >
      <Lightbulb aria-hidden="true" />
      {t('think')}
    </Button>
  );
}
