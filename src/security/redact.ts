import { SECRET_PATTERNS, SecretPattern } from './secret-patterns';

export interface RedactResult {
  redacted: string;
  found: string[];
}

export function redactSecrets(text: string): RedactResult {
  let result = text;
  const foundSet = new Set<string>();
  const markerPattern = /\[REDACTED\]/g;

  for (const { re, label } of SECRET_PATTERNS) {
    const clonedRe = new RegExp(re.source, re.flags);
    result = result.replace(clonedRe, (match) => {
      foundSet.add(label);
      return `[${label} REDACTED]`;
    });
  }

  const found = Array.from(foundSet);
  return { redacted: result, found };
}

export function redactUrl(url: string): string {
  let result = url.replace(/^((https?|ftp):\/\/)?([^\s@:]+:[^\s@]+@)?/i, (match, scheme, protocol, auth) => {
    if (auth) return (scheme || '') + '://';
    return match;
  });

  const secretParams = [
    'signature',
    'token',
    'auth',
    'access_token',
    'access-token',
    'key',
    'api_key',
    'apikey',
    'api-key',
    'secret',
    'password',
    'pwd',
    'auth_token',
    'auth-token',
    'bearer_token',
    'bearer-token',
    'private_key',
    'private-key',
    'secret_key',
    'secret-key',
  ];

  const secretParamPattern = new RegExp(
    '(&|\\?)(' + secretParams.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')=[^&]*',
    'gi'
  );

  result = result.replace(secretParamPattern, '');

  result = result.replace(/[?&]$/, '');

  return result;
}
