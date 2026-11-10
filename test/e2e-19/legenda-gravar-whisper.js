'use strict';
// O caminho da Joy: grava com fala de verdade, fundo borrado, legenda pelo Whisper (modelo pequeno baixado), vídeo final com legenda.
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = process.argv[3], SERVIDOR = process.argv[4], CAM = '/tmp/gravador-teste-midia';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
function brancosEmbaixo(arq, t) {
  const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', arq]).toString().trim().split(',').map(Number);
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', `crop=${W}:${Math.round(H * 0.2)}:0:${Math.round(H * 0.8)},format=gray`, '-f', 'rawvideo', '-']);
  let n = 0; for (const b of buf) if (b > 235) n++; return n / buf.length;
}
(async () => {
  const servidor = http.createServer((req, res) => { const f = path.join(SERVIDOR, path.basename(req.url)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-length': fs.statSync(f).size }); fs.createReadStream(f).pipe(res); }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-gw-'));
  fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify({ formato: 'horizontal', qualidade: 'leve' }));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'), OLHO_TESTE_VIDEO: path.join(CAM, 'centrado.y4m'), OLHO_TESTE_MIC: path.join(MIDIA, 'mic-conto.wav'),
      OLHO_TESTE_WHISPER_BASE: `http://127.0.0.1:${servidor.address().port}`, OLHO_TESTE_WHISPER_WINE: '1' } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message));
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const passo = () => w.evaluate(() => ['lg-origem', 'lg-baixar', 'lg-gerar', 'lg-estilo'].find((i) => !document.getElementById(i).hidden));
  const status = () => w.evaluate(() => document.getElementById('status').textContent);
  await ate(() => window.gravarTela && window.olho); await espera(1200);
  await clicar('ir-gravar'); await ate(() => window.gravarTela.estado.pronto, null, 30000);
  for (const n of [1, 2, 3]) await clicar(`grav-e${n}-continuar`);
  await w.keyboard.press('Alt+KeyR'); await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  await espera(16000); await w.keyboard.press('Alt+KeyR');
  await ate(() => !document.getElementById('grav-decidir').hidden && !!window.__gravador.original, null, 120000);
  await clicar('melhorar'); await ate(() => window.olho.telaAtual() === 'melhorar', null, 30000);
  ok('fundo borrado marcado', await w.evaluate(() => document.querySelector('input[name="efeito"]:checked').value === 'borrar'));
  await clicar('mel-continuar');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 60000);
  for (const [b, prox] of [['au-continuar', 'au-silencios'], ['aus-continuar', 'au-trilhas'], ['aut-continuar', 'au-eq']]) { await clicar(b); await ate((i) => !document.getElementById(i).hidden, prox); }
  await clicar('aue-continuar');
  await ate(() => window.olho.telaAtual() === 'legenda', null, 120000);
  await clicar('lg-com-modelo'); await ate(() => !document.getElementById('lg-baixar').hidden);
  await clicar('lg-baixar-pequeno');
  await ate(() => !document.getElementById('lg-gerar').hidden, null, 180000);
  await clicar('lg-gerar-srt');
  ok('SRT gerado: Passo 4', await ate(() => !document.getElementById('lg-estilo').hidden, null, 600000));
  ok('fala de pronto, com as falas cronometradas, junto do Passo 4', await ate(() => /^Pronto: SRT gerado, com \d+ falas? cronometradas?, \d+ palavras\. Passo 4 de 4/.test(document.getElementById('status').textContent), null, 3000), await status());
  ok('o foco fica no título do Passo 4', await w.evaluate(() => document.activeElement.id === 'lg-estilo-titulo'));
  // A armadilha: voltar ao Passo 3 e apertar Alt A não pode perder a legenda.
  await clicar('lg-estilo-voltar'); await ate(() => !document.getElementById('lg-gerar').hidden);
  await w.keyboard.press('Alt+KeyA');
  ok('Alt A no Passo 3 com SRT feito leva ao Passo 4, sem perder a legenda', await ate(() => !document.getElementById('lg-estilo').hidden, null, 5000) && /falta escolher/.test(await status()), await status());
  // Escolha pelo teclado: foco no primeiro estilo e espaço.
  await w.focus('#lg-estilo-youtube'); await w.keyboard.press('Space');
  await w.keyboard.press('Alt+KeyA');
  ok('depois da legenda, título e logo', await ate(() => window.olho.telaAtual() === 'melhorar', null, 10000));
  await clicar('mel-continuar');
  ok('vídeo final pronto', await ate(() => !document.getElementById('grav-pronto').hidden, null, 900000), await status());
  const fala = await w.evaluate(() => window.__gravador.anuncios.filter((a) => /salv/.test(a)).slice(-1)[0] || '');
  ok('a mensagem final diz que tem legenda', /com fundo borrado e legenda salvo/.test(fala), fala);
  const final = await w.evaluate(() => window.__gravador.ultimoSalvo && window.__gravador.ultimoSalvo.arquivo);
  const srt = fs.readdirSync(path.join(tmp, 'Documentos', 'Olho da Cena')).find((f) => /legenda\.srt$/.test(f));
  if (final && srt) {
    const t = Number(/(\d\d):(\d\d):(\d\d),(\d\d\d)/.exec(fs.readFileSync(path.join(tmp, 'Documentos', 'Olho da Cena', srt), 'utf8').split('\n')[1]).slice(1, 5).reduce((a, x, i) => a + Number(x) * [3600, 60, 1, 0.001][i], 0)) + 0.8;
    const v = brancosEmbaixo(final, t);
    ok('a legenda está no vídeo final', v > 0.005, v.toFixed(4));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', final, '-frames:v', '1', '-vf', 'scale=960:-1', path.join(MIDIA, 'quadro-gravar-whisper.png')]);
  } else ok('arquivos', false, `${final} ${srt}`);
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close(); servidor.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
