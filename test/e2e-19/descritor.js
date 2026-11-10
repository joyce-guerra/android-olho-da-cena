'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const RAIZ = process.argv[2], MIDIA = process.argv[3], SERVIDOR = process.argv[4];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 500) : ''}`); if (!c) falhas++; };
(async () => {
  const servidor = http.createServer((req, res) => {
    const f = path.join(SERVIDOR, path.basename(req.url));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-length': fs.statSync(f).size });
    fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-ds-'));
  const imgs = ['foto-pessoa.png', 'foto-escura.png'].map((f) => { fs.copyFileSync(path.join(MIDIA, f), path.join(tmp, f)); return path.join(tmp, f); });
  fs.copyFileSync(path.join(process.argv[5], 'biblioteca-horizontal.jpg'), path.join(tmp, 'biblioteca.jpg'));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: process.env.DADOS || path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_WHISPER_BASE: `http://127.0.0.1:${servidor.address().port}`, OLHO_TESTE_WHISPER_WINE: '1' } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  await app.evaluate(({ dialog }, lista) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: lista }); }, [imgs[0], path.join(tmp, 'biblioteca.jpg')]);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(250); } return false; };
  const status = () => w.evaluate(() => document.getElementById('status').textContent);
  await ate(() => window.gravarTela && window.olho); await espera(800);
  // Registra tudo o que o programa fala (a região de status), de qualquer tela.
  await w.evaluate(() => { window.__falas = []; new MutationObserver(() => window.__falas.push(document.getElementById('status').textContent)).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true }); });
  await w.evaluate(async () => { await window.api.configSalvar({ idiomaDescricao: 'pt' }); window.__olhoConfig = (await window.api.configLer()).valor; });
  const mostrarEtapa3 = () => w.evaluate(() => document.querySelectorAll('.etapa').forEach((e) => { e.hidden = e.id !== 'g-etapa-3'; }));
  await w.evaluate(() => { document.getElementById('ir-gerar').click(); document.getElementById('btn-imagens').click(); });
  await mostrarEtapa3();
  await ate(() => document.querySelectorAll('#lista-imagens li').length === 2 && /NASA|Imagem/.test(document.getElementById('lista-imagens').textContent), null, 120000);
  ok('o detector descreve sozinho ao adicionar', /Imagem .*Tem um rosto/.test(await w.textContent('#lista-imagens')), (await w.textContent('#lista-imagens')).slice(0, 200));
  if (!process.env.DADOS) { await w.evaluate(() => { document.getElementById('ir-extras').click(); }); await espera(800); await w.evaluate(() => document.getElementById('ex-ds-baixar').click()); }
  ok('descritor instalado', await ate(() => descritor.instalado === true, null, 900000), await status());
  if (!process.env.DADOS) { await w.evaluate(() => { document.getElementById('ir-gerar').click(); document.getElementById('btn-imagens').click(); }); await w.evaluate(() => document.querySelectorAll('.etapa').forEach((e) => { e.hidden = e.id !== 'g-etapa-3'; })); }
  const d = path.join(process.env.DADOS || path.join(tmp, 'dados'), 'descritor');
  ok('motor e modelo guardados', fs.existsSync(path.join(d, 'motor', 'llama-mtmd-cli.exe')) && fs.existsSync(path.join(d, 'modelos', 'gemma-3-4b-it-Q4_K_M.gguf')) && fs.existsSync(path.join(d, 'modelos', 'mmproj-model-f16.gguf')) && !fs.existsSync(path.join(d, 'motor.zip')));
  // Alt I com o foco na primeira imagem da lista
  await w.evaluate(() => document.querySelector('#lista-imagens li').focus());
  await w.keyboard.press('Alt+KeyD');
  ok('Alt I na lista: diz que está descrevendo', await ate(() => /Descrevendo foto-pessoa\.png/.test(window.__falas.join(' | ')), null, 8000));
  const camPessoa = imgs[0];
  ok('a descrição chega', await ate((c) => !!estado.descModelo[c], camPessoa, 900000), await w.evaluate((c) => estado.descModelo[c] || '', camPessoa));
  const f1 = await w.evaluate((c) => estado.descModelo[c] || '', camPessoa);
  ok('a frase sai direto, sem aviso na frente', f1.length > 40 && !/^Descrição estimada/i.test(f1) && !/Com certeza|Aqui está/i.test(f1), f1);
  ok('em português, e fala da NASA, do foguete ou da bandeira', /NASA|foguete|bandeira|camisa/i.test(f1) && /\b(uma|um|de|com|ao)\b/.test(f1), f1);
  ok('ela também sai falada, sem prefixo', await ate((t) => window.__falas.some((f) => f.trim() === t), f1, 5000));
  ok('bipes de andamento e o de concluído', await w.evaluate(() => window.__gravador.bipes.filter((b) => b.tipo === 'andamento').length >= 2 && window.__gravador.bipes.filter((b) => b.tipo === 'concluido').length >= 1));
  // Espanhol, na segunda imagem
  await w.evaluate(() => { document.getElementById('ir-config').click(); });
  await w.check('#cf-idiomaDescricao-es');
  await ate(() => (window.__olhoConfig || {}).idiomaDescricao === 'es', null, 5000);
  await w.evaluate(() => { document.getElementById('ir-gerar').click(); });
  await mostrarEtapa3();
  await w.evaluate(() => document.querySelectorAll('#lista-imagens li')[1].querySelector('button').focus());
  await w.keyboard.press('Alt+KeyD');
  ok('espanhol: descreve a biblioteca em espanhol', await ate(() => /biblioteca|estantería|libros|lámpara/i.test(document.getElementById('lista-imagens').textContent.split('biblioteca.jpg')[1] || ''), null, 900000), (await w.textContent('#lista-imagens')).slice(-400));
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close(); servidor.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
