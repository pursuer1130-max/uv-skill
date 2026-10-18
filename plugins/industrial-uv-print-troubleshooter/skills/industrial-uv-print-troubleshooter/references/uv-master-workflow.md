# UV Master 增量工作流

这些模块扩展现有 Skill。核心运行仅依赖 Node.js 内置模块、Windows PowerShell 5.1 和实际安装的软件；不安装 Python 或第三方 npm 包。

## 运行入口

从当前 Skill 目录执行，路径有空格时加引号。作业根目录必须是本地、未被 RIP 监控的新目录。

```powershell
node scripts/uv_hybrid.cjs license
node scripts/uv_master.cjs discover
node scripts/uv_master.cjs job --root <本地作业目录>
node scripts/uv_master.cjs plan --job <返回的作业目录> --request <请求JSON> --mode SIMULATION_MODE
node scripts/uv_master.cjs execute --plan <返回的计划文件>
node scripts/uv_master.cjs simulate --job <作业目录> --file <生成的TIFF>
```

Photoshop 低 DPI 示例请求：

```json
{"adapter":"Photoshop","action":"prepress","args":{"demo":true,"dpi":72,"white":true,"varnish":true}}
```

客户图稿使用 `input` 绝对路径，省略 `demo`。可选 `resize:[像素宽,像素高]`、`canvas:[像素宽,像素高]`、`dpi`、`colorMode`、`profile`。只改 DPI 时不重采样；CMYK 必须提供明确 ICC 配置名称。输出始终新建，源文件哈希前后检查。批量时对每份请求创建独立 Job，依次执行；旧 `ps_print_batch.jsx` 的排版和智能对象能力继续保留。

`w`、`v` 示例为附加灰度蒙版，黑色表示示例覆盖区域，不宣称已匹配机台专色。已有 `ps_print_batch.jsx` 仍可准备 `UV_WHITE` 专色。正式生产须检查 RIP 的通道名称、类型、极性和分色预览，不能只改名称。

## 软件发现

`uv_discover.ps1` 按运行进程、注册表 App Paths/卸载信息、开始菜单/桌面快捷方式、Program Files、盘根软件目录发现路径。便携软件藏在其他目录时，用 `-SearchRoots <实际目录>` 补充，不全盘无限扫描。记录产品/文件版本及发现来源；EXE 版本资源不代替“关于”窗口。多安装目录保留候选，不自动选择。未发现标记 unavailable；扫描上限和系统查询失败进入 warnings。

发现过程不启动 PrintExp、RIIN、IKap，不发网络探测数据，只读本机现有 TCP 表和 PnP 状态。PrinterBoard 缺少实时应用证据时为 unknown。9100 配置、9100 监听、RIP 接收、物理打印是四种不同证据。

## 安全执行

每个 Adapter 提供 detect/capabilities/read_state/validate/execute_safe_action/collect_result/handle_error。

| 等级 | 执行条件 |
|---|---|
| READ_ONLY | 自动允许；可以产生本地观察日志 |
| FILE_CHANGE | 必须新副本或已验证备份；观察模式不做图稿修改 |
| SOFTWARE_CONTROL | 授权软件控制上下文、前后状态与日志；客户生产中停在人工确认 |
| PRINT_JOB | 生产模式、具体操作员确认、已准备机台；模拟模式不执行外部动作 |
| MACHINE_PARAMETER | 同上；当前仅有清洗 GUI 适配，其他硬件参数无执行入口 |
| FIRMWARE / BOARD_WRITE | 默认禁止，无执行适配器 |

`plan` 完成 Detect、Read、Validate、Simulate，并输出参数及请求哈希。生产输出的 Confirm 必须记录用户/现场操作员对该具体计划的授权，不能由代理捏造：

```powershell
node scripts/uv_master.cjs confirm --plan <计划> --operator <操作员> --statement <具体确认内容>
node scripts/uv_master.cjs execute --plan <计划> --approval <返回的确认文件>
```

确认绑定电脑、请求及计划哈希，有时效，只能消费一次。计划也只能尝试一次。软件状态变化、超时或结果不明时先读状态和作业输出，重新制定计划；不直接重放。网关属于本 Skill 的协作执行边界，不是防止本机管理员改代码的操作系统安全隔离。

### PrintExp

