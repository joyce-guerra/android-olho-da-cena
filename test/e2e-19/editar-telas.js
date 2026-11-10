'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-et2-'));
  fs.copyFileSync(path.join(MIDIA, 'pessoa-leg-som.mp4'), path.join(tmp, 'v.mp4'));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, path.join(tmp, 'v.mp4'));
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const visiveis = () => w.evaluate(() => [...document.querySelectorAll('label, legend, h2, button')].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim().slice(0, 50)).join(' | '));
  await ate(() => window.gravarTela && window.olho); await espera(800);
  await clicar('ir-cortar'); await clicar('ed-adicionar'); await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-video');
  await ate(() => /Tem pessoa|Não achei pessoa/.test(document.getElementById('ed-an-info').textContent), null, 300000);
  await clicar('ed-an-continuar'); await espera(800);
  console.log('TELA FUNDO:', await visiveis());
  await w.check('#efeito-borrar'); await clicar('mel-continuar');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video, null, 60000); await espera(500);
  console.log('TELA ÁUDIO:', await visiveis());
  await app.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
