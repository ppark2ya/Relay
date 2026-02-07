import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  className?: string;
}

export function EmptyState({ icon, message, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex-1 flex items-center justify-center ${className}`}>
      <div className="text-center text-gray-500 dark:text-gray-400">
        {icon}
        <p>{message}</p>
      </div>
    </div>
  );
}
