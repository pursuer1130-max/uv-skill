---
name: industrial-uv-print-troubleshooter
description: UV prepress and Hoson PrintExp scanning, template fitting, verification and explicitly authorized printing on the current device.
---

# UV 视觉打印助手

维护源为当前核实的仓库副本中的 plugins/industrial-uv-print-troubleshooter，通过 uv-print 市场安装。安装缓存仅用于加载。开始工作时从该 Skill 目录执行 scripts/uv_site_readonly.ps1 -Action LoadCheck 和 node scripts/uv_hybrid.cjs license；文件完整性与运行许可检查须通过。公开包不包含本机许可证、私钥、客户资料或历史动作授权；发布范围见 [发布说明](references/public-package.md)。

## 当前工作规则

- 需求明确就执行；关键歧义才逐轮询问一个问题，以约95%的理解为收敛目标，不虚构精确置信值。同一未变化作业已有授权和人工测高事实复用，不为填标志重复询问。
- 默认只读。用户明确请求的扫描、框选、验证或单次打印是对应动作授权；权限、现场事实和当前设备状态仍须成立。观察生产期间不抢焦点、不修改队列或参数；日志不证明物理完工。
- 操作前选取唯一、真实返回的当前窗口并核对 EXE、状态、控件和新鲜图像；Computer Use 先读其 skill。每个动作只消费一次命令 ID，未知结果先查同一 ID，不重发扫描或打印。保留原生联锁和现有适配器校验，不强启用按钮。
- 历史 height-safety/height-transition 软件锁及旧跨机器复核已永久退役；旧记录不能阻断当前动作。扫描高度字段不能推导实际 Z、材料高或净间隙，不沿用历史数值为默认。实际 Z 按新鲜状态观察；不改驱动、固件或设备联锁。
- 图稿用副本，提交前检查 DPI、颜色/专色通道与贴合。当前模板、图稿、选择或扫描图改变后重新验证；检查全部已加载模板，识别数量与逐件配图均须核对。文件预检通过不等于视觉识别或打印质量通过。
- 模板数据根可能不同于 EXE 根，应从当前实际模板/配置核实，不把历史盘符作为默认。客户图稿、订单、密码、原始日志、临时坐标及历史动作授权不进入通用知识。

## 按任务读取

| 当前任务 | 只读取所需资料 |
|---|---|
| 常规扫描、建模、贴图、验证、打印 | [快速流程](references/fast-print-workflow.md)，动作细节查 [扫描及模板](references/visual-scan-compat.md) / [单次打印](references/visual-selection-print.md) |
| 减少 token、等待或重复输出 | [经济执行](references/economy-workflow.md)：本地摘要/等待，图像决策才交给 AI |
| 新知识保存、本地刷新 | [自动学习](references/automatic-learning.md)；先检索 [已核实目录](knowledge/validated/index.md)，仅新增可复用且核实的事实，无新结论不改版本 |
| 多模多图、一模多图 | 先检索知识目录相关记录；静态资源不是已执行操作。绑定、分配及模板竞争未知项保留未知，不借用多层打印或动态循环规则 |
| 生产中被动学习 | [生产只读](references/production-log-learning.md)，仅限量脱敏读取，不做 GUI 输入 |
| 波形、电压、厂家页 | [波形研究](references/printexp-waveform-study.md)；候选文件不等于板卡读回，不凭文件名推荐电压/间隙；更改须有对应资格、任务授权和厂家依据 |
| Photoshop 制图/导出 | [批量制图](references/photoshop-batch-workflow.md)；启动故障查 [Photoshop 恢复](references/photoshop-startup-recovery.md) |
| RIP、传输、计划执行 | [Master 工作流](references/uv-master-workflow.md)：Detect→Read→Validate→Simulate→Confirm→Execute，复用当前明确授权，不捏造确认；未知接收端不发送 |
| 扫描失败、导入失败 | [扫描诊断](references/scan-maintenance-workflow.md) / [快速故障短路](references/fast-print-workflow.md)，先查实际失败项，不循环试点 |
| 本地部署、历史高度记录 | [本地部署](references/local-deployment.md) / [退役记录](references/height-lock-retirement.md) |
| 其他墨路、固化、喷头、色彩故障 | [诊断流程](references/diagnosis-flow.md)、[文件/RIP](references/rip-and-file-checks.md)、[生产问题](references/production-issues.md)，按问题选择 |

新且已验证的可复用结论按 references/automatic-learning.md 在当前用户授权范围内保存。保存前脱敏、去重、审核证据并备份；不将现场许可、客户资料或临时设备状态写入公开仓库。代码与核心规则变更仅在明确维护任务中进行。

历史入口与机器档案未随公开包分发；历史日期、路径、许可或设备数值不能替代当前现场依据。
