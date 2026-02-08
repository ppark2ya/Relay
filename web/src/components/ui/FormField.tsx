import type { ReactNode } from 'react';

export const INPUT_CLASS = 'w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100';

interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
