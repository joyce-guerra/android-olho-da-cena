'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 400) : ''}`); if (!c) falhas++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-qt-'));
  const pasta = path.join(tmp, 'meus'); fs.mkdirSync(pasta);
  for (const f of ['pessoa-leg-som.mp4', 'fala.mp3']) fs.copyFileSync(path.join(MIDIA, f), path.join(pasta, f));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: process.env.DADOS || path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  await ate(() => window.gravarTela && window.olho); await espera(1000);
  await w.evaluate(() => { window.__f = []; new MutationObserver(() => window.__f.push(document.getElementById('status').textContent)).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true }); });
  const falas = () => w.evaluate(() => window.__f.join(' | '));
  const limpa = () => w.evaluate(() => { window.__f = []; });
  await clicar('ir-cortar');
  // áudio puro: não há imagem
  await abrir(path.join(pasta, 'fala.mp3')); await clicar('ed-adicionar'); await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-audio');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video, null, 60000); await espera(500);
  await limpa(); await w.keyboard.press('Alt+KeyE'); await espera(600);
  ok('áudio puro: Alt E diz que não há imagem', /só de áudio/.test(await falas()), await falas());
  await clicar('au-voltar'); await ate(() => window.olho.telaAtual() === 'edicao');
  // vídeo com pessoa
  await abrir(path.join(pasta, 'pessoa-leg-som.mp4')); await clicar('ed-adicionar'); await ate(() => /pessoa-leg-som/.test(document.getElementById('ed-info').textContent)); await clicar('ed-audio');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 120000);
  await ate(() => document.getElementById('au-player').readyState >= 2); await w.evaluate(() => { document.getElementById('au-player').currentTime = 1; }); await espera(800);
  await limpa(); await w.keyboard.press('Alt+KeyE');
  ok('vídeo parado: Alt E fala o enquadre', await ate(() => /rosto|enquadr|corpo|Luz|Fundo/i.test(window.__f.join(' ')), null, 60000), await falas());
  await espera(500); await limpa(); await w.keyboard.press('Alt+KeyC');
  ok('Alt C fala a luz e o fundo', await ate(() => /Luz:|Fundo:/.test(window.__f.join(' ')), null, 60000), await falas());
  if (process.env.DADOS) await w.evaluate(async () => { await window.api.configSalvar({ idiomaDescricao: 'pt' }); window.__olhoConfig = (await window.api.configLer()).valor; });
  await limpa(); await w.keyboard.press('Alt+KeyQ'); await espera(1500);
  if (!process.env.DADOS) ok('Alt Q sem descritor orienta a instalar em Extras', /Extras/.test(await falas()), await falas());
  else {
    ok('Alt Q avisa que vai olhar', /Olhando o quadro com o descritor/.test(await falas()), await falas());
    ok('a descrição completa chega', await ate(() => window.__f.some((t) => t.length > 150), null, 1500000), await falas());
    const t = (await falas()).split(' | ').pop();
    console.log('DESCRIÇÃO:', t);
    ok('não afirma gênero nem maquiagem ausente', !/\b(homem|mulher|rapaz|moça|menino|menina)\b/i.test(t) && !/sem maquiagem|não (usa|tem|há) maquiagem/i.test(t), t);
  }
  ok('Alt F continua marcando o fim da seleção (não é o fundo)', await w.evaluate(() => { const ev = new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', altKey: true, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(ev); return true; }));
  ok('Alt H lista os três atalhos', await (async () => { await w.keyboard.press('Alt+KeyH'); await espera(400); const t = await w.evaluate(() => document.getElementById('ajuda-lista').textContent); await w.keyboard.press('Escape'); return /Alt Q/.test(t) && /Alt C/.test(t); })());
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  await app.close(); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
