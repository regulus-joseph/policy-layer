import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Whitelist entry: a structured command pattern
export interface WhitelistEntry {
  pattern: string;       // e.g. "rm -rf {node_modules}" or "rm\\s+-rf\\s+(node_modules|dist)"
  originalCommand: string; // e.g. "rm -rf node_modules"
  addedAt: string;        // ISO timestamp
  addedBy: 'allow-always' | 'admin';
  count: number;          // number of allow-always triggers — must reach ACTIVATION_THRESHOLD to activate
  active: boolean;        // true only when count >= ACTIVATION_THRESHOLD
}

export const ACTIVATION_THRESHOLD = 3;

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
const WHITELIST_AUDIT_FILE = join(LOG_DIR, 'whitelist-audit.jsonl');

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {}
}

// Load all whitelist entries (active and inactive)
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

// Only returns active entries (count >= ACTIVATION_THRESHOLD)
export async function matchesWhitelist(cmd: string): Promise<WhitelistEntry | null> {
  const entries = await loadWhitelist();
  for (const entry of entries) {
    if (entry.active && cmd.includes(entry.pattern)) {
      return entry;
    }
  }
  return null;
}

// Add a new whitelist entry or increment count on existing one
export async function addToWhitelist(entry: Omit<WhitelistEntry, 'count' | 'active'>): Promise<WhitelistEntry> {
  await ensureLogDir();

  const entries = await loadWhitelist();
  const existing = entries.find(e => e.pattern === entry.pattern);

  let finalEntry: WhitelistEntry;

  if (existing) {
    existing.count++;
    existing.originalCommand = entry.originalCommand; // update to most recent
    existing.active = existing.count >= ACTIVATION_THRESHOLD;
    finalEntry = existing;
    // Rewrite entire file
    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(WHITELIST_FILE, content, 'utf8');
  } else {
    finalEntry = { ...entry, count: 1, active: false };
    const line = JSON.stringify(finalEntry) + '\n';
    await fs.appendFile(WHITELIST_FILE, line, 'utf8');
  }

  await logWhitelistAudit({
    action: existing ? 'increment' : 'add',
    pattern: entry.pattern,
    originalCommand: entry.originalCommand,
    count: finalEntry.count,
    active: finalEntry.active,
    addedBy: entry.addedBy,
  });

  return finalEntry;
}

export async function removeFromWhitelist(pattern: string): Promise<void> {
  const entries = await loadWhitelist();
  const filtered = entries.filter(e => e.pattern !== pattern);
  const content = filtered.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(WHITELIST_FILE, content, 'utf8');

  await logWhitelistAudit({
    action: 'remove',
    pattern,
    count: 0,
    active: false,
    addedBy: 'admin',
  });
}

interface WhitelistAuditRecord {
  action: 'add' | 'increment' | 'remove' | 'activate';
  pattern: string;
  originalCommand: string;
  count: number;
  active: boolean;
  addedBy: 'allow-always' | 'admin';
  timestamp?: string;
}

async function logWhitelistAudit(record: WhitelistAuditRecord): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify({ ...record, timestamp: new Date().toISOString() }) + '\n';
    await fs.appendFile(WHITELIST_AUDIT_FILE, line, 'utf8');
  } catch {}
}

// Extract a generalized pattern from a concrete command
// e.g. "rm -rf node_modules" → "rm -rf {node_modules}"
export function generalizePattern(cmd: string, safeDirs: string[]): string {
  let pattern = cmd;
  for (const dir of safeDirs) {
    const regex = new RegExp(`\\b${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    pattern = pattern.replace(regex, `{${dir}}`);
  }
  return pattern;
}

// Check if a command matches any NEVER_WHITELIST pattern
export function matchesNeverWhitelist(cmd: string): boolean {
  return NEVER_WHITELIST_PATTERNS.some(p => p.test(cmd));
}

// Check if a command is a candidate for whitelist (not in never list and not already active)
export async function canWhitelist(cmd: string, safeDirs: string[]): Promise<boolean> {
  if (matchesNeverWhitelist(cmd)) return false;
  const generalized = generalizePattern(cmd, safeDirs);
  const existing = await loadWhitelist();
  // Already active (count >= 3) — don't re-add
  if (existing.some(e => e.pattern === generalized && e.active)) return false;
  return true;
}

export { WHITELIST_FILE, WHITELIST_AUDIT_FILE };