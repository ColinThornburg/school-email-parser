import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setMessage('Completing authentication...');

        console.log('AuthCallback - Initial URL state:', {
          fullUrl: window.location.href,
          hash: window.location.hash,
          search: window.location.search,
          pathname: window.location.pathname
        });

        // Check if we have hash params (Supabase OAuth callback uses hash fragments)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hasHashParams = hashParams.has('access_token') || hashParams.has('error');

        console.log('Hash params check:', {
          hasHashParams,
          hasAccessToken: hashParams.has('access_token'),
          hasError: hashParams.has('error'),
          errorDescription: hashParams.get('error_description')
        });

        // If there's an error in the hash, throw it
        if (hashParams.has('error')) {
          const error = hashParams.get('error');
          const errorDescription = hashParams.get('error_description');
          throw new Error(`OAuth error: ${error} - ${errorDescription}`);
        }

        // Supabase should automatically pick up the hash params and create a session
        // Let's wait a bit for it to process
        setMessage('Establishing session...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Attempting to get session...');
        const { data: { session }, error } = await supabase.auth.getSession();

        console.log('Session result:', {
          hasSession: !!session,
          hasError: !!error,
          error: error,
          sessionKeys: session ? Object.keys(session) : []
        });

        if (error) {
          console.error('Session error:', error);
          throw error;
        }

        if (!session) {
          // Try one more time with exchangeCodeForSession if we have a code
          const code = hashParams.get('code');
          if (code) {
            console.log('Attempting to exchange code for session...');
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('Code exchange error:', exchangeError);
              throw exchangeError;
            }
            if (data.session) {
              console.log('Session obtained via code exchange');
              // Continue with this session
            }
          } else {
            console.error('No session and no code to exchange');
            throw new Error('No session established after OAuth callback');
          }
        }

        const finalSession = await supabase.auth.getSession();
        if (!finalSession.data.session) {
          throw new Error('Still no session after all attempts');
        }

        console.log('Final session established:', {
          userId: finalSession.data.session.user.id,
          hasProviderToken: !!finalSession.data.session.provider_token,
          hasProviderRefreshToken: !!finalSession.data.session.provider_refresh_token
        });

        setMessage('Getting Gmail access token...');

        // Get the provider token (Gmail access token) from Supabase
        const providerToken = finalSession.data.session.provider_token;
        const providerRefreshToken = finalSession.data.session.provider_refresh_token;

        if (!providerToken) {
          throw new Error('No Gmail access token received');
        }

        setMessage('Saving Gmail credentials...');

        // Get the user record from our users table (created by trigger)
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', finalSession.data.session.user.id)
          .single();

        if (userError) {
          console.error('Error fetching user:', userError);
          throw new Error('Failed to get user record');
        }

        // Update user record with Gmail tokens
        const { error: updateError } = await supabase
          .from('users')
          .update({
            gmail_token: providerToken,
            gmail_refresh_token: providerRefreshToken,
            last_sync_at: new Date().toISOString()
          })
          .eq('id', userData.id);

        if (updateError) {
          console.error('Error updating tokens:', updateError);
          throw new Error('Failed to save Gmail credentials');
        }

        setStatus('success');
        setMessage('Authentication successful! Redirecting...');

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1500);

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
