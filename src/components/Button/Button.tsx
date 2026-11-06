import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import './Button.css';

/** Figma: Buttons page › "Button - Refactored" (Type × Size × State). */
export type ButtonType = 'primary' | 'outline' | 'outline-on-dark' | 'ghost';
export type ButtonSize = 'large' | 'small';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Figma `Type`. Named `variant` because `type` is taken by the HTML attribute. */
  variant?: ButtonType;
  /** Figma `Size`. Ghost is only designed at large. */
  size?: ButtonSize;
  /** Figma `Button Label`. */
  label?: string;
  /** Figma `Icon Left` + `Icon Left Image`. Pass `true` for the default arrow, or your own node. */
  iconLeft?: boolean | ReactNode;
  /** Figma `Icon Right` + `Icon Right Image`. On by default, as in Figma. Pass `false` to hide. */
  iconRight?: boolean | ReactNode;
  /** HTML button type. */
  htmlType?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'large',
  label = 'Button',
  iconLeft = false,
  iconRight = true,
  htmlType = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const left = iconLeft === true ? <Icon name="arrow-left" /> : iconLeft || null;
  const right = iconRight === true ? <Icon name="arrow-right" /> : iconRight || null;
  return (
    <button
      type={htmlType}
      className={['cha-button', `cha-button--${variant}`, `cha-button--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {left}
      <span className="cha-button__label">{children ?? label}</span>
      {right}
    </button>
  );
}
