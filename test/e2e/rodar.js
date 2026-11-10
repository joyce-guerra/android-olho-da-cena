'use strict';
/* Olho da Cena: testes de ponta a ponta com Playwright _electron, câmera e microfone falsos.
   Teclas de acesso (accesskey, Alt + letra do menu) vão pelo xdotool, como teclas de verdade.
   Uso: xvfb-run -a node test/e2e/rodar.js [partes separadas por vírgula] */
const { _electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync, execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const GERADOR = process.env.GERADOR_203 || '/workspace/gerador-video-v2';
const MIDIA = '/tmp/gravador-teste-midia';
execFileSync(path.join(__dirname, 'preparar.sh'), [MIDIA], { stdio: 'ignore' });

let falhas = 0;
const linhas = [];
function conferir(nome, ok, extra = '') {
  const l = `${ok ? 'ok    ' : 'FALHOU'} ${nome}${extra !== '' ? ' — ' + String(extra).slice(0, 400) : ''}`;
  linhas.push(l); console.log(l);
  if (!ok) falhas++;
  return ok;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function sonda(arq) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,duration', '-of', 'json', arq]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  return { duracao: Number(j.format.duration), v, a };
}
function volumeMedio(arq) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', arq, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return m ? Number(m[1]) : -Infinity;
}
/** Instante (s) em que começa o clarão branco no vídeo (primeiro quadro bem claro). */
function tempoDoClarao(arq) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', arq, '-map', '0:v', '-vf', 'scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const pts = [];
  let t = null;
  for (const l of r.stdout.split('\n')) {
    const mt = /pts_time:([\d.]+)/.exec(l); if (mt) t = Number(mt[1]);
    const my = /YAVG=([\d.]+)/.exec(l); if (my) pts.push({ t, y: Number(my[1]) });
  }
  const max = Math.max(...pts.map((p) => p.y));
  const p = pts.find((x) => x.y > max - 15);
  return p ? p.t : null;
}
/** Instante (s) em que começa o bipe de 1000 Hz no áudio (janelas de 10 ms, 10 dB abaixo do pico). */
function tempoDoBipe(arq) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', arq, '-map', '0:a', '-af',
    'aresample=48000,bandpass=f=1000:width_type=q:w=8,bandpass=f=1000:width_type=q:w=8,asetnsamples=n=480:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const pts = [];
  let t = null;
  for (const l of r.stdout.split('\n')) {
    const mt = /pts_time:([\d.]+)/.exec(l); if (mt) t = Number(mt[1]);
    const mv = /RMS_level=(-?[\d.]+)/.exec(l); if (mv) pts.push({ t, v: Number(mv[1]) });
  }
  const max = Math.max(...pts.map((p) => p.v));
  const p = pts.find((x) => x.v > max - 10);
  return p ? p.t : null;
}

/** Vídeo de teste do Editar: 12 s, tom de 440 Hz com silêncios em 2–5 s e 8–10 s,
    e um clarão branco junto com um bipe de 1000 Hz em 6,0–6,2 s (para medir a sincronia). */
function videoDeTeste(dir) {
  const arq = path.join(dir, 'teste editar.mp4');
  if (!fs.existsSync(arq)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=12',
      '-f', 'lavfi', '-i', "aevalsrc='if(between(t,2,5)+between(t,8,10),0,if(between(t,6,6.2),0.8*sin(2*PI*1000*t),0.3*sin(2*PI*440*t)))':s=48000:d=12",
      '-vf', "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,6,6.2)',format=yuv420p",
      '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-shortest', arq]);
  }
  return arq;
}

/** Pico (dB) do bipe de 1000 Hz no áudio: alto no vídeo de teste, some quando o trecho 6–6,2 s é cortado. */
function picoDoBipe(arq) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', arq, '-map', '0:a', '-af',
    'bandpass=f=1000:width_type=q:w=8,bandpass=f=1000:width_type=q:w=8,volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return m ? Number(m[1]) : -Infinity;
}

/** Diferença média (0–255) entre dois vídeos no instante t, em cinza 64x36. */
function difQuadro(a, b, t) {
  const q = (arq) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', 'scale=64:36', '-pix_fmt', 'gray', '-f', 'rawvideo', '-']);
  const x = q(a), y = q(b);
  let soma = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) soma += Math.abs(x[i] - y[i]);
  return soma / Math.max(1, Math.min(x.length, y.length));
}

