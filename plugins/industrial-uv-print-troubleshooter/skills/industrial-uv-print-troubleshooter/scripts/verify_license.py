import base64
import hashlib
import json
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


ROOT = Path(__file__).resolve().parents[1]
LICENSE_DIR = ROOT / "license"
LICENSE_FILE = LICENSE_DIR / "license.json"
PUBLIC_KEY_FILE = LICENSE_DIR / "public_key.txt"


def canonical_json(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")


def local_device_id():
    host = socket.gethostname().strip().lower()
    digest = hashlib.sha256(host.encode("utf-8")).hexdigest()[:16].upper()
    return f"UV-{digest[:4]}-{digest[4:8]}-{digest[8:12]}-{digest[12:16]}"


def fail(code, detail):
    print(code)
    print(detail)
    return 1


def main():
    if not LICENSE_FILE.exists():
        return fail("LICENSE_MISSING", f"Missing {LICENSE_FILE}")
    if not PUBLIC_KEY_FILE.exists():
        return fail("LICENSE_MISSING", f"Missing {PUBLIC_KEY_FILE}")

    try:
        public_key_hex = PUBLIC_KEY_FILE.read_text(encoding="utf-8").strip()
        license_doc = json.loads(LICENSE_FILE.read_text(encoding="utf-8"))
        payload = license_doc["payload"]
        signature = base64.b64decode(license_doc["signature"])
        public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        public_key.verify(signature, canonical_json(payload))
    except InvalidSignature:
        return fail("LICENSE_INVALID", "Signature does not match license payload.")
    except Exception as exc:
        return fail("LICENSE_INVALID", f"Could not verify license: {exc}")

    expires_at = payload.get("expires_at")
    if expires_at:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expiry:
            return fail("LICENSE_EXPIRED", f"Expired at {expires_at}")

    allowed_device = payload.get("device_id")
    current_device = local_device_id()
    if allowed_device and allowed_device != current_device:
        return fail("LICENSE_INVALID", f"License device {allowed_device} does not match this device {current_device}")

    print("LICENSE_OK")
    print(json.dumps({"customer": payload.get("customer"), "device_id": current_device}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
