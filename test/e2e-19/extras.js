'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const RAIZ = process.argv[2], MIDIA = process.argv[3], SERVIDOR = process.argv[4];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 400) : ''}`); if (!c) falhas++; };
(async () => {
  const servidor = http.createServer((req, res) => { const f = path.join(SERVIDOR, path.basename(req.url)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-length': fs.statSync(f).size }); fs.createReadStream(f).pipe(res); }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-ex-'));
  const audio = path.join(tmp, 'minha fala.wav'); fs.copyFileSync(path.join(MIDIA, 'mic-conto.wav'), audio);
  const foto = path.join(tmp, 'foto-pessoa.png'); fs.copyFileSync(path.join(MIDIA, 'foto-pessoa.png'), foto);
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_WHISPER_BASE: `http://127.0.0.1:${servidor.address().port}`, OLHO_TESTE_WHISPER_WINE: '1' } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  let escolha = audio;
  await app.evaluate(({ dialog }) => { global.__escolha = null; dialog.showOpenDialog = async () => ({ canceled: !global.__escolha, filePaths: [global.__escolha] }); });
  const escolher = (c) => app.evaluate((_e, x) => { global.__escolha = x; }, c);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(250); } return false; };
  const status = () => w.evaluate(() => document.getElementById('status').textContent);
  await ate(() => window.gravarTela && window.olho); await espera(800);
  ok('Extras na tela inicial, antes de Configurações', await w.evaluate(() => { const b = [...document.querySelectorAll('#tela-inicial button')].map((x) => x.id); return b.indexOf('ir-extras') >= 0 && b.indexOf('ir-extras') === b.indexOf('ir-config') - 1; }));
  await w.evaluate(() => document.getElementById('ir-transcrever').click());
  ok('abre a tela Extras', await ate(() => window.olho.telaAtual() === 'extras'));
  await espera(600);
  ok('sem modelo: mostra baixar e esconde transcrever', await w.evaluate(() => !document.getElementById('ex-tr-baixar-pequeno').hidden && document.getElementById('ex-tr-escolher').hidden && !document.getElementById('ex-ds-baixar').hidden && document.getElementById('ex-ds-escolher').hidden));
  // Alt V volta
  await w.keyboard.press('Alt+KeyV');
  ok('Alt V volta para a tela inicial', await ate(() => window.olho.telaAtual() === 'inicial'));
  await w.evaluate(() => document.getElementById('ir-transcrever').click()); await espera(500);
  // modelo pequeno
  await w.click('#ex-tr-baixar-pequeno');
  ok('modelo baixado, transcrever aparece', await ate(() => !document.getElementById('ex-tr-escolher').hidden, null, 120000), await w.evaluate(() => document.getElementById('ex-tr-estado').textContent));
  ok('botão do modelo pequeno some', await w.evaluate(() => document.getElementById('ex-tr-baixar-pequeno').hidden));
  // transcrever
  await escolher(audio);
  await w.click('#ex-tr-escolher');
  ok('transcrição termina', await ate(() => /^Pronto: transcrição/.test(document.getElementById('ex-tr-estado').textContent), null, 600000), await w.evaluate(() => document.getElementById('ex-tr-estado').textContent));
  const docs = path.join(tmp, 'Documentos');
  const achar = (ext) => { const out = []; const rec = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? rec(p) : out.push(p); } }; if (fs.existsSync(docs)) rec(docs); return out.filter((p) => p.endsWith(ext)); };
  const txt = achar('.txt'), srt = achar('.srt');
  ok('texto salvo com o nome do arquivo', txt.length === 1 && /minha fala - transcrição\.txt$/.test(txt[0]) && fs.readFileSync(txt[0], 'utf8').trim().length > 10, txt.join());
  ok('SRT salvo', srt.length === 1 && /minha fala - legenda\.srt$/.test(srt[0]) && /-->/.test(fs.readFileSync(srt[0], 'utf8')), srt.join());
  // descritor
  await w.click('#ex-ds-baixar');
  ok('descritor baixado', await ate(() => !document.getElementById('ex-ds-escolher').hidden, null, 900000), await status());
  await escolher(foto);
  await w.click('#ex-ds-escolher');
  ok('descrição chega e é salva', await ate(() => /Salvo em texto/.test(document.getElementById('ex-ds-texto').textContent), null, 900000), await w.evaluate(() => document.getElementById('ex-ds-texto').textContent));
  const dtxt = achar('.txt').filter((p) => /descrição/.test(p));
  ok('arquivo de descrição salvo', dtxt.length === 1 && fs.readFileSync(dtxt[0], 'utf8').trim().length > 20, dtxt.join());
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  console.log(falhas ? 'COM FALHAS ' + falhas : 'tudo certo');
  await app.close(); servidor.close(); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
