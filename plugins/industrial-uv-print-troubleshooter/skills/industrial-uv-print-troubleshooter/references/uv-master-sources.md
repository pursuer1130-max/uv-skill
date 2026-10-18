# 技术来源及引入边界

查阅日期：2026-09-11。未下载执行第三方项目代码，未复制整个仓库，无新增 npm/Python 依赖。

- Adobe 官方支持 Photoshop 脚本自动化。本次沿用已验证的 Windows COM + ExtendScript 接口，把请求参数、独立副本和导出重开验证分离；不要求 Photoshop 2021 支持较新版本的 UXP 合约。[Adobe 脚本说明](https://helpx.adobe.com/photoshop/using/scripting.html)
- Windows-first Photoshop MCP 项目展示了 COM/ExtendScript、注册表发现和结构化状态设计。本次仅借鉴接口优先、能力状态、真实软件测试的组织方式。[项目说明](https://github.com/Vaxaxas/photoshop-mcp-windows-first)，[MIT 许可证](https://github.com/Vaxaxas/photoshop-mcp-windows-first/blob/main/LICENSE)。没有把 MCP 名称写成“已连接”。
- Hoson 社区实现记录了 RIP 向 PrintExp 的 9100 接收端投递以及 project.ini 的监听地址调整。它是特定环境的一手实现记录，不是所有板卡的官方协议；没有发现可据此通用构造板卡指令的依据。仓库首页未显示明确代码许可，所以不复制代码或附带字体。[dounix/hoson](https://github.com/dounix/hoson)
- RIIN 用户手册由厂商提供；官方 PDF 地址在本轮抓取时未完整解析，因此不从搜索摘要推定本机菜单或参数。旧工厂记录引用的本地 RIIN 手册说明了文件输出、网络输出与热文件夹启用的区别，本次保留此证据边界，等待具体安装现场复核。[厂商手册入口](https://en.hosonsoft.com/uploads/Driver/Help/help-Eng.pdf)，[已有工厂记录](public-package.md)。厂商文档仅引用，不重新分发全文。
- I-TEK 官网提供 Windows SDK、相机/采集卡 C 和 .NET API 文档以及 IKapCViewer 手册。本次仅发现本机 DLL、EXE、PnP 信息并建立文件图像入口，未下载 290 MB SDK、调用未知设备函数或更改参数。[I-TEK 官方软件资源](https://www.i-tekvision.com/list_down_common.php?c_id=192)

这些资料支持分层架构和验证路线，不构成真实打印验收。所有执行代码为本次在原 Skill 上增量编写，原有专有许可证保持不变。
