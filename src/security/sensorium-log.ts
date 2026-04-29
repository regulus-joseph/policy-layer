import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface DCycleSignalDetails {
  success: boolean;
  successRate: number | null;
  toolDetails: {
    total: number;
    failed: number;
    failedRate: number;
    failedNames: string[];
  };
  cbrDetails: {
    hit: boolean;
    hitRate: number | null;
    matchedCaseIds: string[];
  };
  severityDetails: {
    maxSeverity: number;
    avgSeverity: number;
    reason: string;
    level: string;
  };
}

export interface DCycleTrigger {
  gate: 'input' | 'tool' | 'output';
  operation?: string;
  patterns?: string[];
  normalizedCommand?: string;
}

export interface DCycleRecord {
  cycleId: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  cycleNumber: number;
  signals: DCycleSignalDetails;
  dPrime: number | null;
  dPrimeStatus: string;
  decision: 'ACCEPT' | 'ESCALATE' | 'REJECT';
  trigger: DCycleTrigger;
  windowSize: number;
}

const LOG_DIR = join(homedir(), '.openclaw', 'logs');
const LOG_FILE = join(LOG_DIR, 'dcycles.jsonl');

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch { /* already exists */ }
}

export class DCycleStore {
  private records: DCycleRecord[] = [];
  private cycleCounters = new Map<string, number>();
  private loaded = false;

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const content = await fs.readFile(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      this.records = lines
        .map((l: string) => {
          try { return JSON.parse(l) as DCycleRecord; }
          catch { return null; }
        })
        .filter(Boolean) as DCycleRecord[];
      for (const r of this.records) {
        const key = r.sessionId;
        const current = this.cycleCounters.get(key) ?? 0;
        if (r.cycleNumber > current) this.cycleCounters.set(key, r.cycleNumber);
      }
    } catch { /* no log yet */ }
    this.loaded = true;
  }

  private nextCycleNumber(sessionId: string): number {
    const current = this.cycleCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.cycleCounters.set(sessionId, next);
    return next;
  }

  async log(record: Omit<DCycleRecord, 'cycleId' | 'timestamp' | 'cycleNumber'>): Promise<DCycleRecord> {
    await this.ensureLoaded();
    const cycleNumber = this.nextCycleNumber(record.sessionId);
    const full: DCycleRecord = {
      ...record,
      cycleId: `${record.sessionId}:${cycleNumber}`,
      timestamp: new Date().toISOString(),
      cycleNumber,
    };
    this.records.push(full);
    try {
      await ensureLogDir();
      await fs.appendFile(LOG_FILE, JSON.stringify(full) + '\n', 'utf8');
    } catch { /* non-fatal */ }
    return full;
  }

  async forSession(sessionId: string, limit = 50): Promise<DCycleRecord[]> {
    await this.ensureLoaded();
    return this.records
      .filter((r) => r.sessionId === sessionId)
      .slice(-limit);
  }

  async recent(limit = 20): Promise<DCycleRecord[]> {
    await this.ensureLoaded();
    return this.records.slice(-limit);
  }

  async stats(sessionId: string): Promise<{
    total: number;
    byDecision: Record<string, number>;
    avgDPrime: number | null;
    last10: DCycleRecord[];
  }> {
    await this.ensureLoaded();
    const session = this.records.filter((r) => r.sessionId === sessionId);
    const byDecision: Record<string, number> = {};
    let sumD = 0, countD = 0;
    for (const r of session) {
      byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
      if (r.dPrime !== null) { sumD += r.dPrime; countD++; }
    }
    return {
      total: session.length,
      byDecision,
      avgDPrime: countD > 0 ? sumD / countD : null,
      last10: session.slice(-10),
    };
  }
}

export const dCycleStore = new DCycleStore();
