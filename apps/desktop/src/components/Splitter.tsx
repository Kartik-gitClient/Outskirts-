import React, { useCallback, useRef, useState } from 'react';

interface SplitterProps {
  /** Called with the pointer delta in px while dragging. */
  onDelta: (dx: number) => void;
}

/** Thin vertical drag handle between two grid columns. */
export const Splitter: React.FC<SplitterProps> = ({ onDelta }) => {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    setDragging(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onDelta(e.clientX - lastX.current);
      lastX.current = e.clientX;
    },
    [dragging, onDelta],
  );

  const end = useCallback(() => {
    setDragging(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  return (
    <div
      className={`splitter ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
};

/** Clamp helper shared by all resizable panes. */
export const clampWidth = (w: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(w)));

/** Read a persisted pane width from localStorage. */
export const storedWidth = (key: string, fallback: number): number => {
  const v = Number(window.localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const storeWidth = (key: string, w: number): void => {
  try {
    window.localStorage.setItem(key, String(w));
  } catch {
    /* private mode / quota — ignore */
  }
};
