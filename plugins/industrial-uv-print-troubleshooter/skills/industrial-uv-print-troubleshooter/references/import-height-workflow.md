# Confirmed height and TIFF texture workflow

## 历史高度软件锁永久退役（2026-10-14，优先于本文件后文）

操作员明确确认旧机器与当前机器无关、当前机器已人工定位并处于安全范围，并要求永久删除不适配新机器的高度保护功能。已退役插件自行保存的 height-safety / height-transition 历史扫描、打印、Z 定位锁及扫描字段必须等于 Z 的绑定。旧案例原文件保持为历史档案；其存在、缺失、损坏或数值不同均不构成当前动作阻断。Stage 不再把旧记录复制为运行锁，prepare 和原生程序也不读取这些锁。--device-review 路线已退役，后文的跨机器单次复核要求仅描述旧版本。

当前授权和人工测高确认按同一未变化作业复用；实际 Z 通过新鲜主状态栏或 Z 面板读回观察。扫描高度字段只检查本次观察后未改变，不能推导实际 Z、材料高或净间隙。继续保留 EXE 身份、当前窗口及空闲状态、新鲜控件和图像、明确动作授权、一次性命令消费、产品验证及模板/选择绑定、Z 手动输入语义校验。打印机原有联锁、驱动、固件和运动设置不作变更。当前设备状态未知、忙碌、控件禁用或参数变化仍按真实接口停止受影响动作。

详见 [高度锁退役记录](height-lock-retirement.md)。

USB is the master. LoadCheck, verified backup and fresh staging precede tests. Use the currently returned PrintExp window; template editor is a separate returned window. Activate that editor while handling its file dialog. Never infer command success from sent input.

## Height

Use capture-controls then open-z-panel <observation> --z-panel-authorized. capture-z-panel reads numeric fields and saves only the panel. Before set-z-target and position-z-once, reuse current unchanged-job operator facts for actual total material height, gap, coordinate meaning/direction, origin/limits/anti-collision and readiness; obtain only any missing or changed fact. Both commands take a fresh capture ID, --height-action-authorized --operator-ready --coordinate-semantics-confirmed --limits-confirmed --thickness-mm <actual> --gap-mm <actual> --approved-target-mm <explicit>. Thickness+gap must equal the explicitly approved target. Target edit is exactly 118; positioning button exactly 109; readback text exactly 110. Do not operate reset, homing, automatic height detection, up/down or offsets. Read back target before positioning and actual position afterwards. Ask operator to verify real clearance/outcome. One input attempt; no blind retry. close-z-panel <fresh-capture> --z-panel-close-authorized uses Exit, not Save Exit. The positioning attempt is logged only inside its current run; it creates no permanent motion lock. The scan field is checked against its own unchanged current observation, never equated with Z. Current operator height facts and fresh actual Z readback remain separate.

## Texture import

Main visual page 导入 (17098) imports a template package; a standalone TIFF failed with 无法识别的模板目录！. For ordinary TIFF, capture-controls and open-template-editor <id> --editor-navigation-authorized. Select the returned independent 编辑模板 window. capture-template-editor then open-texture-import <id> --texture-import-navigation-authorized uses the exact 导入贴图 button 17071 within that editor (not the main page's 导入扫描图). Current file filter is 图片文件 (*.tif;*.pdf;*.ai), but this adapter currently admits TIFF .tif signatures only. PDF/AI import has not been tested.

Import temporarily overwrites the current template TIFF before Save. For future tests obtain explicit permission for a temporary local artwork backup, identify the matching template file, and choose a fresh directory outside all watchers and the USB. Run node scripts/uv_template_guard.cjs snapshot --target-file <template.tif> --out <new-isolated-dir> --local-artwork-backup-authorized --isolated-directory-confirmed. Keep its local guard manifest private. If permission or backup is absent, stop before submission.

Use capture-import-dialog; fill-import-file <capture> --texture-import --import-authorized --import-only-no-print --file <authorized.tif>. Reobserve filename/file hash, then a fresh capture-import-dialog; submit-import-once <capture> with the same flags and --template-guard <local-guard.json>. All commands require --target-exe <currently-discovered-PrintExp_X64.exe>. The adapter checks exact dialog/filter/IDs, file signature and hash, current ready status and original/backup hashes before one Open click. Do not pass file dialogs shell commands.

After submission inspect actual preview and errors. File import does not certify matching scale, product shape, alignment, RIP or printable output. The TIFF import test did not save, align, verify products or print. A separate later scan is described below. To finish a reversible test, select the exact returned template editor and close with Alt+F4, inspect any prompt without assuming its answer, then run guard verify and compare original hashes. This version restored its vendor temporary copy on unsaved exit; a changed hash or missing original stops the workflow. Do not issue machine recovery commands or silently rewrite production files.

## Later single-product scan: unresolved height mismatch

At this site one authorized scan of regions 1~3 was sent after set-scan-height <fresh-controls-id> --scan-height-authorized --operator-ready --approved-height-mm 9. The field write was read back as 9; scan ended normally and the operator confirmed actual motion. Afterward Z readback was 7.10 mm, confirmed by the operator. Reopening Z still showed target 9 and actual 7.10. The root cause is unknown. Do not equate an edit-field value with physical position, or assume Save Exit resolves it. The old 56-product count was not current evidence. Further selection/verification/printing was not performed.

Latest onsite user report: manual positioning can reach 9 mm. Record this as manually confirmed capability; automatic positioning-plus-scan remains unverified. The user requested USB-only closeout due to remaining usage, so no further device tests or plugin-cache refresh were performed.

Z 面板观察额外记录当前同 PID 的唯一 PrintExp 主窗口身份、mainWindowObserved/mainWindowEnabled、activeJobState 及来源原因。只读捕获可以报告 unknown；set/position 要求新鲜且明确 idle 的主窗口观察，并在原生发令前重读。主窗口因模态禁用、父链矛盾或主作业控件无法可靠读取时记 unknown，不能从子控件全禁用推断 idle。
