'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + x : ''}`); if (!c) falhas++; };
const dur = (a) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a]).toString());
const faixas = (a) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', a]).toString().trim().split('\n');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-ed-'));
  const pasta = path.join(tmp, 'meus'); fs.mkdirSync(pasta);
  for (const f of ['fala.mp3', 'clipe.mp4']) fs.copyFileSync(path.join(MIDIA, f), path.join(pasta, f));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack||'').split('\n').slice(0,3).join(' ')));
  w.on('console', (m) => { if (m.type() === 'error' && !/Autofill|DevTools|XNNPACK/.test(m.text())) erros.push('console: ' + m.text()); });
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(150); } return false; };
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  const texto = (id) => w.evaluate((i) => document.getElementById(i).textContent, id);
  const visivel = (id) => w.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.hidden && e.offsetParent !== null; }, id);
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  await ate(() => window.gravarTela && window.olho);
  await espera(1500);

  ok('botão da tela inicial', (await texto('ir-cortar')) === 'Editar', await texto('ir-cortar'));
  await clicar('ir-cortar');
  ok('abre a Edição', (await tela()) === 'edicao');
  ok('opções escondidas sem arquivo', !(await visivel('ed-opcoes')));

  // --- MP3 ---
  await abrir(path.join(pasta, 'fala.mp3'));
  await clicar('ed-adicionar');
  await ate(() => !document.getElementById('ed-opcoes').hidden);
  ok('info do MP3', /^Áudio fala\.mp3/.test(await texto('ed-info')), await texto('ed-info'));
  ok('MP3: Editar áudio à vista', await visivel('ed-audio'));
  ok('MP3: Editar vídeo escondido', !(await visivel('ed-video')));
  await clicar('ed-audio');
  ok('Editar áudio abre a Etapa 1', await ate(() => /Áudio fala/.test(document.getElementById('au-info').textContent)), await texto('au-info'));
  ok('tela de áudio', (await tela()) === 'audio');
  // Voltar na Etapa 1 volta para a Edição
  await clicar('au-voltar');
  ok('Voltar da Etapa 1 volta para a Edição', await ate(() => window.olho.telaAtual() === 'edicao', null, 5000));
  await w.evaluate(() => { window.__audioCortes.video = null; document.getElementById('au-info').textContent = ''; });
  await clicar('ed-audio');
  ok('reabre', await ate(() => /Áudio fala/.test(document.getElementById('au-info').textContent) && document.getElementById('au-player').readyState >= 1));
  // descarta de 1 s a 3 s
  await w.evaluate(() => { document.getElementById('au-player').currentTime = 1; }); await ate(() => Math.abs(document.getElementById('au-player').currentTime - 1) < 0.05);
  await clicar('au-inicio');
  await w.evaluate(() => { document.getElementById('au-player').currentTime = 3; }); await espera(300);
  await clicar('au-fim');
  await clicar('au-descartar');
  console.log('DEBUG', JSON.stringify(await w.evaluate(() => ({ c: window.__audioCortes.cortados, m: window.__audioCortes.marcas.trechos, p: window.__audioCortes.pendente, t: document.getElementById('au-player').currentTime }))), erros.join('|'));
  await clicar('au-continuar');
  ok('Etapa 2', await ate(() => !document.getElementById('au-silencios').hidden));
  await clicar('aus-continuar');
  ok('Etapa 3', await ate(() => !document.getElementById('au-trilhas').hidden));
  await clicar('aut-continuar');
  ok('Etapa 4', await ate(() => !document.getElementById('au-eq').hidden));
  await clicar('aue-continuar');
  ok('MP3: depois das etapas, a imagem do vídeo', await ate(() => !document.getElementById('grav-imagem').hidden, null, 120000));
  await w.check('#img-tipo-audio');
  await clicar('img-continuar');
  ok('Só o áudio: salva e volta para a tela Editar', await ate(() => window.olho.telaAtual() === 'edicao', null, 60000));
  const saida = path.join(tmp, 'Documentos', 'Olho da Cena', 'fala editado.mp3');
  ok('MP3 na pasta Olho da Cena, com o nome fala editado', fs.existsSync(saida), fs.existsSync(path.dirname(saida)) ? fs.readdirSync(path.dirname(saida)).join(', ') : '');
  if (fs.existsSync(saida)) { const d = dur(saida); ok('duração 10 s menos 2 s de corte', Math.abs(d - 8) < 0.3, d.toFixed(2)); ok('só áudio', faixas(saida).join() === 'audio', faixas(saida).join()); }
  ok('nenhum MP4 deixado na pasta', !fs.readdirSync(pasta).some((f) => /editado\.mp4$/.test(f)), fs.readdirSync(pasta).join(', '));

  // --- Vídeo ---
  ok('Edição lembra o último arquivo', /fala\.mp3/.test(await texto('ed-info')));
  await abrir(path.join(pasta, 'clipe.mp4'));
  await clicar('ed-adicionar');
  await ate(() => /clipe/.test(document.getElementById('ed-info').textContent));
  ok('info do vídeo', /^Vídeo clipe\.mp4/.test(await texto('ed-info')), await texto('ed-info'));
  ok('vídeo: as duas opções', (await visivel('ed-audio')) && (await visivel('ed-video')));
  await clicar('ed-video');
  ok('Editar vídeo abre a análise', await ate(() => !document.getElementById('grav-editar').hidden, null, 10000));
  await ate(() => /Tem pessoa|Não achei pessoa/.test(document.getElementById('ed-an-info').textContent), null, 300000);
  await clicar('ed-an-voltar');
  ok('Voltar da análise volta para a tela Editar', await ate(() => window.olho.telaAtual() === 'edicao', null, 5000));
  await clicar('ed-audio');
  ok('Editar áudio de vídeo', await ate(() => /Vídeo clipe/.test(document.getElementById('au-info').textContent)), await texto('au-info'));
  await clicar('au-continuar'); await ate(() => !document.getElementById('au-silencios').hidden);
  await clicar('aus-continuar'); await ate(() => !document.getElementById('au-trilhas').hidden);
  await clicar('aut-continuar'); await ate(() => !document.getElementById('au-eq').hidden);
  await clicar('aue-continuar');
  ok('vídeo salvo', await ate(() => !document.getElementById('au-pronto').hidden, null, 120000), await texto('au-pronto-info'));
  const sv = path.join(pasta, 'clipe editado.mp4');
  ok('MP4 editado com imagem e som', fs.existsSync(sv) && faixas(sv).sort().join() === 'audio,video', fs.existsSync(sv) ? faixas(sv).join() : fs.readdirSync(pasta).join(', '));
  ok('título Vídeo salvo', (await texto('au-pronto-titulo')) === 'Vídeo salvo');

  // --- Gravação continua no modo de gravação ---
  const modo = await w.evaluate(() => typeof window.gravarTela.editarAudio);
  ok('editarAudio exposto', modo === 'function');
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
