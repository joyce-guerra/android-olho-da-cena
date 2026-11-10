const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = '/workspace/gravador-video';
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gobj-'));
  const app = await _electron.launch({ args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, GRAVADOR_TESTE_DADOS: tmp + '/d', GRAVADOR_TESTE_DOCUMENTOS: tmp + '/D',
      GRAVADOR_TESTE_VIDEO: '/tmp/gravador-teste-midia/centrado.y4m', GRAVADOR_TESTE_MIC: '/tmp/gravador-teste-midia/mic.wav' } });
  const w = await app.firstWindow();
  for (let i = 0; i < 100; i++) { if (await w.evaluate(() => window.__gravador && window.__gravador.pronto)) break; await new Promise(r => setTimeout(r, 200)); }
  const OB = require(RAIZ + '/src/objetos');
  for (const modelo of (process.env.MODELOS || 'efficientdet_lite0_float16.tflite').split(',')) {
    console.log('==', modelo);
    for (const f of fs.readdirSync(RAIZ + '/test/e2e/fotos-objetos').filter(f => f.endsWith('.jpg')).sort()) {
      const b64 = fs.readFileSync(RAIZ + '/test/e2e/fotos-objetos/' + f).toString('base64');
      const r = await w.evaluate(async ({ b64, modelo }) => {
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
        await window.__gravador.trabalhador('objetosTeste', { bitmap: bmp, modelo }); // aquece
        const bmp2 = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
        return window.__gravador.trabalhador('objetosTeste', { bitmap: bmp2, modelo }, [bmp2]);
      }, { b64, modelo });
      const brutos = r.objetos.filter(o => o.score >= 0.3).map(o => `${o.rotulo}:${o.score.toFixed(2)}`).join(' ');
      console.log(f, Math.round(r.ms) + 'ms |', OB.descreverObjetos(r.objetos).texto, '|', brutos);
    }
  }
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
