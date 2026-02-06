import { useState, useCallback } from 'react';
import { useEnvironments, useActivateEnvironment, useProxies, useActivateProxy } from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';

export function Header() {
  const { data: environments = [] } = useEnvironments();
  const { data: proxies = [] } = useProxies();
  const activateEnv = useActivateEnvironment();
  const activateProxy = useActivateProxy();

  const activeEnv = environments.find(e => e.isActive);
  const activeProxy = proxies.find(p => p.isActive);

  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);

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
              {proxies.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No proxies</div>
              ) : (
                proxies.map(proxy => (
                  <button
                    key={proxy.id}
                    onClick={() => { activateProxy.mutate(proxy.id); setShowProxyDropdown(false); }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 ${proxy.isActive ? 'bg-blue-50' : ''}`}
                  >
                    {proxy.isActive && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                    {proxy.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
