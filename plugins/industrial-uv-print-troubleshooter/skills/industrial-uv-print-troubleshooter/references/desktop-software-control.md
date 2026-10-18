# Photoshop and PrintExp_X64 Coordination

Use this reference when the user wants Codex to work with Photoshop, PS files, Hoson PrintExp, or PrintExp_X64.

## Scope

Codex may help open software, check whether it is running, locate executable paths, collect logs, review screenshots, inspect exported files, and guide the operator through RIP/prepress checks.

Respect the user's existing authorization for artwork and local skill updates. Before machine output or maintenance, establish the actual machine and job state. See `printexp-operations.md` for the current control limitations.

## Local Helper

Run the helper from the plugin root or skill folder:

```powershell
powershell -ExecutionPolicy Bypass -File skills\industrial-uv-print-troubleshooter\scripts\desktop_uv_helper.ps1 -Action status
```

Actions:

- `status`: report Photoshop and PrintExp process status, common executable candidates, likely PrintExp logs, and recent Windows application errors.
- `open-photoshop`: open Photoshop using a known installed path or Windows app resolution.
- `open-printexp`: open PrintExp_X64 from a supplied `-PrintExpPath` or common local candidates.
- `collect`: write a small diagnostic bundle under the chosen output directory.
- `learn-printexp`: extract a concise PrintExp function map from the local Chinese language resource.
- `factory-dry-run`: create a factory-style dry-run handoff bundle for Photoshop-to-PrintExp work without pressing real print controls.

Photoshop demo artwork:

- Use `scripts/create_ps_circle_demo.jsx` to create a simple 100 mm x 100 mm CMYK circle test file for import demonstrations.
- The script saves PSD and TIFF print files plus an RGB PNG preview in the current Codex task `outputs` folder. Photoshop cannot save a CMYK document directly as PNG in some versions, so the preview is made from an RGB duplicate.
- Prefer this scripted route for repeatable testing; mouse drawing is acceptable only when the user specifically wants UI drawing behavior tested.

Examples:

```powershell
powershell -NoProfile -File skills\industrial-uv-print-troubleshooter\scripts\desktop_uv_helper.ps1 -Action open-printexp -PrintExpPath "<当前已核实的PrintExp_X64.exe绝对路径>"
powershell -ExecutionPolicy Bypass -File skills\industrial-uv-print-troubleshooter\scripts\desktop_uv_helper.ps1 -Action collect -OutputDir "<当前用户目录>"
powershell -ExecutionPolicy Bypass -File skills\industrial-uv-print-troubleshooter\scripts\desktop_uv_helper.ps1 -Action learn-printexp
powershell -ExecutionPolicy Bypass -File skills\industrial-uv-print-troubleshooter\scripts\desktop_uv_helper.ps1 -Action factory-dry-run -OutputDir "<当前用户目录>"
```

## PrintExp_X64 Startup Checks

If PrintExp does not open:

1. Confirm the actual `PrintExp_X64.exe` path.
2. Launch it with its own folder as the working directory.
3. Prefer a short ASCII path or junction if the package path contains garbled text or deep Chinese folders.
4. Check for local x86 VC++ runtime DLLs beside a 64-bit EXE, especially `mfc100.dll`, `msvcp100.dll`, and `msvcr100.dll`.
5. Check `logfile`, `Log`, `RIP_SDK2`, `ICC Profile`, `Printer`, and `platforms/qwindows.dll`.
6. Read Windows Application events for `Application Error`, `SideBySide`, and `Windows Error Reporting`.

## Photoshop Checks

For opening Photoshop or resolving no-window / COM failures, use `photoshop-startup-recovery.md`. Native desktop launch must precede `open-photoshop` when no usable window exists; the helper now checks actual readiness rather than reporting success merely after spawning a process.

When Photoshop is open but direct document inspection is unavailable, ask the user for:

- A screenshot of the canvas, Layers panel, and Channels panel.
- The file format and export target used for PrintExp.
- Canvas size, resolution, color mode, embedded profile, and proof/profile settings.
- Spot white and varnish channel names, layer visibility, opacity, overprint/knockout behavior, masks, and linked assets.

## PrintExp Import Demonstration

For a low-risk import demonstration:

1. Create or obtain a simple test file, preferably `uv-circle-demo.tif`.
2. Open PrintExp_X64 and confirm it is idle.
3. Process the TIFF with the matching RIP and import its supported machine task. Direct TIFF import is only an alternative after this build's integrated RIP import and profile selection have been verified. Never rename a TIFF to PRN.
4. Inspect media size, placement, pass count, ICC/material profile, lamp power, white ink, and varnish settings before any output.
5. Stop before pressing the final print/start/output button unless the user explicitly confirms the real printer is safe, loaded with test material, and ready.

