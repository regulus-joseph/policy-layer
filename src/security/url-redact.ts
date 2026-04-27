import { redactUrl } from './redact';

const SECRET_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'GITHUB_PAT',
  'SLACK_BOT_TOKEN',
  'SLACK_USER_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'NVIDIA_API_KEY',
  'DATABASE_URL',
  'DB_PASSWORD',
  'DB_SECRET',
  'REDIS_PASSWORD',
  'POSTGRES_PASSWORD',
  'MYSQL_PASSWORD',
  'SENDGRID_API_KEY',
  'MAILGUN_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'SECRET_KEY',
  'SECRET_TOKEN',
  'PRIVATE_KEY',
  'SSH_KEY',
  'BOTO_CONFIG',
  'AZURE_STORAGE_KEY',
  'AZURE_STORAGE_CONNECTION_STRING',
];

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const AUTH_HEADER_PATTERN = /Authorization[\s:]+Bearer\s+[A-Za-z0-9_-]{20,}/gi;
const EXPORT_ENV_PATTERN = new RegExp(
  '\\b(export\\s+)?(' + SECRET_ENV_VARS.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s*[=:]\\s*["\']?([^"\'\\s&]+)["\']?',
  'gi'
);
const ENV_REF_PATTERN = new RegExp(
  '\\$(' + SECRET_ENV_VARS.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'g'
);
const ENV_BRACE_REF_PATTERN = new RegExp(
  '\\$\\{(' + SECRET_ENV_VARS.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\}',
  'g'
);

export function redactUrlSecrets(text: string): string {
  let result = text;

  result = result.replace(AUTH_HEADER_PATTERN, (match) => {
    return match.replace(/(Bearer\s+)[A-Za-z0-9_-]{20,}/, '$1[REDACTED]');
  });

  result = result.replace(URL_PATTERN, (url) => {
    return redactUrl(url);
  });

  return result;
}

export function redactEnvironmentVariables(text: string): string {
  let result = text;

  result = result.replace(EXPORT_ENV_PATTERN, (match, _export, name, value) => {
    const prefix = _export ? 'export ' : '';
    return `${prefix}${name}=${value ? '[REDACTED]' : ''}`;
  });

  result = result.replace(ENV_REF_PATTERN, () => '[REDACTED]');
  result = result.replace(ENV_BRACE_REF_PATTERN, () => '[REDACTED]');

  return result;
}
