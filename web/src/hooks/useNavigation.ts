import { useState, useEffect, useCallback } from 'react';

export type View = 'requests' | 'flows' | 'history';

interface NavState {
  view: View;
  resourceId: number | null;
}

function parseUrl(pathname: string): NavState {
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'requests' && parts[1]) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id) && id > 0) {
      return { view: 'requests', resourceId: id };
    }
  }

  if (parts[0] === 'flows' && parts[1]) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id) && id > 0) {
      return { view: 'flows', resourceId: id };
    }
  }

  if (parts[0] === 'history') {
    return { view: 'history', resourceId: null };
  }

  if (parts[0] === 'flows') {
    return { view: 'flows', resourceId: null };
  }

  return { view: 'requests', resourceId: null };
}

function buildUrl(view: View, resourceId?: number): string {
  if (resourceId && view === 'requests') return `/requests/${resourceId}`;
  if (resourceId && view === 'flows') return `/flows/${resourceId}`;
  if (view === 'history') return '/history';
  if (view === 'flows') return '/flows';
  return '/';
}

export interface UseNavigationReturn {
  view: View;
  resourceId: number | null;
  navigateToRequest: (id: number) => void;
  navigateToFlow: (id: number) => void;
  navigateToView: (view: View) => void;
}

export function useNavigation(onUrlChange?: (state: NavState) => void): UseNavigationReturn {
  const [state, setState] = useState<NavState>(() => parseUrl(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      const newState = parseUrl(window.location.pathname);
      setState(newState);
      onUrlChange?.(newState);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onUrlChange]);

  const navigateToRequest = useCallback((id: number) => {
    const url = buildUrl('requests', id);
    window.history.pushState(null, '', url);
    setState({ view: 'requests', resourceId: id });
  }, []);

  const navigateToFlow = useCallback((id: number) => {
    const url = buildUrl('flows', id);
    window.history.pushState(null, '', url);
    setState({ view: 'flows', resourceId: id });
  }, []);

  const navigateToView = useCallback((view: View) => {
    const url = buildUrl(view);
    window.history.pushState(null, '', url);
    setState({ view, resourceId: null });
  }, []);

  return {
    view: state.view,
    resourceId: state.resourceId,
    navigateToRequest,
    navigateToFlow,
    navigateToView,
  };
}
