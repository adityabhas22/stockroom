#!/usr/bin/env python3
"""Generate authenticated read traffic for a bounded duration; never changes inventory."""
import argparse
import concurrent.futures
import http.cookiejar
import json
import os
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:3000")
parser.add_argument("--seconds", type=int, default=60)
parser.add_argument("--workers", type=int, default=8)
args = parser.parse_args()
if not 1 <= args.workers <= 64 or not 1 <= args.seconds <= 600:
    parser.error("workers must be 1–64 and seconds must be 1–600")
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
login = urllib.request.Request(args.url + "/api/session", data=json.dumps({"password": os.environ.get("OPERATOR_PASSWORD", "stockroom-local")}).encode(), headers={"Content-Type": "application/json", "X-Stockroom-Request": "1"})
opener.open(login, timeout=10).close()
cookie = "; ".join(f"{c.name}={c.value}" for c in jar)
deadline = time.monotonic() + args.seconds


def worker(_):
    success = errors = 0
    while time.monotonic() < deadline:
        try:
            req = urllib.request.Request(args.url + "/api/items?limit=30", headers={"Cookie": cookie})
            with urllib.request.urlopen(req, timeout=5) as response:
                response.read()
            success += 1
        except Exception:
            errors += 1
    return success, errors


with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
    results = list(pool.map(worker, range(args.workers)))
print(json.dumps({"successful_requests": sum(r[0] for r in results), "failed_requests": sum(r[1] for r in results), "duration_seconds": args.seconds}))
