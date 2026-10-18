# Industrial Flatbed UV Printer Troubleshooting

This reference is a practical checklist for industrial flatbed UV printers. Use it to triage symptoms, choose likely causes, and apply low-risk fixes first.

## First Response Workflow

1. Record the machine model, printhead model, ink brand/type, material, primer/coating use, print mode, pass count, resolution, lamp power, carriage speed, ambient temperature/humidity, and whether the issue started after ink/material/software changes.
2. Run and save a nozzle test before changing calibrations. Identify whether defects follow one color/channel, all channels, one head, one area of the table, or one file.
3. Separate file/prepress problems from machine problems by printing a known-good factory test file.
4. Separate material/curing problems from image problems by testing a common reference material at standard lamp power.
5. Change one variable at a time and document the before/after result.

## Print Quality Symptoms

### Missing Lines, Nozzle Breaks, Banding

Likely causes:

- Partially clogged nozzle, dried UV ink at nozzle plate, weak positive purge, unstable negative pressure, air in ink line, expired/settled ink, dirty filter, damaged damper, weak pump, capping station not sealing.
- Pass count too low, bidirectional calibration off, media feed/axis step calibration error.

Fix order:

1. Print nozzle test and map missing nozzles by color/head.
2. Check ink level, ink expiration, sediment, line bubbles, negative pressure, and damper fill.
3. Wipe nozzle plate with approved lint-free material and manufacturer-approved cleaning fluid.
4. Perform normal purge/cleaning; avoid repeated strong cleans that overheat or flood heads.
5. Rest the head with cap/moisture if dried; then retest.
6. Replace filter/damper if one channel repeatedly starves.
7. Calibrate media advance or pass overlap only after nozzles are stable.

### Flying Ink, Mist, Fuzzy Edges

Likely causes:

- Excess printhead-to-media gap, static electricity, wrong waveform/voltage, low humidity, contaminated material surface, carriage speed too high, ink viscosity/temperature mismatch.

Fix order:

1. Set head gap to the material and confirm table flatness.
2. Clean material surface and remove dust/oil.
3. Ground the machine and material path; use ionizing/static control if available.
4. Keep humidity in the printer's recommended range, often around 40-60% unless the ink vendor specifies otherwise.
5. Reduce carriage speed or use a higher pass mode.
6. Do not change waveform or head voltage without vendor guidance.

### Ghosting, Double Image, Misregistration

Likely causes:

- Bidirectional calibration error, encoder strip contamination, carriage belt looseness, platform skew, loose head mount, wrong print mode, RIP scale/rotation mismatch.

Fix order:

1. Compare unidirectional and bidirectional output.
2. Clean encoder strip and sensor gently.
3. Run bidirectional/head alignment calibration.
4. Check belt tension, carriage rail lubrication, head fixing screws, and table origin repeatability.
5. Verify file scale, rotation, and mirror settings in RIP/PrintExp.

### Color Cast, Color Difference, Weak Density

Likely causes:

- Wrong ICC/profile, CMYK/RGB conversion mismatch, incorrect material profile, ink channel restriction, UV over/under curing, expired/settled ink, Photoshop export color changes.

Fix order:

1. Print a known color chart and nozzle test.
2. Confirm the selected material/profile/print mode matches the material and ink.
3. In Photoshop, check document color mode, embedded profile, proof setup, spot channels, opacity, and export format.
4. Agitate ink per vendor instructions and check channel density.
5. Rebuild or select ICC only after mechanical/nozzle stability is confirmed.

### Poor Adhesion, Peeling, Scratching

Likely causes:

- Surface oil/dust, unsuitable material, missing primer/coating, UV lamp power too low or too high, wrong ink for substrate, over-thick white/varnish layer.

Fix order:

1. Clean material with approved method and avoid touching print area.
2. Test primer/coating for glass, metal, acrylic, ceramic, silicone-like, or low-energy plastics.
3. Adjust lamp power and print speed; verify full cure without over-brittleness.
4. Reduce ink limit or white/varnish thickness.
5. Perform cross-hatch/tape test after proper curing time if required.

