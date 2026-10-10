# Windows 安装

适用于 Windows 10 / 11、Windows PowerShell 5.1+、已登录的 Codex 桌面客户端与 Node.js 24+。安装器自动查找 Microsoft Store / 普通桌面版客户端、CLI 和客户端 Node；找不到 Node 时需自行安装 Node 24。

1. 完整解压 `CodexOrbit-Windows-0.4.2.zip`。
2. 双击 `Install.cmd`。安装当前用户后台，不需要管理员权限。
3. 保存工作，从托盘或菜单完全退出 Codex，再从原来的图标打开，等待自动加载。

图标固定在帮助／头像区域上方；外圈优先显示 5 小时余量，没有该额度窗口时改为周余量；四点始终表示周余量。启动助手只尝试正常重开刚启动、前台且尚未操作的客户端，已打开的会话不接管。首次操作过快而跳过时，完全退出后使用 `Launch.cmd`。Microsoft Store 的手动启动入口可能不支持直接执行，优先使用原图标。

- `Status.cmd`：查看后台、位置、额度与更新状态。
- `Update.cmd`：立即检查并升级。
- `Uninstall.cmd`：停止本工具后台，清理本工具组件，将工具保留为可恢复备份；不删除登录与聊天。

安装位置：`%LOCALAPPDATA%\CodexOrbit`。后台每 6 小时检查本项目 GitHub Windows Releases，下载更高版本并校验发布 SHA-256 清单、GitHub 资产摘要（提供时）、ZIP 路径和包内每个文件。升级失败恢复原版本，更新不退出当前 Codex 会话。

可通过 PowerShell `-Action UpdatesOff` / `UpdatesOn` 关闭或开启自动更新。安装时可以指定 `-AppExe`、`-NodeExe`、`-CodexBin`、`-CodexHome`，参数留空自动发现。入口仅对当前 PowerShell 进程设置脚本执行策略，不改变系统或企业策略；受策略限制时需遵守设备管理员要求。

调试连接仅使用 `127.0.0.1:39222`，可访问该端口的本机程序可能控制客户端，请勿转发端口。后台不解析账号密钥，不采集聊天，不上传额度；原生输入观察只保留事件种类与时间，不保留按键内容。

当前开发机器是 macOS：Windows ZIP 已生成，跨平台运行逻辑已测试；Windows 原生 CI 已通过脚本解析、C# 编译、输入分类与 ZIP 校验；完整安装、Store 自动启动和真实客户端定位仍需使用者验收。不要将打包或模拟界面结果视为已在真实 Windows Codex 中安装成功。
