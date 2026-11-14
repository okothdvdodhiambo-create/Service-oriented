import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.error("Page render failed", error.message);
  }

  render(): ReactNode {
    if (this.state.failed) return <main className="container"><h1>Something went wrong</h1><p>Reload the page to try again.</p></main>;
    return this.props.children;
  }
}
