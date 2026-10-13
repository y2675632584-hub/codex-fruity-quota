# Windows 安装

适用于 Windows 10 / 11、Windows PowerShell 5.1+、已登录的 Codex 桌面客户端与 Node.js 24+。安装器自动查找 Microsoft Store / 普通桌面版客户端、CLI 和客户端 Node；找不到 Node 时需自行安装 Node 24。

## 第一次安装：双击 Install.cmd

1. 在 GitHub 的 **Windows Release → Assets** 下载 **CodexOrbit-Windows-0.5.3.zip**。不要选 macOS 包，也不要选 GitHub 自动附带的 Source code 源码包。
2. 右键 ZIP → **全部解压**。不要在压缩包预览里直接运行文件。
3. 打开解压后的 **CodexOrbit-Windows-0.5.3** 文件夹；如果还有一层同名文件夹，继续打开，直到看到 **Install.cmd**。
4. **双击 Install.cmd，开始安装。** 如果 Windows 隐藏扩展名，它可能只显示为 **Install**，文件类型为“Windows 命令脚本”。保持整个文件夹完整，不要单独移动这个文件。
5. 等窗口出现 **“安装成功”**，再按任意键关闭。出现错误或仅出现“请按任意键继续”不代表安装成功；保留窗口里的错误信息。
6. 保存当前工作，完全退出 Codex（包括托盘中的 Codex），再从原来的 Codex 图标打开，等待约 5–10 秒。额度图标应出现在左侧栏帮助／头像上方。

安装当前用户后台，不需要管理员权限。使用前先正常打开并登录 Codex；安装器找不到 Node 时会提示，需安装 Node.js 24+ 后重新运行 Install.cmd。

## 文件怎么点

| 文件或文件夹 | 用途 | 什么时候打开 |
| --- | --- | --- |
| **Install.cmd** | **安装** | **第一次安装双击这个文件** |
| Launch.cmd | 手动打开 Codex 并加载额度条 | 安装成功后未自动加载时使用，先完全退出 Codex |
| Status.cmd | 查看安装和运行状态 | 检查是否安装成功、后台是否运行 |
| Update.cmd | 立即检查更新 | 已安装后升级 |
| Uninstall.cmd | 卸载额度条 | 想移除本工具时使用 |
| README-Windows.md | 本安装说明 | 需要了解步骤时查看 |
| startup 文件夹 | 后台组件 | 保留完整，无需手动打开里面的文件 |
| agent.cjs、manage-windows.ps1 等 | 程序组件 | 保留完整，无需直接双击 |
| SHA256SUMS.txt | 校验信息 | 程序使用，无需双击安装 |

图标固定在帮助／头像区域上方；外圈优先显示 5 小时余量，没有该额度窗口时改为周余量；底部连续线始终表示周余量。启动助手只尝试正常重开刚启动、前台且尚未操作的客户端，已打开的会话不接管。首次操作过快而跳过时，完全退出后使用 `Launch.cmd`。Microsoft Store 的手动启动入口可能不支持直接执行，优先使用原图标。

- `Status.cmd`：查看后台、位置、额度与更新状态。
- `Update.cmd`：立即检查并升级。
- `Uninstall.cmd`：停止本工具后台，清理本工具组件，将工具保留为可恢复备份；不删除登录与聊天。

安装位置：`%LOCALAPPDATA%\CodexOrbit`。后台每 6 小时检查本项目 GitHub Windows Releases，下载更高版本并校验发布 SHA-256 清单、GitHub 资产摘要（提供时）、ZIP 路径和包内每个文件。升级失败恢复原版本，更新不退出当前 Codex 会话。

可通过 PowerShell `-Action UpdatesOff` / `UpdatesOn` 关闭或开启自动更新。安装时可以指定 `-AppExe`、`-NodeExe`、`-CodexBin`、`-CodexHome`，参数留空自动发现。入口仅对当前 PowerShell 进程设置脚本执行策略，不改变系统或企业策略；受策略限制时需遵守设备管理员要求。

调试连接仅使用 `127.0.0.1:39222`，可访问该端口的本机程序可能控制客户端，请勿转发端口。后台不解析账号密钥，不采集聊天，不上传额度；原生输入观察只保留事件种类与时间，不保留按键内容。

当前开发机器是 macOS：Windows ZIP 已生成，跨平台运行逻辑已测试；Windows 原生 CI 已通过脚本解析、C# 编译、输入分类与 ZIP 校验；完整安装、Store 自动启动和真实客户端定位仍需使用者验收。不要将打包或模拟界面结果视为已在真实 Windows Codex 中安装成功。

## 对话 Token

将鼠标移到侧栏对话条目上，显示今日与累计 Token 两行，数值以千／万／亿缩写，移出隐藏。点击额度图标开关。只读本地记录，不调用模型。额度图标底部是连续周额度线，详情页提供 5 小时／本周横向进度条。
