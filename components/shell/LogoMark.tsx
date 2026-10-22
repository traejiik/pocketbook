import { cn } from '@/lib/utils';

const sizes = { 16: 16, 24: 24, 32: 32, 64: 64 } as const;

// Bookmark P on a 256 grid. At 32 px and below the small cut is used: every edge
// sits on a 16-unit grid (one pixel at 16 px), with a deeper notch and a bigger
// counter so the mark stays crisp in the rail and the sidebar.
const MARK = 'M48 36H140A68 68 0 0 1 140 172H86V216L67 197L48 216ZM86 72H140A32 32 0 0 1 140 136H86Z';
const MARK_SMALL = 'M48 32H136A72 72 0 0 1 136 176H96V224L72 200L48 224ZM96 80H136A24 24 0 0 1 136 128H96Z';

interface LogoMarkProps {
  size?: keyof typeof sizes;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  const px = sizes[size];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={px}
      height={px}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path d={px <= 32 ? MARK_SMALL : MARK} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
