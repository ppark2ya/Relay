import { METHOD_TEXT_COLORS } from './method-colors';

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({ method, className = '' }: MethodBadgeProps) {
  return (
    <span className={`text-xs font-mono font-semibold ${METHOD_TEXT_COLORS[method] || 'text-gray-600'} ${className}`}>
      {method}
    </span>
  );
}
