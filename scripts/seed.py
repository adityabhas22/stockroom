#!/usr/bin/env python3
"""Insert a small, explicitly named demonstration inventory through the API."""
import argparse
import http.cookiejar
import json
import os
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:3000")
args = parser.parse_args()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(args.url + "/api" + path, data=data,
        headers={"Content-Type": "application/json", "X-Stockroom-Request": "1"})
    with opener.open(req, timeout=15) as response:
        return json.load(response)


request("/session", {"password": os.environ.get("OPERATOR_PASSWORD", "stockroom-local")})
samples = [
    ("CAB-001", "USB-C cable · 1 m", "Cables", "A-01", 48, 10),
    ("CAB-002", "Jumper wires · 40 pack", "Cables", "A-02", 6, 10),
    ("CMP-001", "Arduino Uno R3", "Components", "B-01", 18, 5),
    ("CMP-002", "Breadboard · 830 points", "Components", "B-02", 32, 8),
    ("CMP-003", "Resistor kit · 600 pcs", "Components", "B-03", 4, 5),
    ("CMP-004", "Raspberry Pi 5 · 4 GB", "Components", "B-04", 0, 3),
    ("CON-001", "Solder wire · 100 g", "Consumables", "C-01", 12, 4),
    ("CON-002", "Heat shrink tubing kit", "Consumables", "C-02", 9, 5),
    ("TLS-001", "Digital multimeter", "Tools", "D-01", 7, 2),
    ("TLS-002", "Precision screwdriver set", "Tools", "D-02", 3, 3),
    ("TLS-003", "Wire stripper", "Tools", "D-03", 0, 2),
    ("CMP-005", "LED assortment · 100 pcs", "Components", "B-05", 15, 5),
]
for sku, name, category, location, quantity, reorder in samples:
    existing = request("/items?q=" + sku)["items"]
    item = next((i for i in existing if i["sku"] == sku), None)
    if item is None:
        item = request("/items", {"sku": sku, "name": name, "category": category,
            "location": location, "reorder_point": reorder})
    if quantity:
        request(f"/items/{item['id']}/movements", {"request_id": str(uuid.uuid5(uuid.NAMESPACE_URL, "stockroom-demo/" + sku)),
            "delta": quantity, "note": "Demo opening stock · workshop supplies"})
print("Demonstration inventory is ready: 12 items. Re-running does not add stock twice.")