- `ini_preview` 只读。`ini_apply` 参数包含 `ini`、原文件 `sha256`、`stopped:true`、`noPendingJobs:true`、`softwareControlAuthorized:true`。程序再次检查运行进程和原文件哈希，备份后仅修改 TCP_IP，保留板卡 COMM_CONFIG。测试电脑目前没有实际应用配置修改。
- `send` 参数包含 `file`、`sha256`、`host`、`port`；`evidence` 记录协议、资料来源、打印机/板卡型号、`formatVerified`、`preparedMachine`、`receiverIsPrintSoftware`。TIFF/PSD 等原稿另需明确支持原稿接收的证据；通常应先 RIP。PRN/PRT 扩展名不能证明格式兼容。
- 实际生产发送还必须核对当前 PrintExp 接收端、版本、机台连接和队列。禁止直接向未知板卡发送数据。传输仍使用旧 Node net 模块，连通前最多三次重试；连通后任何异常标记 unknown_no_auto_retry。TCP 完成不等于任务接收或打印完成。
- `launch` 也需要确认，因为启动可能恢复监控或队列。`pause/resume/cancel/clean` 需要具体目标 Job、准备状态及当前可用控件；清洗另需 maintenanceReady。不把取消当作暂停。

GUI 使用已安装 Windows computer-use 的 node_repl 会话。先读其 Skill，初始化 `sky`，使用真实返回的窗口。用 `createRequire` 加载当前 USB 路径下 `adapters/printexp/sky.cjs`，得到 `gui=provider(sky)`。`gui.read(window)` 返回当前树、哈希和时间；观察后选择真实启用控件，生成计划。调用 `uv_master.execute(plan,{approvalFile,registry,gui})`。执行前再次读树并比对，只点击一次，然后读回结果。没有可访问性树或权限不兼容时停止自动按钮操作，保留现场操作员/截图观察路线，不复用历史坐标。

### RIIN

优先官方 API > 已验证热文件夹/文件交换 > CLI/IPC > GUI。是否安装以当次发现结果为准；API、实际 RIP 与监听目录均须在当前安装上核实，见 `factory-rehearsal.md`。`stage` 记录输入哈希、参数、预期输出、验证来源及输出模式；在确认部分文件不会被监控后，使用 Job ID 命名，通过临时文件和同目录改名投递。投递本身属于 PRINT_JOB，因为热文件夹可能自动输出。

`collect` 只接受该 Job 已记录的精确 expectedOutput，检查文件稳定和哈希，记录结果。关联不明确、文件仍在写入、出错或授权无效时停止，不重复投递。模拟模式只写作业自己的 simulation 目录，不写真实 RIIN 热文件夹。不修改许可证。

### IKap

先读 SDK/DLL、设备枚举信息及已经保存的相机图像；`read_capture` 把文件哈希、来源和可选视觉分析关联到 Job。软件启动、设备连接和开始采集不是同一动作。相机实时采集和标定需真实相机及对应 SDK 文档验证，当前未实现自动改参，也不把本地图片读取当成相机采集成功。

## 学习和恢复

每条学习记录必须有 source、scope、observation。`learn --record <JSON> --knowledge-root <USB现有Skill/knowledge>` 先写 raw。`promote --id <ID> --review <JSON> --knowledge-root <同一路径>` 要求审核人、原因、证据；保留 raw。机器和材料参数不自动应用。知识来自文件/文档/软件测试，不能泛化成生产标准。

读取 `knowledge/errors/catalog.json` 对应问题即可，不必整库加载。`diagnose --category <分类> --evidence <JSON>` 分别返回 confirmedCauses、probableCauses、pendingCauses。confirmed 记录必须有来源和验证说明。

执行报错后查看该 Job 的 job.json、events.jsonl 和输出文件。有完成文件但调用超时时，先验证文件；不要重新启动制图。文件和日志保留，下一次使用新 Job。敏感键和常见凭证串会脱敏；不要把原始授权文件或密码粘进观察字段。

## 新电脑验证顺序

1. 打开实际 USB 插件目录为 Codex 项目，运行根目录 Connect-UVUSB.ps1；先看 usb_source、write_check、cache 三项结果。换盘符自动发现，有多盘匹配才指定 UsbRoot。沙箱拒绝仍需按实际权限处理，脚本不会修改系统安全设置或权限。
2. 默认 OBSERVE_MODE，验证本地许可证、软件路径/版本、控制插件是否实际可调用。客户生产中仅观察。
3. 在未监控的本地目录运行 Photoshop 副本制图、重开检查和 simulate。运行 `node --test tests/uv_master.test.cjs` 检查网关。
4. 生产空闲时由现场人员确认 RIIN 授权、机型/墨水/ICC、文件输出模式、热文件夹、PRN/PRT 格式和 PrintExp 接收设置。先做纯文件 RIP，并核对分色与尺寸。
5. 确认 PrintExp 已停止且无待发任务后，审阅并应用监听配置；确认启动，再验证 0.0.0.0:9100 和归属 PID。不要为了方便把防火墙开放给所有网络。
6. 准备试材，确认机台/板卡型号、清空运行区域及机台操作条件，对具体 Job 人工确认后才做首次真实传输。检查队列实际接收，再按厂家规程验证打印、暂停/继续/取消和清洗。
7. 实测记录放 raw，首件和视觉结果经审核后才提高验证等级；未验证功能保持 REQUIRES_REAL_MACHINE_TEST。
