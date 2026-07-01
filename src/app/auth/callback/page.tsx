'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    // Handle both camelCase (requestToken) and underscore (request_token) formats
    const requestToken = searchParams.get('requestToken') || searchParams.get('request_token');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description') || searchParams.get('message');

    console.log('Auth callback received:', { success, requestToken, state, error });

    if (error) {
      setErrorMessage(errorDescription || error);
      setStatus('error');
      return;
    }

    if (success === 'true' && requestToken) {
      // Exchange the request token for access token
      fetch(`/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`)
        .then(res => res.json())
        .then(data => {
          console.log('Exchange token response:', data);
          if (data.error) {
            throw new Error(data.error);
          }
          if (data.success || data.hasAccessToken) {
            setStatus('success');
            toast({
              title: 'Success!',
              description: 'Your Paytm Money account has been connected',
            });
            // Redirect to portfolio after 2 seconds
            setTimeout(() => {
              router.push('/paytm-portfolio');
            }, 2000);
          } else {
            throw new Error('Unexpected response from server');
          }
        })
        .catch(err => {
          console.error('Token exchange error:', err);
          setErrorMessage(err.message || 'Failed to exchange token');
          setStatus('error');
        });
    } else if (!requestToken) {
      setErrorMessage('No requestToken found in the callback URL');
      setStatus('error');
    } else {
      setErrorMessage('Authentication was not successful');
      setStatus('error');
    }
  }, [searchParams, router, toast]);

  const goToPortfolio = () => {
    router.push('/paytm-portfolio');
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Connecting your Paytm Money account...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Card className="border-destructive max-w-md mx-auto mt-12">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Authentication Failed</h3>
          <p className="text-sm text-muted-foreground text-center mt-2 max-w-sm">
            {errorMessage || 'An error occurred during authentication'}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => router.push('/paytm-portfolio')}>
              Back to Portfolio
            </Button>
            <Button onClick={() => router.push('/paytm-portfolio')}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/50 max-w-md mx-auto mt-12">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-6 w-6" />
          Account Connected!
        </CardTitle>
        <CardDescription>
          Your Paytm Money account has been successfully linked
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your access token has been securely stored. Redirecting to your portfolio...
        </p>
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Redirecting...</span>
        </div>
        <Button onClick={goToPortfolio} className="w-full">
          View My Portfolio Now
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
