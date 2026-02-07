const BG_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  gray: 'bg-gray-300 dark:bg-gray-500',
  red: 'bg-red-500',
};

interface StatusDotProps {
  color?: keyof typeof BG_COLORS;
  className?: string;
}

export function StatusDot({ color = 'gray', className = '' }: StatusDotProps) {
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${BG_COLORS[color]} ${className}`} />
  );
}
