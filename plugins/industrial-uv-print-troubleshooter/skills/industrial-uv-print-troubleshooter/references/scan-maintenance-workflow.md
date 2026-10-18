# 扫描状态诊断与当前设备依据

## 一次汇总状态

从当前本地工作区运行：

```powershell
node <local-skill>/scripts/uv_scan_readiness.cjs --runtime <local-staged-runtime> --operator-record <current-session-record.json> --out <new-local-report.json>
```

可选 --site-state <local-skill>/site-config/height-safety.json 只读取历史档案来源。诊断无设备输入、命令或放行能力，永远返回 motionAuthorizedByAssessment=false。运行目录、现场记录和输出须在当前工作区，输出不能覆盖或位于 runtime 内。工具不跟随输入 JSON 中路径。

输出分别显示档案出处、当前主窗口/任务状态、实际 Z 面板读回、定位目标输入和扫描字段；三种数值不能互相代替。缺失/过期当前软件数据保持 unknown/stale，设备就绪文字不能填补任务状态。诊断不解析状态栏 Z 文本，其缺少 Z 面板数值仅作观察建议，可用新鲜 capture-footer 及实际查看读回替代；不成为历史高度软件锁。

## 命令准备与异常处理

每次准备先取得独占锁，将旧 command.json 原样移入 superseded-commands，验证成功才原子提交新命令。抢锁或归档失败时不启动 helper；不得自动删锁或重播归档命令。只有退出码为 0、返回 ID 与 command.json 一致且本请求无已发令证据时才启动 helper。运行程序遇到准备锁或已消费 ID 继续拒绝。发令结果不明确先读取结果与软件状态，不自动重试。

复用当前作业已给出的人工定位/测高和就绪确认，同时刷新当前唯一 PrintExp 主窗口、EXE/进程和控件证据。capture-controls 保留 mainWindowEnabled、activeJobState、进程/窗口/EXE 哈希；capture-footer 可观察实际 Z，无需反复打开 Z 面板。主窗口因模态禁用、任务忙碌或软件报相机等接口故障时停止相关流程。不要自动重启 PrintExp、结束进程、关闭未知提示框或做设备恢复。
