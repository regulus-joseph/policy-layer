import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface ApprovalRecord {
  timestamp: string;
  command: string;
  result: 'approve' | 'deny' | 'escalate' | 'fast_lane';
  patterns: string[];
  reason?: string;
  tool?: string;
  userId?: string;
  sessionId?: string;
  latencyMs?: number;
}

const LOG_DIR = join(homedir(), '.openclaw', 'logs');
const LOG_FILE = join(LOG_DIR, 'approval.jsonl');

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {
  }
}

export async function logApproval(record: ApprovalRecord): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(LOG_FILE, line, 'utf8');
  } catch {
  }
}

export async function lookupHistory(
  command: string,
  limit = 10
): Promise<ApprovalRecord[]> {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter((l: string) => l.trim());
    const normalized = command.toLowerCase();

    const matches: ApprovalRecord[] = [];

    for (let i = lines.length - 1; i >= 0 && matches.length < limit; i--) {
      try {
        const record = JSON.parse(lines[i]) as ApprovalRecord;
        if (record.command.toLowerCase().includes(normalized)) {
          matches.push(record);
        }
      } catch {
        continue;
      }
    }

    return matches;
  } catch {
    return [];
  }
}
