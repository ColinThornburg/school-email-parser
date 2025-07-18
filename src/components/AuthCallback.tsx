import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGmailService } from '../lib/gmail';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get authorization code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(`Authorization failed: ${error}`);
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        setMessage('Exchanging code for tokens...');

        // Exchange code for tokens
        const gmailService = createGmailService();
        const tokens = await gmailService.exchangeCodeForTokens(code);

        setMessage('Getting user information...');

        // Get user email
        const userEmail = await gmailService.getUserEmail(tokens.accessToken);

        setMessage('Saving authentication data...');

        // Save tokens to Supabase
        // For now, we'll use a temporary user ID until we implement proper Supabase auth
        const tempUserId = 'temp-user-' + Date.now();
        
        // Create or update user in our database
        const { error: insertError } = await supabase
          .from('users')
          .upsert({
            id: tempUserId,
            email: userEmail,
            gmail_token: tokens.accessToken,
            gmail_refresh_token: tokens.refreshToken,
            last_sync_at: new Date().toISOString()
          });

        if (insertError) {
          throw new Error(`Database error: ${insertError.message}`);
        }

        // Store user info in localStorage for now
        localStorage.setItem('user', JSON.stringify({
          id: tempUserId,
          email: userEmail,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }));

        setStatus('success');
        setMessage('Authentication successful! Redirecting...');

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);

      } catch (error) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Authentication failed');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          {status === 'processing' && (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          )}
          
          {status === 'success' && (
            <div className="text-green-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          
          {status === 'error' && (
            <div className="text-red-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
          
          <h2 className="text-xl font-semibold mb-2">
            {status === 'processing' && 'Authenticating...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Error'}
          </h2>
          
          <p className="text-gray-600 mb-4">{message}</p>
          
          {status === 'error' && (
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 