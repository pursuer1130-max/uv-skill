"""Read artwork metadata and issue a handoff report, never a print command."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def inspect_artwork(path, expected_mm):
    result = {"path": str(path.resolve()), "status": "blocked", "issues": [], "production_ready": False}
    if not path.is_file():
        result["issues"].append("artwork_missing")
        return result
    with path.open("rb") as source:
        result["sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
    try:
        with Image.open(path) as img:
            img.load()
            dpi = img.info.get("dpi")
            result.update(format=img.format, mode=img.mode, pixels=list(img.size),
                          bands=list(img.getbands()), icc_present=bool(img.info.get("icc_profile")),
                          dpi=[float(n) for n in dpi] if dpi else None)
            if dpi and all(float(n) > 0 for n in dpi):
                mm = [round(px / float(res) * 25.4, 3) for px, res in zip(img.size, dpi)]
                result["size_mm"] = mm
                if any(abs(a-b) > .1 for a,b in zip(mm, expected_mm)):
                    result["issues"].append("unexpected_physical_size")
            else:
                result["issues"].append("physical_size_unverified_no_dpi")
            if img.format != "TIFF":
                result["issues"].append("demo_handoff_expects_tiff")
            if img.mode != "CMYK":
                result["issues"].append("demo_handoff_expects_cmyk")
            result["spot_channels"] = "not_proven_by_pillow_metadata"
            result["profile_note"] = "Embedded profile presence is not validation of the production profile."
            result["status"] = "artwork_metadata_checked" if not result["issues"] else "blocked"
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        result["issues"].append("unreadable_image: " + str(exc))
    result["production_ready"] = False
    result["remaining"] = ["RIP with matching printer, ink, channel order, mode and media profile",
                           "Confirm actual PrintExp task preview and dimensions",
                           "Verify controller, physical setup and accepted first sample"]
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artwork", type=Path)
    parser.add_argument("--expected-mm", nargs=2, type=float, default=[100,100])
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = inspect_artwork(args.artwork, args.expected_mm)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"], "issues": report["issues"], "output":str(args.output)}))
    raise SystemExit(0 if report["status"] == "artwork_metadata_checked" else 2)
