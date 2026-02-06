import { useState, useCallback } from 'react';
import { useEnvironments, useActivateEnvironment, useProxies, useActivateProxy, useDeactivateProxy } from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import { EnvironmentEditor } from './EnvironmentEditor';
import { ProxyEditor } from './ProxyEditor';

export function Header() {
  const { data: environments = [] } = useEnvironments();
  const { data: proxies = [] } = useProxies();
  const activateEnv = useActivateEnvironment();
  const activateProxy = useActivateProxy();
  const deactivateProxy = useDeactivateProxy();

  const activeEnv = environments.find(e => e.isActive);
  const activeProxy = proxies.find(p => p.isActive);

  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [showProxyEditor, setShowProxyEditor] = useState(false);

  const closeEnvDropdown = useCallback(() => setShowEnvDropdown(false), []);
  const closeProxyDropdown = useCallback(() => setShowProxyDropdown(false), []);

  const envDropdownRef = useClickOutside<HTMLDivElement>(closeEnvDropdown, showEnvDropdown);
  const proxyDropdownRef = useClickOutside<HTMLDivElement>(closeProxyDropdown, showProxyDropdown);

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="font-bold text-xl text-gray-800">Relay</span>
      </div>

      <div className="flex-1" />

      {/* Environment Selector */}
      <div className="relative" ref={envDropdownRef}>
        <button
          onClick={() => { setShowEnvDropdown(!showEnvDropdown); setShowProxyDropdown(false); }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50"
        >
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {activeEnv?.name || 'No Environment'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showEnvDropdown && (
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
            <div className="py-1">
              {environments.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No environments</div>
              ) : (
                environments.map(env => (
                  <button
                    key={env.id}
                    onClick={() => { activateEnv.mutate(env.id); setShowEnvDropdown(false); }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 ${env.isActive ? 'bg-blue-50' : ''}`}
                  >
                    {env.isActive && <span className="w-2 h-2 rounded-full bg-green-500" />}
                    {env.name}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 py-1">
              <button
                onClick={() => { setShowEnvEditor(true); setShowEnvDropdown(false); }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 text-blue-600"
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
          onClick={() => { setShowProxyDropdown(!showProxyDropdown); setShowEnvDropdown(false); }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50"
        >
          <span className={`w-2 h-2 rounded-full ${activeProxy ? 'bg-yellow-500' : 'bg-gray-300'}`} />
          {activeProxy?.name || 'No Proxy'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showProxyDropdown && (
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
            <div className="py-1">
              <button
                onClick={() => { deactivateProxy.mutate(undefined); setShowProxyDropdown(false); }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 ${!activeProxy ? 'bg-blue-50' : ''}`}
              >
                {!activeProxy && <span className="w-2 h-2 rounded-full bg-gray-400" />}
                <span className="text-gray-500">No Proxy</span>
              </button>
              {proxies.map(proxy => (
                <button
                  key={proxy.id}
                  onClick={() => { activateProxy.mutate(proxy.id); setShowProxyDropdown(false); }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 ${proxy.isActive ? 'bg-blue-50' : ''}`}
                >
                  {proxy.isActive && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                  {proxy.name}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-200 py-1">
              <button
                onClick={() => { setShowProxyEditor(true); setShowProxyDropdown(false); }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 text-blue-600"
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
    </header>
  );
}
