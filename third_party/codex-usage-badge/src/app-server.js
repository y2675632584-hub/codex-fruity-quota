class AppServerClient extends require('node:events').EventEmitter {
  constructor({command='codex', args=['app-server'], requestTimeoutMs=10000}={}) {
    super(); Object.assign(this,{command,args,requestTimeoutMs});
    this.child=null; this.lines=null; this.pending=new Map(); this.serial=0; this.rateLimits=null;
  }
  async start() {
    if (this.child) return;
    const child=require('node:child_process').spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],windowsHide: true,env:process.env});
    this.child=child;
    const fail=error=>{
      if (this.child!==child) return;
      this.stop(); this.emit('server-exit',error);
    };
    child.once('error',fail);
    child.once('exit',(code)=>fail(new Error(`App Server exited (${code})`)));
    child.stdin.on('error',fail);
    child.stderr.resume(); // Drain without recording account/server details.
    this.lines=require('node:readline').createInterface({input:child.stdout});
    this.lines.on('line',line=>{
      let message; try { message=JSON.parse(line); } catch { return; }
      if (!message || typeof message!=='object') return;
      const request=this.pending.get(message.id);
      if (request) {
        this.pending.delete(message.id); clearTimeout(request.timer);
        message.error ? request.reject(new Error(message.error.message || 'App Server request failed')) : request.resolve(message.result);
      } else if(message.method==='account/rateLimits/updated') {
        this.rateLimits=mergeRateLimitsResponse(this.rateLimits,message.params);
        this.emit('rate-limits',this.rateLimits);
      }
    });
    await this.request('initialize',{clientInfo:{name:'codex_usage_badge',title:'Codex Usage Badge',version:AGENT_VERSION}});
    this.child?.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    await this.refresh();
  }
  request(method,params) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error('App Server is not running'));
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},this.requestTimeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,method,...(params===undefined?{}:{params})})+'\n',error=>{
        if(error && this.pending.delete(id)){clearTimeout(timer);reject(error);}
      });
    });
  }
  async refresh() {
    this.rateLimits=mergeRateLimitsResponse(null,await this.request('account/rateLimits/read'));
    this.emit('rate-limits',this.rateLimits); return this.rateLimits;
  }
  stop() {
    const child=this.child; this.child=null;
    this.lines?.close(); this.lines=null;
    if(child && !child.killed) child.kill();
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('App Server stopped'));}
    this.pending.clear();
  }
}
