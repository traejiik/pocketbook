import { cn } from '@/lib/utils';
import { hexToRgba, initials } from '@/lib/colors';

interface CategoryAvatarProps {
  name: string;
  /** Six-digit hex category colour. */
  color: string;
  size?: number;
  className?: string;
}

// Round, tinted badge with 2-letter mono initials — used in transaction and
// recent-activity rows (v5).
export function CategoryAvatar({ name, color, size = 36, className }: CategoryAvatarProps) {
  return (
    <span
      className={cn('rounded-full flex items-center justify-center shrink-0', className)}
      style={{ width: size, height: size, background: hexToRgba(color, 0.14), color }}
      aria-hidden
    >
      <span className="mono font-bold" style={{ fontSize: size <= 28 ? '9px' : '10.5px' }}>
        {initials(name)}
      </span>
    </span>
  );
}
