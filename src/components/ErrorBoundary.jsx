import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <div className="brand-mark">RL</div>
          <h1>The dashboard hit a problem.</h1>
          <p>Your saved data is not affected. Reload to reconnect.</p>
          <button className="primary" onClick={() => location.reload()}>Reload dashboard</button>
          <code>{this.state.error.message}</code>
        </main>
      )
    }
    return this.props.children
  }
}

