import { useState, useCallback } from 'react';
import { useEnvironments, useActivateEnvironment } from '../api/environments';
import { useProxies, useActivateProxy, useDeactivateProxy } from '../api/proxies';
import { useWorkspaces } from '../api/workspaces';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTheme } from '../hooks/useTheme';
import { useWorkspaceContext } from '../hooks/useWorkspace';
import { EnvironmentEditor } from './EnvironmentEditor';
import { ProxyEditor } from './ProxyEditor';
import { WorkspaceEditor } from './WorkspaceEditor';
import { StatusDot } from './ui';

export function Header() {
  const { data: environments = [] } = useEnvironments();
  const { data: proxies = [] } = useProxies();
  const { data: workspaces = [] } = useWorkspaces();
  const activateEnv = useActivateEnvironment();
  const activateProxy = useActivateProxy();
  const deactivateProxy = useDeactivateProxy();
  const { currentWorkspaceId, switchWorkspace } = useWorkspaceContext();

  const activeEnv = environments.find(e => e.isActive);
  const activeProxy = proxies.find(p => p.isActive);
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [showWsEditor, setShowWsEditor] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [showProxyEditor, setShowProxyEditor] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const closeWsDropdown = useCallback(() => setShowWsDropdown(false), []);
  const closeEnvDropdown = useCallback(() => setShowEnvDropdown(false), []);
  const closeProxyDropdown = useCallback(() => setShowProxyDropdown(false), []);

  const wsDropdownRef = useClickOutside<HTMLDivElement>(closeWsDropdown, showWsDropdown);
  const envDropdownRef = useClickOutside<HTMLDivElement>(closeEnvDropdown, showEnvDropdown);
  const proxyDropdownRef = useClickOutside<HTMLDivElement>(closeProxyDropdown, showProxyDropdown);

  const closeAllDropdowns = () => {
    setShowWsDropdown(false);
    setShowEnvDropdown(false);
    setShowProxyDropdown(false);
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="font-bold text-xl text-gray-800 dark:text-gray-100">Relay</span>
      </div>

      <div className="flex-1" />

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-500 dark:text-amber-400"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Workspace Selector */}
      <div className="relative" ref={wsDropdownRef}>
        <button
          onClick={() => { closeAllDropdowns(); setShowWsDropdown(!showWsDropdown); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
        >
          <StatusDot color="blue" />
          {currentWorkspace?.name || 'Default'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showWsDropdown && (
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-10">
            <div className="py-1">
              {workspaces.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No workspaces</div>
              ) : (
                workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => { switchWorkspace(ws.id); setShowWsDropdown(false); }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200 ${ws.id === currentWorkspaceId ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                  >
                    {ws.id === currentWorkspaceId && <StatusDot color="blue" />}
                    {ws.name}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 py-1">
              <button
                onClick={() => { setShowWsEditor(true); setShowWsDropdown(false); }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Manage Workspaces
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Environment Selector */}
      <div className="relative" ref={envDropdownRef}>
        <button
          onClick={() => { closeAllDropdowns(); setShowEnvDropdown(!showEnvDropdown); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
        >
          <StatusDot color="green" />
          {activeEnv?.name || 'No Environment'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showEnvDropdown && (
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-10">
            <div className="py-1">
              {environments.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No environments</div>
              ) : (
                environments.map(env => (
                  <button
                    key={env.id}
                    onClick={() => { activateEnv.mutate(env.id); setShowEnvDropdown(false); }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200 ${env.isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                  >
                    {env.isActive && <StatusDot color="green" />}
                    {env.name}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 py-1">
              <button
                onClick={() => { setShowEnvEditor(true); setShowEnvDropdown(false); }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Environments
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Proxy Selector */}
      <div className="relative" ref={proxyDropdownRef}>
        <button
          onClick={() => { closeAllDropdowns(); setShowProxyDropdown(!showProxyDropdown); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
        >
          <StatusDot color={activeProxy ? 'yellow' : 'gray'} />
          {activeProxy?.name || 'No Proxy'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showProxyDropdown && (
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-10">
            <div className="py-1">
              <button
                onClick={() => { deactivateProxy.mutate(undefined); setShowProxyDropdown(false); }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${!activeProxy ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
              >
                {!activeProxy && <StatusDot color="gray" />}
                <span className="text-gray-500 dark:text-gray-400">No Proxy</span>
              </button>
              {proxies.map(proxy => (
                <button
                  key={proxy.id}
                  onClick={() => { activateProxy.mutate(proxy.id); setShowProxyDropdown(false); }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200 ${proxy.isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                >
                  {proxy.isActive && <StatusDot color="yellow" />}
                  {proxy.name}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 py-1">
              <button
                onClick={() => { setShowProxyEditor(true); setShowProxyDropdown(false); }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                Manage Proxies
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Environment Editor Modal */}
      <EnvironmentEditor isOpen={showEnvEditor} onClose={() => setShowEnvEditor(false)} />

      {/* Proxy Editor Modal */}
      <ProxyEditor isOpen={showProxyEditor} onClose={() => setShowProxyEditor(false)} />

      {/* Workspace Editor Modal */}
      <WorkspaceEditor
        isOpen={showWsEditor}
        onClose={() => setShowWsEditor(false)}
        currentWorkspaceId={currentWorkspaceId}
        onSwitchWorkspace={switchWorkspace}
      />
    </header>
  );
}
