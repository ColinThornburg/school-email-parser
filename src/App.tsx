import { BrowserRouter as Router, Routes, Route} from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AuthCallback from './components/AuthCallback'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlassToastProvider } from './components/ui/glass-toast'
import { AuthProvider } from './contexts/AuthContext'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GlassToastProvider>
          <Router>
            <div className="min-h-screen">
              <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
              </Routes>
            </div>
          </Router>
        </GlassToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App 
