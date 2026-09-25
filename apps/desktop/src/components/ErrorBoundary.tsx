import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render crashes and shows the error on screen instead of a blank page,
 * so failures are diagnosable in the chromeless desktop window (no DevTools by default).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[outskirts] render crash:', error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          height: '100vh',
          padding: 32,
          background: '#000',
          color: '#ff3333',
          fontFamily: 'monospace',
          fontSize: 12,
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 14, marginBottom: 16 }}>render crash — the workbench hit an unhandled error</div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {this.state.error.name}: {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 20,
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          reload workbench
        </button>
      </div>
    );
  }
}
