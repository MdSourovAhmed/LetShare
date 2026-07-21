#!/usr/bin/env python3
"""
analyze_transfers.py — turns the two JSONL transfer logs into a performance
report you can pull numbers from for a portfolio/CV writeup.

This is a standalone tool, separate from the app and from Grafana. Grafana's
dashboards are deliberately kept one-per-app (see grafana/dashboards/) so the
running product never mixes LAN and Internet data. This script is the one
place LAN and Internet numbers are intentionally put side by side — that's
the whole point of it: turning two isolated logs into one comparison.

Usage:
    python3 analysis/analyze_transfers.py
    python3 analysis/analyze_transfers.py --lan path/to/lan.jsonl --internet path/to/internet.jsonl
    python3 analysis/analyze_transfers.py --out analysis/report.md

No dependencies beyond the Python 3 standard library.
"""
import argparse
import json
import os
import statistics
from pathlib import Path

DEFAULT_LAN      = "apps/lan/backend/logs/lan-transfers.jsonl"
DEFAULT_INTERNET = "apps/internet/backend/logs/internet-transfers.jsonl"

KB, MB, GB = 1024, 1024**2, 1024**3

# (lower bound inclusive, upper bound exclusive, label) — log-scale, since
# connection overhead dominates at the small end and steady-state throughput
# dominates at the large end; linear buckets would bury the interesting part.
SIZE_BUCKETS = [
    (0,      1 * MB,   "<1MB"),
    (1 * MB, 10 * MB,  "1-10MB"),
    (10 * MB, 50 * MB, "10-50MB"),
    (50 * MB, 200 * MB, "50-200MB"),
    (200 * MB, 1 * GB, "200MB-1GB"),
    (1 * GB, float("inf"), ">1GB"),
]


def bucket_by_size(records):
    """Group 'done' records into SIZE_BUCKETS by totalBytes.
    Returns {label: [records]}, in SIZE_BUCKETS order. Records with no
    totalBytes, or a non-'done' outcome, are skipped — this is about
    throughput scaling, not reliability, so failed transfers don't belong
    here (they're already covered by the success-rate panel/table)."""
    buckets = {label: [] for *_, label in SIZE_BUCKETS}
    for r in records:
        if r.get("outcome") != "done":
            continue
        tb = r.get("totalBytes")
        if tb is None:
            continue
        for lo, hi, label in SIZE_BUCKETS:
            if lo <= tb < hi:
                buckets[label].append(r)
                break
    return buckets


def load_records(path):
    path = Path(path)
    if not path.exists():
        return []
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue   # skip a corrupted line rather than crash the whole report
    return records


def fmt_bytes(n):
    if n is None:
        return "n/a"
    for unit in ["B", "KB", "MB", "GB"]:
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def fmt_speed(bps):
    if bps is None:
        return "n/a"
    return fmt_bytes(bps) + "/s"


def fmt_ms(ms):
    if ms is None:
        return "n/a"
    return f"{ms:,.0f} ms" if ms >= 1000 else f"{ms:.0f} ms"


