export interface SecretPattern {
  re: RegExp;
  label: string;
  category: 'api_key' | 'token' | 'credential' | 'private_key' | 'password' | 'jwt' | 'generic';
}

const SECRET_MARKER = '[REDACTED]';
const ESCAPED_MARKER = '\\[REDACTED\\]';

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    re: /\bghp_[a-zA-Z0-9]{36}\b/g,
    label: 'GitHub Personal Access Token',
    category: 'token',
  },
  {
    re: /\bgithub_pat_[a-zA-Z0-9_]{22,}/g,
    label: 'GitHub Fine-Grained PAT',
    category: 'token',
  },
  {
    re: /\bgho_[a-zA-Z0-9]{36}\b/g,
    label: 'GitHub OAuth Access Token',
    category: 'token',
  },
  {
    re: /\bghu_[a-zA-Z0-9]{36}\b/g,
    label: 'GitHub User-to-Server Token',
    category: 'token',
  },
  {
    re: /\bghs_[a-zA-Z0-9]{36}\b/g,
    label: 'GitHub Server-to-Server Token',
    category: 'token',
  },
  {
    re: /\bghr_[a-zA-Z0-9]{36}\b/g,
    label: 'GitHub Refresh Token',
    category: 'token',
  },
  {
    re: /\bsk-ant-[a-zA-Z0-9_-]{20,}/g,
    label: 'Anthropic API Key',
    category: 'api_key',
  },
  {
    re: /\bsk-[a-zA-Z0-9_-]{20,}/g,
    label: 'OpenAI API Key',
    category: 'api_key',
  },
  {
    re: /\bAKIA[A-Z0-9]{16}\b/g,
    label: 'AWS Access Key ID',
    category: 'api_key',
  },
  {
    re: /\bxox[bpaors]-[a-zA-Z0-9-]{10,}/g,
    label: 'Slack Token',
    category: 'token',
  },
  {
    re: /\bBearer\s+[A-Za-z0-9_-]{20,}\b/g,
    label: 'Bearer Token',
    category: 'token',
  },
  {
    re: /\bnvapi-[a-zA-Z0-9_-]{20,}/g,
    label: 'NVIDIA API Key',
    category: 'api_key',
  },
  {
    re: /\bnvcf-[a-zA-Z0-9_-]{20,}/g,
    label: 'NVIDIA Cloud Function Key',
    category: 'api_key',
  },
  {
    re: /\bapi[_-]?key[=][A-Za-z0-9_-]{10,}/gi,
    label: 'Generic API Key',
    category: 'api_key',
  },
  {
    re: /\bkey[=][A-Za-z0-9_-]{20,}/g,
    label: 'Generic Secret Key',
    category: 'generic',
  },
  {
    re: /\bpassword=[^&\s]+/gi,
    label: 'Password in URL',
    category: 'password',
  },
  {
    re: /\baws_secret_access_key[=\s]+[A-Za-z0-9/+=]{20,}/gi,
    label: 'AWS Secret Access Key',
    category: 'credential',
  },
  {
    re: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/gi,
    label: 'Private Key',
    category: 'private_key',
  },
  {
    re: /-----BEGIN\s+CERTIFICATE-----/gi,
    label: 'Certificate',
    category: 'private_key',
  },
  {
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    label: 'JWT Token',
    category: 'jwt',
  },
  {
    re: /\bsk_live_[a-zA-Z0-9]{20,}/g,
    label: 'Stripe Live Secret Key',
    category: 'api_key',
  },
  {
    re: /\bsk_test_[a-zA-Z0-9]{20,}/g,
    label: 'Stripe Test Secret Key',
    category: 'api_key',
  },
  {
    re: /\bpk_live_[a-zA-Z0-9]{20,}/g,
    label: 'Stripe Live Publishable Key',
    category: 'api_key',
  },
  {
    re: /\bpk_test_[a-zA-Z0-9]{20,}/g,
    label: 'Stripe Test Publishable Key',
    category: 'api_key',
  },
  {
    re: /(\b(?:mysql|postgres(?:ql)?|mongodb|postgresql|redis|mssql|oracle):\/\/)[^:]+:[^@]+@/gi,
    label: 'Database Connection URL with Credentials',
    category: 'credential',
  },
  {
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    label: 'Google API Key',
    category: 'api_key',
  },
  {
    re: /\bya29\.[0-9A-Za-z_-]+/g,
    label: 'Google OAuth Access Token',
    category: 'token',
  },
  {
    re: /\bsk_live_[a-zA-Z0-9]{24,}/g,
    label: 'Twilio API Key',
    category: 'api_key',
  },
  {
    re: /\bPGP[_-]?SECRET[_-]?KEY[_-]?[A-Za-z0-9_-]{10,}/gi,
    label: 'PGP Secret Key',
    category: 'private_key',
  },
  {
    re: /\b(secret|pwd|passwd|pass)[=:\s][^\s&]{8,}/gi,
    label: 'Generic Password Pattern',
    category: 'password',
  },
  {
    re: /\btoken[=][A-Za-z0-9_-]{16,}/gi,
    label: 'Generic Token',
    category: 'token',
  },
  {
    re: /\baccess[_-]?token[=][A-Za-z0-9_-]{16,}/gi,
    label: 'Access Token',
    category: 'token',
  },
  {
    re: /\bauth[_-]?token[=][A-Za-z0-9_-]{16,}/gi,
    label: 'Auth Token',
    category: 'token',
  },
  {
    re: /\b[a-zA-Z0-9_-]{40,50}\b(?=.*[A-Za-z])/g,
    label: 'Long Hex/String Secret',
    category: 'generic',
  },
  {
    re: /\b(goog|google|gcp)_[a-zA-Z0-9_-]{20,}/gi,
    label: 'Google Cloud Credential',
    category: 'credential',
  },
  {
    re: /\b[xX][0-9a-fA-F]{32,}\b/g,
    label: 'Long Hex String',
    category: 'generic',
  },
  {
    re: /\b[a-f0-9]{32,}(?![a-f0-9])\b/gi,
    label: 'Hash-like Secret',
    category: 'generic',
  },
  {
    re: /\bsendgrid[_-]?api[_-]?key[=][A-Za-z0-9._-]{10,}/gi,
    label: 'SendGrid API Key',
    category: 'api_key',
  },
  {
    re: /\bmailgun[_-]?api[_-]?key[=][A-Za-z0-9_-]{10,}/gi,
    label: 'Mailgun API Key',
    category: 'api_key',
  },
];

export { SECRET_MARKER, ESCAPED_MARKER };
