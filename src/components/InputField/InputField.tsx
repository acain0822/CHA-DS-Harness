import { useId, type InputHTMLAttributes } from 'react';
import './InputField.css';

/**
 * Figma: Forms page › "input fields" (State × Screen).
 * States map to the browser: Active = hover, Focus = keyboard/mouse focus,
 * Disabled = `disabled`, Error = `error` text present.
 */
export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Figma `Label Text`. */
  label?: string;
  /** Figma `Label` toggle. Hiding it keeps it for screen readers. */
  showLabel?: boolean;
  /** Figma `Is Required`: shows the red asterisk and sets `required`. */
  isRequired?: boolean;
  /** Figma `Show Help Text`: the text to show. */
  helpText?: string;
  /** Puts the field in the Error state and shows this message. */
  error?: string;
}

export function InputField({
  label = 'Label',
  showLabel = true,
  isRequired = false,
  helpText,
  error,
  id,
  className,
  disabled,
  ...rest
}: InputFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = helpText ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div
      className={['cha-input', error ? 'cha-input--error' : '', disabled ? 'cha-input--disabled' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor={inputId} className={showLabel ? 'cha-input__label' : 'cha-visually-hidden'}>
        {label}
        {isRequired && (
          <span className="cha-input__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="cha-input__frame">
        <input
          id={inputId}
          className="cha-input__control"
          required={isRequired}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={[helpId, errorId].filter(Boolean).join(' ') || undefined}
          {...rest}
        />
      </div>
      {(helpText || error) && (
        <div className="cha-input__messages">
          {helpText && (
            <p id={helpId} className="cha-input__help">
              {helpText}
            </p>
          )}
          {error && (
            <p id={errorId} className="cha-input__error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
