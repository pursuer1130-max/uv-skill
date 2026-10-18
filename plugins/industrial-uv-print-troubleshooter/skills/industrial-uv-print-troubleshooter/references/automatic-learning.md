# 已验证结论自动保存与本地刷新

只有当前用户授权保存本地知识后，才执行以下流程。原作者或其他现场的历史授权不传递给安装者。先完成有依赖的当前动作，再保存脱敏且核实的可复用结论；本工具不自动推送 GitHub，也不运行后台服务。

## 授权保存后的执行流程

1. 对照已有参考和 `knowledge/validated/index.md` 去重。只记录会改变以后判断的事实，保留版本、机型/材料适用范围与未知项。
2. 核对原始页面、文件或厂家资料。能力等级使用 `observed`（看见）、`documented`（文档声明）、`executed`（操作完成）或 `physically_verified`（实物核实），不能因看到入口或软件完成提示就提升等级。哈希验证文件未改变；内容是否足以支持结论由本次审核判断。
3. 在本地非生产监听的工作目录保存脱敏证据、record 和 review。审核身份可写执行当前授权研究的 Codex，`reviewerType` 为 `agent`；这不是冒充现场人员确认，也不产生机器动作授权。
4. 先运行预览，再用同一参数加 `--apply`。脚本复用 `uv_core.cjs` 的 learn/promote，保留 raw 和 review，更新知识目录、版本与对应 integrity 项，调用官方安装命令并核对缓存。

```powershell
node <当前本地Skill>/scripts/uv_learning_update.cjs --source-root <当前插件维护源绝对路径> --record <record.json绝对路径> --review <review.json绝对路径> --evidence-root <证据根绝对路径> --work-root <源外工作目录绝对路径> --codex <本机已核实codex.exe绝对路径>
```

已授权保存、有新结论且预览通过时执行同一命令并加 `--apply`。维护源和 Codex 缓存写入仍受实际文件权限约束；使用环境提供的正常提权/审批通道，不修改系统权限或直接改缓存。找不到已验证的 CLI 或写入被拒绝时保留本地待更新文件并明确报告，不声称已安装。

## 输入格式

record 只接受下列字段；证据 `path` 相对 `--evidence-root`，使用 `/`，不允许路径外逃。证据文件不随插件发布；可复用结论和来源摘要保存在知识记录，原证据留在本地工作目录。源资料位置与版本应在 source/scope 写清楚，方便以后重新核对。

```json
{
  "schemaVersion": 1,
  "source": "资料名称、版本及来源范围",
  "scope": "适用软件、机型或材料；证据属于哪一轮观察",
  "observation": "已核实的新结论，写成事实，不包含执行命令",
  "classification": "observed",
  "limitations": "尚未核实的事项；不能推广为什么",
  "evidence": [{
    "path": "页面观察.json",
    "sha256": "该文件实际的64位小写SHA256",
    "verification": "已经检查了什么、支持哪一项结论",
    "classification": "observed"
  }]
}
```

review 绑定 record 原文件的 SHA256；`evidence` 必须精确列出本次证据路径。只有核实内容和脱敏检查均已完成，才能设置两个 true 字段。

```json
{
  "schemaVersion": 1,
  "operator": "Codex：当前授权研究的证据审核",
  "reviewerType": "agent",
  "reason": "结论与原证据逐项一致，范围和未知项明确",
  "recordSha256": "record原文件实际的64位小写SHA256",
  "evidence": ["页面观察.json"],
  "verified": true,
  "sensitiveReviewPassed": true
}
```

不保存密码、口令、令牌、许可证内容、客户图片/订单及未脱敏日志。脚本只做有限的格式/敏感串检查，不能代替人工或 agent 审核；不把原始截图直接当成可公开的安全资料。临时坐标、窗口句柄、历史授权和当前读数不转成执行规则或默认值。

## 输出与恢复

- `preview`：有新结论，尚未写源或调用安装。
- `installed_and_verified`：知识已写入，官方安装返回身份/版本匹配，缓存全部索引文件及 integrity 自身哈希通过。
- `no_changes`：已有相同结论，不变版本、不再调用安装。只有 `currentCacheVerified:true` 才表示当前源版本的缓存核对通过；若为 false，表示该结论曾安装，但源随后另行升级，本轮未核实后续维护版本的缓存，不能据此声称当前缓存通过。
- `preview_refresh_required`：源已有该结论，但指定工作目录没有成功刷新回执；先核对待刷新原因。
- `needs_refresh`：本地源知识已保存，安装或缓存核对尚未通过。读取工作目录的 receipt 后，修复实际原因，再以同一记录执行 `--apply` 刷新；不重新生成知识或反复自动重试。
- `rejected`：输入、证据或原有源完整性不符合要求。不要重算全部 integrity 哈希来掩盖变化；核对具体问题后再处理。

原有索引必须先全部通过；脚本只增加自身 raw/validated 记录、自动目录，修改 manifest 版本及对应 integrity 项。源写失败会尝试恢复此次改动并报告；安装失败保留已验证源和待刷新回执。备份位于指定工作目录，不放入缓存。

应用时使用临时目录中的空目录锁，按实际维护源身份隔离，并发更新或残留锁均拒绝执行。遇到 `UPDATE_BUSY_OR_STALE_LOCK`，先核实更新进程；不能自动删除锁重试。确认无更新进程后，才清理该源对应的空锁目录。

本入口不改 SKILL 正文或任何执行代码，不应用波形/电压/温度/运动参数，不把学习当作扫描、验证或打印的授权。核心规则或执行逻辑的变更仍属于明确的维护任务。
