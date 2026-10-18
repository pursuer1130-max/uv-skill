# 经济执行流程

目标：减少重复上下文、屏幕树回传和等待轮次；不以关闭图像/状态校验或提高机械速度换取提速。

1. 任务开始仅加载 SKILL 路由、该任务对应参考和一次完整性/许可证结果。长参考用 rg 定位所需段落，不整篇反复读取。软件路径和模板位置在未变化会话内复用；设备输入的窗口、图像、状态和时效仍按原执行器重新校验。
2. 常规作业使用现有确定性适配器，按依赖顺序执行。独立文件预检可并行；设备输入保持单通道，不把相互依赖的动作盲目串成点击宏。
3. `uv_economy.cjs` 是只读状态摘要和命令回执等待器，不是新打印控制器。CLI 用 `summary --file <result.json绝对路径>`；等待用 `wait --runtime <暂存根绝对路径> --id <已有命令ID> --timeout-ms 45000`。它不启动软件、不发设备命令、不调用模型或网络。
4. 在原来的 `uv_desktop_session.dispatch` 返回 pending/started 后，用本地等待器检查同一 ID。一次最多45秒，超时返回待处理，不能重派扫描或打印。这个工具等待的是适配器回执，不是打印机物理完工；长时间机械扫描仍按当前 UI / 脱敏日志有限观察。
   长扫描可在已初始化的 Computer Use 会话中用 `waitForChange` 注入只读观察回调：回调仅调用 `sky.get_window_state`（不含截图），经 `compactTree` 提取固定控件状态。最多45秒内由本地循环观察，有变化再返回 AI；缺控件、异常或超时停止，不进行下一次设备输入。前后仍按原适配器的新鲜证据要求执行。
5. 对摘要用 delta 比较：无变化只保留本地记录，有变化或需图像判断才回传。需要新状态证据时仍调用原 capture，不凭旧摘要驱动下一次输入。摘要不携带模板名、客户路径、坐标、原始日志或截图。
6. 关键图像检查点保留：扫描后整体清晰度、贴图贴合及全部产品配图、异常窗口。其余只读取必要状态/回执，不重复输出整棵 UI 树。截图不可用时保留已有原生捕获路线，不连续失败重试。
7. 常用图稿复用已合格模板和导出参数；文件/材料/扫描条件改变后重新验证。只有新的可复用结论才触发自动保存和插件刷新，避免每次打印重新研究或安装。

已初始化 Computer Use 并取得唯一真实窗口后，可在 node_repl 中一次等待状态变化（`eco` 是本地 `uv_economy.cjs` 模块）：

```js
const readCompact = async () => {
  const state = await sky.get_window_state({window, include_screenshot:false, include_text:true});
  window = state.window;
  return eco.compactTree(state.accessibility?.tree);
};
const previous = await readCompact();
nodeRepl.write(JSON.stringify(await eco.waitForChange(readCompact, previous, {timeoutMs:45000, pollMs:2000})));
```

这里只读控件变化。回调不得加入点击、按键、提交或重试；返回变化后再按任务读取必要图像。工具不负责当前窗口重新发现和动作授权。

该方案不需要新增 API 付费、订阅、软件或硬件。仍会消耗本次 AI 会话用量；本地摘要与等待部分不调用 AI。节省幅度以输入文本长度、工具回传字节及实际任务耗时衡量，不编造 token 单价、账单或全流程加速百分比。扫描、RIP、喷印和固化的硬件时间不能由精简上下文消除。
