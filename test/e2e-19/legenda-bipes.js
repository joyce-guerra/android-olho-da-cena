'use strict';
// Bipes de andamento: download lento (servidor local devagar) e transcrição pelo Wine.
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const RAIZ = process.argv[2], MIDIA = process.argv[3], SERVIDOR = process.argv[4];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
(async () => {
  // Servidor que manda o modelo em 12 segundos, para dar tempo de ouvir os bipes.
  const servidor = http.createServer((req, res) => {
    const f = path.join(SERVIDOR, path.basename(req.url));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const st = fs.statSync(f); res.writeHead(200, { 'content-length': st.size });
    if (!/\.bin$/.test(f)) return fs.createReadStream(f).pipe(res);
    const fd = fs.openSync(f, 'r'); const passo = Math.ceil(st.size / 60); let pos = 0;
    const t = setInterval(() => { const b = Buffer.alloc(Math.min(passo, st.size - pos)); fs.readSync(fd, b, 0, b.length, pos); pos += b.length; res.write(b); if (pos >= st.size) { clearInterval(t); fs.closeSync(fd); res.end(); } }, 200);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-bp-'));
  const audio = path.join(tmp, 'conto.mp3'); fs.copyFileSync(path.join(MIDIA, 'conto.mp3'), audio);
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_WHISPER_BASE: `http://127.0.0.1:${servidor.address().port}`, OLHO_TESTE_WHISPER_WINE: '1' } });
  const w = await app.firstWindow();
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const bipes = (tipo) => w.evaluate((t) => window.__gravador.bipes.filter((b) => b.tipo === t).length, tipo);
  await ate(() => window.gravarTela && window.olho); await espera(1000);
  await w.evaluate((a) => window.gravarTela.abrirLegenda({ audio: a, nome: 'conto', aoTerminar: () => {}, aoVoltar: () => {} }), audio);
  await clicar('lg-com-modelo'); await ate(() => !document.getElementById('lg-baixar').hidden);
  await clicar('lg-baixar-pequeno');
  await ate(() => !document.getElementById('lg-gerar').hidden, null, 120000);
  const nAnd = await bipes('andamento'), nFim = await bipes('concluido');
  ok('bipes durante o download (uns 12 segundos: pelo menos 2)', nAnd >= 2, nAnd);
  ok('bipe de concluído no fim do download', nFim === 1, nFim);
  await espera(5000);
  ok('depois do download, os bipes param', (await bipes('andamento')) === nAnd);
  await clicar('lg-transcricao');
  await ate(() => /Transcrição salva/.test(document.getElementById('lg-gerar-estado').textContent), null, 600000);
  ok('bipes durante a transcrição', (await bipes('andamento')) > nAnd + 2, (await bipes('andamento')) - nAnd);
  ok('bipe de concluído no fim da transcrição', (await bipes('concluido')) === 2);
  await app.close(); servidor.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
