# Photoshop Batch Artwork

## Verified Capability

Tested on local Photoshop 2021, version 22.5.9, on 2026-09-10: ten illustration jobs were composed with editable Chinese/English text and exported as layered RGB PSD, flattened RGB TIFF, flattened CMYK TIFF and PNG preview. Four jobs had full-coverage white masks and a UV_WHITE spot channel; four had selective text varnish masks. All ten passed file checks and visual review after correcting the phone design's text placement.

On 2026-09-10, `scripts/create_ps_emboss_demo.jsx` was added for a fast Photoshop emboss-style circle seal demo. It creates a 300 ppi 120 mm square RGB document, editable Chinese/English text, raised/recessed circular shapes, bead details, highlight/shadow layers, and exports PSD, PNG preview and RGB TIFF to the desktop folder `PS浮雕测试` when Photoshop accepts JSX execution.

On 2026-09-10, `scripts/create_spot_varnish_demo.py` was added as a fast spot-varnish learning/demo helper. It writes a desktop `PS光油测试` folder containing a visible RGB preview, 300 ppi RGB TIFF, and `VARNISH_MASK_黑色为光油.tif`. In this mask convention, black means varnish coverage and white means no varnish; confirm the RIP channel mapping before real printing.

On 2026-09-10, `scripts/create_high_dpi_demo.py` was added for high-DPI Photoshop-style artwork checks. It generates one desktop folder `PS高DPI测试` with 300, 600, 720 and 1200 dpi PNG/TIFF pairs plus `DPI说明.txt`. Use 300 dpi for normal UV art, 600 dpi for finer packaging or cultural products, 720 dpi when matching high-quality RIP modes, and 1200 dpi only for small-format fine texture tests because file size grows quickly.

This does not establish coverage of every Photoshop feature. Packaging images are face-art samples, not complete legal packaging or approved dielines. No machine output was performed.

## Efficient Execution

For startup or COM failures, follow `photoshop-startup-recovery.md`. On 2026-09-11, native `sky.launch_app` plus same-user approved execution restored the visible Photoshop 22.5.9 session. Ordinary background launching did not. Use this newer evidence before repeating older stale-process recovery steps below.

1. Verify the skill license. Inspect the current Photoshop state through available desktop tools; preserve pre-existing documents.
2. Prefer attaching to the ready application using `scripts/run_ps_batch.ps1 -BatchScript <absolute-reviewed-launcher.jsx>`. This wrapper uses Windows PowerShell 5.1, even when the caller runs PowerShell 7. The tested API is `[Runtime.InteropServices.Marshal]::GetActiveObject('Photoshop.Application')`, followed by `DoJavaScriptFile`.
3. Do not repeatedly use `New-Object -ComObject Photoshop.Application` to start Photoshop: a stranded no-window instance caused a blocking activation in this environment. A process existing is not proof of a ready application. Do not force-close an unknown session or possibly unsaved user work.
4. When attachment is unavailable, the verified UI fallback is File > Scripts > Browse. Observe the actual dialog, focus the filename field, type the reviewed JSX path, and load it. The filename field's screenshot showed the true caret while accessibility reported stale search-box focus. Use fresh observations, not saved coordinates.
5. Watch the output log and verify completion files. After an uncertain invocation, inspect outputs and application state before retrying. Terminating a caller does not establish that Photoshop stopped its script.

If Photoshop is present only as a no-window process and `GetActiveObject('Photoshop.Application')` returns `MK_E_UNAVAILABLE`, record the failure as an application readiness issue rather than a script failure. In that state, do not claim Photoshop execution until either the UI fallback runs File > Scripts > Browse successfully or Photoshop is restarted into a normal visible session.

On 2026-09-10, this state was recovered by terminating the stale no-window `Photoshop.exe` instances through `Win32_Process.Terminate`, then starting Photoshop normally and waiting for a real main window. After that, Windows PowerShell 5.1 `GetActiveObject('Photoshop.Application')` returned Photoshop 22.5.9 and `scripts/create_ps_emboss_demo.jsx` successfully exported the desktop PSD/PNG/TIFF set. If using this test from PowerShell 7, escape `$ps` in the nested Windows PowerShell command so the outer shell does not expand it.

