# 已验证的产品验证能力

本次客户现场：操作员手动框选，框内有两个相邻产品；代理没有执行拖拽框选。20:41:14 通过当前控件 ID、按钮截图哈希、窗口大小及目标程序哈希检查后，向“产品验证”发送一次鼠标按下/抬起。20:41:16 新软件日志报告当前模板成功识别 2 个产品。模板名称已脱敏。此结果证明软件产品验证响应，不证明成品质量或物理打印。

## 可复用执行方式

先用 USB 的 Stage-DesktopCompat.ps1 将四个运行文件校验并暂存到隔离本机目录。使用 Computer Use 的当前窗口枚举结果和文档化 launch_app/activate_window；禁止沿用历史窗口句柄。原生截图错误及回退原因见 visual-scan-compat.md。

1. 只读执行 prepare-command.cjs capture-controls --target-exe <本次重新识别的完整路径>，启动暂存的 UVMenuCompat.exe，激活真实目标窗口，读取本次 runs/<ID>/result.json。必要时 capture-view 可供临时本机观察；完整视图可能包含客户图稿，禁止随记录回写 U 盘。
2. 人工完成框选后，确认本次授权、软件空闲、扫描可用且取消未启用；检查实际选区和产品，不使用旧截图替代当前观察。
3. 准备命令：node prepare-command.cjs verify-product <当前观察ID> --product-verification-authorized --target-exe <当前完整路径>。这是单次明确动作，不随插件加载执行。
4. 启动同一隔离 helper 并激活同一真实窗口。程序核验 17075 / 产品验证 的唯一性、可用性、按钮哈希及窗口状态，发送一次点击后退出。
5. 从新鲜软件日志核对本次时间、识别数量及错误。input_returned_requires_dialog_verification 只是输入返回，必须追加独立结果读取。失败或输入结果不明禁止重试；先观察，不发复位、急停或恢复。

不实现打印启动、自动框选、参数写入、热文件夹投递或原始设备协议。曾编译但未执行的 print-once 草稿未进入本发行版允许列表；它不是已验证功能。现有扫描和区域代码保留，按 visual-scan-compat.md 的独立授权条件执行。任何新电脑、设备、软件版本或布局均须重新识别和验证。

