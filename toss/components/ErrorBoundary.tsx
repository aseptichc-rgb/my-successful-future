import { Component, type ReactNode } from 'react';
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="toss-page"><h1>화면을 불러오지 못했어요</h1><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" className="toss-row text-[var(--soul)]" onClick={() => window.location.reload()}>다시 불러오기</button></main>;
  }
}
