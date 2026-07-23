# Transfer performance analysis

Reads the two JSONL logs the backends write after every finished transfer
and turns them into a comparison report. Two scripts:

- `analyze_transfers.py` — text table + markdown report. Standard library
  only, no `pip install` needed.
- `plot_transfers.py` — the same comparison as charts (PNG). Needs
  matplotlib.

```bash
# text report + optional markdown file
python3 analysis/analyze_transfers.py
python3 analysis/analyze_transfers.py --out analysis/report.md

# charts — needs matplotlib
pip install matplotlib
python3 analysis/plot_transfers.py
python3 analysis/plot_transfers.py --out analysis/charts/comparison.png

# break throughput down by file size too (LAN vs Internet, per size bucket)
python3 analysis/analyze_transfers.py --bucket-by-size --out analysis/report.md
python3 analysis/plot_transfers.py --bucket-by-size
```

Both accept `--lan` / `--internet` to point at different log file paths;
they default to the paths each backend's `.env` writes to.

`--bucket-by-size` groups completed transfers into six log-scale size
ranges (`<1MB` … `>1GB`) and reports LAN vs Internet throughput per range,
as a table (`analyze_transfers.py`) and a line chart (`plot_transfers.py`).
This is usually the most compelling chart in the whole report — small
transfers are dominated by fixed connection overhead (handshake time barely
depends on file size), large transfers approach steady-state throughput.
Where the two lines converge, if they do, marks the point past which the
network — not the handshake — is the bottleneck. Needs a reasonable spread
of file sizes actually tested per mode to be meaningful; a bucket with 1
sample isn't a real data point, just noise (the chart annotates each point
with `n=` for exactly this reason — treat low-`n` points skeptically).

`plot_transfers.py` produces one PNG with four panels:
- **Throughput** (avg / median / P95) — the headline speed comparison
- **Avg connection setup time** — the NAT-traversal-cost story: this is
  usually the single most interesting number to explain in an interview,
  since it's not just "LAN is faster," it's "here's specifically why"
- **Success rate** — reliability, not just speed
- **Throughput distribution** (box plot) — shows spread, not just the
  average; a wide box for Internet vs a tight one for LAN is itself a
  finding worth a sentence in a writeup (LAN throughput is consistent;
  Internet throughput varies with the receiver's path/NAT type)

## Why a separate script, when Grafana already exists

Grafana's two dashboards (`grafana/dashboards/`) are deliberately isolated —
one datasource each, no shared panel — so the *product* never mixes LAN and
Internet data. This script is the one intentional exception: it's a
standalone tool for *you*, not part of the app, and comparing the two is
the entire point of running it.

## What to actually pull out for a CV / portfolio writeup

Not every number here is equally interesting. In rough order of what tends
to land well:

1. **Throughput ratio (LAN vs Internet avg/median speed)** — the headline
   number. Demonstrates you can quantify the thing you built, not just
   describe it.
2. **Connection setup time** — this is really "NAT traversal cost," and
   it's a genuinely technical result: it shows you understand *why* LAN and
   Internet transfers behave differently at the protocol level (ICE/STUN
   vs direct same-network handshake), not just that they do.
3. **Success rate** — reliability matters as much as speed for a resume
   story; "99% success rate over N transfers" is a stronger claim than raw
   speed alone.
4. **Backpressure pause rate** — evidence you tuned the two transfer
   profiles (chunk size / buffer thresholds) deliberately, not by accident.

Re-run the script after you've done more real transfers (ideally: a real
LAN with two physical devices, and a real cross-network Internet transfer,
not two tabs on localhost) before quoting exact figures — a handful of
same-machine test transfers will understate real-world Internet latency and
overstate LAN's advantage.
