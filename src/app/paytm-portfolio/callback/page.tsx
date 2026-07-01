'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const requestToken = searchParams.get('request_token');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      return;
    }

    if (!requestToken) {
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
        if (data.access_token) {
          setAccessToken(data.access_token);
          setStatus('success');
        } else {
          throw new Error('No access token in response');
        }
      })
      .catch(err => {
        console.error('Token exchange error:', err);
        setStatus('error');
      });
  }, [searchParams]);

  const copyToClipboard = () => {
    if (accessToken) {
      navigator.clipboard.writeText(accessToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied!',
        description: 'Access token copied to clipboard',
      });
    }
  };

  const goBack = () => {
    router.push('/paytm-portfolio');
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Exchanging token...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Card className="border-destructive max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Authentication Failed</h3>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {searchParams.get('error') || 'No request token found in the redirect URL. Please try again.'}
          </p>
          <Button onClick={goBack} className="mt-4">
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/50 max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-6 w-6" />
          Authentication Successful!
        </CardTitle>
        <CardDescription>
          Your Paytm Money account has been connected
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <p className="text-sm font-medium">Add this to your .env file:</p>
          <div className="relative">
            <code className="block p-3 bg-background rounded border text-xs break-all font-mono">
              PAYTM_ACCESS_TOKEN={accessToken}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2"
              onClick={copyToClipboard}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={copyToClipboard} variant="outline" className="flex-1">
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            Copy Token
          </Button>
          <Button onClick={goBack} className="flex-1">
            Back to Portfolio
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          After adding the token to .env, restart your dev server and refresh the portfolio page.
        </p>
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