Fast operator-assisted route when UI automation cannot click PrintExp:

1. Codex creates `outputs\uv-circle-demo.tif` with Photoshop.
2. Codex opens PrintExp_X64 and confirms status/logs.
3. User clicks `文件` or `打开PRN文件/添加打印` in PrintExp.
4. Select the RIP-generated PRN/PRT accepted by the observed file filter. A TIFF is RIP input, not proof of an importable machine task.
5. Codex observes the changed screen, records the buttons/coordinates, checks task parameters, and stops before real printing.

Factory-segment simulation when PrintExp can open but cannot be controlled:

1. Generate the artwork through Photoshop automation.
2. Produce a dry-run handoff bundle with `factory-dry-run`.
3. Treat the bundle as the production traveler: artwork path, PrintExp status, function map, operator import steps, and risk gate.
4. Use screenshots or operator confirmation for the PrintExp parameter page.
5. Compare actual settings against the handoff checklist before allowing real print.

## Learned PrintExp_X64 Interface Map

This historical interface map is a navigation reference. Verify the actual current installation, window and controls before use.

Top modules visible in the main window:

- `文件`: file/task browser area.
- `常规打印`: normal print workspace.
- `设置`: setup area.
- `校准`: calibration area.
- `电压`: voltage area. Treat as risky because wrong settings can damage heads.
- `高级`: advanced area. Treat as risky until the user confirms the exact purpose.

Normal print workspace controls seen on the main screen:

- `打印`: final output/start control. Do not press without explicit confirmation.
- `暂停`: pause printing.
- `取消`: cancel printing. Confirm if it will cancel a real running job.
- `检测`: test/check control.
- `左移`, `右移`, `进料`, `退料`, `X复位`: motion/material controls. Establish machine readiness before using on a connected printer.
- `打印任务列表`, `历史任务列表`: task and history panes.
- Status fields: task precision, print mode, print size, area/length, print progress, print timer, output, copies.

Language-resource functions found in `Lang\chs\PrintExpHS.ini`:

- `Open PRN Files`: open PRN files.
- `Add Printing`: add a print task.
- `Print Immediately`: print immediately.
- `Task attribute`, `Task Property`, `Task Param`, `Print Param`: task and print parameter inspection.
- `Print Scheme`, `Material`, `Print mode`, `Pass Num`, `Task Dpi`, `Task Size`: core RIP/print setup.
- `White`, `White Ink`, `White Ink Set`: white ink controls.
- `Varnish`: varnish controls.
- `Print preview`, `Print Verify`: preview/effect verification.
- `Open log directory`: log folder access.

Observed local limitation:

- In one test, Computer Use could see the PrintExp window and screenshot but coordinate clicks on top tabs did not change screens. If this happens, avoid repeated blind clicking. Use logs, language resources, screenshots, and operator-assisted navigation until the window accepts input.
- The local log repeatedly showed `m_bIsConnect!=TRUE`, meaning the printer/controller was not connected. In that state, demonstrate file creation and software opening, but do not claim a real print was executed.
- Passing `uv-circle-demo.tif` as a command-line argument to `PrintExp_X64.exe` opened/held another PrintExp process but did not create a confirmed task or log the imported filename. Do not treat command-line file arguments as a reliable import path for this local version.

## Demonstration Status Template

Use this for PS-to-PrintExp demos:

- Symptom judgment: software workflow test, not a print-quality fault.
- Most likely cause if blocked: UI automation cannot actuate PrintExp controls, or printer/controller is disconnected.
- First action: create `uv-circle-demo.tif` from Photoshop, open PrintExp, confirm idle/disconnected status, then import manually or with confirmed UI control.
- Risky-operation warning: do not press `打印`, `立即打印`, motion, purge, voltage, or advanced controls without explicit confirmation and a prepared test material.
- Missing information: printer connection status, material loaded, chosen print scheme/material profile, pass count, lamp power, white/varnish mode, and whether this is dry-run or real output.

## Diagnostic Response Format

Each diagnosis should include:

- Symptom judgment
- Most likely cause
- First action
- Risky-operation warning
- Missing information

Keep first actions reversible: compare with a known-good file, print a nozzle test, check profile/RIP selection, verify material settings, and collect logs before calibration or hardware changes.
