'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 400) : ''}`); if (!c) falhas++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-im-'));
  const imgs = ['foto-pessoa.png', 'foto-escura.png', 'img1.png'].map((f) => { fs.copyFileSync(path.join(MIDIA, f), path.join(tmp, f)); return path.join(tmp, f); });
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  await app.evaluate(({ dialog }, fs_) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: fs_ }); }, imgs);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  await ate(() => window.gravarTela && window.olho); await espera(800);
  await w.evaluate(() => { document.getElementById('ir-gerar').click(); document.getElementById('btn-imagens').click(); });
  ok('descrição falada depois do nome e da proporção', await ate(() => /foto-pessoa\.png: Imagem/.test(document.getElementById('status').textContent), null, 120000), await w.textContent('#status'));
  const t = await w.textContent('#status');
  ok('três imagens, uma a uma, com rosto e cores', /foto-pessoa\.png: Imagem .*Tem um rosto/.test(t) && /foto-escura\.png: Imagem (bem )?escura.*Possível objeto, sem certeza: mala/.test(t) && /img1\.png: Imagem .*steel|azul/.test(t), t);
  const lista = await w.textContent('#lista-imagens');
  ok('a lista traz a descrição de cada uma', (lista.match(/Imagem /g) || []).length === 3, lista.slice(0, 300));
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
