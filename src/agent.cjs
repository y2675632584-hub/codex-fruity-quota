async function runOrbit({ port = 39222, appPath, codexBin, scanMs = 5000, pollMs = 60000 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('无效的本机端口');
  const executable = resolveCodexBin(codexBin, appPath);
  const injector = new RendererInjector({ port });
  let client = null, stopped = false, ticking = false, reading = false, nextRead = 0, lastGood = null;
  let lastPlacement = '';
  async function readUsage() {
    if (stopped || reading || !injector.sessions.size || Date.now() < nextRead) return;
    reading = true;
    try {
      if (!client) {
        const current = new AppServerClient({ command:executable, requestTimeoutMs:20000 });
        client = current;
        current.on('rate-limits', payload => {
          if (client !== current || stopped) return;
          const value = sanitizeOrbitUsage(payload);
          lastGood = value;
          injector.update(value).catch(() => {});
        });
        current.on('server-exit', () => {
          if (client === current) { client = null; nextRead = Date.now() + 30000; }
        });
        await current.start();
        if (stopped) current.stop();
      } else await client.refresh();
      nextRead = Date.now() + pollMs;
    } catch {
      const old = client; client = null; old?.stop();
      nextRead = Date.now() + 30000;
      await injector.update(lastGood ? { ...lastGood, status:'stale' } : { fiveHour:null,weekly:null,resetCount:null,status:'unavailable' });
      // Never print upstream errors, which can contain account information.
    } finally { reading = false; }
  }
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await injector.scan().catch(() => {});
      if (!injector.sessions.size) {
        const old = client; client = null; old?.stop(); nextRead = 0;
        if (lastGood) injector.currentValue = { ...lastGood, status:'stale' };
      }
      const placed = [];
      for (const session of injector.sessions.values()) {
        try { placed.push((await session.evaluate('window.__codexOrbit?.status() ?? null')).result?.value?.placed === true); }
        catch { placed.push(false); }
      }
      const state = placed.some(Boolean) ? 'placed' : injector.sessions.size ? 'unsupported-layout' : 'waiting';
      if (state !== lastPlacement) {
        console.log(state === 'placed' ? '额度环已插入侧栏。' : state === 'unsupported-layout' ? '已连接，但未找到导航栏插槽；请运行诊断。' : '等待客户端的本机调试连接。');
        lastPlacement = state;
      }
      try { require('node:fs').writeFileSync(require('node:path').join(__dirname,'runtime-state.json'),JSON.stringify({version:AGENT_VERSION,state,updatedAt:Date.now()}),{mode:0o600}); } catch {}
      readUsage().catch(() => {});
    } finally { ticking = false; }
  }
  const timer = setInterval(tick, scanMs);
  const stop = () => {
    stopped = true; clearInterval(timer); const old = client; client = null; old?.stop(); injector.stop();
  };
  process.once('SIGTERM', () => { stop(); process.exit(0); });
  process.once('SIGINT', () => { stop(); process.exit(0); });
  if (process.env.CODEX_ORBIT_STOP_FILE) {
    const stopTimer=setInterval(()=>{if(require('node:fs').existsSync(process.env.CODEX_ORBIT_STOP_FILE)){clearInterval(stopTimer);stop();process.exit(0);}},200);
  }
  await tick();
  return { stop, injector };
}
module.exports = { installQuotaOrbit, sanitizeOrbitUsage, isCodexLimit, runOrbit,
  AppServerClient, RendererInjector, CdpSession, isMainWindow, buildBootstrapScript, mergeRateLimitsResponse, resolveCodexBin };
if (require.main === module) {
  if (process.argv.includes('--once')) {
    const options = process.platform === 'win32' ? {app:process.env.CODEX_ORBIT_APP,codexBin:process.env.CODEX_ORBIT_BIN,port:Number(process.env.CODEX_ORBIT_PORT||39222)} : JSON.parse(require('node:fs').readFileSync(process.env.CODEX_ORBIT_CONFIG || require('node:path').join(__dirname,'settings.json'),'utf8'));
    const client = new AppServerClient({command:resolveCodexBin(options.codexBin,options.app),requestTimeoutMs:20000});
    client.start().then(() => console.log(JSON.stringify(sanitizeOrbitUsage(client.rateLimits),null,2)))
      .catch(() => { console.error('额度读取失败，请确认 Codex 登录状态。'); process.exitCode=1; })
      .finally(() => client.stop());
  } else {
    const options = process.platform === 'win32' ? {app:process.env.CODEX_ORBIT_APP,codexBin:process.env.CODEX_ORBIT_BIN,port:Number(process.env.CODEX_ORBIT_PORT||39222)} : JSON.parse(require('node:fs').readFileSync(process.env.CODEX_ORBIT_CONFIG || require('node:path').join(__dirname,'settings.json'),'utf8'));
    runOrbit({ appPath:options.app, codexBin:options.codexBin, port:options.port ?? 39222 }).catch(() => {
      console.error('额度环后台无法启动，请运行诊断。'); process.exitCode=1;
    });
  }
}
