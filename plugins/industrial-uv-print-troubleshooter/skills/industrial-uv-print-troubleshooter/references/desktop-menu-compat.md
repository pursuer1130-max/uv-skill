# Windows 10 desktop compatibility: original menu verification

For the later visual-control, file-dialog and scan-only additions, read `visual-scan-compat.md`. The menu tests and restrictions below describe the initial menu-only release; actual printing and parameter writes remain absent.

This adapter uses the documented Computer Use `launch_app`/window-selection APIs to start a small, visible, one-shot application in the interactive desktop. The application reads UI Automation and captures only the visible target's top 185 pixels with GDI. It prefers a matching top-row UIA SelectionItem/Invoke pattern; otherwise it uses one native mouse down/up at a freshly inspected top-row point. This does not repair the bundled Computer Use screenshot API and does not connect a print/camera/board protocol.

Verified on the current onsite PrintExp build: switching **常规打印, 设置, 校准, 电压, 高级**. 高级 displays a password area; authentication and protected functions were not attempted. Opening a calibration or voltage page does not mean calibration/voltage control is verified. The application implements no print start, scan, calibration execution, value setting, save, reset, emergency stop, cleaning, firmware, driver, or device commands.

## Portable runtime

Keep the verified repository copy as the maintenance source. Use `Stage-DesktopCompat.ps1 -OutputParent <existing-isolated-local-directory>` from `adapters/printexp/desktop-compat/` to create and hash-check a fresh local runtime. It copies four declared files and launches nothing. Never use a production hot folder for the output parent. Do not run directly in the USB source: transient commands and reports belong to the isolated copy.

Runtime dependencies: 64-bit interactive Windows desktop; installed .NET Framework 4.x assemblies (Windows Forms, Drawing, Web Extensions, UIAutomationClient/Types and WindowsBase); Node.js 18+ only for preparing commands. PowerShell is used for staging/building; the current onsite PowerShell 7.6.5 policy permits those scripts. Do not change execution/security policies when a runtime refuses a script. `Build-DesktopCompat.ps1` rebuilds the included C# with the installed Framework64 compiler without downloading or installing anything. No npm/Python packages or network services are used.

The executable has a **read-only default**, and consumes each command ID at most once. An explicit `selftest` clicks only its own test button. Self-test success is not real printer validation.

## Observe, then perform one approved navigation

1. Rediscover the current unique PrintExp window through Computer Use. Do not reuse a saved handle or a device-specific installation path. Confirm the selected actual executable and exact UI version/layout.
2. In the isolated runtime, prepare a read-only observation:
   `node prepare-command.cjs capture --target-exe <fresh-absolute-PrintExp_X64.exe>`.
3. Start the staged `UVMenuCompat.exe` with Computer Use `launch_app`. Select the unique returned PrintExp window and activate it. The helper waits for that exact executable in the foreground, records `runs/<id>/before.png` and `result.json`, then exits. Inspect the screenshot and current page before any navigation. Captured window size and executable SHA-256 are part of the command checks.
4. For an explicitly requested top-row page only, prepare:
   `node prepare-command.cjs navigate "设置" <observed-x> <observed-y> <fresh-capture-id> --target-exe <fresh-absolute-PrintExp_X64.exe>`.
   Allowed names are 常规打印, 设置, 校准, 电压, 高级. Coordinates are current-window physical pixels. The current adapter accepts only the observed top navigation band, y=25..85; the machine toolbar lies below it on the tested layout. Never copy the old site's coordinates onto another machine or rescaled layout. If the layout does not fit, stop for a reviewed adapter change.
5. Start the staged helper and activate the same freshly selected target again. It verifies the executable hash, dimensions and exact current header image, then issues one navigation input and captures `after.png`. Verify the selected tab **and** corresponding page controls using fresh accessibility state. Header change alone is not proof of success. Password/authentication prompts remain untouched.
6. Before the next page, take and inspect a new `capture`. Focus/highlight changes can legitimately invalidate an old header hash. `HEADER_CHANGED_REOBSERVE_REQUIRED` sends no target input; inspect its `before.png` or take a fresh capture before preparing another command. No automatic retry is implemented. Any uncertain or partial input result requires observation before another command.

Commands expire after two minutes at startup. A changed foreground, unknown target, replayed ID, unsupported action/page, invalid navigation point, changed binary/window/header or partial input stops the helper. Closing the visible helper cancels a waiting attempt. It times out if the exact target does not become foreground. Do not elevate it, change interlocks/security settings, or launch a second production app to obtain access.

## Evidence and limitations

After approved work, write redacted evidence and reviewed adapter changes to the explicit USB master using its existing backup, temporary write, hash-check and integrity-index workflow. The live command file, target-path scratch file and generated command IDs are not portable defaults. This adapter grants no future job authorization and does not unlock or replace the original device-bound licence or production safety gateway.
