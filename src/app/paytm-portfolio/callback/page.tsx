'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const requestToken = searchParams.get('request_token');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setErrorMessage(errorDescription || error);
      setStatus('error');
      return;
    }

    if (!requestToken) {
      setErrorMessage('No request_token found in the redirect URL');
      setStatus('error');
      return;
    }

    // Exchange the request token for access token
    fetch(`/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.success || data.hasAccessToken) {
          setStatus('success');
          toast({
            title: 'Success!',
            description: 'Your Paytm Money account has been connected',
          });
        } else {
          throw new Error('Unexpected response from server');
        }
      })
      .catch(err => {
        console.error('Token exchange error:', err);
        setErrorMessage(err.message || 'Failed to exchange token');
        setStatus('error');
      });
  }, [searchParams, toast]);

  const goBack = () => {
    router.push('/paytm-portfolio');
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Connecting your account...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Card className="border-destructive max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Authentication Failed</h3>
          <p className="text-sm text-muted-foreground text-center mt-2 max-w-sm">
            {errorMessage || 'An error occurred during authentication'}
          </p>
          <Button onClick={goBack} className="mt-4">
            Go Back to Portfolio
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/50 max-w-md mx-auto">
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
          Your access token has been securely stored in the database.
          You can now view your portfolio.
        </p>
        <Button onClick={goBack} className="w-full">
          View My Portfolio
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PaytmCallbackPage() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
