import { useEffect, useRef, useState } from 'react';

type FlowLayout = 'vertical' | 'horizontal';

const STORAGE_KEY_LAYOUT = 'flowLayout';
const STORAGE_KEY_RATIO = 'flowSplitRatio';
const DEFAULT_RATIO = 50;
const MIN_RATIO = 20;
const MAX_RATIO = 80;

export function useFlowLayout() {
  const [layout, setLayout] = useState<FlowLayout>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT);
    return saved === 'horizontal' ? 'horizontal' : 'vertical';
  });

  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RATIO);
    if (saved) {
      const n = Number(saved);
      if (n >= MIN_RATIO && n <= MAX_RATIO) return n;
    }
    return DEFAULT_RATIO;
  });

  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LAYOUT, layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RATIO, String(splitRatio));
  }, [splitRatio]);

  const toggleLayout = () => {
    setLayout(prev => (prev === 'vertical' ? 'horizontal' : 'vertical'));
  };

  /* eslint-disable react-compiler/react-compiler -- DOM cursor/selection manipulation in drag handler */
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    isResizing.current = true;

    const containerRect = containerRef.current.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const ratio = ((ev.clientX - containerRect.left) / containerRect.width) * 100;
      setSplitRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  /* eslint-enable react-compiler/react-compiler */

  return {
    layout,
    splitRatio,
    containerRef,
    toggleLayout,
    handleResizeStart,
  };
}
