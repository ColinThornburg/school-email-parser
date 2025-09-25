import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import AuthCallback from './components/AuthCallback'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  )
}

export default App 
