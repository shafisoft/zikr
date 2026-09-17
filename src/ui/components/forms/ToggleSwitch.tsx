/**
 * Toggle Switch Component
 * Custom styled checkbox with slider animation
 */

import React from 'react';
import { ToggleSwitchProps } from '../../types/components';

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  inputId: inputIdProp,
}) => {
  const id = inputIdProp ?? React.useId();

  return (
    <div className="flex items-center gap-3">
      {label && (
        <label
          htmlFor={id}
          className={`font-label-md text-label-md cursor-pointer ${
            disabled ? 'text-on-surface-variant opacity-50' : 'text-on-surface'
          }`}
        >
          {label}
        </label>
      )}
      <div className="relative inline-block w-12 align-middle select-none">
        <input
          type="checkbox"
          id={id}
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-checked={checked}
          aria-label={label || 'Toggle switch'}
          className="
            toggle-checkbox
            absolute block w-6 h-6 rounded-full bg-white border-4 border-outline-variant/40
            appearance-none cursor-pointer z-10
            top-1 left-1
            checked:right-1 checked:left-auto
            checked:border-surface-container-lowest
            transition-all duration-200
          "
        />
        <label
          htmlFor={id}
          className={`
            toggle-label
            block overflow-hidden h-8 rounded-full
            cursor-pointer border border-outline-variant/20
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${checked ? 'bg-inverse-primary' : 'bg-surface-container-highest'}
          `}
        />
      </div>
    </div>
  );
};

export default ToggleSwitch;
