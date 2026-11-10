'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-ti-'));
  for (const f of ['conto.mp3', 'fala.mp3']) fs.copyFileSync(path.join(MIDIA, f), path.join(tmp, f));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(150); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const vis = (id) => w.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.hidden && e.offsetParent !== null; }, id);
  await ate(() => window.gravarTela && window.olho); await espera(1000);
  await w.evaluate(() => { window.__f = []; new MutationObserver(() => window.__f.push(document.getElementById('status').textContent)).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true }); });
  await clicar('ir-cortar'); await abrir(path.join(tmp, 'conto.mp3')); await clicar('ed-adicionar'); await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-audio');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 120000);
  await clicar('au-continuar'); await ate(() => !document.getElementById('au-silencios').hidden);
  await clicar('aus-continuar'); await ate(() => !document.getElementById('au-trilhas').hidden);
  // estado inicial
  ok('começa em loop, desde o começo, sem bloco de tempo nem de fade', await w.evaluate(() => document.getElementById('e-trilha-tipo-loop').checked && document.getElementById('e-trilha-inicio-comeco').checked) && !(await vis('e-trilha-bloco-tempo')) && !(await vis('e-trilha-bloco-fade')));
  ok('o grupo Quando a trilha começa existe', await w.evaluate(() => [...document.querySelectorAll('#au-trilhas legend')].some((l) => l.textContent === 'Quando a trilha começa')));
  ok('sem o antigo O que acontece a partir desse tempo', await w.evaluate(() => ![...document.querySelectorAll('#au-trilhas legend')].some((l) => /O que acontece/.test(l.textContent))));
  ok('a prévia da mistura aparece também em loop desde o começo', await vis('e-trilha-previa'));
  await abrir(path.join(tmp, 'fala.mp3')); await clicar('e-btn-trilha-arquivo'); await espera(500);
  await w.evaluate(() => { document.getElementById('au-player').currentTime = 5; }); await espera(300);
  await clicar('e-trilha-previa');
  ok('a prévia da mistura gera e toca em loop desde o começo', await ate(() => /^(blob:|app:|file:)/.test(document.getElementById('e-previa-audio').src) || document.getElementById('e-previa-audio').src.length > 10, null, 60000), await w.evaluate(() => document.getElementById('e-previa-audio').src));
  // escolher "a partir de um tempo": não fala a explicação na hora
  await w.evaluate(() => { window.__f = []; document.getElementById('e-trilha-inicio-comeco').focus(); });
  await w.keyboard.press('ArrowDown'); // as setas escolhem o rádio
  await espera(500);
  ok('escolher o tempo abre o bloco do tempo', await vis('e-trilha-bloco-tempo'));
  ok('a explicação NÃO é falada na hora de escolher', !(await w.evaluate(() => window.__f.join(' ').includes('Para tocar a partir de um tempo'))), await w.evaluate(() => window.__f.join(' | ')));
  // Tab leva à explicação, que só é lida pelo leitor (foco), sem abrir nada
  await w.keyboard.press('Tab'); await espera(200);
  ok('Tab chega na explicação', await w.evaluate(() => document.activeElement.id === 'e-trilha-dica'));
  ok('a explicação diz marcar pelo player, espaço e Marcar aqui', await w.evaluate(() => /player/.test(document.activeElement.textContent) && /espaço/i.test(document.activeElement.textContent) && /Marcar aqui/.test(document.activeElement.textContent)));
  ok('Tab na explicação não abre nada (mesma tela, mesmo bloco)', await vis('e-trilha-bloco-tempo') && await vis('au-trilhas'));
  // Espaço toca e pausa com o foco na explicação
  await w.keyboard.press('Space'); await espera(900);
  ok('Espaço toca o áudio a partir da explicação', await w.evaluate(() => !document.getElementById('au-player').paused));
  await w.keyboard.press('Space'); await espera(300);
  ok('Espaço pausa', await w.evaluate(() => document.getElementById('au-player').paused));
  ok('player ao alcance: Tocar ou pausar, voltar e avançar dentro do bloco', await w.evaluate(() => ['e-t-tocar', 'e-t-voltar1', 'e-t-avancar1'].every((i) => document.getElementById(i).offsetParent !== null)));
  // marcar aqui
  await w.evaluate(() => { document.getElementById('au-player').currentTime = 12.5; }); await espera(400);
  await clicar('e-trilha-marcar');
  ok('Marcar aqui põe o tempo no campo', await w.evaluate(() => /^00:00:1[23]$/.test(document.getElementById('e-trilha-tempo').value)), await w.evaluate(() => document.getElementById('e-trilha-tempo').value));
  ok('o botão se chama Marcar aqui', (await w.textContent('#e-trilha-marcar')) === 'Marcar aqui');
  // adicionar: loop a partir do tempo => estática repetindo
  await abrir(path.join(tmp, 'fala.mp3')); await clicar('e-btn-trilha-arquivo'); await espera(500);
  await clicar('e-btn-add-trilha'); await espera(900);
  let cam = await w.evaluate(() => JSON.parse(JSON.stringify(window.__audioCortes.camadas)));
  ok('loop a partir de um tempo: estática que repete, no tempo marcado', cam.length === 1 && cam[0].tipo === 'estatico' && cam[0].repetir === true && Math.abs(cam[0].tempo - 12.5) <= 1, JSON.stringify(cam));
  // estática a partir do tempo: toca uma vez, mostra fade
  await w.evaluate(() => document.getElementById('e-trilha-tipo-estatico').click());
  ok('estática mostra as opções de fade', await vis('e-trilha-bloco-fade'));
  await abrir(path.join(tmp, 'fala.mp3')); await clicar('e-btn-trilha-arquivo'); await espera(500);
  await w.fill('#e-trilha-tempo', '00:00:20'); await clicar('e-btn-add-trilha'); await espera(900);
  cam = await w.evaluate(() => JSON.parse(JSON.stringify(window.__audioCortes.camadas)));
  ok('estática a partir do tempo: uma vez só, em 20 s', cam.length === 2 && cam[1].tipo === 'estatico' && cam[1].repetir === false && cam[1].tempo === 20, JSON.stringify(cam[1]));
  // estática desde o começo
  await w.evaluate(() => document.getElementById('e-trilha-inicio-comeco').click());
  ok('desde o começo esconde o bloco de tempo', !(await vis('e-trilha-bloco-tempo')));
  await abrir(path.join(tmp, 'fala.mp3')); await clicar('e-btn-trilha-arquivo'); await espera(500);
  await clicar('e-btn-add-trilha'); await espera(900);
  cam = await w.evaluate(() => JSON.parse(JSON.stringify(window.__audioCortes.camadas)));
  ok('a prévia aparece em estática desde o começo', await vis('e-trilha-previa'));
  ok('estática desde o começo: tempo 0, uma vez só', cam.length === 3 && cam[2].tipo === 'estatico' && cam[2].tempo === 0 && cam[2].repetir === false, JSON.stringify(cam[2]));
  // loop desde o começo
  await w.evaluate(() => document.getElementById('e-trilha-tipo-loop').click());
  ok('loop esconde o fade', !(await vis('e-trilha-bloco-fade')));
  await abrir(path.join(tmp, 'fala.mp3')); await clicar('e-btn-trilha-arquivo'); await espera(500);
  await clicar('e-btn-add-trilha'); await espera(900);
  if (await vis('e-trilha-conflito')) { await clicar('e-trilha-conflito-sobrepor'); await espera(600); }
  cam = await w.evaluate(() => JSON.parse(JSON.stringify(window.__audioCortes.camadas)));
  ok('loop desde o começo: loop do jeito de sempre', cam.length >= 3 && cam[cam.length - 1].tipo === 'loop', JSON.stringify(cam.map((c) => c.tipo + ':' + c.tempo)));
  // Editar vídeo (c) e Juntar (j): mesmas escolhas
  for (const p of ['c', 'j']) {
    ok(`${p}: grupo Quando a trilha começa e dica na tela`, await w.evaluate((x) => !!document.getElementById(x + '-trilha-inicio-comeco') && !!document.getElementById(x + '-trilha-inicio-tempo') && document.getElementById(x + '-trilha-dica').tabIndex === 0 && !document.getElementById(x + '-trilha-repetir-nao'), p));
  }
  for (const p of ['c', 'j']) {
    const r = await w.evaluate((x) => {
      const h = (id) => document.getElementById(id).hidden;
      const click = (id) => document.getElementById(id).click();
      const ini = { tempo: h(x + '-trilha-bloco-tempo'), fade: h(x + '-trilha-bloco-fade') };
      click(x + '-trilha-inicio-tempo'); const a = { tempo: h(x + '-trilha-bloco-tempo'), fade: h(x + '-trilha-bloco-fade') };
      click(x + '-trilha-tipo-estatico'); const b = { tempo: h(x + '-trilha-bloco-tempo'), fade: h(x + '-trilha-bloco-fade') };
      click(x + '-trilha-inicio-comeco'); const c = { tempo: h(x + '-trilha-bloco-tempo'), fade: h(x + '-trilha-bloco-fade') };
      return { ini, a, b, c };
    }, p);
    ok(`${p}: loop desde o começo esconde tempo e fade`, r.ini.tempo && r.ini.fade, JSON.stringify(r));
    ok(`${p}: a partir de um tempo mostra o tempo`, !r.a.tempo && r.a.fade, JSON.stringify(r));
    ok(`${p}: estática mostra o fade`, !r.b.fade, JSON.stringify(r));
    ok(`${p}: estática desde o começo: fade sim, tempo não`, r.c.tempo && !r.c.fade, JSON.stringify(r));
  }
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  await app.close(); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
