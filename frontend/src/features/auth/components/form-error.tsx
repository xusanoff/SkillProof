import { Notice } from '@/components/common/notice';

/** Form-level error (after submit). Announced by screen readers. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Notice tone="danger" role="alert">
      {message}
    </Notice>
  );
}
