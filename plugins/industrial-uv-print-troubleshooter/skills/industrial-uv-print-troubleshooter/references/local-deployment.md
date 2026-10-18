# 安装与维护源

安装方法见仓库根 README.md。GitHub 市场名称为 uv-print；插件身份为 industrial-uv-print-troubleshooter@uv-print。

维护源为当前核实的仓库副本中的 plugins/industrial-uv-print-troubleshooter。安装缓存只用于加载，不作为维护源。U 盘盘符和其他设备上的历史目录均不是默认值。

在 Skill 根执行 scripts/uv_site_readonly.ps1 -Action LoadCheck，核对发布索引；再执行 node scripts/uv_hybrid.cjs license。运行许可由签发方另行提供，license 目录不能存放私钥。

运行暂存目录和作业目录使用本地、非 RIP 监听目录。按当前软件状态、设备状态和作业授权执行，原生设备联锁保持有效。重新安装使用 codex plugin add industrial-uv-print-troubleshooter@uv-print --json。
