import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  // one per view
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-input bg-card text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  // irreversible actions
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
  icon: 'h-9 w-9',
};

/**
 * Flat button with a clear hierarchy: primary > secondary > ghost, plus destructive.
 * For icon-only buttons pass size="icon" and an aria-label.
 */
const Button = React.forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
