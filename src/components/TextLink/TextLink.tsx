import type { AnchorHTMLAttributes, ReactNode } from 'react';
import './TextLink.css';

/** Figma: Components page › "Text Links" (State × Variation). */
export type TextLinkVariation = 'default' | 'light' | 'dark';

export interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Figma `Variation`. `light` is for dark backgrounds, `dark` is black text. */
  variation?: TextLinkVariation;
  /** Figma `State = Disabled`. Renders a non-navigable link that is still announced. */
  disabled?: boolean;
  children?: ReactNode;
}

export function TextLink({
  variation = 'default',
  disabled = false,
  href,
  className,
  children = 'Text Links',
  ...rest
}: TextLinkProps) {
  return (
    <a
      className={['cha-link', `cha-link--${variation}`, className].filter(Boolean).join(' ')}
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      role={disabled ? 'link' : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
