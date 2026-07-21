#!/usr/bin/env python3
"""
plot_transfers.py — LAN vs Internet performance charts, built from the same
two JSONL logs analyze_transfers.py reads.

Kept as a separate script (not folded into analyze_transfers.py) so the
text/markdown report stays dependency-free — this one needs matplotlib:

    pip install matplotlib
    python3 analysis/plot_transfers.py
    python3 analysis/plot_transfers.py --out analysis/charts/comparison.png

Same rule as analyze_transfers.py: this is a personal analysis tool, not
part of the app. Grafana's dashboards stay one-per-app/isolated by design;
this script is where LAN and Internet are deliberately put side by side.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from analyze_transfers import (  # noqa: E402
    load_records, percentile, bucket_by_size, SIZE_BUCKETS, DEFAULT_LAN, DEFAULT_INTERNET,
)

try:
    import matplotlib
    matplotlib.use("Agg")   # write straight to file, no display needed
    import matplotlib.pyplot as plt
except ImportError:
    print("This script needs matplotlib — install it with:\n    pip install matplotlib")
    raise SystemExit(1)

MB = 1024 * 1024
LAN_COLOR, NET_COLOR = "#3b82f6", "#f97316"   # blue / orange — consistent across every panel


def done_field(records, key):
    return [r[key] for r in records if r.get("outcome") == "done" and r.get(key) is not None]


def success_rate(records):
    if not records:
        return 0.0
    done = sum(1 for r in records if r.get("outcome") == "done")
    return done / len(records) * 100


def bar_labels(ax, bars, fmt):
    for b in bars:
        h = b.get_height()
        ax.annotate(fmt.format(h), (b.get_x() + b.get_width() / 2, h),
                    ha="center", va="bottom", fontsize=9)


def plot(lan, net, out_path):
    lan_speeds = [v / MB for v in done_field(lan, "avgSpeedBps")]
    net_speeds = [v / MB for v in done_field(net, "avgSpeedBps")]
    lan_conn   = done_field(lan, "connectionMs")
    net_conn   = done_field(net, "connectionMs")

    fig, axes = plt.subplots(2, 2, figsize=(11, 8))
    fig.suptitle("LetsShare — LAN vs Internet Transfer Performance", fontsize=14, fontweight="bold")

    # ── 1. Throughput: avg / median / p95 ───────────────────────────────────
    ax = axes[0][0]
    stat_names = ["Avg", "Median", "P95"]

    def stats(vals):
        if not vals:
            return [0, 0, 0]
        return [sum(vals) / len(vals), percentile(vals, 50), percentile(vals, 95)]

    lan_vals, net_vals = stats(lan_speeds), stats(net_speeds)
    x = list(range(len(stat_names)))
    w = 0.35
    ax.bar([i - w / 2 for i in x], lan_vals, w, label="LAN",      color=LAN_COLOR)
    ax.bar([i + w / 2 for i in x], net_vals, w, label="Internet", color=NET_COLOR)
    ax.set_xticks(x); ax.set_xticklabels(stat_names)
    ax.set_ylabel("MB/s")
    ax.set_title("Throughput")
    ax.legend()

    # ── 2. Avg connection setup time ────────────────────────────────────────
    ax = axes[0][1]
    lan_avg_conn = sum(lan_conn) / len(lan_conn) if lan_conn else 0
    net_avg_conn = sum(net_conn) / len(net_conn) if net_conn else 0
    bars = ax.bar(["LAN", "Internet"], [lan_avg_conn, net_avg_conn], color=[LAN_COLOR, NET_COLOR])
    ax.set_ylabel("ms")
    ax.set_title("Avg Connection Setup Time\n(NAT traversal cost, LAN vs Internet)")
    bar_labels(ax, bars, "{:.0f} ms")

    # ── 3. Success rate ──────────────────────────────────────────────────────
    ax = axes[1][0]
    bars = ax.bar(["LAN", "Internet"], [success_rate(lan), success_rate(net)], color=[LAN_COLOR, NET_COLOR])
    ax.set_ylabel("%")
    ax.set_ylim(0, 108)
    ax.set_title(f"Success Rate  (LAN n={len(lan)}, Internet n={len(net)})")
    bar_labels(ax, bars, "{:.0f}%")

    # ── 4. Throughput distribution (spread matters as much as the average) ──
    ax = axes[1][1]
    box_data = [lan_speeds or [0], net_speeds or [0]]
    bp = ax.boxplot(box_data, patch_artist=True)
    ax.set_xticklabels(["LAN", "Internet"])
    for patch, color in zip(bp["boxes"], [LAN_COLOR, NET_COLOR]):
        patch.set_facecolor(color)
        patch.set_alpha(0.5)
    ax.set_ylabel("MB/s")
    ax.set_title("Throughput Distribution")

    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_size_scaling(lan, net, out_path):
    """Throughput vs file-size bucket — usually the most compelling chart in
    this kind of writeup, since it visually shows the crossover point where
    connection overhead stops dominating and steady-state throughput takes
    over. Gaps (untested buckets) are left as gaps, not interpolated."""
    lan_buckets = bucket_by_size(lan)
    net_buckets = bucket_by_size(net)
    labels = [label for *_, label in SIZE_BUCKETS]

    def avg_and_n(buckets, label):
        speeds = [r["avgSpeedBps"] / MB for r in buckets[label] if r.get("avgSpeedBps") is not None]
        return (sum(speeds) / len(speeds) if speeds else float("nan")), len(speeds)

    lan_stats = [avg_and_n(lan_buckets, l) for l in labels]
    net_stats = [avg_and_n(net_buckets, l) for l in labels]
    lan_vals, lan_ns = zip(*lan_stats)
    net_vals, net_ns = zip(*net_stats)

    fig, ax = plt.subplots(figsize=(9, 6))
    x = list(range(len(labels)))
    ax.plot(x, lan_vals, marker="o", linewidth=2, label="LAN",      color=LAN_COLOR)
    ax.plot(x, net_vals, marker="o", linewidth=2, label="Internet", color=NET_COLOR)

    for i, (v, n) in enumerate(zip(lan_vals, lan_ns)):
        if n:
            ax.annotate(f"n={n}", (i, v), textcoords="offset points", xytext=(0, 10),
                        fontsize=8, color=LAN_COLOR, ha="center")
    for i, (v, n) in enumerate(zip(net_vals, net_ns)):
        if n:
            ax.annotate(f"n={n}", (i, v), textcoords="offset points", xytext=(0, -16),
                        fontsize=8, color=NET_COLOR, ha="center")

    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=15)
    ax.set_ylabel("Avg throughput (MB/s)")
    ax.set_title("Throughput vs File Size — LAN vs Internet")
    ax.legend()
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=150)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lan",      default=DEFAULT_LAN)
    ap.add_argument("--internet", default=DEFAULT_INTERNET)
    ap.add_argument("--out",      default="analysis/charts/comparison.png")
    ap.add_argument("--bucket-by-size", action="store_true",
                     help="Also plot throughput vs file-size bucket (LAN vs Internet)")
    ap.add_argument("--size-out", default="analysis/charts/throughput_by_size.png",
                     help="Output path for the size-scaling chart")
    args = ap.parse_args()

    lan = load_records(args.lan)
    net = load_records(args.internet)

    if not lan and not net:
        print(f"No records found.\n  LAN:      {args.lan}\n  Internet: {args.internet}\n"
              f"Run a few transfers first, then re-run this script.")
        return

    out_path = Path(args.out)
    plot(lan, net, out_path)
    print(f"Saved {out_path}")

    if args.bucket_by_size:
        size_out_path = Path(args.size_out)
        plot_size_scaling(lan, net, size_out_path)
        print(f"Saved {size_out_path}")


if __name__ == "__main__":
    main()
