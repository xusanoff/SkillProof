import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';

/** A failed upload: the answer is still here, so offer to send it again. */
export function AnswerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('stage2.room');
  return (
    <Notice
      tone="danger"
      role="alert"
      title={t('sendFailed')}
      action={
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
          {t('retry')}
        </Button>
      }
    >
      {message} {t('answerKept')}
    </Notice>
  );
}
