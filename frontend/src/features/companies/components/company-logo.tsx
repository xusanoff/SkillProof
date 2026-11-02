import { Building2 } from 'lucide-react';
import Image from 'next/image';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Company logo from the API (public URL via the /api proxy) or a neutral placeholder. */
export function CompanyLogo({
  logoUrl,
  name,
  size = 48,
  className,
}: {
  logoUrl: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = apiAssetUrl(logoUrl);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // The API serves logos already sized; skip the optimizer (it can't reach /api in all setups).
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          unoptimized
          className="size-full object-contain"
        />
      ) : (
        <Building2 aria-hidden="true" className="size-1/2 text-muted" />
      )}
    </span>
  );
}
