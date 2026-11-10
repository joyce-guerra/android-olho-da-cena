'use strict';
// Gravar vídeo com legenda de um SRT: depois do áudio, a tela de legenda; SRT inserido, estilo YouTube; vídeo final com a legenda.
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = process.argv[3], CAM = '/tmp/gravador-teste-midia';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
function contraste(arq, t, y0, y1) {
  const dims = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', arq]).toString().trim().split(',').map(Number);
  const [W, H] = dims;
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', `crop=${W}:${Math.round(H * (y1 - y0))}:0:${Math.round(H * y0)},format=gray`, '-f', 'rawvideo', '-']);
  let n = 0; for (const b of buf) if (b > 235) n++;
  return n / buf.length;
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-lgr-'));
  fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify({ formato: 'horizontal', qualidade: 'leve' }));
  const srt = path.join(tmp, 'teste.srt'); fs.copyFileSync(path.join(MIDIA, 'teste.srt'), srt);
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'), OLHO_TESTE_VIDEO: path.join(CAM, 'centrado.y4m'), OLHO_TESTE_MIC: path.join(CAM, 'mic.wav') } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  await ate(() => window.gravarTela && window.olho); await espera(1200);
  await clicar('ir-gravar'); await ate(() => window.gravarTela.estado.pronto, null, 30000);
  for (const n of [1, 2, 3]) await clicar(`grav-e${n}-continuar`);
  await w.keyboard.press('Alt+KeyR'); await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  await espera(4000); await w.keyboard.press('Alt+KeyR');
  await ate(() => !document.getElementById('grav-decidir').hidden && !!window.__gravador.original, null, 120000);
  await clicar('melhorar'); await ate(() => window.olho.telaAtual() === 'melhorar', null, 30000);
  if (process.env.FUNDO === 'substituir') { await w.check('#efeito-substituir'); await w.evaluate(() => { const r = document.querySelector('input[name="fundo"]'); r.click(); }); }
  else await w.check('#efeito-nenhum').catch(() => {});
  await clicar('mel-continuar');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 60000);
  for (const [b, prox] of [['au-continuar', 'au-silencios'], ['aus-continuar', 'au-trilhas'], ['aut-continuar', 'au-eq']]) { await clicar(b); await ate((i) => !document.getElementById(i).hidden, prox); }
  await clicar('aue-continuar');
  ok('depois da Equalização, a tela de legenda', await ate(() => window.olho.telaAtual() === 'legenda', null, 120000), await tela());
  await clicar('lg-origem-voltar');
  ok('Voltar da legenda volta para Equalização e ajustes', await ate(() => window.olho.telaAtual() === 'audio' && !document.getElementById('au-eq').hidden, null, 10000));
  await clicar('aue-continuar');
  await ate(() => window.olho.telaAtual() === 'legenda', null, 120000);
  await abrir(srt);
  await clicar('lg-inserir-srt');
  ok('SRT inserido: pergunta de revisar', await ate(() => !document.getElementById('lg-revisar').hidden, null, 10000), await w.textContent('#lg-origem-info'));
  await clicar('lg-revisar-nao');
  await ate(() => !document.getElementById('lg-estilo').hidden, null, 10000);
  ok('informação do SRT', /^Legenda teste\.srt: 2 legendas\./.test(await w.textContent('#lg-origem-info')), await w.textContent('#lg-origem-info'));
  await w.check('#lg-estilo-youtube');
  await clicar('lg-estilo-continuar');
  ok('depois da legenda, título e logo', await ate(() => window.olho.telaAtual() === 'melhorar' && !document.getElementById('mel-abertura-bloco').hidden, null, 10000), await tela());
  await clicar('melhorar-voltar');
  ok('Voltar do título e logo volta para a legenda', await ate(() => window.olho.telaAtual() === 'legenda', null, 10000), await tela());
  await clicar('lg-inserir-srt').catch(() => {});
  await abrir(srt);
  await clicar('lg-inserir-srt');
  await ate(() => !document.getElementById('lg-revisar').hidden, null, 10000);
  await clicar('lg-revisar-nao');
  await ate(() => !document.getElementById('lg-estilo').hidden, null, 10000);
  await w.check('#lg-estilo-youtube');
  await clicar('lg-estilo-continuar');
  ok('segunda passagem pela legenda: salva com outro nome e segue', await ate(() => window.olho.telaAtual() === 'melhorar', null, 10000), await tela());
  await clicar('mel-continuar');
  ok('vídeo final pronto', await ate(() => !document.getElementById('grav-pronto').hidden, null, 900000), await w.evaluate(() => window.__gravador.anuncios.slice(-3).join(' | ')));
  await espera(800);
  ok('a mensagem final diz que tem legenda', /legenda salv|com legenda salvo/.test(await w.evaluate(() => window.__gravador.anuncios.slice(-2).join(' | '))), await w.evaluate(() => window.__gravador.anuncios.slice(-2).join(' | ')));
  const final = await w.evaluate(() => window.__gravador.ultimoSalvo && window.__gravador.ultimoSalvo.arquivo);
  if (final && fs.existsSync(final)) {
    const com = contraste(final, 1.2, 0.8, 1), sem = contraste(final, 3.6, 0.8, 1);
    ok('legenda branca embaixo durante a primeira legenda', com > 0.005, `${com.toFixed(4)} / ${sem.toFixed(4)}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1.2', '-i', final, '-frames:v', '1', path.join(MIDIA, 'quadro-gravar-legenda.png')]);
  } else ok('arquivo final', false, final);
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
