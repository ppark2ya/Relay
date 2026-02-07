interface Tab {
  key: string;
  label: string;
  badge?: number;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
  tabClassName?: string;
}

export function TabNav({ tabs, activeTab, onTabChange, className = '', tabClassName = '' }: TabNavProps) {
  return (
    <div className={`flex border-b border-gray-200 ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === tab.key
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          } ${tabClassName}`}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