async function abrir(nome, config = null, extraEnv = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-e2e-'));
  if (config) { fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify(config)); }
  return lancar(tmp, nome, extraEnv);
}
async function lancar(tmp, clipe = 'centrado', extraEnv = {}) {
  const app = await _electron.launch({
    args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_VIDEO: path.join(MIDIA, clipe + '.y4m'), OLHO_TESTE_MIC: path.join(MIDIA, 'mic.wav'), ...extraEnv }
  });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message));
  w.on('console', (m) => { if (m.type() === 'error' && !/Autofill|DevTools|TensorFlow Lite XNNPACK/.test(m.text())) erros.push('console: ' + m.text()); });
  const ate = async (f, arg, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(120); }
    return false;
  };
  await ate(() => /pronto para começar/.test(document.getElementById('status').textContent));
  // Janelas de abrir e salvar: respondidas pelo teste (guardando a sugestão de pasta).
  await app.evaluate(({ dialog }) => {
    global.__abrir = []; global.__salvar = []; global.__sugestoes = [];
    dialog.showOpenDialog = async (_w, o) => { global.__sugestoes.push((o || _w || {}).defaultPath || ''); const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async (_w, o) => { global.__sugestoes.push((o || _w || {}).defaultPath || ''); const p = global.__salvar.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  });
  const abrirProximo = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const salvarProximo = (p) => app.evaluate((_e, x) => { global.__salvar.push(x); }, p);
  const sugestoes = () => app.evaluate(() => global.__sugestoes.slice());
  const status = () => w.textContent('#status');
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  /** Tecla de verdade (X11), para as teclas de acesso. */
  const tecla = async (k) => {
    const ids = execSync('xdotool search --name "Olho da Cena"').toString().trim().split(/\s+/);
    for (const id of ids) { try { execSync('xdotool windowfocus ' + id, { stdio: 'ignore' }); } catch (_) { /* */ } }
    execSync('xdotool key ' + k);
    await espera(400);
  };
  return { app, w, tmp, erros, ate, abrirProximo, salvarProximo, sugestoes, status, tela, tecla };
}

/** Grava (Alt R, espera, Alt R) e espera a parte "decidir". */
async function gravar(s, segundos = 3, comPausa = false) {
  const { w, ate } = s;
  const antes = await w.evaluate(() => window.__gravador.original && window.__gravador.original.arquivo);
  await w.keyboard.press('Alt+KeyR');
  await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  if (comPausa) {
    await espera(1200);
    await w.keyboard.press('Alt+KeyT');
    await espera(1000);
    await w.keyboard.press('Alt+KeyT');
  }
  await espera(segundos * 1000);
  await w.keyboard.press('Alt+KeyR');
  await ate((a) => window.__gravador.original && window.__gravador.original.arquivo !== a && !document.getElementById('grav-decidir').hidden, antes, 180000);
  await espera(500);
  return w.evaluate(() => window.__gravador.original);
}
async function melhorar(s, { efeito, fundo, modo = 'continuar' }) {
  const { w, ate } = s;
  await w.check(`#efeito-${efeito}`);
  if (fundo) await w.check(`#fundo-${fundo}`);
  const antes = await w.evaluate(() => window.__gravador.ultimaMelhoria && window.__gravador.ultimaMelhoria.arquivo);
  const n0 = await w.evaluate(() => window.__gravador.anuncios.length);
  await w.evaluate(() => { window.__pcts = []; if (!window.__assinouPct) { window.__assinouPct = true; window.api.aoProgressoMelhoria((p) => window.__pcts.push(p)); } });
  await w.click(modo === 'fechar' ? '#mel-fechar' : '#mel-continuar');
  const ok = await ate((a) => window.__gravador.ultimaMelhoria && window.__gravador.ultimaMelhoria.arquivo !== a && !window.__gravador.melhoria, antes, 900000);
  await espera(500);
  const falas = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(n0);
  const pcts = await w.evaluate(() => window.__pcts.slice());
  return { pcts, ok, r: await w.evaluate(() => window.__gravador.ultimaMelhoria), falas };
}

(async () => {
  const so = process.argv[2] ? process.argv[2].split(',') : null;
  const fazer = (n) => !so || so.includes(n);
  const NOME_ORIGINAL = /^Vídeo \d{4}-\d\d-\d\d \d\dh\d\dm\d\ds \((horizontal|vertical|quadrado)\)\.mp4$/;
  let gravacoes = [];
  let tmpPrincipal = null;

  // ------------------------------------------------------------ 1. Menu inicial e atalhos
  if (fazer('inicio') || fazer('gravar') || fazer('editar') || fazer('juntar')) {
    // Pasta antiga do Gravador presente: o aviso aparece uma vez e nada é mexido.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-e2e-'));
    tmpPrincipal = tmp;
    const antiga = path.join(tmp, 'Documentos', 'Gravador de Vídeo');
    fs.mkdirSync(antiga, { recursive: true });
    fs.writeFileSync(path.join(antiga, 'Vídeo antigo.mp4'), 'conteúdo de teste');
    let s = await lancar(tmp);
    const { w } = s;
    conferir('título da janela e da página: Olho da Cena', (await w.title()) === 'Olho da Cena', await w.title());
    const botoes = await w.$$eval('#tela-inicial button', (b) => b.map((x) => `${x.textContent.trim()}|${x.dataset.atalho || ''}`));
    conferir('menu inicial na ordem: Gravar (R), Montar (G), Editar (C), Juntar (J), Dividir (D); sem Melhorar',
      botoes.slice(0, 5).join(',') === 'Gravar vídeo|r,Montar vídeo|g,Editar vídeo|c,Juntar vídeos|j,Dividir vídeo|d' && !botoes.some((b) => /Melhorar/.test(b)), botoes.join(','));
    const st0 = await s.status();
    conferir('na abertura: avisa (uma vez) que as gravações antigas continuam na pasta Gravador de Vídeo', /gravações antigas continuam na pasta Gravador de Vídeo.*nada foi movido nem apagado.*Olho da Cena/.test(st0), st0);
    conferir('pasta Documentos/Olho da Cena criada e anunciada na tela inicial', fs.existsSync(path.join(tmp, 'Documentos', 'Olho da Cena')) && /pasta Olho da Cena, em Documentos/.test(await w.textContent('#pasta-info')));
    // Teclas de acesso de verdade.
    for (const [k, t] of [['alt+g', 'gerar'], ['alt+c', 'cortar'], ['alt+j', 'juntar'], ['alt+d', 'dividir']]) {
      await s.w.evaluate(() => window.olho.mostrarTela('inicial'));
      await s.tecla(k);
      conferir(`${k.toUpperCase().replace('ALT+', 'Alt ')} no início abre a tela ${t}`, (await s.tela()) === t, await s.tela());
      await s.tecla('alt+h');
      const ajuda = await w.evaluate(() => !document.getElementById('ajuda').hidden && document.getElementById('ajuda-lista').innerText);
      conferir(`Alt H abre a ajuda na tela ${t}`, !!ajuda, ajuda);
      await s.tecla('Escape');
    }
    await w.evaluate(() => window.olho.mostrarTela('inicial'));
    await s.tecla('alt+h');
    const ajudaIni = await w.evaluate(() => document.getElementById('ajuda-lista').innerText);
    conferir('Alt H no início lista os cinco atalhos do menu', /Alt R: Gravar vídeo[\s\S]*Alt G: Montar vídeo[\s\S]*Alt C: Editar vídeo[\s\S]*Alt J: Juntar vídeos[\s\S]*Alt D: Dividir vídeo/.test(ajudaIni), ajudaIni);
    await s.tecla('Escape');
    await s.tecla('alt+r');
    conferir('Alt R no início abre Gravar vídeo', (await s.tela()) === 'gravar');
    await s.ate(() => window.__gravador.pronto);
    await s.tecla('alt+h');
    conferir('Alt H não abre ajuda na tela Gravar', await w.evaluate(() => document.getElementById('ajuda').hidden));
    conferir('só a tela à vista tem teclas de acesso', await w.evaluate(() => [...document.querySelectorAll('[accesskey]')].every((e) => e.closest('section[id^="tela-"]') === document.getElementById('tela-' + window.olho.telaAtual()))));
    conferir('sem erros de página na abertura', !s.erros.length, s.erros.join(' | '));
    await s.app.close();
    s = await lancar(tmp);
    conferir('o aviso da pasta antiga não se repete', !/gravações antigas/.test(await s.status()), await s.status());
    conferir('a pasta antiga e o vídeo antigo continuam lá, intactos', fs.readFileSync(path.join(antiga, 'Vídeo antigo.mp4'), 'utf8') === 'conteúdo de teste');
    await s.app.close();
  }

  // ------------------------------------------------------------ 2. Gravar vídeo
  if (fazer('gravar') || fazer('editar') || fazer('juntar')) {
    const s = await lancar(tmpPrincipal, 'centrado', { OLHO_TESTE_TEXTO: path.join(RAIZ, 'testdata', 'texto.docx') });
    const { w, ate } = s;
    const ultimo = () => w.evaluate(() => window.__gravador.anuncios[window.__gravador.anuncios.length - 1] || '');
    await w.click('#ir-gravar');
    await ate(() => window.__gravador.pronto);
    const falaEntrada = await w.evaluate(() => window.__gravador.anuncios.join(' | '));
    conferir('entrar em Gravar: anuncia as teclas e pede proporção e qualidade', /Gravar vídeo\. Alt R grava, Alt T pausa, Alt E fala o enquadramento\. Antes da primeira gravação, escolha a proporção e a qualidade/.test(falaEntrada), falaEntrada);
    conferir('câmera aberta só com a tela Gravar à vista', await w.evaluate(() => !!document.getElementById('camera-video').srcObject));
    conferir('sem o botão Testar o espelho; caixa "câmera espelhada" marcada, com descrição nova',
      await w.evaluate(() => !document.getElementById('testar-espelho') && document.getElementById('espelhada').checked && /Vem marcado/.test(document.getElementById('espelhada-desc').textContent) && !/Testar/.test(document.getElementById('tela-gravar').innerText)));
    const fundos = await w.evaluate(() => [...document.querySelectorAll('input[name="fundo"]')].map((r) => document.querySelector(`label[for="${r.id}"]`).textContent));
    conferir('fundos: Escritório (no lugar de "Ambiente neutro e calmo") e Grafite com neon', fundos[0] === 'Escritório' && fundos.includes('Grafite com neon') && !fundos.some((f) => /neutro e calmo/.test(f)), fundos.join(', '));
    const descGrafite = await w.evaluate(() => document.getElementById(document.getElementById('fundo-grafite').getAttribute('aria-describedby')).textContent);
    conferir('Grafite com neon tem descrição', /neon/.test(descGrafite) && descGrafite.length > 80, descGrafite);
    await w.check('#formato-horizontal');
    await w.check('#qualidade-padrao');

    // Alt E: enquadramento e avisos novos.
    await w.evaluate(() => { window.__gravador.ultimoEnquadramento = null; });
    await w.keyboard.press('Alt+KeyE');
    await ate(() => !!window.__gravador.ultimoEnquadramento, null, 90000);
    const enq = await w.evaluate(() => window.__gravador.ultimoEnquadramento);
    conferir('Alt E: rosto centralizado, sem aviso falso de mão ou braço', /centralizado/.test(enq.texto) && !/Mão na frente|Braço cortado/.test(enq.texto), enq.texto);
    conferir('Alt E: dados de mão e braço calculados a partir da pose de 33 pontos', enq.dados && enq.dados.maoNoRosto === false && Array.isArray(enq.dados.bracoCortado), JSON.stringify(enq.dados));
    const avisos = await w.evaluate(() => {
      const PU = window.api.puro;
      const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 2, v: 0 }));
      Object.assign(p, { 0: { x: 0.5, y: 0.35, v: 0.9 }, 7: { x: 0.56, y: 0.33, v: 0.9 }, 8: { x: 0.44, y: 0.33, v: 0.9 }, 11: { x: 0.62, y: 0.6, v: 0.9 }, 12: { x: 0.38, y: 0.6, v: 0.9 }, 14: { x: 0, y: 0.7, v: 0.9 }, 19: { x: 0.5, y: 0.3, v: 0.9 } });
      const rostos = [{ x: 0.42, y: 0.2, w: 0.16, h: 0.28 }];
      return [PU.descreverEnquadramento({ rostos, pose: p, espelhada: false }).texto, PU.descreverEnquadramento({ rostos, pose: p, espelhada: true }).texto];
    });
    conferir('Alt E: "Mão na frente do rosto" e "Braço cortado na lateral", com o lado trocando conforme o espelho',
      /Mão na frente do rosto\./.test(avisos[0]) && /Braço cortado na lateral, à sua direita/.test(avisos[0]) && /Braço cortado na lateral, à sua esquerda/.test(avisos[1]), avisos.join(' || '));

    // Texto e frases com as setas para os lados também.
    await w.click('#abrir-texto');
    await ate(() => document.getElementById('frase-texto').textContent === 'O conto de teste');
    await w.focus('#frase');
    await w.keyboard.press('ArrowRight');
    const f1 = await w.textContent('#frase-texto');
    await w.keyboard.press('ArrowLeft');
    const f0 = await w.textContent('#frase-texto');
    await w.keyboard.press('End');
    const fEnd = await w.textContent('#frase-texto');
    await w.keyboard.press('Home');
    conferir('frases: seta para a direita avança, para a esquerda volta, End e Home', f1 === 'A Dra. Ana abriu a porta.' && f0 === 'O conto de teste' && fEnd !== f0 && (await w.textContent('#frase-texto')) === f0, [f1, f0, fEnd].join(' | '));
    // 1.7.1: cada frase lida uma vez (uma fala por seta; o nome da frase, que o NVDA também lê, não muda com o foco nela)
    // e, no começo do texto, a seta para cima lê a primeira frase em vez de "Começo do texto".
    {
      const n0 = await w.evaluate(() => window.__gravador.anuncios.length);
      const nome0 = await w.textContent('#frase-nome');
      await w.keyboard.press('ArrowDown');
      await w.keyboard.press('ArrowDown');
      const nomeFoco = await w.textContent('#frase-nome');
      await w.keyboard.press('ArrowUp'); await w.keyboard.press('ArrowUp');
      await w.keyboard.press('ArrowUp');
      const falas = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(n0);
      const ax = await w.evaluate(() => { const f = document.getElementById('frase'); return { lb: f.getAttribute('aria-labelledby'), txtOculto: document.getElementById('frase-texto').getAttribute('aria-hidden') }; });
      conferir('1.7.1: uma fala por seta (5 setas, 5 falas), cada frase uma vez; o nome não muda com o foco na frase', falas.length === 5 && nomeFoco === nome0 && ax.lb === 'frase-nome' && ax.txtOculto === 'true', JSON.stringify({ falas, nome0, nomeFoco, ax }));
      conferir('1.7.1: no começo do texto, a seta para cima lê a primeira frase (sem "Começo do texto")', falas[4] === 'O conto de teste' && !falas.some((f) => /Começo do texto|Início do texto/i.test(f)), falas.join(' | '));
      await w.focus('#gravar'); await w.keyboard.press('ArrowDown').catch(() => {});
      await w.evaluate(() => document.getElementById('gravar').focus());
      conferir('1.7.1: ao sair da frase, o nome passa a ser a frase atual (lida uma vez ao voltar)', (await w.textContent('#frase-nome')) === 'O conto de teste', await w.textContent('#frase-nome'));
    }

    // Gravação com pausa (Alt T).
    await w.focus('#gravar');
    await w.keyboard.press('Alt+KeyR');
    await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
    await espera(1500);
    await w.keyboard.press('Alt+KeyT');
    conferir('Alt T pausa a gravação', /^Gravação pausada/.test(await ultimo()) && await w.evaluate(() => window.__gravador.gravador.state === 'paused'), await ultimo());
    await espera(1200);
    await w.keyboard.press('Alt+KeyT');
    conferir('Alt T retoma a gravação', /^Gravação retomada/.test(await ultimo()) && await w.evaluate(() => window.__gravador.gravador.state === 'recording'), await ultimo());
    await w.click('#grav-inicio');
    conferir('durante a gravação não sai da tela Gravar', (await s.tela()) === 'gravar' && /Pare a gravação/.test(await s.status()), await s.status());
    await espera(5000);
    await w.keyboard.press('Alt+KeyR');
    await ate(() => !!window.__gravador.original && !document.getElementById('grav-decidir').hidden, null, 120000);
    await espera(600);
    const r1 = await w.evaluate(() => window.__gravador.original);
    const falaDecidir = await ultimo();
    const DOCS = path.join(tmpPrincipal, 'Documentos', 'Olho da Cena');
    conferir('1.3.1: depois de parar: Descartar vídeo, Salvar e fechar, Salvar e continuar, Voltar (sem Editar vídeo; foco em Salvar e fechar)',
      /Vídeo gravado, ainda não salvo\..*Escolha Descartar vídeo, Salvar e fechar, Salvar e continuar, ou Voltar\./.test(falaDecidir) && await w.evaluate(() => !document.getElementById('decidir-editar') && ['descartar', 'salvar-fechar', 'melhorar', 'decidir-voltar'].every((i) => !document.getElementById(i).hidden && document.getElementById(i).offsetParent) && document.activeElement.id === 'salvar-fechar'), falaDecidir);
    conferir('1.1: cada botão numa linha (um embaixo do outro)', await w.evaluate(() => {
      const ys = ['descartar', 'salvar-fechar', 'melhorar', 'decidir-voltar'].map((i) => document.getElementById(i).getBoundingClientRect().top);
      return ys.every((y, k) => k === 0 || y > ys[k - 1]);
    }));
    conferir('1.3.1: a gravação fica temporária (fora da pasta Olho da Cena) até salvar', r1.provisorio && fs.existsSync(r1.arquivo) && !r1.arquivo.startsWith(DOCS) && NOME_ORIGINAL.test(r1.nome) && !fs.existsSync(path.join(DOCS, r1.nome)), r1.arquivo);
    const p1 = sonda(r1.arquivo);
    conferir('original: H.264 1920x1080 com áudio AAC, sem o tempo pausado', p1.v.codec_name === 'h264' && p1.v.width === 1920 && p1.a.codec_name === 'aac' && p1.duracao > 5.5 && p1.duracao < 8, JSON.stringify({ d: p1.duracao, w: p1.v.width }));

    // 1.3.1: Salvar e continuar salva na pasta e vai direto para o áudio (Cortes).
    const ultimas = () => w.evaluate(() => window.__gravador.anuncios.slice(-1)[0] || '');
    await w.click('#melhorar');
    await ate(() => window.__audioCortes.video && window.__audioCortes.video.duracao > 0 && window.olho.telaAtual() === 'audio', null, 60000);
    const r1s = await w.evaluate(() => window.__gravador.original);
    conferir('1.3.1: Salvar e continuar salva o original na pasta Olho da Cena, nome de sempre, e apaga o temporário', r1s.arquivo === path.join(DOCS, r1.nome) && fs.existsSync(r1s.arquivo) && !fs.existsSync(r1.arquivo), r1s.arquivo);
    gravacoes.push(r1s.arquivo);
    conferir('1.3.1: Salvar e continuar abre Ajustes de áudio, Cortes, sem botão Enviar áudio', (await s.tela()) === 'audio' &&
      await w.evaluate(() => document.getElementById('au-nav-cortes').getAttribute('aria-current') === 'page' && !/Enviar/.test(document.getElementById('tela-audio').textContent)));
    conferir('1.3: nivelamento para a internet automático (ganho calculado)', await w.evaluate(() => Number.isFinite(window.__audioCortes.video.ganhoNivelar)));
    // 1.4: Espaço toca e pausa, como na 1.3.1 (Control Espaço saiu).
    conferir('1.4: Cortes tem os botões do tocador, na ordem', await w.evaluate(() => [...document.querySelectorAll('#au-tocador button')].map((b) => b.textContent).join(' | ')) ===
      'Tocar ou pausar, Espaço | Voltar meio segundo, seta para a esquerda | Avançar meio segundo, seta para a direita | Começo do áudio, Home | Final do áudio, End');
    conferir('1.4: a fala de entrada dos Cortes diz Espaço toca e pausa', /Cortes\..* Espaço toca e pausa\. Alt H lista os atalhos\./.test(await w.evaluate(() => window.__gravador.anuncios.join(' | '))) && !/Control Espaço/.test(await w.evaluate(() => window.__gravador.anuncios.join(' | '))));
    await w.evaluate(() => document.getElementById('au-inicio').focus());
    await w.keyboard.press('Control+Space'); await espera(500);
    const pausadoCtrl = await w.evaluate(() => document.getElementById('au-player').paused);
    await w.keyboard.press('Space'); await espera(700);
    const tocandoEsp = await w.evaluate(() => !document.getElementById('au-player').paused);
    await w.keyboard.press('Space'); await espera(300);
    conferir('1.4: Espaço toca e pausa; Control Espaço não faz nada', pausadoCtrl && tocandoEsp && await w.evaluate(() => document.getElementById('au-player').paused), JSON.stringify({ pausadoCtrl, tocandoEsp }));
    await w.click('#au-tocar'); await espera(700);
    const tocBotao = await w.evaluate(() => !document.getElementById('au-player').paused);
    await w.click('#au-tocar'); await espera(300);
    await w.click('#au-final'); await espera(200);
    const fimT = await w.evaluate(() => document.getElementById('au-player').currentTime);
    await w.click('#au-comeco'); await w.click('#au-avancar1'); await w.click('#au-avancar1'); await w.click('#au-voltar1'); await espera(200);
    const umT = await w.evaluate(() => document.getElementById('au-player').currentTime);
    conferir('1.7.1: os botões do tocador funcionam (tocar, final, começo, avançar e voltar meio segundo)', tocBotao && fimT > 1 && Math.abs(umT - 0.5) < 0.15, JSON.stringify({ tocBotao, fimT, umT }));
    await s.tecla('alt+h');
    const listaAu = await w.evaluate(() => document.getElementById('ajuda-lista').innerText);
    conferir('1.4: Alt H nos Cortes diz Barra de espaço', /Barra de espaço: tocar ou pausar/.test(listaAu) && !/Control com barra/.test(listaAu), listaAu);
    await w.evaluate(() => { document.getElementById('ajuda').hidden = true; });
    await w.evaluate(() => document.getElementById('au-inicio').focus());
    await w.keyboard.press('Alt+KeyD');
    conferir('1.3: Alt D sem descartes fala a mensagem', /Nenhum descarte encontrado\. Use Alt I e Alt F/.test(await ultimas()), await ultimas());
    await w.keyboard.press('Escape');
    const durG = await w.evaluate(() => window.__audioCortes.video.duracao);
    await w.evaluate(() => { document.getElementById('au-player').currentTime = 4; }); await espera(300);
    await w.keyboard.press('Alt+KeyI');
    await w.evaluate(() => { document.getElementById('au-player').currentTime = 5; }); await espera(300);
    await w.keyboard.press('Alt+KeyF');
    conferir('1.3: Alt F confirma a seleção', /Seleção 1 marcada, de 00:04 a 00:05/.test(await ultimas()), await ultimas());
    await w.keyboard.press('Alt+KeyD');
    conferir('1.3: Alt D lista "Descarte 1, de 00:04 a 00:05" com Ouvir, Descartar e Salvar', await w.evaluate(() => {
      const li = document.querySelector('#au-lista li');
      return !document.getElementById('au-descartes').hidden && li && /Descarte 1, de 00:04 a 00:05/.test(li.textContent) &&
        ['Ouvir trecho 1', 'Descartar trecho 1', 'Salvar trecho 1'].every((t) => [...li.querySelectorAll('button')].some((b) => b.textContent === t)); }));
    await w.click('#au-descartes-voltar');
    await w.keyboard.press('Delete');
    conferir('1.3: Del descarta a seleção', await w.evaluate(() => window.__audioCortes.cortados.length === 1 && window.__audioCortes.marcas.trechos.length === 0), await ultimas());
    // 1.6: Fim antes do Início, em qualquer ordem; com uma marca só, Alt S e Del avisam.
    await w.evaluate(() => { document.getElementById('au-player').currentTime = 3; }); await espera(300);
    await w.keyboard.press('Alt+KeyF');
    const fimPrimeiro = await ultimas();
    await w.keyboard.press('Alt+KeyS'); const avisoS = await ultimas();
    await w.keyboard.press('Delete'); const avisoDel = await ultimas();
    await w.evaluate(() => { document.getElementById('au-player').currentTime = 2; }); await espera(300);
    await w.keyboard.press('Alt+KeyI');
    const trocou = await w.evaluate(() => JSON.stringify(window.__audioCortes.marcas.trechos));
    conferir('1.6: Alt F antes do Alt I é aceito; Alt S e Del avisam que falta o início; fim antes do início troca sem aviso',
      /Fim da seleção 1 em 00:03/.test(fimPrimeiro) && /Falta o início da seleção: aperte Alt I/.test(avisoS) && /Falta o início/.test(avisoDel) &&
      /Seleção 1 marcada, de 00:02 a 00:03/.test(await ultimas()) && /"inicio":2(\.\d+)?,"fim":3/.test(trocou), [fimPrimeiro, avisoS, avisoDel, await ultimas(), trocou].join(' || '));
    await w.evaluate(() => { window.__audioCortes.marcas.trechos = []; window.__audioCortes.pendente = null; });
    // 1.6: Control com setas, com tecla de verdade (X11), nos Cortes.
    {
      const ler = () => w.evaluate(() => ({ r: document.getElementById('au-player').playbackRate, v: window.__audioCortes.volume }));
      await w.evaluate(() => document.getElementById('au-tocar').focus());
      const c0 = await ler(); await s.tecla('ctrl+Up'); await s.tecla('ctrl+Right'); const c1 = await ler();
      await s.tecla('ctrl+Down'); await s.tecla('ctrl+Left'); const c2 = await ler();
      conferir('1.6: Control com setas (teclas de verdade) nos Cortes: cima/baixo velocidade, direita/esquerda volume', c1.r > c0.r && c1.v > c0.v && c2.r === c0.r && c2.v === c0.v, JSON.stringify([c0, c1, c2]));
    }
    const n0 = await w.evaluate(() => window.__gravador.anuncios.length);
    await w.click('#au-continuar');
    // 1.4: Salvar e continuar dos Cortes leva para Silêncios e crossfade.
    await ate(() => !document.getElementById('au-silencios').hidden, null, 10000);
    const sil0 = await w.evaluate(() => ({
      nav: [...document.querySelectorAll('#au-telas button')].map((b) => b.textContent + (b.getAttribute('aria-current') ? '*' : '')).join(' | '),
      opcoes: [...document.querySelectorAll('#aus-opcoes label')].map((l) => l.textContent.trim()).join(' | '),
      cross: document.getElementById('aus-crossfade').disabled,
      fim: [...[...document.querySelectorAll('#au-silencios .controles')].pop().querySelectorAll('button')].map((b) => b.textContent).join(' | ')
    }));
    conferir('1.4: tela Silêncios e crossfade, com os links no começo marcando onde está', sil0.nav === 'Cortes | Silêncios e crossfade* | Efeitos e trilhas | Equalização e ajustes', sil0.nav);
    conferir('1.4: opções leve, equilibrado, agressivo e Crossfade (desligado sem o agressivo)', sil0.opcoes === 'Corte leve de silêncio | Corte equilibrado de silêncio | Corte agressivo de silêncio | Crossfade' && sil0.cross, JSON.stringify(sil0));
    conferir('1.4: termina com Salvar e continuar, Voltar, Fechar', sil0.fim === 'Salvar e continuar | Voltar | Fechar', sil0.fim);
    await w.click('#aus-leve'); await w.click('#aus-agressivo');
    const so1 = await w.evaluate(() => ({ l: document.getElementById('aus-leve').checked, a: document.getElementById('aus-agressivo').checked, c: document.getElementById('aus-crossfade').disabled }));
    conferir('1.4: só um corte de silêncio marcado; o agressivo libera o Crossfade', !so1.l && so1.a && !so1.c, JSON.stringify(so1));
    await w.click('#aus-agressivo');
    conferir('1.4: desmarcar todos é possível; Crossfade volta a ficar desligado', await w.evaluate(() => !document.querySelector('#aus-opcoes input:checked') && document.getElementById('aus-crossfade').disabled));
    await w.click('#aus-continuar');
    // 1.5: Salvar e continuar de Silêncios e crossfade leva para Efeitos e trilhas.
    await ate(() => !document.getElementById('au-trilhas').hidden, null, 10000);
    const tr0 = await w.evaluate(() => ({
      nav: [...document.querySelectorAll('#au-telas button')].map((b) => b.textContent + (b.getAttribute('aria-current') ? '*' : '')).join(' | '),
      botoes: [...document.querySelectorAll('#au-trilhas button')].map((b) => b.textContent).join(' | '),
      cincoSeg: /5 segundos/.test(document.getElementById('au-trilhas').textContent),
      vol: [...document.querySelectorAll('#e-trilha-volume option')].map((o) => o.textContent + (o.selected ? '*' : '')).join(' | '),
      salvou: !!window.__gravador.fonteMelhoria && window.__gravador.fonteMelhoria !== null && /editado/.test(window.__gravador.fonteMelhoria.arquivo || '')
    }));
    conferir('1.5: tela Efeitos e trilhas, com os links no começo marcando onde está', tr0.nav === 'Cortes | Silêncios e crossfade | Efeitos e trilhas* | Equalização e ajustes', tr0.nav);
    conferir('1.5: botões do Montar (sem o tocador de 5 segundos), tocador (cortar à mão só na Cortes), e no fim Salvar e continuar, Voltar, Fechar',
      tr0.botoes === 'Escolher arquivo de trilha | Marcar este ponto | Ouvir prévia da mistura aqui (6 segundos) | Adicionar trilha | Encerrar a trilha anterior aqui | Deixar as duas tocando | Tocar ou pausar, Espaço | Voltar meio segundo, seta para a esquerda | Avançar meio segundo, seta para a direita | Começo do áudio, Home | Final do áudio, End | Salvar e continuar | Voltar | Fechar' && !tr0.cincoSeg, tr0.botoes);
    conferir('1.5: volumes da trilha iguais aos do Montar, Baixa marcada', tr0.vol === 'Bem baixa, 6 por cento | Baixa, 10 por cento* | Média, 18 por cento | Alta, 30 por cento', tr0.vol);
    await w.evaluate(() => document.getElementById('aut-tocar').focus());
    await w.keyboard.press('Alt+KeyH'); await espera(300);
    const listaTr = await w.evaluate(() => document.getElementById('ajuda-lista').textContent);
    await w.keyboard.press('Escape');
    conferir('1.5: Alt H nos Efeitos e trilhas fala do Alt G da mistura e da barra de espaço', /Alt G: prévia da mistura de 6 segundos/.test(listaTr) && /Barra de espaço: tocar ou pausar/.test(listaTr), listaTr);
    await w.click('#aut-continuar');
    // 1.6: Salvar e continuar de Efeitos e trilhas leva para Equalização e ajustes, sem salvar ainda.
    await ate(() => !document.getElementById('au-eq').hidden, null, 10000);
    const eq0 = await w.evaluate(() => ({
      nav: [...document.querySelectorAll('#au-telas button')].map((b) => b.textContent + (b.getAttribute('aria-current') ? '*' : '')).join(' | '),
      botoes: [...document.querySelectorAll('#au-eq button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' | '),
      outros: [...document.querySelectorAll('#au-eq input')].map((i) => i.id + (i.checked ? '*' : '')).join(' '),
      salvando: window.__audioCortes.salvando
    }));
    conferir('1.6: tela Equalização e ajustes, com os links no começo marcando onde está', eq0.nav === 'Cortes | Silêncios e crossfade | Efeitos e trilhas | Equalização e ajustes*', eq0.nav);
    conferir('1.6: predefinições em botões (Neutro marcada), Ouvir prévia, tocador (cortar à mão só na Cortes), e no fim Salvar e continuar, Voltar, Fechar',
      eq0.botoes === 'Neutro* | Voz mais clara | Menos abafada | Voz mais encorpada | Menos chiado | Ouvir prévia, Alt P | Tocar ou pausar, Espaço | Voltar meio segundo, seta para a esquerda | Avançar meio segundo, seta para a direita | Começo do áudio, Home | Final do áudio, End | Salvar e continuar | Voltar | Fechar', eq0.botoes);
    conferir('1.6: Estéreo e Limitador marcados; bandas Graves, Médios, Agudos', eq0.outros === 'aue-estereo* aue-mono aue-limitador* aue-graves aue-medios aue-agudos', eq0.outros);
    {
      const nF = (await w.evaluate(() => window.__gravador.anuncios.length));
      await w.click('#aue-predefinicoes button:nth-of-type(2)');
      const falaPre = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(nF).join(' | ');
      conferir('1.6: escolher Voz mais clara fala as bandas como no Editar', /Voz mais clara: graves/.test(falaPre) && await w.evaluate(() => document.querySelector('#aue-predefinicoes button:nth-of-type(2)').getAttribute('aria-pressed') === 'true'), falaPre);
      const b0 = await w.evaluate(() => window.__gravador.bipes.length);
      await w.evaluate(() => document.getElementById('aue-tocar').focus());
      await w.keyboard.press('Alt+KeyH'); await espera(300);
      const listaEq = await w.evaluate(() => document.getElementById('ajuda-lista').textContent);
      const b1 = await w.evaluate(() => window.__gravador.bipes.length);
      await w.keyboard.press('Escape');
      conferir('1.6: Alt H na Equalização fala do Alt P, com bipe como o Alt E', /Alt P: toca e pausa a prévia de 6 segundos/.test(listaEq) && b1 > b0, listaEq);
      await w.evaluate(() => document.getElementById('aue-tocar').focus());
      await w.keyboard.press('Alt+KeyP');
      const tocouEq = await ate(() => !document.getElementById('aue-previa-player').paused && document.getElementById('aue-previa-player').currentTime > 0.2, null, 60000);
      await w.keyboard.press('Alt+KeyP'); await espera(300);
      conferir('1.6: Alt P toca e pausa a prévia da equalização', tocouEq && await w.evaluate(() => document.getElementById('aue-previa-player').paused));
      await w.keyboard.press('Space'); await espera(300);
      const tocaEsp = await w.evaluate(() => !document.getElementById('au-player').paused);
      await w.keyboard.press('Space'); await espera(200);
      conferir('1.6: Espaço toca e pausa o tocador na Equalização', tocaEsp);
      // 1.6: Control com setas, com tecla de verdade (X11), focado num botão e num controle deslizante.
      {
        const { tecla } = s;
        const v0 = await w.evaluate(() => ({ r: document.getElementById('au-player').playbackRate, v: window.__audioCortes.volume }));
        await w.evaluate(() => document.getElementById('aue-tocar').focus());
        await tecla('ctrl+Up'); await tecla('ctrl+Right');
        const v1 = await w.evaluate(() => ({ r: document.getElementById('au-player').playbackRate, v: window.__audioCortes.volume }));
        await tecla('ctrl+Down'); await tecla('ctrl+Left');
        const v2 = await w.evaluate(() => ({ r: document.getElementById('au-player').playbackRate, v: window.__audioCortes.volume}));
        conferir('1.6: Control com setas (teclas de verdade) mudam velocidade e volume, com foco no botão Tocar', v1.r > v0.r && v1.v > v0.v && v2.r === v0.r && v2.v === v0.v, JSON.stringify([v0, v1, v2]));
      }
      await w.click('#aue-voltar');
      conferir('1.6: Voltar da Equalização volta para Efeitos e trilhas', await w.evaluate(() => !document.getElementById('au-trilhas').hidden));
      await w.click('#aut-continuar');
      await ate(() => !document.getElementById('au-eq').hidden, null, 10000);
      await w.click('#aue-predefinicoes button:nth-of-type(1)');
    }
    conferir('1.6: até aqui nada foi salvo', !eq0.salvando);
    await w.click('#aue-continuar');
    const okG = await ate(() => window.olho.telaAtual() === 'melhorar' && !document.getElementById('grav-melhorar').hidden && !!window.__gravador.fonteMelhoria, null, 300000);
    await espera(800);
    const corteG = await w.evaluate(() => window.__gravador.fonteMelhoria);
    const pg = okG && sonda(corteG.arquivo);
    conferir('1.3.1: Salvar e continuar dos Cortes salva o vídeo cortado (1 s a menos) e vai para a imagem', okG && Math.abs(pg.duracao - (durG - 1)) < 0.25 && !!pg.a && !!pg.v, pg && `${pg.duracao} x ${durG}`);
    if (okG) gravacoes.push(corteG.arquivo);
    const falasImg = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(n0);
    const EXPL = 'O fundo substitui tudo o que aparece atrás de você por uma imagem, como um cenário.';
    conferir('1.3.1: a explicação do fundo é lida uma vez, no topo, e não em cada opção',
      falasImg.filter((f) => f.includes(EXPL)).length === 1 && await w.evaluate((e) => document.getElementById('mel-explica-fundo').textContent.startsWith(e) &&
        ![...document.querySelectorAll('#grupo-fundo input')].some((r) => (r.getAttribute('aria-describedby') || '').includes('mel-explica')), EXPL), falasImg.join(' || '));
    const mini = await w.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 500));
      const g = document.getElementById('grupo-fundo');
      if (g.hidden) { document.getElementById('efeito-substituir').click(); await new Promise((r) => setTimeout(r, 300)); }
      const imgs = [...g.querySelectorAll('img')];
      for (let k = 0; k < 150 && !imgs.every((i) => i.complete && i.naturalWidth > 0); k++) await new Promise((r) => setTimeout(r, 100));
      return { n: imgs.length, radios: g.querySelectorAll('input').length, decorativas: imgs.every((i) => i.alt === '' && i.getAttribute('aria-hidden') === 'true' && i.tabIndex < 0 && !i.closest('label')),
        carregadas: imgs.every((i) => i.naturalWidth > 0), falhas: imgs.filter((i) => !i.naturalWidth).map((i) => i.src.split('/').pop() + ':' + i.complete), texto: g.textContent, legenda: g.querySelector('legend').textContent,
        ordem: [...g.querySelectorAll('input')].map((r) => r.value) };
    });
    conferir('1.3.1: miniatura decorativa ao lado de cada fundo (alt vazio, aria-hidden, fora do rótulo)', mini.n === mini.radios && mini.n >= 17 && mini.decorativas && mini.carregadas, JSON.stringify({ n: mini.n, r: mini.radios, d: mini.decorativas, c: mini.carregadas, f: mini.falhas }));
    const alin = await w.evaluate(() => {
      const ls = [...document.querySelectorAll('#grupo-fundo .radio')].map((d) => ({ img: d.querySelector('img').getBoundingClientRect(), lab: d.querySelector('label').getBoundingClientRect(), desc: d.querySelector('.desc').getBoundingClientRect(), w: d.getBoundingClientRect().width }));
      const iguais = (f) => new Set(ls.map(f).map((v) => Math.round(v))).size === 1;
      return { ok: ls.length > 0 && iguais((l) => l.img.left) && iguais((l) => l.lab.left) && iguais((l) => l.desc.left) && iguais((l) => l.desc.width) && iguais((l) => l.w) && ls.every((l) => Math.round(l.lab.left) === Math.round(l.desc.left) && l.desc.top >= l.lab.bottom - 1),
        ordem: [...document.querySelectorAll('#grupo-fundo .radio')][0] && [...[...document.querySelectorAll('#grupo-fundo .radio')][0].children].map((c) => c.tagName).join(',') };
    });
    conferir('1.5: fundos alinhados: miniatura, nome e descrição na mesma coluna em todas as linhas, mesma largura; ordem do leitor igual', alin.ok && alin.ordem === 'IMG,INPUT,LABEL,P', JSON.stringify(alin));
    conferir('1.3.1: sem "fundo novo" na tela do fundo', !/fundo novo/i.test(mini.texto + mini.legenda + falasImg.join(' ')), mini.legenda);
    conferir('1.3.1: Céu estrelado no campo logo depois da Praia', mini.ordem.indexOf('ceu-estrelado') === mini.ordem.indexOf('praia') + 1, mini.ordem.join(','));
    const descCeu = await w.evaluate(() => document.getElementById('fundo-ceu-estrelado-desc').textContent);
    conferir('1.3.1: Céu estrelado lido como aplicação e descrição', /^Bom para leitura de contos, histórias para dormir, reflexões e conversas tranquilas\. Noite no campo, no interior de Minas Gerais/.test(descCeu), descCeu);
    conferir('1.3.1: "Fundo original" aparece no caminho da gravação', await w.evaluate(() => !!document.getElementById('efeito-nenhum').offsetParent));

    // Imagem (última etapa): botões e nomes da 1.3.1.
    const botImg = await w.evaluate(() => [...document.querySelectorAll('#melhorar-botoes button')].filter((b) => !b.hidden).map((b) => b.textContent));
    conferir('1.3.1: tela "Alterar plano de fundo" termina com Salvar e continuar, Salvar e fechar, Voltar', botImg.join('|') === 'Salvar e continuar|Salvar e fechar|Voltar' && (await w.textContent('#tela-melhorar h1')) === 'Alterar plano de fundo', botImg.join('|'));
    const m1 = await melhorar(s, { efeito: 'substituir', fundo: 'escritorio' });
    conferir('1.3.1: Salvar e continuar salva com fundo escritório (nome "fundo escritório")', m1.ok && /fundo escritório/.test(m1.r.nome), m1.r && m1.r.nome);
    conferir('processamento acompanha o andamento em por cento', m1.pcts.length > 2 && m1.pcts.some((p) => p > 0 && p < 100), m1.pcts.slice(0, 12).join(','));
    const pm1 = sonda(m1.r.arquivo);
    conferir('vídeo com fundo: 1920x1080', pm1.v.width === 1920 && pm1.v.height === 1080, JSON.stringify({ d: pm1.duracao, w: pm1.v.width, h: pm1.v.height }));
    await ate(() => !document.getElementById('grav-pronto').hidden, null, 10000);
    const botPronto = await w.evaluate(() => [...document.querySelectorAll('#grav-pronto button')].map((b) => b.textContent));
    const semTelaVelha = await w.evaluate(() => !document.getElementById('melhorar-pronto'));
    conferir('1.3.1: depois de Salvar e continuar vem "Vídeo salvo", sem Editar vídeo, Concluir ou Melhorar de novo', botPronto.join('|') === 'Gravar outro vídeo|Abrir a pasta|Voltar ao início' && semTelaVelha, botPronto.join('|'));
    conferir('1.3.1: nenhuma fala cita Concluir, Melhorar de novo ou Editar o vídeo melhorado', !m1.falas.some((f) => /Concluir|Melhorar de novo|vídeo melhorado/.test(f)), m1.falas.join(' / '));
    gravacoes.push(m1.r.arquivo);
    await w.evaluate(() => window.gravarTela.abrirMelhorar());
    const mSem = await melhorar(s, { efeito: 'substituir', fundo: 'grafite' });
    await w.evaluate(() => window.gravarTela.abrirMelhorar());
    await w.fill('#mel-abertura-titulo', 'Teste da versão 1.3.1');
    const m2 = await melhorar(s, { efeito: 'substituir', fundo: 'grafite' });
    await w.evaluate(() => { document.getElementById('mel-abertura-titulo').value = ''; });
    conferir('1.3.1: grafite + título salvo, com imagem e som, nome "fundo grafite"', m2.ok && /fundo grafite/.test(m2.r.nome) && !!sonda(m2.r.arquivo).a, m2.r && m2.r.nome);
    const pm2 = sonda(m2.r.arquivo);
    conferir('1.3.1: o corte está no vídeo final (1 s a menos que o original)', Math.abs(pm2.duracao - (p1.duracao - 1)) < 0.4, `${pm2.duracao} x ${p1.duracao}`);
    const dTit = difQuadro(m2.r.arquivo, mSem.r.arquivo, 1.0), dFim = difQuadro(m2.r.arquivo, mSem.r.arquivo, pm2.duracao - 0.6);
    conferir('1.3.1: o título aparece no começo do vídeo final (e some depois)', dTit > 6 && dFim < dTit / 3, `${dTit.toFixed(1)} x ${dFim.toFixed(1)}`);
    conferir('1.1: o último fundo e efeito ficam guardados', await w.evaluate(async () => { const c = (await window.api.configLer()).valor; return c.fundo === 'grafite' && c.efeito === 'substituir'; }));
    gravacoes.push(m2.r.arquivo, mSem.r.arquivo);

    // Conteúdo do corte e Fundo original: vídeo de teste (bipe de 1000 Hz em 6–6,2 s), cortando 5,5–6,7 s, com título.
    {
      const teste = videoDeTeste(DOCS);
      await w.evaluate((a) => window.__audioCortesAbrir({ arquivo: a }), teste);
      await ate(() => window.__audioCortes.video && /teste editar/.test(window.__audioCortes.video.arquivo) && window.olho.telaAtual() === 'audio', null, 60000);
      await w.evaluate(() => document.getElementById('au-inicio').focus());
      await w.evaluate(() => { document.getElementById('au-player').currentTime = 5.5; }); await espera(300);
      await w.keyboard.press('Alt+KeyI');
      await w.evaluate(() => { document.getElementById('au-player').currentTime = 6.7; }); await espera(300);
      await w.keyboard.press('Alt+KeyF');
      await w.keyboard.press('Alt+KeyS');
      await w.keyboard.press('Delete');
      await w.click('#au-continuar');
      await ate(() => !document.getElementById('au-silencios').hidden, null, 10000);
      await w.click('#aus-continuar');
      // 1.7.1: Efeitos e trilhas já tocam o vídeo cortado (10,8 s); a trilha marcada aos 8 s cai aos 8 s do vídeo final.
      await ate(() => !document.getElementById('au-trilhas').hidden, null, 60000);
      const durTr = await w.evaluate(() => ({ d: window.__audioCortes.video.duracao, pd: document.getElementById('au-player').duration }));
      conferir('1.7.1: Efeitos e trilhas trabalham no áudio já cortado (10,8 s)', Math.abs(durTr.d - 10.8) < 0.2, JSON.stringify(durTr));
      const tom = path.join(os.tmpdir(), 'olho-tom-440.wav');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', tom]);
      await w.evaluate((t) => { window.__audioCortes.trilhaEscolhida = t; }, tom);
      await w.click('#e-trilha-tipo-estatico');
      conferir('1.5: estática mostra o tempo, Marcar este ponto e a prévia', await w.evaluate(() => !document.getElementById('e-trilha-bloco-tempo').hidden));
      await w.evaluate(() => { document.getElementById('au-player').currentTime = 8; }); await espera(300);
      await w.click('#e-trilha-marcar'); await espera(300);
      conferir('1.5: Marcar este ponto usa o tocador universal', (await w.inputValue('#e-trilha-tempo')) === '00:00:08', await w.inputValue('#e-trilha-tempo'));
      await w.selectOption('#e-trilha-volume', '0.3');
      await w.evaluate(() => document.getElementById('aut-tocar').focus());
      const nb = await w.evaluate(() => window.__gravador.anuncios.length);
      await w.keyboard.press('Alt+KeyG');
      const tocouMix = await ate(() => !document.getElementById('e-previa-audio').paused && document.getElementById('e-previa-audio').currentTime > 0.2, null, 60000);
      const falaMix = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(nb).join(' | ');
      conferir('1.5: Alt G toca a prévia da mistura ali mesmo, sem tela própria, com a trilha ainda não adicionada', tocouMix && /Prévia de 6\.0 segundos/.test(falaMix) && await w.evaluate(() => document.getElementById('au-previa').hidden && !document.getElementById('au-trilhas').hidden), falaMix);
      await w.keyboard.press('Space'); await espera(200);
      await w.click('#e-btn-add-trilha'); await espera(300);
      const li = await w.evaluate(() => document.getElementById('e-lista-trilhas').textContent);
      conferir('1.5: trilha adicionada e lida como no Montar', /Trilha 1 de 1: olho-tom-440\.wav, estática, começa em 00:00:08, toca uma vez só, com fade na entrada e na saída, volume Alta, 30 por cento\./.test(li), li);
      // 1.6: Voz mais clara, mono e limitador, salvos junto com o resto.
      await w.click('#aut-continuar');
      await ate(() => !document.getElementById('au-eq').hidden, null, 10000);
      await w.click('#aue-predefinicoes button:nth-of-type(2)');
      await w.click('#aue-mono');
      await w.click('#aue-continuar');
      const okT = await ate(() => window.olho.telaAtual() === 'melhorar' && /teste editar editado/.test((window.__gravador.fonteMelhoria || {}).arquivo || ''), null, 300000);
      const corteT = await w.evaluate(() => window.__gravador.fonteMelhoria);
      await w.fill('#mel-abertura-titulo', 'Céu');
      const mT = await melhorar(s, { efeito: 'nenhum' });
      await w.evaluate(() => { document.getElementById('mel-abertura-titulo').value = ''; });
      const pt = mT.ok && sonda(mT.r.arquivo);
      conferir('1.3.1: Fundo original salva o vídeo final com 10,8 s (12 s menos 1,2 s)', okT && mT.ok && Math.abs(pt.duracao - 10.8) < 0.2, pt && pt.duracao + ' ' + (mT.r && mT.r.nome));
      const bOrig = picoDoBipe(teste), bCort = mT.ok ? picoDoBipe(mT.r.arquivo) : 0;
      conferir('1.3: o trecho cortado sumiu mesmo do arquivo final (o bipe não está mais lá)', mT.ok && bCort < bOrig - 15, `${bOrig} x ${bCort}`);
      const t1 = difQuadro(mT.r.arquivo, corteT.arquivo, 1.0), t8 = difQuadro(mT.r.arquivo, corteT.arquivo, 8.0);
      conferir('1.3.1: Fundo original: título no começo, aplicado depois dos cortes; o resto igual', t1 > 6 && t8 < 2, `${t1.toFixed(1)} x ${t8.toFixed(1)}`);
      const rms440 = (f, de, ate) => { const r = spawnSync('ffmpeg', ['-nostats', '-ss', String(de), '-t', String(ate - de), '-i', f, '-map', '0:a', '-af', 'bandpass=f=440:width_type=h:w=40,astats=metadata=0', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(r.stderr); return m ? (m[1] === '-inf' ? -200 : Number(m[1])) : null; };
      const naMarca = mT.ok ? rms440(mT.r.arquivo, 8.2, 8.8) : null, antes = mT.ok ? rms440(mT.r.arquivo, 2.0, 2.6) : null, cedo = mT.ok ? rms440(mT.r.arquivo, 7.0, 7.6) : null;
      conferir('1.7.1: a trilha marcada aos 8 s do áudio editado está aos 8 s do vídeo final (não remapeada de novo)', naMarca !== null && naMarca > antes + 15 && naMarca > cedo + 15, `${naMarca} x antes ${antes} x 7 s ${cedo} dB`);
      conferir('1.3: Alt S salvou o trecho em vídeo e em áudio', fs.existsSync(path.join(DOCS, 'teste editar - trecho 1.mp4')) && fs.existsSync(path.join(DOCS, 'teste editar - trecho 1.mp3')), fs.readdirSync(DOCS).join(' | '));
      const lufs = mT.ok ? (() => { const r = spawnSync('ffmpeg', ['-nostats', '-i', mT.r.arquivo, '-map', '0:a', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /Integrated loudness:\s*\n\s*I:\s+(-?[\d.]+) LUFS/.exec(r.stderr); return m ? Number(m[1]) : null; })() : null;
      conferir('1.3: vídeo final com o volume nivelado para a internet (perto de -16 LUFS)', lufs !== null && Math.abs(lufs + 16) < 1.5, lufs);
      const canais = mT.ok ? spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', corteT.arquivo], { encoding: 'utf8' }).stdout.trim() : '';
      const difLR = okT ? (() => { const r = spawnSync('ffmpeg', ['-nostats', '-i', corteT.arquivo, '-map', '0:a', '-af', 'pan=mono|c0=c0-c1,astats=metadata=0', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(r.stderr); return m ? m[1] : null; })() : null;
      conferir('1.6: Mono salvo de verdade (a voz igual nos dois ouvidos, ou um canal só)', canais === '1' || difLR === '-inf' || Number(difLR) < -80, `${canais} canais, diferença ${difLR}`);
      const eqSalvo = await w.evaluate(() => window.__audioCortes.eq);
      conferir('1.6: Voz mais clara foi salva junto (graves -2, médios +2, agudos +3)', JSON.stringify(eqSalvo) === JSON.stringify({ graves: -2, medios: 2, agudos: 3 }), JSON.stringify(eqSalvo));
    }

    // 1.4: Silêncios e crossfade com uma fala gravada de verdade (40 pausas), comparando com o Gerador 2.0.3 de antes da junção.
    {
      const FALA = process.env.FALA_SILENCIOS || '/workspace/silencio-teste/fala40.mp4';
      const fala = path.join(DOCS, 'fala silencios.mp4');
      fs.copyFileSync(FALA, fala);
      const G = require(path.join(GERADOR, 'src', 'render.js'));
      const velhos = await G.detectarSilencios(fala, { limiarDb: -30, duracaoMinima: 0.6, margem: 0.15 });
      const wavVelho = path.join(os.tmpdir(), 'gerador203-silencios.wav');
      const cv = await G.cortarAudio({ entrada: fala, descartes: velhos, saida: wavVelho });
      const durVelho = sonda(wavVelho).duracao;
      fs.unlinkSync(wavVelho);
      await w.evaluate((a) => window.__audioCortesAbrir({ arquivo: a }), fala);
      await ate(() => window.__audioCortes.video && /fala silencios/.test(window.__audioCortes.video.arquivo) && window.olho.telaAtual() === 'audio', null, 60000);
      await w.click('#au-continuar');
      await ate(() => !document.getElementById('au-silencios').hidden, null, 10000);
      await w.click('#aus-verificar');
      conferir('1.4: Verificar silêncios sem marcar nenhum corte só avisa', await w.evaluate(() => !document.getElementById('aus-dlg').open));
      await w.click('#aus-equilibrado');
      await w.click('#aus-verificar');
      await ate(() => document.getElementById('aus-dlg').open, null, 120000);
      const novos = await w.evaluate(() => window.__audioCortes.sil.lista);
      const qtd = await w.textContent('#aus-dlg-qtd');
      conferir('1.4: equilibrado acha exatamente os mesmos silêncios do Gerador 2.0.3', JSON.stringify(novos) === JSON.stringify(velhos) && qtd === `${velhos.length} silêncios encontrados.`, `${qtd} / Gerador: ${velhos.length}`);
      const botoesDlg = await w.evaluate(() => [...document.querySelectorAll('#aus-dlg button')].map((b) => b.textContent).join(' | '));
      conferir('1.4: o pop-up tem a quantidade, Ouvir prévia, Tentar de novo e Salvar e continuar', botoesDlg === 'Ouvir prévia | Tentar de novo | Salvar e continuar', botoesDlg);
      await w.keyboard.press('Alt+KeyP');
      const tocou = await ate(() => !document.getElementById('aus-previa-player').paused && document.getElementById('aus-previa-player').currentTime > 0.3, null, 120000);
      const durPrev = await w.evaluate(() => document.getElementById('aus-previa-player').duration);
      await w.keyboard.press('Alt+KeyP'); await espera(300);
      const pausou = await w.evaluate(() => document.getElementById('aus-previa-player').paused);
      conferir('1.4: Alt P toca a prévia inteira, já sem os silêncios, e pausa', tocou && pausou && Math.abs(durPrev - durVelho) < 0.15, `${durPrev} x Gerador ${durVelho}`);
      await w.click('#aus-tentar');
      conferir('1.4: Tentar de novo fecha o pop-up e volta para Silêncios e crossfade', await w.evaluate(() => !document.getElementById('aus-dlg').open && !document.getElementById('au-silencios').hidden && document.getElementById('aus-previa-player').paused));
      // Salvar com o equilibrado: mesma duração do Gerador 2.0.3 (as pausas que ficam são as mesmas).
      await w.click('#aus-verificar');
      await ate(() => document.getElementById('aus-dlg').open, null, 120000);
      await w.click('#aus-dlg-continuar');
      await ate(() => !document.getElementById('au-trilhas').hidden, null, 120000);
      conferir('1.5: Salvar e continuar do pop-up leva para Efeitos e trilhas, sem salvar ainda', await w.evaluate(() => !document.getElementById('aus-dlg').open && !window.__audioCortes.salvando));
      const durSil = await w.evaluate(() => window.__audioCortes.video.duracao);
      conferir('1.7.1: Efeitos e trilhas já tocam o áudio sem os silêncios (mesma duração da prévia)', Math.abs(durSil - durVelho) < 0.15, `${durSil} x ${durVelho}`);
      await w.click('#aut-continuar');
      await ate(() => !document.getElementById('au-eq').hidden, null, 10000);
      await w.click('#aue-continuar');
      const okE = await ate(() => window.olho.telaAtual() === 'melhorar' && /fala silencios editado/.test((window.__gravador.fonteMelhoria || {}).arquivo || ''), null, 600000);
      const fe = await w.evaluate(() => window.__gravador.fonteMelhoria);
      const pe = okE && sonda(fe.arquivo);
      conferir('1.4: Salvar e continuar do pop-up salva o vídeo com o corte equilibrado (mesma duração do Gerador 2.0.3) e vai para a imagem', okE && Math.abs(pe.duracao - durVelho) < 0.15 && !!pe.v && !!pe.a, pe && `${pe.duracao} x ${durVelho}`);
      if (okE) fs.unlinkSync(fe.arquivo);
      // Agressivo com crossfade: mesma duração (fades sem sobrepor), som contínuo.
      await w.evaluate((a) => window.__audioCortesAbrir({ arquivo: a }), fala);
      await ate(() => window.__audioCortes.video && window.olho.telaAtual() === 'audio' && !document.getElementById('au-cortes').hidden, null, 60000);
      await w.click('#au-nav-silencios');
      await w.click('#aus-agressivo'); await w.click('#aus-crossfade');
      const agr = await w.evaluate(async () => (await window.api.audiosilenciosDetectar({ entrada: window.__audioCortes.video.arquivo, limiarDb: -28, duracaoMinima: 0.4, margem: 0.08 })));
      await w.click('#aus-continuar');
      await ate(() => !document.getElementById('au-trilhas').hidden, null, 120000);
      await w.click('#aut-continuar');
      await ate(() => !document.getElementById('au-eq').hidden, null, 10000);
      await w.click('#aue-continuar');
      const okA = await ate(() => window.olho.telaAtual() === 'melhorar' && /fala silencios editado/.test((window.__gravador.fonteMelhoria || {}).arquivo || ''), null, 600000);
      const fa = await w.evaluate(() => window.__gravador.fonteMelhoria);
      const pa = okA && sonda(fa.arquivo);
      conferir('1.4: agressivo com crossfade salva vídeo mais curto que o equilibrado, imagem e som juntos', okA && pa.duracao < pe.duracao && Math.abs(Number(pa.v.duration || pa.duracao) - Number(pa.a.duration || pa.duracao)) < 0.2, pa && `${pa.duracao}; agressivo: ${(agr.valor || agr).silencios ? (agr.valor || agr).silencios.length : '?'} silêncios`);
      const mA = await melhorar(s, { efeito: 'nenhum' });
      conferir('1.4: depois dos silêncios, Alterar plano de fundo salva o vídeo final', mA.ok, mA.r && mA.r.nome);
      for (const f of [okA && fa.arquivo, mA.ok && mA.r.arquivo, fala]) if (f && fs.existsSync(f)) fs.unlinkSync(f);
    }
    await w.click('#voltar');
    conferir('Gravar outro vídeo volta para Gravar, pronto para gravar outro', (await s.tela()) === 'gravar' && await w.evaluate(() => !document.getElementById('grav-captura').hidden));
    await ate(() => !!document.getElementById('camera-video').srcObject, null, 15000);
    conferir('de volta ao Gravar, a câmera é aberta de novo', await w.evaluate(() => !!document.getElementById('camera-video').srcObject));

    // 1.3.1: Descartar vídeo apaga o temporário; Voltar confirma pela fala e descarta.
    const antesDocs = fs.readdirSync(DOCS).length;
    const rd = await gravar(s, 2);
    await w.click('#descartar');
    await ate(() => !document.getElementById('grav-captura').hidden, null, 10000);
    await espera(400);
    conferir('1.3.1: Descartar vídeo apaga o temporário, nada vai para a pasta, fica no Gravar', rd.provisorio && !fs.existsSync(rd.arquivo) && fs.readdirSync(DOCS).length === antesDocs && (await s.tela()) === 'gravar' && fs.existsSync(r1s.arquivo), rd.arquivo);
    const rv = await gravar(s, 2);
    await w.click('#decidir-voltar');
    await espera(400);
    conferir('1.3.1: o primeiro Voltar só avisa que o vídeo não foi salvo', /O vídeo ainda não foi salvo\. Aperte Voltar de novo/.test(await ultimo()) && (await s.tela()) === 'gravar' && fs.existsSync(rv.arquivo), await ultimo());
    await w.click('#decidir-voltar');
    await ate(() => window.olho.telaAtual() === 'inicial', null, 10000);
    conferir('1.3.1: o segundo Voltar descarta o temporário e vai para a tela inicial', (await s.tela()) === 'inicial' && !fs.existsSync(rv.arquivo) && fs.readdirSync(DOCS).length === antesDocs, rv.arquivo);
    await w.click('#ir-gravar');
    await ate(() => !!document.getElementById('camera-video').srcObject, null, 15000);

    // Segunda gravação, vertical: Salvar e continuar, Voltar dos Cortes, Voltar, e abre no Editar.
    await w.check('#formato-vertical');
    const r2 = await gravar(s, 2);
    conferir('gravação vertical com nome de sempre', NOME_ORIGINAL.test(r2.nome) && /\(vertical\)/.test(r2.nome), r2.nome);
    await w.click('#melhorar');
    await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && /vertical/.test(window.__audioCortes.video.arquivo), null, 60000);
    await w.click('#au-voltar');
    await ate(() => !document.getElementById('grav-decidir').hidden, null, 10000);
    const r2s = await w.evaluate(() => window.__gravador.original);
    conferir('1.3.1: Voltar dos Cortes volta para a escolha, com o vídeo já salvo', /Vídeo salvo com o nome/.test(await w.textContent('#decidir-info')) && fs.existsSync(r2s.arquivo) && r2s.arquivo.startsWith(DOCS), r2s.arquivo);
    gravacoes.push(r2s.arquivo);
    await w.click('#decidir-voltar');
    await ate(() => window.olho.telaAtual() === 'inicial', null, 10000);
    conferir('1.3.1: Voltar com o vídeo já salvo não apaga nada', fs.existsSync(r2s.arquivo));
    await w.click('#ir-cortar');
    s.abrirProximo(r2s.arquivo);
    await w.click('#c-btn-video');
    await s.ate(() => window.olho.telaAtual() === 'cortar' && /vertical/.test(document.getElementById('c-info').textContent), null, 20000);
    conferir('o vídeo gravado abre no Editar vídeo', (await s.tela()) === 'cortar' && (await w.textContent('#c-info')).includes(r2s.nome), await w.textContent('#c-info'));
    conferir('saindo do Gravar, a câmera é fechada', await w.evaluate(() => !document.getElementById('camera-video').srcObject));

    // Melhorar a partir do Editar, com o vídeo vertical.
    conferir('1.3.2: no Editar, a parte 7 e o botão se chamam Alterar plano de fundo', await w.evaluate(() => /^7\. Alterar plano de fundo \(opcional\)$/.test(document.getElementById('c-t-melhorar').textContent) && document.getElementById('c-btn-melhorar').textContent === 'Alterar plano de fundo' && !/Melhorar/.test(document.getElementById('tela-cortar').innerText)));
    await w.click('#c-btn-melhorar');
    conferir('Melhorar no Editar abre a tela Melhorar com o vídeo carregado', (await s.tela()) === 'melhorar' && (await w.textContent('#melhorar-voltar')) === 'Voltar, Alt V');
    conferir('1.1: o último fundo volta marcado (o último efeito foi Fundo original, que só existe depois de gravar: aqui vem Borrar)', await w.evaluate(() => document.getElementById('efeito-borrar').checked && document.getElementById('fundo-grafite').checked));
    conferir('sem erros de página no Gravar e no Alterar plano de fundo', !s.erros.length, s.erros.join(' | '));
    const fechou = new Promise((ok) => s.app.process().once('exit', () => ok(true)));
    const m3 = await melhorar(s, { efeito: 'borrar', modo: 'fechar' });
    const pm3 = sonda(m3.r.arquivo);
    conferir('Alterar plano de fundo do Editar: vertical continua 1080x1920, nome "fundo borrado"', m3.ok && pm3.v.width === 1080 && pm3.v.height === 1920 && /fundo borrado/.test(m3.r.nome), JSON.stringify({ n: m3.r && m3.r.nome, w: pm3.v.width, h: pm3.v.height }));
    const fechouMesmo = await Promise.race([fechou, espera(8000).then(() => false)]);
    conferir('1.3.1: Salvar e fechar salva e fecha o programa', fechouMesmo && fs.existsSync(m3.r.arquivo), m3.falas.join(' / '));
    await s.app.close().catch(() => {});
  }

  // ------------------------------------------------------------ 3. Editar vídeo: ajuste do áudio, silêncios, fades
  if (fazer('editar')) {
    const s = await abrir('centrado');
    const { w, ate } = s;
    const entrada = videoDeTeste(s.tmp);
    await w.click('#ir-cortar');
    s.abrirProximo(entrada);
    await w.click('#c-btn-video');
    await ate(() => /teste editar/.test(document.getElementById('c-info').textContent));
    const info0 = await w.textContent('#c-ajuste-info');
    conferir('ajuste começa neutro e diz a duração', /^Volume 100%, equalização Neutro, velocidade 100%\. Vídeo de 12 segundos\./.test(info0), info0);
    await w.focus('#c-tocar');
    await w.keyboard.press('Control+ArrowRight');
    await w.keyboard.press('Control+ArrowRight');
    conferir('Control + seta para a direita: volume 120%, anunciado', /^Volume 120%\./.test(await s.status()), await s.status());
    await w.keyboard.press('Control+ArrowLeft');
    conferir('Control + seta para a esquerda: volume 110%', /^Volume 110%\./.test(await s.status()), await s.status());
    await w.keyboard.press('Control+ArrowRight');
    for (let i = 0; i < 4; i++) await w.keyboard.press('Control+ArrowUp');
    conferir('Control + seta para cima: velocidade 120%, com a nova duração', /^Velocidade 120%\. Vídeo de 10 segundos\./.test(await s.status()), await s.status());
    await w.keyboard.press('Control+ArrowDown');
    await w.keyboard.press('Control+ArrowUp');
    await w.selectOption('#c-eq-predefinicao', 'clara');
    conferir('predefinição da equalização anunciada', /^Voz mais clara: graves menos 2 decibéis, médios mais 2 decibéis, agudos mais 3 decibéis\./.test(await s.status()), await s.status());
    const vt = await w.evaluate(() => ['c-eq-volume', 'c-eq-graves', 'c-eq-velocidade'].map((i) => document.getElementById(i).getAttribute('aria-valuetext')));
    conferir('controles deslizantes com valor falado (aria-valuetext)', vt.join('|') === '120%|menos 2 decibéis|120%', vt.join('|'));
    // Ouvir o ajuste: 6 s a partir de onde o vídeo está.
    await w.evaluate(() => { document.getElementById('c-player').currentTime = 1; });
    await w.click('#c-eq-ouvir');
    await ate(() => /arquivo/.test(document.getElementById('c-ajuste-player').src), null, 30000);
    const urlOuvir = await w.evaluate(() => document.getElementById('c-ajuste-player').src);
    const wav = decodeURIComponent(urlOuvir.split('/arquivo/')[1] || '');
    const pw = fs.existsSync(wav) ? sonda(wav) : { duracao: 0 };
    conferir('Ouvir o ajuste: prepara e toca 6 segundos (já com a velocidade)', /Preparando 6 segundos com o ajuste, a partir de 00:00:01/.test(await w.evaluate(() => window.__falas ? '' : document.getElementById('status').textContent)) || Math.abs(pw.duracao - 6) < 0.3, `${wav} ${pw.duracao}`);
    conferir('Ouvir o ajuste: arquivo de 6 s', Math.abs(pw.duracao - 6) < 0.3, pw.duracao);
    await w.evaluate(() => document.getElementById('c-ajuste-player').pause());
    // Removedor de silêncio e suavizar fades.
    await w.click('#c-btn-detectar-silencio');
    await ate(() => /silêncio\(s\) encontrado/.test(document.getElementById('c-silencio-status').textContent), null, 60000);
    const descartes = await w.evaluate(() => corte.descartes.map((d) => [d.inicio, d.fim]));
    conferir('removedor de silêncio acha os dois silêncios', descartes.length === 2, JSON.stringify(descartes));
    await w.check('#c-fade');
    conferir('suavizar fades anunciado', /Suavizar as emendas: marcado/.test(await s.status()));
    const plano = await w.evaluate(async () => window.api.planejarCortes({ descartes: corte.descartes.map((d) => ({ inicio: d.inicio, fim: d.fim })), duracao: corte.video.duracao }));
    // Salvar vídeo.
    const saidaV = path.join(s.tmp, 'Documentos', 'Olho da Cena', 'editado.mp4');
    await s.salvarProximo(saidaV);
    const falasSalvar = [];
    const coletor = setInterval(async () => { try { falasSalvar.push(await s.status()); } catch (_) { /* */ } }, 150);
    await w.click('#c-btn-cortar');
    await ate(() => /^Pronto\. O vídeo ficou com/.test(document.getElementById('status').textContent), null, 180000);
    clearInterval(coletor);
    const sug = await s.sugestoes();
    conferir('salvar vídeo: a janela sugere a pasta Olho da Cena', sug.some((x) => x.includes(path.join('Documentos', 'Olho da Cena'))), sug.join(' | '));
    conferir('salvar vídeo: anuncia o andamento em por cento', falasSalvar.some((f) => /\d+ por cento/.test(f)), [...new Set(falasSalvar)].slice(0, 6).join(' | '));
    const pv = sonda(saidaV);
    const esperado = plano.duracaoFinal / 1.2;
    conferir('vídeo salvo com cortes e velocidade 120%: duração certa', Math.abs(pv.duracao - esperado) < 0.35, `${pv.duracao} x ${esperado}`);
    conferir('imagem e som do mesmo tamanho (sincronia das trilhas)', Math.abs(Number(pv.v.duration) - Number(pv.a.duration)) < 0.12, `${pv.v.duration} x ${pv.a.duration}`);
    const tv = tempoDoClarao(saidaV), ta = tempoDoBipe(saidaV);
    conferir('clarão e bipe continuam juntos depois da velocidade (diferença < 40 ms)', tv !== null && ta !== null && Math.abs(tv - ta) < 0.04, `imagem ${tv} s, som ${ta} s`);
    const antesDoClarao = 6 - descartes.filter((d) => d[1] <= 6).reduce((a, d) => a + (d[1] - d[0]), 0);
    conferir('o clarão caiu no tempo esperado (cortes e velocidade)', tv !== null && Math.abs(tv - antesDoClarao / 1.2) < 0.15, `${tv} x ${antesDoClarao / 1.2}`);
    const vOrig = volumeMedio(entrada), vNovo = volumeMedio(saidaV);
    conferir('volume 120% e silêncios removidos: som mais alto que o original', vNovo > vOrig + 1, `${vOrig} → ${vNovo} dB`);
    // Salvar áudio.
    const saidaA = path.join(s.tmp, 'Documentos', 'Olho da Cena', 'editado.mp3');
    await s.salvarProximo(saidaA);
    await w.click('#c-btn-salvar-audio');
    await ate(() => /^Áudio salvo/.test(document.getElementById('status').textContent), null, 120000);
    const pa = sonda(saidaA);
    conferir('salvar áudio com o mesmo ajuste: MP3 da mesma duração do vídeo', pa.a.codec_name === 'mp3' && Math.abs(pa.duracao - pv.duracao) < 0.3, `${pa.duracao} x ${pv.duracao}`);
    // Só o ajuste (sem cortes): também salva.
    await w.click('#c-todos');
    await w.click('#c-eq-zerar');
    conferir('Voltar o áudio ao original anunciado', /^Áudio original: volume 100%, equalização Neutro, velocidade 100%\./.test(await s.status()), await s.status());
    for (let i = 0; i < 10; i++) await w.keyboard.press('Control+ArrowDown');
    conferir('velocidade tem mínimo 50%, avisado', /Velocidade 50%|já está em 50%, o mínimo/.test(await s.status()), await s.status());
    await w.evaluate(() => { const d = document.getElementById('c-eq-velocidade'); d.value = '80'; d.dispatchEvent(new Event('input')); });
    const descSel = await w.evaluate(() => corte.descartes.filter((d) => d.selecionado !== false).length);
    const saidaV2 = path.join(s.tmp, 'Documentos', 'Olho da Cena', 'so-ajuste.mp4');
    await s.salvarProximo(saidaV2);
    await w.click('#c-btn-cortar');
    await ate(() => /^Pronto\. O vídeo ficou com|Deu erro|Marque pelo menos/.test(document.getElementById('status').textContent), null, 180000);
    const pv2 = fs.existsSync(saidaV2) ? sonda(saidaV2) : { duracao: 0, v: {}, a: {} };
    conferir('só com o ajuste (velocidade 80%, sem descartes): salva um vídeo de 15 s', Math.abs(pv2.duracao - 15) < 0.4 && Math.abs(Number(pv2.v.duration) - Number(pv2.a.duration)) < 0.12, `${pv2.duracao} (descartes selecionados: ${descSel}) ${await s.status()}`);
    // Alt T no Editar: o tocador da tela (Tocar ou pausar).
    conferir('Ctrl + setas: descritas na ajuda do Editar', await (async () => { await w.evaluate(() => { document.getElementById('ajuda').hidden = true; }); await s.tecla('alt+h'); const t = await w.evaluate(() => document.getElementById('ajuda-lista').innerText); await s.tecla('Escape'); return /Control com seta para a direita/.test(t) && /Control com seta para cima/.test(t); })());
    conferir('sem erros de página no Editar', !s.erros.length, s.erros.join(' | '));
    await s.app.close();
  }

  // ------------------------------------------------------------ 4. Juntar e Dividir com vídeos gravados
  if (fazer('juntar') && gravacoes.length >= 2) {
    const s = await abrir('centrado');
    const { w, ate } = s;
    await w.click('#ir-juntar');
    await s.abrirProximo([gravacoes[0], gravacoes[1]]);
    await w.click('#j-btn-add');
    await ate(() => /2 vídeo\(s\) na lista/.test(document.getElementById('j-info').textContent));
    const saidaJ = path.join(s.tmp, 'Documentos', 'Olho da Cena', 'juntado.mp4');
    await s.salvarProximo(saidaJ);
    const falas = [];
    const col = setInterval(async () => { try { falas.push(await s.status()); } catch (_) { /* */ } }, 150);
    await w.click('#j-btn-juntar');
    await ate(() => /^Pronto\.|Deu erro/.test(document.getElementById('status').textContent), null, 300000);
    clearInterval(col);
    const pj = fs.existsSync(saidaJ) ? sonda(saidaJ) : { duracao: 0 };
    conferir('Juntar: junta o vídeo gravado e o melhorado', /^Pronto\./.test(await s.status()) && pj.duracao > 5, `${await s.status()} ${pj.duracao}`);
    conferir('Juntar: andamento em por cento', falas.some((f) => /\d+ por cento/.test(f)), [...new Set(falas)].slice(0, 8).join(' | '));
    await w.click('#j-btn-voltar');
    await w.click('#ir-dividir');
    await s.abrirProximo(gravacoes[0]);
    await w.click('#d-btn-video');
    await ate(() => /Vídeo carregado/.test(document.getElementById('status').textContent));
    await w.fill('#d-tamanho', '0:02');
    await w.click('#d-btn-dividir');
    await ate(() => /^Pronto\.|Deu erro/.test(document.getElementById('status').textContent), null, 300000);
    const st = await s.status();
    const pastaOlho = path.join(s.tmp, 'Documentos', 'Olho da Cena');
    const pastas = fs.existsSync(pastaOlho) ? fs.readdirSync(pastaOlho).filter((n) => /\(partes/.test(n)) : [];
    const partes = pastas.length ? fs.readdirSync(path.join(pastaOlho, pastas[0])) : [];
    conferir('Dividir: divide a gravação em partes, na pasta Olho da Cena', /^Pronto\. 2 partes/.test(st) && partes.length === 2, `${st} ${pastas} ${partes}`);
    conferir('sem erros de página no Juntar e no Dividir', !s.erros.length, s.erros.join(' | '));
    await s.app.close();
  }

  // ------------------------------------------------------------ 5. Montar vídeo: escolhas guardadas e mesmo resultado do Gerador 2.0.3
  if (fazer('montar')) {
    const s = await abrir('centrado');
    const { w } = s;
    await w.click('#ir-gerar');
    await w.keyboard.press('Control+Digit2');
    await espera(300);
    await w.selectOption('#formato', 'vertical');
    await w.keyboard.press('Control+Digit4');
    await espera(300);
    const presets = await w.$$eval('#preset option', (o) => o.map((x) => x.value));
    await w.selectOption('#preset', presets[2]);
    const quals = await w.$$eval('#qualidade option', (o) => o.map((x) => x.value));
    await w.selectOption('#qualidade', quals[quals.length - 1]);
    await espera(500);
    await s.app.close();
    const s2 = await lancar(s.tmp);
    const vals = await s2.w.evaluate(() => ['formato', 'preset', 'qualidade'].map((i) => document.getElementById(i).value));
    conferir('Montar: orientação, atmosfera e qualidade ficam guardadas', vals.join() === ['vertical', presets[2], quals[quals.length - 1]].join(), vals.join());
    // Mesma montagem pelo Olho da Cena (pela ponte da janela) e pelo Gerador 2.0.3 (direto no código dele).
    const dir = s.tmp;
    const audio = path.join(dir, 'audio.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=330:d=8:sample_rate=48000', '-ac', '2', audio]);
    const imgs = ['Sally_Ride_(1984).jpg', 'Mae_Carol_Jemison.jpg', 'corpo_inteiro.jpg'].map((n) => path.join(RAIZ, 'testdata', 'fontes', n));
    const cfg = { audio, imagens: imgs, modo: 'distribuir', presetId: presets[0], formatoId: 'horizontal', qualidadeId: quals[0], titulos: [], fim: 'Fim do teste', camadas: [], legenda: null };
    const saidaOlho = path.join(dir, 'montado-olho.mp4');
    const falas = [];
    const col = setInterval(async () => { try { falas.push(await s2.status()); } catch (_) { /* */ } }, 150);
    const r = await s2.w.evaluate((c) => window.api.iniciarRender(c), { ...cfg, saida: saidaOlho });
    clearInterval(col);
    conferir('Montar pelo Olho da Cena: vídeo pronto', r && r.ok && fs.existsSync(saidaOlho), JSON.stringify(r));
    await s2.app.close();
    const saidaGerador = path.join(dir, 'montado-gerador.mp4');
    const script = `require(${JSON.stringify(path.join(GERADOR, 'src', 'render.js'))}).renderizar(${JSON.stringify({ ...cfg, saida: saidaGerador })}, () => {}).then((r) => { console.log(JSON.stringify(r)); }).catch((e) => { console.error(e); process.exit(1); });`;
    execFileSync('node', ['-e', script], { cwd: GERADOR, stdio: 'ignore', timeout: 600000 });
    const md5 = (arq, m) => execFileSync('ffmpeg', ['-v', 'error', '-i', arq, '-map', m, '-f', 'md5', '-']).toString().trim();
    const po = sonda(saidaOlho), pg = sonda(saidaGerador);
    conferir('Montar: mesmas medidas e duração do Gerador 2.0.3', po.v.width === pg.v.width && po.v.height === pg.v.height && Math.abs(po.duracao - pg.duracao) < 0.05, `${po.v.width}x${po.v.height} ${po.duracao} x ${pg.v.width}x${pg.v.height} ${pg.duracao}`);
    const iv = md5(saidaOlho, '0:v') === md5(saidaGerador, '0:v'), ia = md5(saidaOlho, '0:a') === md5(saidaGerador, '0:a');
    conferir('Montar: imagem e som quadro a quadro iguais aos do Gerador 2.0.3', iv && ia, `imagem ${iv}, som ${ia}`);
  }

  console.log(`\n${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'} — ${linhas.length} conferências`);
  fs.writeFileSync(path.join(__dirname, 'ultimo-resultado' + (so ? '-' + so.join('-') : '') + '.txt'), linhas.join('\n') + `\n\n${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'}\n`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
