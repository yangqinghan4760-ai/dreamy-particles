import React, { ErrorInfo, ReactNode } from 'react';
import VanGoghParticles from './components/VanGoghParticles';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-black text-white flex items-center justify-center p-8">
            <div className="max-w-xl text-center">
                <h1 className="text-3xl font-serif text-yellow-600 mb-4">Something went wrong.</h1>
                <p className="text-gray-400 mb-6">{this.state.error?.message || "Unknown error occurred"}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 border border-white/20 hover:bg-white/10 rounded transition-colors"
                >
                    Reload Experience
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <div className="w-full h-full">
      <ErrorBoundary>
        <VanGoghParticles />
      </ErrorBoundary>
    </div>
  );
};

export default App;