### White Ink Problems

Likely causes:

- White ink settling, poor circulation, clogged white channel, wrong spot white layer, insufficient underbase, excessive white causing cracking.

Fix order:

1. Confirm white ink circulation/stirring is active.
2. Agitate/recirculate per vendor guidance before printing.
3. Print white nozzle test.
4. In Photoshop/RIP, verify spot white channel name, layer order, overprint/knockout, and white density.
5. Use appropriate white choke/spread to avoid halos.

### Varnish/Gloss Problems

Likely causes:

- Wrong varnish spot channel, lamp power mismatch, dust, uneven substrate height, excessive thickness, wrong curing sequence.

Fix order:

1. Confirm varnish spot layer/channel and RIP mapping.
2. Test lower/higher varnish density and lamp power.
3. Clean environment and material.
4. Check height sensing and flatness.

## Ink System and Printhead

Common issues:

- Air bubbles, pressure instability, clogged filters, old dampers, leaking fittings, pump failure, cap station leak, wiper contamination, head cable/contact issue.

Checks:

- Channel-by-channel nozzle test.
- Negative pressure reading and stability.
- Ink line bubbles after purge.
- Damper fullness and filter age.
- Cap station seal and waste ink pump operation.
- Head cable seating only after power is off and static precautions are used.

Stop and escalate to vendor when:

- Burned head smell, visible electrical damage, repeated blown fuses, ink in electronics, severe head strike, or missing full head channels after cable swap/check.

## UV Curing System

Symptoms:

- Wet/tacky ink, odor, poor adhesion, yellowing, cracking, banded gloss, overheating material, lamp alarm.

Likely causes:

- Lamp power too low/high, LED aging, dirty lens/window, cooling fan or water-cooling issue, wrong print speed/pass, material sensitivity.

Fix order:

1. Clean lamp lens/window and verify cooling.
2. Confirm lamp power settings by print mode.
3. Reduce speed or increase pass for curing; lower power for heat-sensitive materials.
4. Check lamp hours and replace aged LED module if output is weak.

## Media Handling and Platform

Symptoms:

- Media moves, print not square, head strike, uneven density across table, suction weak.

Likely causes:

- Vacuum zones wrong, vacuum pump/filter issue, table not level, material warped, height sensor error, origin/clamp not repeatable.

Fix order:

1. Clean table and vacuum holes.
2. Select only needed vacuum zones and mask unused area if required.
3. Check material flatness and head gap.
4. Run height detection and table level checks.
5. Verify origin pins/clamps and file placement.

## Motion, Sensors, and Electronics

Symptoms:

- Carriage alarm, origin failure, limit alarm, skew, random stop, communication loss.

Likely causes:

- Dirty encoder strip, loose belt, blocked sensor, cable drag issue, motor driver alarm, emergency stop, unstable power/grounding, controller IP mismatch.

Fix order:

1. Read exact alarm message/code and preserve logs.
2. Check emergency stop, interlocks, limit sensors, and cable chain.
3. Clean encoder strip and check sensor alignment.
4. Verify controller communication: USB/TCP mode, IP, port, network adapter, firewall.
5. Do not flash firmware or change motion parameters until mechanical causes are excluded.

## Environment

Control:

- Dust, static, temperature, humidity, direct sunlight, vibration, unstable power, and poor grounding.

Typical guidance:

- Keep material and ink acclimated before printing.
- Use stable humidity to reduce static and nozzle drying.
- Avoid dusty airflow near printheads and wet prints.

## Photoshop Prepress for UV Printing

Check these before machine troubleshooting when the defect is file-specific:

