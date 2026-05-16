import { normalizeCommand } from './normalize';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface PatternMatch {
  pattern: RegExp;
  label: string;
  severity: 'critical' | 'high' | 'medium';
}

export const DANGEROUS_PATTERNS: PatternMatch[] = [
  {
    pattern: /\brm\s+-rf\s+\//,
    label: 'Force recursive delete from root',
    severity: 'critical',
  },
  {
    pattern: /\brm\s+-rf\s+\/\*/,
    label: 'Force recursive delete of all top-level dirs',
    severity: 'critical',
  },
  {
    pattern: /\brm\s+-rf\s+--no-preserve-root\s+\//,
    label: 'Force recursive delete from root (explicit flag)',
    severity: 'critical',
  },
  {
    pattern: /curl\s+[^\|]+\s*\|\s*sh/,
    label: 'curl pipe to shell',
    severity: 'high',
  },
  {
    pattern: /wget\s+[^\|]+\s*\|\s*sh/,
    label: 'wget pipe to shell',
    severity: 'high',
  },
  {
    pattern: /curl\s+[^\|&&]+\s*&&\s*sh/,
    label: 'curl download and execute shell',
    severity: 'high',
  },
  {
    pattern: /wget\s+[^\|&&]+\s*&&\s*sh/,
    label: 'wget download and execute shell',
    severity: 'high',
  },
  {
    pattern: /kill\s+-9\s+-1/,
    label: 'kill all processes',
    severity: 'critical',
  },
  {
    pattern: /kill\s+-TERM\s+-1/,
    label: 'terminate all processes',
    severity: 'high',
  },
  {
    pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/,
    label: 'fork bomb variant 1',
    severity: 'critical',
  },
  {
    pattern: /fork\s*\(\s*\)\s*\{\s*fork\s*\(\s*\)\s*\|\s*fork\s*\(\s*\)\s*&\s*\}\s*;fork\s*\(\s*\)/,
    label: 'fork bomb variant 2',
    severity: 'critical',
  },
  {
    pattern: /git\s+reset\s+--hard/,
    label: 'git hard reset',
    severity: 'high',
  },
  {
    pattern: /git\s+reset\s+--hard\s+HEAD/,
    label: 'git hard reset to HEAD',
    severity: 'high',
  },
  {
    pattern: /chmod\s+777\s+[\/~]*(etc|home|root|var|tmp|ssh)/,
    label: 'chmod 777 on system directory',
    severity: 'high',
  },
  {
    pattern: /chmod\s+777\s+\//,
    label: 'chmod 777 on root',
    severity: 'critical',
  },
  {
    pattern: /chmod\s+777\s+\/\./,
    label: 'chmod 777 on root subdirectory',
    severity: 'critical',
  },
  {
    pattern: /chmod\s+[+]x.+\s*\|\s*(bash|sh|zsh|python|ruby|perl|node)/,
    label: 'chmod +x piped to interpreter',
    severity: 'high',
  },
  {
    pattern: /DROP\s+(TABLE|DATABASE|COLUMN|INDEX|VIEW|PROCEDURE|FUNCTION)\s+/i,
    label: 'SQL DROP statement',
    severity: 'high',
  },
  {
    pattern: /pkill\s+(-9\s+)?gateway/,
    label: 'kill gateway process',
    severity: 'critical',
  },
  {
    pattern: /killall\s+gateway/,
    label: 'killall gateway process',
    severity: 'critical',
  },
  {
    pattern: /openclaw\s+gateway\s+stop/,
    label: 'openclaw gateway stop',
    severity: 'critical',
  },
  {
    pattern: /\/dev\/tcp\//,
    label: '/dev/tcp network manipulation',
    severity: 'high',
  },
  {
    pattern: /\/dev\/null.+\>/,
    label: '/dev/null redirect for output suppression',
    severity: 'medium',
  },
];

export function detectDangerousPatterns(cmd: string): PatternMatch[] {
  const normalized = normalizeCommand(cmd);
  const matches: PatternMatch[] = [];

  for (const { pattern, label, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      matches.push({ pattern, label, severity });
    }
  }

  for (const { pattern, label, severity } of USER_BLACKLIST_PATTERNS) {
    if (pattern.test(normalized)) {
      matches.push({ pattern, label, severity });
    }
  }

  return matches;
}

export const USER_BLACKLIST_PATTERNS: PatternMatch[] = [];
const BLACKLIST_FILE = join(homedir(), '.openclaw', 'logs', 'blacklist.jsonl');

export async function addToBlacklist(patternStr: string): Promise<void> {
  try {
    USER_BLACKLIST_PATTERNS.push({
      pattern: new RegExp(patternStr, 'i'),
      label: `user-blacklist: ${patternStr}`,
      severity: 'critical',
    });
    const entry = JSON.stringify({ pattern: patternStr, addedAt: new Date().toISOString() }) + '\n';
    await fs.appendFile(BLACKLIST_FILE, entry, 'utf8');
  } catch {
  }
}

export async function loadBlacklist(): Promise<void> {
  try {
    const content = await fs.readFile(BLACKLIST_FILE, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const { pattern } = JSON.parse(line);
        if (pattern) {
          USER_BLACKLIST_PATTERNS.push({
            pattern: new RegExp(pattern, 'i'),
            label: `user-blacklist: ${pattern}`,
            severity: 'critical',
          });
        }
      } catch {
      }
    }
  } catch {
  }
}
