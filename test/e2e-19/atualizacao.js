'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto');
const RAIZ = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
const versaoAtual = require(path.join(RAIZ, 'package.json')).version;
(async () => {
  const dados = crypto.randomBytes(300000);
  const sha = crypto.createHash('sha256').update(dados).digest('hex');
  let cenario = { versao: '99.0.0', sha256: sha };
  const servidor = http.createServer((req, res) => {
    if (req.url.startsWith('/atualizacao.json')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ versao: cenario.versao, arquivo: 'Olho-da-Cena-Setup-99.0.0.exe', sha256: cenario.sha256, tamanho: dados.length, notas: 'Teste.' })); }
    if (req.url.startsWith('/Olho-da-Cena-Setup-99.0.0.exe')) { res.writeHead(200, { 'content-length': dados.length }); return res.end(dados); }
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const url = `http://127.0.0.1:${servidor.address().port}/atualizacao.json`;
  const abrir = async (tmp) => {
    const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
      env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'), OLHO_TESTE_ATUALIZACAO: url } });
    const w = await app.firstWindow();
    return { app, w };
  };
  const ate = async (w, f, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f)) return true; await espera(200); } return false; };
  // 1) versão nova: aparece o aviso e o botão
  let tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-at-'));
  let { app, w } = await abrir(tmp);
  ok('versão nova: o bloco de atualização aparece', await ate(w, () => !document.getElementById('atualizacao-bloco').hidden, 20000));
  const info = await w.textContent('#atualizacao-info');
  ok('diz a versão nova, a atual e que projetos e configurações ficam', /99\.0\.0/.test(info) && /Seus projetos e configurações ficam/.test(info), info);
  await w.click('#atualizacao-instalar');
  ok('baixa e confere o setup', await ate(w, () => /baixada e conferida/.test(document.getElementById('status').textContent), 30000), await w.textContent('#status'));
  const arq = path.join(os.tmpdir(), 'olho-da-cena-atualizacao', 'Olho-da-Cena-Setup-99.0.0.exe');
  ok('o setup está no disco, igual ao do servidor', fs.existsSync(arq) && crypto.createHash('sha256').update(fs.readFileSync(arq)).digest('hex') === sha);
  await app.close();
  // 2) assinatura errada: recusa
  try { fs.unlinkSync(arq); } catch (_) { /* */ }
  cenario = { versao: '99.0.0', sha256: '0'.repeat(64) };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-at-')); ({ app, w } = await abrir(tmp));
  await ate(w, () => !document.getElementById('atualizacao-bloco').hidden, 20000);
  await w.click('#atualizacao-instalar');
  ok('assinatura errada: recusa e avisa', await ate(w, () => /diferente do esperado/.test(document.getElementById('status').textContent), 30000), await w.textContent('#status'));
  ok('assinatura errada: nada fica no disco', !fs.existsSync(arq));
  await app.close();
  // 3) mesma versão (ou menor): nenhum aviso
  cenario = { versao: versaoAtual, sha256: sha };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-at-')); ({ app, w } = await abrir(tmp));
  await espera(7000);
  ok('mesma versão: nenhum aviso', await w.evaluate(() => document.getElementById('atualizacao-bloco').hidden));
  await app.close(); servidor.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
