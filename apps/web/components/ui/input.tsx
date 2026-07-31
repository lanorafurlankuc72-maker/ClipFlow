import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'h-12 w-full min-w-0 rounded-lg bg-white px-4 text-base text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus-visible:ring-3 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
