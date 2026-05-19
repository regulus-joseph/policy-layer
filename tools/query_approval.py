#!/usr/bin/env python3
"""
Simple approval history query tool for policy-layer.
Baseline prototype before potential LanceDB migration.

Usage:
    python3 tools/query_approval.py --query "curl | sh"
    python3 tools/query_approval.py --query "git reset" --result deny
    python3 tools/query_approval.py --pattern "npm install"
    python3 tools/query_approval.py --recent 5
"""
import json
import argparse
from pathlib import Path
from datetime import datetime

LOG_FILE = Path.home() / ".openclaw" / "logs" / "approval.jsonl"


def load_records():
    records = []
    if not LOG_FILE.exists():
        return records
    with open(LOG_FILE) as f:
        for line in f:
            try:
                records.append(json.loads(line.strip()))
            except:
                continue
    return records


def fuzzy_match(text: str, query: str, threshold: float = 0.3) -> float:
    """Simple fuzzy match returning score 0-1."""
    text = text.lower()
    query = query.lower()

    if query in text:
        return 1.0

    words = query.split()
    matched = sum(1 for w in words if w in text)
    return matched / len(words) if words else 0.0


def query_by_command(records, query_str, limit=10):
    results = []
    for r in records:
        cmd = r.get("rawCommand") or r.get("command", "")
        score = fuzzy_match(cmd, query_str)
        if score >= 0.3:
            results.append((r, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


def query_by_pattern(records, pattern_str, limit=10):
    results = []
    for r in records:
        patterns = r.get("patterns", [])
        for p in patterns:
            score = fuzzy_match(p, pattern_str)
            if score >= 0.3:
                results.append((r, score))
                break

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


def query_by_result(records, result, limit=20):
    return [r for r in records if r.get("result") == result][-limit:]


def print_result(r, score=None):
    ts = r.get("timestamp", "")[:19]
    result = r.get("result", "")
    raw = r.get("rawCommand")
    wrapped = r.get("command", "")[:60]
    cmd = (raw or wrapped)[:60]
    patterns = r.get("patterns", [])
    session = r.get("sessionId", "?")

    score_str = f"[{score:.2f}]" if score else "       "
    result_icon = {"deny": "🚫", "escalate": "⚠️", "approve": "✅", "fast_lane": "⚡", "allow-once": "🔵", "allow-always": "🟢"}.get(result, "❓")
    pattern_str = ", ".join(patterns[:3]) if patterns else "-"

    print(f"{score_str} {ts} {result_icon} {result:10s} | {cmd}")
    if raw and raw != wrapped:
        print(f"         (wrapped: {wrapped})")
    print(f"         patterns: {pattern_str}")
    print(f"         session: {session}")
    print()


def show_stats(records):
    total = len(records)
    by_result = {}
    by_pattern = {}

    for r in records:
        result = r.get("result", "unknown")
        by_result[result] = by_result.get(result, 0) + 1
        for p in r.get("patterns", []):
            by_pattern[p] = by_pattern.get(p, 0) + 1

    print(f"=== Approval History Stats ===")
    print(f"Total records: {total}\n")

    print("By result:")
    for result, count in sorted(by_result.items(), key=lambda x: x[1], reverse=True):
        pct = count / total * 100
        bar = "█" * int(pct / 5)
        print(f"  {result:12s}: {count:4d} ({pct:5.1f}%) {bar}")

    print(f"\nTop patterns (by frequency):")
    for pattern, count in sorted(by_pattern.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {count:3d}x {pattern}")


def export_for_llm(records, limit=20):
    """Export records in LLM-friendly format for learning."""
    print("=== Past Command Decisions (for reference) ===\n")
    recent = records[-limit:] if len(records) >= limit else records

    for r in recent:
        cmd = (r.get("rawCommand") or r.get("command", ""))[:60]
        result = r.get("result", "")
        patterns = r.get("patterns", [])
        pattern_str = ", ".join(patterns) if patterns else "none"
        ts = r.get("timestamp", "")[:10]

        print(f"- [{ts}] Command: {cmd}")
        print(f"  Result: {result} | Patterns: {pattern_str}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Query approval history")
    parser.add_argument("--query", help="Search by command text")
    parser.add_argument("--pattern", help="Search by pattern name")
    parser.add_argument("--result", choices=["deny", "escalate", "approve", "fast_lane", "allow-once", "allow-always"], help="Filter by result")
    parser.add_argument("--recent", type=int, help="Show N most recent records")
    parser.add_argument("--limit", type=int, default=10, help="Max results")
    parser.add_argument("--all", action="store_true", help="Show all records (no filter)")
    parser.add_argument("--stats", action="store_true", help="Show statistics")
    parser.add_argument("--export", action="store_true", help="Export recent records for LLM")

    args = parser.parse_args()

    records = load_records()
    if not records:
        print("No records found in approval.jsonl")
        return

    print(f"Total records: {len(records)}\n")

    if args.all:
        for r in records[-args.limit:]:
            print_result(r)
        return

    if args.result:
        results = query_by_result(records, args.result, args.limit)
        print(f"Results for result={args.result}:\n")
        for r in results:
            print_result(r)
        return

    if args.pattern:
        results = query_by_pattern(records, args.pattern, args.limit)
        print(f"Results for pattern='{args.pattern}':\n")
        for r, score in results:
            print_result(r, score)
        return

    if args.query:
        results = query_by_command(records, args.query, args.limit)
        print(f"Results for query='{args.query}':\n")
        for r, score in results:
            print_result(r, score)
        return

    if args.recent:
        print(f"Most recent {args.recent} records:\n")
        for r in records[-args.recent:]:
            print_result(r)
        return

    if args.stats:
        show_stats(records)
        return

    if args.export:
        export_for_llm(records, args.limit)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
