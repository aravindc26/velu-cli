'use client';

import { useMemo, useState } from 'react';

type PlaygroundDisplayMode = 'interactive' | 'simple' | 'none';
type AuthMethod = 'bearer' | 'basic' | 'key' | 'none';

interface VeluManualApiPlaygroundProps {
  method: string;
  url: string;
  display?: PlaygroundDisplayMode;
  authMethod?: AuthMethod;
  authName?: string;
  className?: string;
}

interface RequestResult {
  status: number;
  statusText: string;
  body: string;
}

export function VeluManualApiPlayground({
  method,
  url,
  display = 'interactive',
  authMethod = 'none',
  authName = 'x-api-key',
  className,
}: VeluManualApiPlaygroundProps) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);

  const [bearerToken, setBearerToken] = useState('');
  const [basicUser, setBasicUser] = useState('');
  const [basicPass, setBasicPass] = useState('');
  const [apiKey, setApiKey] = useState('');

  const headers = useMemo(() => {
    const nextHeaders = new Headers();

    if (authMethod === 'bearer' && bearerToken) {
      nextHeaders.set('Authorization', `Bearer ${bearerToken}`);
    }

    if (authMethod === 'basic' && (basicUser || basicPass)) {
      const encoded = window.btoa(`${basicUser}:${basicPass}`);
      nextHeaders.set('Authorization', `Basic ${encoded}`);
    }

    if (authMethod === 'key' && apiKey) {
      nextHeaders.set(authName || 'x-api-key', apiKey);
    }

    return nextHeaders;
  }, [apiKey, authMethod, authName, basicPass, basicUser, bearerToken]);

  async function sendRequest() {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(url, {
        method: normalizedMethod,
        headers,
      });

      const text = await response.text();
      let formatted = text;
      try {
        const parsed = JSON.parse(text);
        formatted = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep raw body text when response is not JSON.
      }

      setResult({
        status: response.status,
        statusText: response.statusText,
        body: formatted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  if (display === 'none') return null;

  if (display === 'simple') {
    return (
      <section className={['velu-manual-api', 'velu-manual-api-simple', className].filter(Boolean).join(' ')}>
        <code>{normalizedMethod} {url}</code>
      </section>
    );
  }

  return (
    <section className={['velu-manual-api', className].filter(Boolean).join(' ')}>
      <div className="velu-manual-api-head">
        <span className="velu-manual-api-method">{normalizedMethod}</span>
        <code className="velu-manual-api-url">{url}</code>
        <button type="button" className="velu-manual-api-send" onClick={sendRequest} disabled={isLoading}>
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </div>

      {authMethod === 'bearer' ? (
        <label className="velu-manual-api-auth">
          <span>Bearer token</span>
          <input type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} placeholder="Enter token" />
        </label>
      ) : null}

      {authMethod === 'basic' ? (
        <div className="velu-manual-api-auth-grid">
          <label className="velu-manual-api-auth">
            <span>Username</span>
            <input type="text" value={basicUser} onChange={(event) => setBasicUser(event.target.value)} placeholder="Username" />
          </label>
          <label className="velu-manual-api-auth">
            <span>Password</span>
            <input type="password" value={basicPass} onChange={(event) => setBasicPass(event.target.value)} placeholder="Password" />
          </label>
        </div>
      ) : null}

      {authMethod === 'key' ? (
        <label className="velu-manual-api-auth">
          <span>{authName || 'x-api-key'}</span>
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Enter API key" />
        </label>
      ) : null}

      {error ? <p className="velu-manual-api-error">{error}</p> : null}

      {result ? (
        <div className="velu-manual-api-result">
          <div className="velu-manual-api-status">
            {result.status} {result.statusText}
          </div>
          <pre>
            <code>{result.body || '(empty response)'}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}