- Canvas size and scale match the material and RIP units.
- Resolution is appropriate for output size; avoid accidental resampling.
- Color mode/profile is intentional; avoid uncontrolled RGB-to-CMYK conversions.
- Text is outlined or fonts are available.
- Linked images are present and high enough resolution.
- Transparent areas, masks, clipping paths, and hidden layers are correct.
- Spot white and varnish channels/layers are named exactly as required by the RIP/PrintExp workflow.
- White underbase/choke/spread is set to avoid colored edge halos.
- Export format preserves required channels: use TIFF/PSD/PDF only when the RIP supports the needed spot channels and transparency.
- For color mismatch, compare Photoshop proof/profile settings with PrintExp/RIP ICC profile and material mode.

## Hoson PrintExp / PrintExp_X64 on Windows

Known failure classes:

- `0xC000007B` or instant exit: x64 EXE loading x86 DLLs, especially `mfc100.dll`, `msvcp100.dll`, `msvcr100.dll`; install Microsoft VC++ 2010 x64 runtime and remove/rename wrong local x86 copies.
- Starts from command line but not shortcut: shortcut target/working directory wrong, Chinese path encoded incorrectly, or deep/garbled extraction path.
- Runs only from program folder: missing working directory; create shortcut with correct "Start in" path.
- No window but process exists: splash/modal offscreen, secondary process, device wait, licensing/lock, or UI hidden behind another app.
- RIP/resource errors: moved folder, missing `RIP_SDK2`, `ICC Profile`, `Printer`, `platforms/qwindows.dll`, or profile files.
- Camera/location version: missing IKapLibrary/camera SDK, wrong camera driver, camera IP/network mismatch.
- Communication failure: wrong USB/TCP setting, controller IP/port mismatch, firewall, network adapter binding, board powered off.

Recommended checks:

1. Locate the actual `PrintExp_X64.exe` and launch it with its own folder as working directory.
2. Capture exit code:
   `Start-Process -FilePath <exe> -WorkingDirectory <dir> -PassThru`, wait, then check `HasExited` and `ExitCode`.
3. Check Windows Application event logs for `Application Error`, `SideBySide`, and `Windows Error Reporting`.
4. Check the program's `logfile/runlog.log` and `Log/main` logs.
5. Scan local EXE/DLL architecture. A 64-bit `PrintExp_X64.exe` must not load local x86 VC++ runtime DLLs.
6. If path contains garbled Chinese or many nested folders, copy the application folder to a short stable path or create an ASCII junction such as `<current-verified-short-path>`.
7. Rebuild desktop shortcuts using ASCII paths when shell link encoding corrupts Chinese paths.

## Installation and Reinstallation

Use this order unless the vendor manual says otherwise:

1. Install Microsoft common runtimes, especially VC++ x86/x64 packages needed by the software.
2. Install device/camera libraries such as IKapLibrary when the package uses visual positioning.
3. Extract PrintExp to a short, stable path. Avoid garbled ZIP extraction paths.
4. Preserve `Config`, `Data`, `RIP_SDK2`, `Printer`, `ICC Profile`, and customer calibration folders.
5. Create shortcuts only after verifying direct EXE launch.
6. Verify with nozzle test, communication test, and a known-good print file.

## Common Chinese Search Terms

Use these terms when current information or vendor-specific guidance is needed:

- 工业级 平板 UV 打印机 常见故障 解决方法
- UV平板打印机 喷头堵塞 断墨 拉丝 解决
- UV打印机 飞墨 重影 偏色 附着力 差
- UV平板打印机 白墨 沉淀 循环 堵头
- UV打印机 光栅 编码器 小车 报警
- UV打印机 负压 墨路 气泡 过滤器
- PrintExp_X64 0xc000007b mfc100
- 汉森 Hoson PrintExp 打印软件 打不开

## Safety Boundaries

- Do not instruct a user to bypass interlocks, defeat UV shielding, or operate with covers removed.
- UV lamps can injure eyes/skin; do not recommend exposure.
- Many cleaning fluids are flammable or hazardous; use vendor-approved fluid, ventilation, gloves, and disposal.
- Printhead electrical work should be power-off and ESD-safe.
- Firmware, waveform, voltage, and factory parameters can damage heads; escalate unless the user provides vendor settings.
