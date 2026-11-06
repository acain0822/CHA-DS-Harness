import { useId, type InputHTMLAttributes } from 'react';
import { Icon } from '../Icon/Icon';
import './Checkbox.css';

/**
 * Figma: Forms page › "check boxes" (variant × Checked × Screen).
 * `variant` (hover, active, focus) are interaction states, so they come from
 * CSS; `Screen` is handled by the responsive type scale.
 */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Figma `Check Text`. */
  label?: string;
  /** Figma `Show Label`. Hiding the label keeps it for screen readers. */
  showLabel?: boolean;
  /** Figma `Show Helper Text`: the text to show. */
  helperText?: string;
}

export function Checkbox({
  label = 'Label',
  showLabel = true,
  helperText,
  id,
  className,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = helperText ? `${inputId}-help` : undefined;
  return (
    <div className={['cha-checkbox', className].filter(Boolean).join(' ')}>
      <label className="cha-checkbox__row" htmlFor={inputId}>
        <span className="cha-checkbox__control">
          <input
            id={inputId}
            type="checkbox"
            className="cha-checkbox__input"
            aria-describedby={helpId}
            {...rest}
          />
          <span className="cha-checkbox__box" aria-hidden="true">
            <Icon name="check" size={12} className="cha-checkbox__check" />
          </span>
        </span>
        <span className={showLabel ? 'cha-checkbox__label' : 'cha-visually-hidden'}>{label}</span>
      </label>
      {helperText && (
        <p id={helpId} className="cha-checkbox__help">
          {helperText}
        </p>
      )}
    </div>
  );
}
