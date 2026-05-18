import { cn } from '@/lib/utils';

const sizes = { 16: 16, 24: 24, 32: 32, 64: 64 } as const;

interface LogoMarkProps {
  size?: keyof typeof sizes;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  const px = sizes[size];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={px}
      height={px}
      fill="none"
      className={cn('flex-shrink-0', className)}
      aria-hidden
    >
      <path
        d="M5 20a11 11 0 0 1 22 0"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M5 20a11 11 0 0 1 11-11"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeOpacity="0.35"
      />
      <circle cx="16" cy="22" r="2.2" fill="currentColor" />
    </svg>
  );
}