## Launcher Contract

Set global `UV_BATCH_CONFIG` in a small JSX file, then call `$.evalFile(new File(<absolute-path-to-ps_print_batch.jsx>))`.

- `output`: output folder; `assets`: source folder containing `<job.id>.png`.
- `overwrite`: default false. Existing COMPLETE.txt markers skip jobs; this is not content-hash-based caching. Use a new job ID for a new revision, or explicitly allow overwriting only the generated files intended for replacement.
- `jobs`: array of objects with `id`, positive trim `width`/`height` in mm, optional `bleed` in mm, default text `color` in RGB hex, optional `white`/`varnish` booleans, and `text` array.
- Each text object has `text`, point `size`, baseline `y` as a fraction of the full canvas, optional fractional `x` (default centered), PostScript `font`, RGB hex `color`, and fractional `maxWidth`.
- Supply reviewed local paths and simple unique job IDs without path separators. Check font availability first; this machine has SimSun, MicrosoftYaHei, MicrosoftYaHei-Bold, ArialMT, Arial-BoldMT and TimesNewRomanPSMT.

The script makes 300 ppi, 8-bit sRGB documents with trim plus bleed. It fits source art with possible edge cropping, places it as a smart object, creates editable text, adds guides and restores preferences on exit. It closes only documents it created/opened. In Photoshop 22.5.9, remove a document from the owned list BEFORE closing it: comparing a closed document object throws an invalid-object error.

Inspect text/background contrast and overlap, source cropping, trim safety and actual effective source ppi. Increasing output ppi does not add genuine source detail. The ten tested source images provided approximately 317-460 effective ppi at their demo sizes.

## File Acceptance

Run `python scripts/verify_ps_batch.py <output-folder> --expected <count> --output <report.json>` using Python with Pillow. It reads completion metadata, decodes TIFF/PNG files, checks dimensions, TIFF resolution/profiles, nonblank composites, PSD headers and applicable grayscale masks. It does not inspect every PSD layer, certify color accuracy or validate printer commands. Review every preview separately.

The current batch's `CMYK.tif` files use Photoshop's working profile, Japan Color 2001 Coated. This is a documented generic conversion, NOT a verified UV material profile. Keep the sRGB originals and select the actual RIP/material profile before production; do not blindly reconvert the CMYK files.

WHITE_MASK.tif is a full rectangular demo mask. VARNISH_MASK.tif covers the text. Black means coverage, white means none in these supplied masks, subject to mapping in the actual RIP. UV_WHITE is a generic PSD spot name, not a guaranteed machine-channel name. Screen solidity is not a printer ink-volume setting. Real products need their actual cut outline, camera opening, transparency, white choke/spread and front/back orientation verified.

TIFF is the prepress handoff. Require the matching RIP and supported output task format before PrintExp. Never rename TIFF to PRN, infer successful import from launching an EXE with a file argument, or mark a dry run as real printing. Establish material, controller connection and operator readiness before any physical output.

## Maintaining This Skill

When requested functionality is added, save only reusable, tested steps here or in an appropriate reference; distinguish executed, file-validated, RIP-validated and physically verified results. Update only the USB source, validate it, then refresh the installed plugin using its cachebuster helper. Do not maintain a second local standalone source. Preserve licensing files and unrelated changes. New tasks load the refreshed plugin.

Use existing assets and scripts before new generation/research. Keep tool output compact: forward image blocks as images, never serialize base64 into text. For account reserves, check both usage windows and leave a margin; percentages are shared account limits, not exact per-task token counts.

## USB Maintenance

Future Photoshop, DPI, emboss, varnish, PrintExp and UV troubleshooting updates must be made in the USB plugin source: `E:\plugins\industrial-uv-print-troubleshooter`. After editing, install with `codex plugin marketplace add E:\` and `codex plugin add industrial-uv-print-troubleshooter@usb`. Keep the marketplace file at `E:\.agents\plugins\marketplace.json` so new Codex installs can attach in two commands.
