const { _electron } = require('playwright');
const fs=require('fs'),os=require('os'),path=require('path');
const RAIZ='/workspace/olho-da-cena', MIDIA='/tmp/gravador-teste-midia';
const espera=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
for (const clipe of process.argv.slice(2)) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cab-'));
  const app=await _electron.launch({args:['--no-sandbox',RAIZ],cwd:RAIZ,env:{...process.env,OLHO_TESTE_DADOS:tmp+'/dados',OLHO_TESTE_DOCUMENTOS:tmp+'/Doc',OLHO_TESTE_VIDEO:(clipe.startsWith('/')?clipe:path.join(MIDIA,clipe+'.y4m')),OLHO_TESTE_MIC:MIDIA+'/mic.wav'}});
  const w=await app.firstWindow();
  const ate=async(f,ms=60000)=>{const t=Date.now();while(Date.now()-t<ms){if(await w.evaluate(f))return true;await espera(150);}return false;};
  await w.evaluate(() => document.getElementById('ir-gravar').click()); await ate(()=>window.__gravador&&window.__gravador.pronto);
  await w.evaluate(()=>{window.__gravador.ultimoEnquadramento=null;});
  await w.keyboard.press('Alt+KeyE');
  await ate(()=>!!window.__gravador.ultimoEnquadramento);
  const r=await w.evaluate(()=>{const u=window.__gravador.ultimoEnquadramento;return {t:u.texto,c:u.dados.cabelo,g:u.entrada.cabelo,r:u.entrada.rostos};});
  console.log(clipe, r.t, JSON.stringify(r.c), JSON.stringify(r.r)); if(process.env.GRADE&&r.g){for(let y=0;y<r.g.gh;y++){let l='';for(let x=0;x<r.g.gw;x++){const v=r.g.grade[y*r.g.gw+x];l+=v>0.5?'#':v>0.2?'+':'.';}console.log(l);}}
  await app.close(); fs.rmSync(tmp,{recursive:true,force:true});
}})();