def percentile(values, p):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f, c = int(k), min(int(k) + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def summarize(records, label):
    total = len(records)
    done   = [r for r in records if r.get("outcome") == "done"]
    failed = [r for r in records if r.get("outcome") in ("error", "cancelled")]

    def field(recs, key):
        return [r[key] for r in recs if r.get(key) is not None]

    speeds  = field(done, "avgSpeedBps")
    peaks   = field(done, "peakSpeedBps")
    conns   = field(done, "connectionMs")
    pauses  = field(done, "backpressurePauses")
    bytes_  = field(done, "totalBytes")
    rtts    = field(done, "rttMs")

    senders   = [r for r in records if r.get("role") == "sender"]
    receivers = [r for r in records if r.get("role") == "receiver"]

    return {
        "label":            label,
        "total":            total,
        "done":             len(done),
        "failed":           len(failed),
        "success_rate":     (len(done) / total * 100) if total else None,
        "senders":          len(senders),
        "receivers":        len(receivers),
        "total_bytes":      sum(bytes_) if bytes_ else None,
        "avg_speed":        statistics.mean(speeds) if speeds else None,
        "median_speed":     statistics.median(speeds) if speeds else None,
        "p95_speed":        percentile(speeds, 95),
        "peak_speed":       max(peaks) if peaks else None,
        "avg_connection_ms":statistics.mean(conns) if conns else None,
        "median_connection_ms": statistics.median(conns) if conns else None,
        "avg_pauses":       statistics.mean(pauses) if pauses else None,
        "avg_rtt_ms":       statistics.mean(rtts) if rtts else None,
    }


def render_table(lan_s, net_s):
    rows = [
        ("Transfers logged",        lan_s["total"],                    net_s["total"]),
        ("Successful",              lan_s["done"],                     net_s["done"]),
        ("Failed / cancelled",      lan_s["failed"],                   net_s["failed"]),
        ("Success rate",            pct(lan_s["success_rate"]),        pct(net_s["success_rate"])),
        ("Total data moved",        fmt_bytes(lan_s["total_bytes"]),   fmt_bytes(net_s["total_bytes"])),
        ("Avg throughput",          fmt_speed(lan_s["avg_speed"]),     fmt_speed(net_s["avg_speed"])),
        ("Median throughput",       fmt_speed(lan_s["median_speed"]),  fmt_speed(net_s["median_speed"])),
        ("P95 throughput",          fmt_speed(lan_s["p95_speed"]),     fmt_speed(net_s["p95_speed"])),
        ("Peak throughput",         fmt_speed(lan_s["peak_speed"]),    fmt_speed(net_s["peak_speed"])),
        ("Avg connection setup",    fmt_ms(lan_s["avg_connection_ms"]),fmt_ms(net_s["avg_connection_ms"])),
        ("Median connection setup", fmt_ms(lan_s["median_connection_ms"]), fmt_ms(net_s["median_connection_ms"])),
        ("Avg backpressure pauses", f'{lan_s["avg_pauses"]:.1f}' if lan_s["avg_pauses"] is not None else "n/a",
                                     f'{net_s["avg_pauses"]:.1f}' if net_s["avg_pauses"] is not None else "n/a"),
        ("Avg RTT",                 fmt_ms(lan_s["avg_rtt_ms"]),       fmt_ms(net_s["avg_rtt_ms"])),
    ]
    widths = [28, 18, 18]
    lines = []
    header = f'{"Metric":<{widths[0]}} {"LAN":<{widths[1]}} {"Internet":<{widths[2]}}'
    lines.append(header)
    lines.append("-" * len(header))
    for name, lan_v, net_v in rows:
        lines.append(f"{name:<{widths[0]}} {str(lan_v):<{widths[1]}} {str(net_v):<{widths[2]}}")
    return "\n".join(lines)


def pct(v):
    return f"{v:.0f}%" if v is not None else "n/a"


def render_markdown(lan_s, net_s, chart_path=None, size_table_md=None, size_chart_path=None):
    md = []
    md.append("# LetsShare — Transfer Performance Report\n")
    md.append("Generated from `lan-transfers.jsonl` and `internet-transfers.jsonl` "
               "(one JSON record per completed transfer, written by the backend "
               "after every transfer finishes).\n")

    if chart_path:
        md.append(f"![LAN vs Internet comparison charts]({chart_path})\n")
        md.append("_Generate this chart with `python3 analysis/plot_transfers.py`._\n")

    md.append("## Summary\n")
    md.append("| Metric | LAN | Internet |")
    md.append("|---|---|---|")
    rows = [
        ("Transfers logged",        lan_s["total"],                    net_s["total"]),
        ("Success rate",            pct(lan_s["success_rate"]),        pct(net_s["success_rate"])),
        ("Total data moved",        fmt_bytes(lan_s["total_bytes"]),   fmt_bytes(net_s["total_bytes"])),
        ("Avg throughput",          fmt_speed(lan_s["avg_speed"]),     fmt_speed(net_s["avg_speed"])),
        ("Median throughput",       fmt_speed(lan_s["median_speed"]),  fmt_speed(net_s["median_speed"])),
        ("P95 throughput",          fmt_speed(lan_s["p95_speed"]),     fmt_speed(net_s["p95_speed"])),
        ("Avg connection setup",    fmt_ms(lan_s["avg_connection_ms"]),fmt_ms(net_s["avg_connection_ms"])),
        ("Avg backpressure pauses", f'{lan_s["avg_pauses"]:.1f}' if lan_s["avg_pauses"] is not None else "n/a",
                                     f'{net_s["avg_pauses"]:.1f}' if net_s["avg_pauses"] is not None else "n/a"),
    ]
    for name, lan_v, net_v in rows:
        md.append(f"| {name} | {lan_v} | {net_v} |")

    md.append("\n## Notes for a CV / portfolio writeup\n")
    if lan_s["avg_speed"] and net_s["avg_speed"]:
        ratio = lan_s["avg_speed"] / net_s["avg_speed"]
        md.append(f"- LAN mode averaged **{ratio:.1f}x** the throughput of Internet mode "
                   f"({fmt_speed(lan_s['avg_speed'])} vs {fmt_speed(net_s['avg_speed'])}), "
                   f"consistent with LAN's larger chunk/buffer profile and absence of NAT traversal.")
    if lan_s["avg_connection_ms"] and net_s["avg_connection_ms"]:
        diff = net_s["avg_connection_ms"] - lan_s["avg_connection_ms"]
        md.append(f"- Internet mode's connection setup took **{fmt_ms(diff)} longer on average** "
                   f"than LAN — the ICE/STUN NAT-traversal cost LAN mode skips entirely.")
    if lan_s["success_rate"] is not None and net_s["success_rate"] is not None:
        md.append(f"- Reliability: LAN {pct(lan_s['success_rate'])} success rate over "
                   f"{lan_s['total']} transfers vs Internet {pct(net_s['success_rate'])} "
                   f"over {net_s['total']} transfers.")

    if size_table_md:
        md.append("\n## Throughput by file size\n")
        md.append("Buckets are log-scale — small transfers are dominated by fixed connection "
                   "overhead, large transfers approach steady-state throughput. Where LAN and "
                   "Internet throughput converge (if it happens in your data) marks the point "
                   "past which the network, not the handshake, is the bottleneck.\n")
        md.append(size_table_md)
        if size_chart_path:
            md.append(f"\n![Throughput vs file size]({size_chart_path})\n")
            md.append("_Generate this chart with `python3 analysis/plot_transfers.py --bucket-by-size`._\n")

    md.append("\n_Numbers above are pulled directly from these two runs — re-run this "
               "script after more testing for a larger, more representative sample "
               "before quoting exact figures anywhere.\n")
    return "\n".join(md)


def render_size_table(lan_records, net_records):
    lan_buckets = bucket_by_size(lan_records)
    net_buckets = bucket_by_size(net_records)

    def bucket_stats(recs):
        speeds = [r["avgSpeedBps"] for r in recs if r.get("avgSpeedBps") is not None]
        return len(recs), (statistics.mean(speeds) if speeds else None)

    widths = [12, 7, 14, 7, 14]
    header = (f'{"Size range":<{widths[0]}} {"LAN n":<{widths[1]}} {"LAN avg speed":<{widths[2]}} '
              f'{"Net n":<{widths[3]}} {"Net avg speed":<{widths[4]}}')
    lines = [header, "-" * len(header)]
    any_data = False
    for *_, label in SIZE_BUCKETS:
        lan_n, lan_avg = bucket_stats(lan_buckets[label])
        net_n, net_avg = bucket_stats(net_buckets[label])
        if lan_n or net_n:
            any_data = True
        lines.append(f'{label:<{widths[0]}} {lan_n:<{widths[1]}} {fmt_speed(lan_avg):<{widths[2]}} '
                      f'{net_n:<{widths[3]}} {fmt_speed(net_avg):<{widths[4]}}')
    if not any_data:
        lines.append("\n(no completed transfers with a recorded totalBytes yet)")
    return "\n".join(lines)


def render_size_table_md(lan_records, net_records):
    lan_buckets = bucket_by_size(lan_records)
    net_buckets = bucket_by_size(net_records)

    def bucket_stats(recs):
        speeds = [r["avgSpeedBps"] for r in recs if r.get("avgSpeedBps") is not None]
        return len(recs), (statistics.mean(speeds) if speeds else None)

    lines = ["| Size range | LAN n | LAN avg speed | Internet n | Internet avg speed |",
             "|---|---|---|---|---|"]
    for *_, label in SIZE_BUCKETS:
        lan_n, lan_avg = bucket_stats(lan_buckets[label])
        net_n, net_avg = bucket_stats(net_buckets[label])
        lines.append(f"| {label} | {lan_n} | {fmt_speed(lan_avg)} | {net_n} | {fmt_speed(net_avg)} |")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lan",      default=DEFAULT_LAN,      help="Path to lan-transfers.jsonl")
    parser.add_argument("--internet", default=DEFAULT_INTERNET, help="Path to internet-transfers.jsonl")
    parser.add_argument("--out",      default=None,              help="Write a markdown report to this path")
    parser.add_argument("--bucket-by-size", action="store_true",
                         help="Also break throughput down by file-size range (LAN vs Internet)")
    args = parser.parse_args()

    lan_records = load_records(args.lan)
    net_records = load_records(args.internet)

    if not lan_records and not net_records:
        print(f"No records found.\n  LAN:      {args.lan}\n  Internet: {args.internet}\n"
              f"Run a few transfers first, then re-run this script.")
        return

    lan_s = summarize(lan_records, "LAN")
    net_s = summarize(net_records, "Internet")

    print(render_table(lan_s, net_s))
    print()
    print(f"(LAN: {lan_s['senders']} sender records, {lan_s['receivers']} receiver records — "
          f"Internet: {net_s['senders']} sender records, {net_s['receivers']} receiver records)")

    if args.bucket_by_size:
        print()
        print(render_size_table(lan_records, net_records))

    if args.out:
        out_path = Path(args.out)

        def rel_if_exists(p):
            p = Path(p)
            return os.path.relpath(p, start=out_path.parent) if p.exists() else None

        chart_rel      = rel_if_exists("analysis/charts/comparison.png")
        size_chart_rel = rel_if_exists("analysis/charts/throughput_by_size.png") if args.bucket_by_size else None
        size_table_md  = render_size_table_md(lan_records, net_records) if args.bucket_by_size else None

        out_path.write_text(render_markdown(lan_s, net_s, chart_path=chart_rel,
                                             size_table_md=size_table_md, size_chart_path=size_chart_rel))
        print(f"\nMarkdown report written to {args.out}")


if __name__ == "__main__":
    main()
