"""Lossless decoded-pixel JPEG-to-TIFF preparation; never submits a print job.
No output argument means inspect only. Caller must independently verify that
the explicitly authorized output directory is outside production watchers.
"""
import argparse, hashlib, io, json, math, os, uuid
from pathlib import Path
from PIL import Image, __version__ as pillow_version

def digest(data):
    return hashlib.sha256(data).hexdigest()

def prepare(source, output=None):
    source = Path(source).resolve(strict=True)
    source_bytes = source.read_bytes()
    with Image.open(source) as original:
        if original.format != "JPEG" or original.mode not in ("RGB", "CMYK", "L"):
            raise ValueError("SUPPORTED_JPEG_REQUIRED")
        original.load()
        dpi = tuple(float(n) for n in original.info.get("dpi", ()))
        if len(dpi) != 2 or not all(math.isfinite(n) and n > 0 for n in dpi):
            raise ValueError("EXPLICIT_VALID_SOURCE_DPI_REQUIRED")
        if int(original.getexif().get(274, 1)) != 1:
            raise ValueError("ORIENTATION_REQUIRES_REVIEW")
        icc = original.info.get("icc_profile", b"")
        if original.mode in ("RGB", "CMYK") and not icc:
            raise ValueError("SOURCE_ICC_PROFILE_REQUIRED")
        pixels = digest(original.tobytes())
        result = dict(status="inspected", mode=original.mode, width=original.width,
                      height=original.height, dpi=dpi, iccSha256=digest(icc),
                      sourceSha256=digest(source_bytes), decodedPixelsSha256=pixels,
                      pillowVersion=pillow_version, productionReady=False,
                      spotChannelsAdded=False, physicalPrintingVerified=False)
        if output is None:
            return result
        output = Path(output).absolute()
        if output.suffix.lower() not in (".tif", ".tiff") or output.exists():
            raise ValueError("NEW_TIFF_OUTPUT_REQUIRED")
        if not output.parent.is_dir() or output.parent.is_symlink():
            raise ValueError("EXISTING_ISOLATED_OUTPUT_DIRECTORY_REQUIRED")
        temporary = output.parent / (".uv-" + uuid.uuid4().hex + ".tmp")
        try:
            # No resizing, colorspace conversion, profile assignment or EXIF copying.
            with temporary.open("xb") as stream:
                original.save(stream, format="TIFF", compression="raw", dpi=dpi, icc_profile=icc)
                stream.flush()
                os.fsync(stream.fileno())
            with Image.open(io.BytesIO(temporary.read_bytes())) as check:
                check.load()
                if check.format != "TIFF" or check.mode != original.mode or check.size != original.size:
                    raise ValueError("TIFF_STRUCTURE_MISMATCH")
                if digest(check.tobytes()) != pixels or check.info.get("icc_profile", b"") != icc:
                    raise ValueError("PIXEL_OR_ICC_MISMATCH")
                if any(abs(float(a)-b) > 0.00001 for a,b in zip(check.info.get("dpi", (0,0)),dpi)):
                    raise ValueError("DPI_MISMATCH")
            if digest(source.read_bytes()) != result["sourceSha256"]:
                raise ValueError("SOURCE_CHANGED_DURING_READ")
            checked_hash = digest(temporary.read_bytes())
            # On this Windows runtime rename fails if the destination already exists.
            if output.exists():
                raise ValueError("OUTPUT_ALREADY_EXISTS")
            os.rename(temporary, output)
            if digest(output.read_bytes()) != checked_hash:
                raise ValueError("FINAL_READBACK_MISMATCH")
            result.update(status="converted_and_reopened_verified", outputSha256=checked_hash,
                          outputBytes=output.stat().st_size, originalUnchanged=True,
                          decodedPixelsEqual=True, iccEqual=True, dpiEqual=True)
            return result
        finally:
            if temporary.exists():
                temporary.unlink()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    parser.add_argument("--isolated-output-confirmed", action="store_true")
    args = parser.parse_args()
    if args.output and not args.isolated_output_confirmed:
        parser.error("Verify the local output is outside all production watchers first.")
    print(json.dumps(prepare(args.input, args.output), ensure_ascii=False))
