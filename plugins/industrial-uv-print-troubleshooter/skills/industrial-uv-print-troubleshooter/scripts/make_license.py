import argparse
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
LICENSE_FILE = ROOT / "license" / "license.json"


def canonical_json(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description="Create a signed local license for testing.")
    parser.add_argument("--private-key-hex", required=True)
    parser.add_argument("--customer", required=True)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--expires-at", default="2027-12-31T23:59:59Z")
    args = parser.parse_args()

    payload = {
        "customer": args.customer,
        "device_id": args.device_id,
        "expires_at": args.expires_at,
        "features": ["uv_diagnosis", "rip_review", "prepress_checks"],
        "plugin": "industrial-uv-print-troubleshooter",
        "version": 1,
    }
    private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(args.private_key_hex))
    signature = private_key.sign(canonical_json(payload))
    LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    LICENSE_FILE.write_text(
        json.dumps({"payload": payload, "signature": base64.b64encode(signature).decode("ascii")}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {LICENSE_FILE}")


if __name__ == "__main__":
    main()
