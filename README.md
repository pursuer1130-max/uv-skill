# UV 视觉打印助手（U盘版）

面向 Windows 上 UV 平板打印作业的 Codex Skill 与插件，支持图稿预检、Photoshop 制版、Hoson PrintExp 视觉扫描、建模贴图、产品验证及当前明确授权的单次打印。

版本：0.1.3。本仓库是从 U 盘维护源整理出的公开发布副本；原 U 盘源和设备配置保持原状。

## 收费与设备授权

**人民币 999 元/台，一次性设备授权。** 每台使用设备需单独获得匹配的有效许可证，沿用现有签名与设备校验机制。

该 999 元设备授权的在线收款渠道正在接入，目前尚未开通在线购买入口。仓库不提供自动扣费或自动发放设备许可证。购买与授权事宜请[联系维护者](https://github.com/pursuer1130-max)另行确认。完整说明见 [收费说明](PRICING.md)。

## 安装

需要支持插件市场的 Codex 客户端。添加本仓库市场并安装：

```powershell
codex plugin marketplace add pursuer1130-max/uv-skill
codex plugin add industrial-uv-print-troubleshooter@uv-print --json
```

也可以先克隆或下载完整仓库，执行 codex plugin marketplace add <仓库根绝对路径>，再执行上述安装命令。保留 .agents/plugins/marketplace.json 和完整 plugins/ 目录。安装结构依据 [OpenAI 官方插件打包文档](https://developers.openai.com/plugins/build/plugins)。

在聊天中选择插件，或明确使用 $industrial-uv-print-troubleshooter 并说明当前任务。

## 运行前检查

进入 plugins/industrial-uv-print-troubleshooter/skills/industrial-uv-print-troubleshooter，执行：

```powershell
.\scripts\uv_site_readonly.ps1 -Action LoadCheck
node scripts/uv_hybrid.cjs license
```

公开包不带任何客户或本机许可证，第二条命令在未配置许可时应返回 LICENSE_MISSING。请由许可签发方另行提供匹配的签名许可证，放入该 Skill 的 license/ 目录；签名私钥不得放入仓库。原有专有许可声明保留，公开可见不等于开源授权。

## 能力与运行环境

- 核心文件处理：Node.js 18+，使用内置模块；无需新增 npm 依赖。
- Windows 现场工作：实际安装的软件、当前真实窗口和对应设备；桌面兼容器依赖 x64 Windows 与 .NET Framework 4.x。
- Photoshop、PrintExp、RIIN、相机软件和厂商驱动由使用者自行提供，按当前安装版本重新核实。
- 可选 Python 制图/许可工具分别需要 Pillow 或 cryptography。默认完整性检查不依赖 Python。

默认只读。扫描、框选、验证和打印分别遵守当前任务授权；命令仅消费一次，不因未知结果自动重发。现场图像、模板或材料变化后重新验证，保留打印机原生联锁。软件日志不能证明物理完成或最终质量。

## 目录

- .agents/plugins/marketplace.json：可安装的仓库市场入口。
- plugins/industrial-uv-print-troubleshooter/.codex-plugin/plugin.json：插件元数据。
- plugins/industrial-uv-print-troubleshooter/skills/industrial-uv-print-troubleshooter/：技能入口、通用参考、脚本、适配器和隔离测试。
- plugins/industrial-uv-print-troubleshooter/maintenance/site-20260916/integrity.json：公开副本的文件校验索引；沿用原工具约定的索引路径，内容为本次发布文件。

## 发布范围

本机许可、私钥、客户图稿、订单、截图、原始日志、机器配置、历史授权及现场知识记录已排除。厂商 RIIN/ICC/曲线/DPF 素材不随包分发；具体范围见 [发布说明](plugins/industrial-uv-print-troubleshooter/skills/industrial-uv-print-troubleshooter/references/public-package.md)。

本仓库发布不代表进入 OpenAI 官方插件目录，也不代表其他机器已通过现场验证。

## 验证

从 Skill 目录运行 node --test tests/*.test.cjs 可执行本发布包所附隔离测试。它们检查文件预检、许可拒绝、命令时效与一次性消费、日志脱敏和既有运行守卫；不执行真实扫描或打印。

维护者：[pursuer1130-max](https://github.com/pursuer1130-max)。源码声明：Proprietary，见 [LICENSE](LICENSE)。

仓库创建时的项目介绍保存在 [原始项目说明](docs/PROJECT-OVERVIEW.md)。
