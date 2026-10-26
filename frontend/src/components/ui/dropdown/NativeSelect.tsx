import React from 'react';
import { Icon, IconName } from '../PaperIcon';
import './dropdown.css';

export interface NativeSelectOption<T extends string | number = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps<T extends string | number = string>
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: T;
  onChange: (value: T, event: React.ChangeEvent<HTMLSelectElement>) => void;
  options?: NativeSelectOption<T>[];
  icon?: IconName;
  variant?: 'default' | 'surface';
  selectSize?: 'sm' | 'md';
  wrapperClassName?: string;
  children?: React.ReactNode;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps<any>>(
  (
    {
      value,
      onChange,
      options,
      icon,
      variant = 'default',
      selectSize = 'md',
      wrapperClassName = '',
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div
        className={`extrabin-native-select-wrapper extrabin-native-select--${variant} extrabin-native-select--${selectSize} ${wrapperClassName}`}
      >
        <select
          ref={ref}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const rawVal = e.target.value;
            // Preserving numeric value if original type was number
            const val = typeof value === 'number' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal;
            onChange(val as any, e);
          }}
          className={`extrabin-native-select ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <span className="extrabin-native-select__chev" aria-hidden="true">
          <Icon name={icon || 'chevron-down'} size={selectSize === 'sm' ? 12 : 14} />
        </span>
      </div>
    );
  }
);

NativeSelect.displayName = 'NativeSelect';
