'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Services are callbacks so rollback can be verified without touching the real client.
async function replaceInstallation({live,stage,stop,start,probe,restoreExternal=()=>{}}){
  if(path.dirname(live)!==path.dirname(stage)||!path.basename(stage).startsWith(path.basename(live)+'.staging-'))throw Error('Invalid install stage');
  const backup=live+'.backup-'+crypto.randomUUID(),failed=live+'.failed-'+crypto.randomUUID();
  let moved=false,swapped=false;
  try{
    await stop();
    if(fs.existsSync(live)){fs.renameSync(live,backup);moved=true;}
    fs.renameSync(stage,live);swapped=true;
    await start({rollback:false});await probe();
    return {backup:moved?backup:null};
  }catch(error){
    try{await stop();}catch{}
    if(swapped)fs.renameSync(live,failed);
    if(moved)fs.renameSync(backup,live);
    await restoreExternal();
    if(moved)await start({rollback:true});
    throw error;
  }
}
module.exports={replaceInstallation};
