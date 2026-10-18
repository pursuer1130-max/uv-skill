# Photoshop Desktop Session Recovery

Use this for no-window Photoshop, startup exit -1073741790 (0xC0000022), or COM MK_E_UNAVAILABLE. Local test: Photoshop 2021, version 22.5.9, Windows, 2026-09-11.

## Verified Route

1. Read the installed computer-use skill and its guidance. Use `mcp__node_repl__js` with `@oai/sky` for native Windows apps. The browser-only `cua` API is not evidence that native computer-use is unavailable.
2. Initialize `sky`, inspect `sky.list_windows()`, and attach to a returned Photoshop window when present. If absent, use `sky.launch_app({app: <installed Photoshop.exe path>})`, then refresh the returned windows. This machine's path is `C:\Program Files\Adobe\Adobe Photoshop 2021\Photoshop.exe`. Discover the installation on another machine.
3. Select exactly one returned Photoshop window and inspect its state. Do not infer readiness from a process existing. Handle any actual startup dialog according to its observed content.
4. Use the execution tool's approved `require_escalated` route to run the USB script `scripts/photoshop_session.ps1 -Action open` as the interactive Windows user. This does not require launching Photoshop as administrator. The local sandbox identity `CodexSandboxOffline` could not attach to the user's COM object and could not start Photoshop normally.
5. Run reviewed artwork with `scripts/run_ps_batch.ps1 -BatchScript <absolute JSX path>` through the same approved execution route. The wrapper uses Windows PowerShell 5.1, checks the COM connection and a visible main window, and reports script duration.
6. For an end-to-end test, run `scripts/ps_smoke_test.jsx`. It creates a unique desktop `PS_Ready_Test_<timestamp>` folder with a layered PSD, RGB TIFF and PNG at 1200 x 1200 pixels / 600 ppi. It closes and reopens its PSD, checks layers and dimensions, and leaves the saved document available in Photoshop. Decode TIFF/PNG and inspect the preview before reporting success. `COMPLETE.txt` is written only after the PSD reopen check.

## Avoid Repeated Failed Fixes

- `Start-Process`, including normal-window mode under the interactive user through this execution host, failed to establish a usable desktop Photoshop window. Use the verified native desktop launch API instead.
- A sandbox access-denied startup does not prove that Adobe's user-profile ACLs are damaged. Do not grant broad Adobe-directory permissions, disable the sandbox, reset preferences or reinstall Photoshop based on this symptom alone. The successful route required none of these changes.
- Do not use repeated `New-Object -ComObject Photoshop.Application` activation. Attach to the ready user-owned desktop session instead.
- Do not terminate existing Photoshop processes solely because they have no main window. Preserve user work. Only close a known task-owned session after verifying it contains no user documents.
- The helper fails explicitly when the caller is a sandbox account or native desktop launch is still required. It must not silently report a failed background launch as success.

This establishes desktop startup and scriptable document operations, not a claim that every Photoshop menu, third-party filter, or print workflow was tested. Record further capability only after execution and output verification.

Executed on 2026-09-11: desktop relaunch succeeded twice; COM returned 22.5.9; the USB smoke test completed in 12880 ms, saved PSD/TIFF/PNG, and reopened its seven-layer PSD at 1200 x 1200 / 600 ppi. The existing `desktop_uv_helper.ps1 -Action open-photoshop` entry then reported PS_READY with one document and a visible main window. A native screenshot confirmed the circle and editable text layers in the Photoshop workspace.
