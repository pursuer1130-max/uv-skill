# 默认只读流程

插件根 Start-UV-ReadOnly.cmd 只执行文件完整性检查，不启动生产应用、不修改任务、队列或参数。维护源与安装缓存分开，运行回执保存在当前本地非监听工作目录。

从 Skill 根执行 scripts/uv_site_readonly.ps1 -Action LoadCheck。当前已有策略不允许执行时保留源文件并报告，不更改系统策略。需要清单时显式使用 -Action Inventory：只读注册表、文件、进程与系统元数据，无法访问的信息保持 unknown。

node scripts/uv_site_preflight.cjs file <已授权的测试副本> 检查文件签名、稳定哈希和 PSD 头边界；许可检查仍适用。Photoshop 实际打开、DPI、ICC 与专色通道语义另外核实。node scripts/uv_site_preflight.cjs readiness <inventory.json> 只生成就绪摘要，发现所有程序也不会自动产生设备授权。

观察到进程、窗口或日志增长不能证明实际任务进度、板卡就绪、物理喷印或成品质量。扫描、框选、验证与打印按各自参考和当前明确授权执行，命令结果未知时不重发。

记录区分 observed、documented、executed 和 physically_verified。客户图稿、订单、截图、原始日志、许可证、设备标识和临时坐标留在授权的本地工作区，不写入公开插件或 GitHub。新知识仅在当前用户授权范围内，经脱敏、去重与证据审核后保存。
