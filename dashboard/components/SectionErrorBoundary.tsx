"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  err: Error | null;
}

/**
 * Isolates failures so one broken panel does not blank the whole dashboard.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(`[${this.props.title}]`, err, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.err) {
      return (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-5">
          <p className="text-sm font-medium text-amber-200">
            {this.props.title} — something went wrong
          </p>
          <p className="mt-2 font-mono text-[11px] text-zinc-400">
            {this.state.err.message}
          </p>
          <button
            type="button"
            className="mt-3 rounded-md border border-nexora-border px-3 py-1.5 text-xs text-zinc-300 hover:border-nexora-accent"
            onClick={() => this.setState({ err: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
