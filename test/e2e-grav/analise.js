/* 1.8.2: Analisar fundo / Analisar vídeo / Alt E. Uso: xvfb-run -a node test/e2e-grav/analise.js */
const { _electron } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const RAIZ = path.join(__dirname, '..', '..');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analise-'));
  const app = await _electron.launch({ args: ['--no-sandbox', RAIZ], cwd: RAIZ, env: { ...process.env,
    GRAVADOR_TESTE_DADOS: path.join(tmp, 'd'), GRAVADOR_TESTE_DOCUMENTOS: path.join(tmp, 'D'),
    GRAVADOR_TESTE_VIDEO: '/tmp/gravador-teste-midia/centrado.y4m', GRAVADOR_TESTE_MIC: '/tmp/gravador-teste-midia/mic.wav' } });
  const w = await app.firstWindow();
  w.on('pageerror', (e) => console.log('ERRO', e.message));
  w.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  for (let i = 0; i < 300 && !(await w.evaluate(() => window.__gravador && window.__gravador.pronto).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 15000)); // deixa o programa carregar os modelos do Alt E
  const roda = (arq, dur, efeito, fundo) => w.evaluate(async ({ arq, dur, efeito, fundo }) => {
    const t0 = performance.now();
    const res = await window.api.analiseQuadros({ arquivo: arq, duracao: dur, formato: 'horizontal', qualidade: 'alta', efeito, fundo });
    if (!res.ok) return 'falhou ' + res.erro;
    const q = res.valor;
    const janelas = q.janelas.map((j) => j.map((x) => x.slice().buffer));
    const img = q.imagemFundo ? q.imagemFundo.slice().buffer : null;
    const rostos = q.rostos.map((j) => j.map((x) => x.slice().buffer));
    const med = await window.__gravador.trabalhadorAnalise({ janelas, w: q.mw, h: q.mh, efeito, imagemFundo: img, rostos, rw: q.rw, rh: q.rh });
    const dg = window.api.puro.diagnosticar(med, { efeito, nomeFundo: efeito === 'substituir' ? 'Fundo Sala dos gatos' : efeito === 'borrar' ? 'Fundo borrado' : 'Fundo original' });
    const t = dg.texto, vv = JSON.stringify(dg.valores, (k, x) => typeof x === 'number' ? Math.round(x) : x);
    const f = med.flat(), halos = f.filter((m) => m.halo != null).map((m) => m.halo), cab = f.filter((m) => m.cabeloFalha != null).map((m) => m.cabeloFalha);
    return `${Math.round(performance.now() - t0)} ms, ${f.length} quadros, rosto em ${f.filter((m) => m.rosto).length}, halo ${halos.length ? Math.min(...halos).toFixed(2) + '-' + Math.max(...halos).toFixed(2) : '-'}, bordas ${(f.filter((m)=>m.bordasFundo!=null).reduce((a,m)=>a+m.bordasFundo,0)/f.length).toFixed(2)} var ${(f.filter((m)=>m.variacaoFundo!=null).reduce((a,m)=>a+m.variacaoFundo,0)/f.length).toFixed(0)}, ${vv}, cabelo ${cab.length ? Math.min(...cab).toFixed(2) + '-' + Math.max(...cab).toFixed(2) : '-'}: ${t}`;
  }, { arq, dur, efeito, fundo });
  const VID = process.env.VID || '/tmp/longo.mp4', DUR = Number(process.env.DUR || 40);
  for (const [efeito, fundo] of process.env.SO_ALTF ? [] : [['nenhum', null], ['borrar', null], ['substituir', 'sala-dos-gatos']]) {
    const textos = [];
    for (let k = 0; k < 5; k++) { const r = await roda(VID, DUR, efeito, fundo); console.log(efeito, k + 1, r); textos.push(r.slice(r.indexOf(': ') + 2)); }
    console.log(efeito, new Set(textos).size === 1 ? 'IGUAIS nas 5' : 'DIFERENTES');
  }
  await w.evaluate(() => document.getElementById('ir-gravar').click());
  for (let i = 0; i < 100 && !(await w.evaluate(() => window.__gravador.aberto && window.__gravador.cameraStream)); i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 2000));
  await w.keyboard.press('Alt+KeyE');
  for (let i = 0; i < 300 && !(await w.evaluate(() => !!window.__gravador.ultimoEnquadramento)); i++) await new Promise((r) => setTimeout(r, 200));
  console.log('Alt E ->', await w.evaluate(() => window.__gravador.ultimoEnquadramento && window.__gravador.ultimoEnquadramento.texto));
  const html = await w.evaluate(() => ['mel-analisar', 'an-analisar', 'an-finalizar', 'an-voltar'].map((id) => document.getElementById(id).textContent).join(' | '));
  console.log('botoes', html);
  // 1.8.5: Alt F na tela Alterar plano de fundo, fala (status) e foco no resultado, e o registro.
  await w.evaluate(({ arq }) => {
    const g = window.__gravador;
    g.origem = 'gravar'; g.fonteMelhoria = null;
    g.original = { arquivo: arq, nome: 'v.mp4', duracao: 30, formato: 'horizontal', qualidade: 'alta' };
    window.olho.mostrarTela('melhorar', { silencioso: true });
    document.getElementById('grav-melhorar').hidden = false; document.getElementById('grav-analisar').hidden = true;
    document.getElementById('mel-analisar-botoes').hidden = false;
    document.getElementById('mel-analisar').focus();
  }, { arq: process.env.VID || '/tmp/longo.mp4' });
  await w.keyboard.press('Alt+KeyF');
  for (let i = 0; i < 300 && !(await w.evaluate(() => /fundo/.test(document.getElementById('mel-analise').textContent) && !/Analisando/.test(document.getElementById('mel-analise').textContent))); i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Alt F ->', await w.evaluate(() => JSON.stringify({ tela: window.olho.telaAtual(), status: document.getElementById('status').textContent.slice(0, 120), foco: document.activeElement.id, texto: document.getElementById('mel-analise').textContent.slice(0, 120) })));
  // 1.8.6: Alt F várias vezes (e depois de trocar o fundo): cada vez analisa e fala de novo.
  for (let k = 2; k <= 4; k++) {
    if (k === 3) await w.evaluate(() => { const r = document.querySelector('input[name="efeito"][value="substituir"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); const f = document.querySelector('input[name="fundo"]'); if (f) { f.checked = true; f.dispatchEvent(new Event('change', { bubbles: true })); } r.focus(); });
    const antes = await w.evaluate(() => window.__gravador.anuncios.length);
    await w.keyboard.press('Alt+KeyF');
    let ok = false;
    for (let i = 0; i < 400 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = await w.evaluate((n) => window.__gravador.anuncios.slice(n).some((m) => /analise de novo/.test(m)) && !window.__gravador.analisandoFundo, antes); }
    console.log(`Alt F ${k}a vez ->`, ok ? 'falou de novo' : 'NADA', await w.evaluate((n) => JSON.stringify({ falas: window.__gravador.anuncios.slice(n).map((m) => m.slice(0, 70)), ocupado: window.__gravador.analisandoFundo, foco: document.activeElement.id || document.activeElement.name }), antes));
  }
  const reg = path.join(os.tmpdir(), 'Olho da Cena - analise');
  console.log('registro', fs.existsSync(reg) ? fs.readdirSync(reg).join(', ') : 'sem pasta');
  // 1.8.5: imagem antes do áudio; Alt A avança, Alt V volta.
  await w.evaluate(() => { window.__gravador.fonteMelhoria = null; window.gravarTela.abrirMelhorar(); });
  await new Promise((r) => setTimeout(r, 800));
  const onde = () => w.evaluate(() => window.olho.telaAtual() + ' / ' + [...document.querySelectorAll('section')].filter((x) => !x.hidden && !x.closest('[hidden]')).map((x) => x.id).join(','));
  console.log('fluxo inicio', await onde());
  await w.keyboard.press('Alt+KeyA'); await new Promise((r) => setTimeout(r, 2500));
  console.log('fluxo Alt A', await onde());
  await w.keyboard.press('Alt+KeyV'); await new Promise((r) => setTimeout(r, 1500));
  console.log('fluxo Alt V', await onde());
  await w.evaluate(() => { window.__gravador.fonteMelhoria = { arquivo: window.__gravador.original.arquivo, duracao: 30 }; window.gravarTela.abrirMelhorar(); });
  await new Promise((r) => setTimeout(r, 800));
  console.log('fase titulo', await w.evaluate(() => JSON.stringify({ efeito: !document.getElementById('mel-efeito-bloco').hidden, abertura: !document.getElementById('mel-abertura-bloco').hidden, analisar: !document.getElementById('mel-analisar-botoes').hidden, foco: document.activeElement.id, h2: document.getElementById('titulo-melhorar').textContent })));
  console.log('rotulos', await w.evaluate(() => [...document.querySelectorAll('button[data-atalho]')].map((b) => b.id + '=' + b.textContent).join(' | ')));
  if (fs.existsSync(path.join(reg, 'registro.txt'))) console.log(fs.readFileSync(path.join(reg, 'registro.txt'), 'utf8'));
  await app.close();
})();
