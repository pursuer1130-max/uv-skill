"""Read-only Photoshop batch checks; never certifies RIP or physical output."""
import argparse
import json
import struct
from pathlib import Path

from PIL import Image


def verify(root, expected):
    results = []
    folders = sorted(p for p in root.iterdir() if p.is_dir() and p.name[:2].isdigit())
    for folder in folders:
        errors = []
        metadata = {}
        try:
            metadata = dict(line.split('=', 1) for line in
                            (folder / 'COMPLETE.txt').read_text(encoding='utf-8-sig').splitlines())
            width, height = map(float, metadata['canvas_mm'].split('x'))
            size = tuple(round(mm / 25.4 * 300) for mm in (width, height))
            for name, mode in [('RGB.tif', 'RGB'), ('CMYK.tif', 'CMYK'), ('preview.png', 'RGB')]:
                with Image.open(folder / name) as im:
                    im.load()
                    if im.mode != mode or im.size != size:
                        errors.append(f'{name}: mode/size mismatch {im.mode} {im.size}')
                    if name.endswith('.tif'):
                        if not all(abs(float(v) - 300) < .1 for v in im.info.get('dpi', (0, 0))):
                            errors.append(f'{name}: expected 300 dpi')
                        if not im.info.get('icc_profile'):
                            errors.append(f'{name}: missing ICC profile')
                    if all(lo == hi for lo, hi in im.getextrema()):
                        errors.append(f'{name}: blank image')
            with (folder / 'editable.psd').open('rb') as f:
                sig, version, _, channels, h, w, depth, mode = struct.unpack('>4sH6sHIIHH', f.read(26))
            if (sig, version, (w, h), depth, mode) != (b'8BPS', 1, size, 8, 3):
                errors.append('PSD: header mismatch')
            for flag, name in [('white', 'WHITE_MASK.tif'), ('varnish', 'VARNISH_MASK.tif')]:
                if metadata.get(flag) != 'true':
                    continue
                with Image.open(folder / name) as im:
                    im.load()
                    if im.mode != 'L' or im.size != size:
                        errors.append(f'{name}: expected matching grayscale mask')
                    else:
                        extrema = im.getextrema()
                        if flag == 'white' and extrema != (0, 0):
                            errors.append(f'{name}: expected full coverage demo mask')
                        if flag == 'varnish' and (extrema[0] >= 255 or extrema[1] <= 0):
                            errors.append(f'{name}: expected nonblank selective mask')
        except Exception as exc:
            errors.append(str(exc))
        results.append({'job': folder.name, 'passed': not errors, 'errors': errors, 'metadata': metadata})
    passed = len(results) == expected and all(row['passed'] for row in results)
    return {'passed': passed, 'expected_jobs': expected, 'checked_jobs': len(results),
            'rip_validated': False, 'physical_print_validated': False, 'jobs': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--expected', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = verify(args.folder.resolve(), args.expected)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'checked_jobs': report['checked_jobs'],
                      'errors': [row for row in report['jobs'] if not row['passed']]}, ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)
