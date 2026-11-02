import { cn } from '@/lib/utils';

/**
 * User-written text (vacancy description, cover note) as plain text: paragraphs on blank
 * lines, line breaks kept. Never HTML (design-system §3: no dangerouslySetInnerHTML).
 */
export function PlainText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={cn('grid max-w-prose gap-3 leading-relaxed', className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
