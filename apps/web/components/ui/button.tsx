import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
        secondary: 'bg-[var(--surface-strong)] text-[var(--ink)] hover:bg-[var(--line)]',
        ghost: 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
      },
      size: {
        default: 'h-10 px-4',
        lg: 'h-12 px-5 text-base',
        icon: 'size-10 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
