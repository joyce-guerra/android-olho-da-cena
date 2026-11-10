'use strict';
// Montar usa as etapas de áudio, depois a Edição, depois a gravação: cada um volta para o seu lugar.
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3], CAM = '/tmp/gravador-teste-midia';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-cz-'));
  const pasta = path.join(tmp, 'meus'); fs.mkdirSync(pasta);
  for (const f of ['fala.mp3', 'clipe.mp4']) fs.copyFileSync(path.join(MIDIA, f), path.join(pasta, f));
  fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify({ formato: 'horizontal', qualidade: 'leve' }));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_VIDEO: path.join(CAM, 'centrado.y4m'), OLHO_TESTE_MIC: path.join(CAM, 'mic.wav') } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(150); } return false; };
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  await ate(() => window.gravarTela && window.olho);
  await espera(1200);

  // Montar: entra nas etapas de áudio e volta com Voltar
  await clicar('ir-gerar');
  await abrir(path.join(pasta, 'fala.mp3'));
  await clicar('btn-audio');
  await espera(500);
  await clicar('g-continuar-1');
  await ate(() => window.olho.telaAtual() === 'audio' && !document.getElementById('au-cortes').hidden && /fala/.test(document.getElementById('au-info').textContent));
  await clicar('au-voltar');
  ok('Montar: Voltar dos Cortes volta para a Etapa 1 do Montar', await ate(() => window.olho.telaAtual() === 'gerar' && !document.getElementById('g-etapa-1').hidden, null, 5000));
  await clicar('g-continuar-1');
  ok('Montar: o mesmo áudio volta para os Cortes sem preparar de novo', await ate(() => window.olho.telaAtual() === 'audio' && !document.getElementById('au-cortes').hidden, null, 5000));
  await clicar('au-voltar');
  await ate(() => window.olho.telaAtual() === 'gerar');
  await clicar('g-voltar-1');
  await ate(() => window.olho.telaAtual() === 'inicial');

  // Edição: abre o vídeo no Editar áudio e volta
  await clicar('ir-cortar');
  await abrir(path.join(pasta, 'clipe.mp4'));
  await clicar('ed-adicionar');
  await ate(() => /clipe/.test(document.getElementById('ed-info').textContent));
  await clicar('ed-audio');
  ok('Edição: Editar áudio abre o vídeo', await ate(() => window.olho.telaAtual() === 'audio' && /Vídeo clipe/.test(document.getElementById('au-info').textContent)), await w.textContent('#au-info'));
  await clicar('au-voltar');
  ok('Edição: Voltar volta para a Edição', await ate(() => window.olho.telaAtual() === 'edicao', null, 5000));
  await clicar('ed-voltar');

  // Gravação: grava, Salvar e continuar, plano de fundo, áudio: Voltar e o fim vão para o plano de fundo
  await clicar('ir-gravar');
  await ate(() => window.gravarTela.estado.pronto, null, 30000);
  for (const n of [1, 2, 3]) await clicar(`grav-e${n}-continuar`);
  await w.keyboard.press('Alt+KeyR');
  await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  await espera(3000);
  await w.keyboard.press('Alt+KeyR');
  await ate(() => !document.getElementById('grav-decidir').hidden && !!window.__gravador.original, null, 120000);
  await clicar('melhorar');
  ok('Gravação: Salvar e continuar vai para o plano de fundo', await ate(() => window.olho.telaAtual() === 'melhorar', null, 30000));
  await clicar('mel-continuar');
  ok('Gravação: depois do fundo, as etapas de áudio com o vídeo gravado', await ate(() => window.olho.telaAtual() === 'audio' && /^Vídeo /.test(document.getElementById('au-info').textContent), null, 60000), await w.textContent('#au-info'));
  await clicar('au-voltar');
  ok('Gravação: Voltar dos Cortes volta para o plano de fundo', await ate(() => window.olho.telaAtual() === 'melhorar', null, 10000));
  await clicar('mel-continuar');
  await ate(() => window.olho.telaAtual() === 'audio' && !document.getElementById('au-cortes').hidden && window.__audioCortes.video && !window.__audioCortes.salvando, null, 60000);
  await clicar('au-continuar');
  const chegou = await ate(() => !document.getElementById('au-silencios').hidden, null, 60000);
  await clicar('aus-continuar'); await ate(() => !document.getElementById('au-trilhas').hidden);
  await clicar('aut-continuar'); await ate(() => !document.getElementById('au-eq').hidden);
  await clicar('aue-continuar');
  ok('Gravação: o fim do áudio vai para a legenda, não para o Montar', await ate(() => window.olho.telaAtual() === 'legenda', null, 120000), await tela());
  await w.keyboard.press('Alt+KeyA');
  ok('Gravação: Alt A sem legenda vai para título e logo', await ate(() => window.olho.telaAtual() === 'melhorar', null, 10000), await tela());
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
