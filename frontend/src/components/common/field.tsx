import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FieldProps {
  label: ReactNode;
  /** Already translated error text. */
  error?: string;
  hint?: ReactNode;
  /** Shown after the label, e.g. "(ixtiyoriy)". */
  optionalLabel?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label + control + hint + error, wired with aria-describedby / aria-invalid (design-system §7). */
export function Field({ label, error, hint, optionalLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {optionalLabel ? (
          <span className="ml-1 font-normal text-muted">{optionalLabel}</span>
        ) : null}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId!}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
