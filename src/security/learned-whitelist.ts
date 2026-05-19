import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Whitelist entry: a structured command pattern
export interface WhitelistEntry {
  pattern: string;       // e.g. "rm -rf {node_modules}" or "rm\\s+-rf\\s+(node_modules|dist)"
  originalCommand: string; // e.g. "rm -rf node_modules"
  addedAt: string;        // ISO timestamp
  addedBy: 'allow-always' | 'admin';
  count: number;          // number of allow-always triggers that led to this entry
}

// Patterns that NEVER enter whitelist (absolute blocklist)
export const NEVER_WHITELIST_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\brm\s+-rf\s+\/\*/,
  /\bcurl\s+[^\|]+\s*\|\s*sh/,
  /\bwget\s+[^\|]+\s*\|\s*sh/,
  /\bkill\s+-9\s+-1/,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/,
  /fork\s*\(\s*\)\s*\{\s*fork\s*\(\s*\)\s*\|\s*fork\s*\(\s*\)\s*&\s*\}\s*;fork\s*\(\s*\)/,
  /pkill\s+(-9\s+)?gateway/,
  /openclaw\s+gateway\s+stop/,
];

const LOG_DIR = join(homedir(), '.openclaw', 'logs');
const WHITELIST_FILE = join(LOG_DIR, 'learned-whitelist.jsonl');

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {}
}

export async function loadWhitelist(): Promise<WhitelistEntry[]> {
  try {
    await ensureLogDir();
    const content = await fs.readFile(WHITELIST_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l) as WhitelistEntry);
  } catch {
    return [];
  }
}

export async function addToWhitelist(entry: Omit<WhitelistEntry, 'count'>): Promise<void> {
  await ensureLogDir();
  const newEntry: WhitelistEntry = { ...entry, count: 1 };
  const line = JSON.stringify(newEntry) + '\n';
  await fs.appendFile(WHITELIST_FILE, line, 'utf8');
}

export async function incrementWhitelistCount(pattern: string): Promise<void> {
  const entries = await loadWhitelist();
  const idx = entries.findIndex(e => e.pattern === pattern);
  if (idx >= 0) {
    entries[idx].count++;
    // Rewrite entire file (append-only JSONL, but count updates require rewrite)
    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(WHITELIST_FILE, content, 'utf8');
  }
}

// Extract a generalized pattern from a concrete command
// e.g. "rm -rf node_modules" → "rm -rf {safe_dir}"
export function generalizePattern(cmd: string, safeDirs: string[]): string {
  let pattern = cmd;
  for (const dir of safeDirs) {
    // Replace exact directory matches with placeholder
    const regex = new RegExp(`\\b${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    pattern = pattern.replace(regex, '{' + dir + '}');
  }
  return pattern;
}

// Check if a command matches any whitelist entry
export async function matchesWhitelist(cmd: string): Promise<WhitelistEntry | null> {
  const entries = await loadWhitelist();
  for (const entry of entries) {
    if (cmd.includes(entry.pattern)) {
      return entry;
    }
  }
  return null;
}

// Check if a command matches any NEVER_WHITELIST pattern
export function matchesNeverWhitelist(cmd: string): boolean {
  return NEVER_WHITELIST_PATTERNS.some(p => p.test(cmd));
}

// Check if a command is a candidate for whitelist (not in never list and not already whitelisted)
export async function canWhitelist(cmd: string, safeDirs: string[]): Promise<boolean> {
  if (matchesNeverWhitelist(cmd)) return false;
  const existing = await matchesWhitelist(generalizePattern(cmd, safeDirs));
  if (existing) return false;
  return true;
}

export { WHITELIST_FILE };