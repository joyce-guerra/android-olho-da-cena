'use strict';
/* Testes de ponta a ponta do Gravador de Vídeo (teste), com Playwright _electron,
   câmera falsa (y4m com rostos de verdade) e microfone falso (tom de 440 Hz).
   Uso: xvfb-run -a node test/e2e/rodar.js */
const { _electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const MIDIA = '/tmp/gravador-teste-midia';
execFileSync(path.join(__dirname, 'preparar.sh'), [MIDIA], { stdio: 'ignore' });

let falhas = 0;
const linhas = [];
function conferir(nome, ok, extra = '') {
  const l = `${ok ? 'ok    ' : 'FALHOU'} ${nome}${extra ? ' — ' + String(extra).slice(0, Number(process.env.EXTRA || 300)) : ''}`;
  linhas.push(l); console.log(l);
  if (!ok) falhas++;
  return ok;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrir(clipe, extraEnv = {}, config = null) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gravador-e2e-'));
  if (config) { fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify(config)); }
  const app = await _electron.launch({
    args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, GRAVADOR_TESTE_DADOS: path.join(tmp, 'dados'), GRAVADOR_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      GRAVADOR_TESTE_VIDEO: path.join(MIDIA, clipe + '.y4m'), GRAVADOR_TESTE_MIC: path.join(MIDIA, 'mic.wav'), ...extraEnv }
  });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message));
  // A política de segurança da página não deixa o Playwright usar eval; então conferimos com evaluate.
  const ate = async (f, arg, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(120); }
    return false;
  };
  await ate(() => window.__gravador && window.__gravador.pronto);
  const ultimo = () => w.evaluate(() => window.__gravador.anuncios[window.__gravador.anuncios.length - 1] || '');
  const anuncios = () => w.evaluate(() => window.__gravador.anuncios.slice());
  const enquadrar = async () => {
    await w.evaluate(() => { window.__gravador.ultimoEnquadramento = null; });
    await w.keyboard.press('Alt+KeyE');
    await ate(() => !!window.__gravador.ultimoEnquadramento, null, 60000);
    return w.evaluate(() => window.__gravador.ultimoEnquadramento.texto);
  };
  return { app, w, tmp, erros, ate, ultimo, anuncios, enquadrar };
}

function sonda(arq) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,pix_fmt', '-of', 'json', arq]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  return { duracao: Number(j.format.duration), v, a };
}
function volumeMedio(arq) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', arq, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return m ? Number(m[1]) : -Infinity;
}
/** Quadro em cinza 96 x 54 (ou 54 x 96), como lista de bytes. */
function quadroCinza(arq, t, w, h) {
  return execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-']);
}
function diferenca(a, b, w, linhaDe, linhaAte, colDe = 0, colAte = w) {
  let s = 0, n = 0;
  for (let y = linhaDe; y < linhaAte; y++) for (let x = colDe; x < colAte; x++) { s += Math.abs(a[y * w + x] - b[y * w + x]); n++; }
  return s / n;
}

function rms(arq) {
  // Nível do som a cada 0,1 s.
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', arq, '-map', '0:a', '-af',
    'asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const v = [];
  for (const m of r.stdout.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)) v.push(m[1] === '-inf' ? -200 : Number(m[1]));
  return v;
}
const sha = (arq) => require('crypto').createHash('sha256').update(fs.readFileSync(arq)).digest('hex');
/** Quadro em cinza no tamanho pedido. */
function cinza(arq, t, w, h) {
  return execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
}
/** Detalhe (nitidez) de uma região: diferença média entre vizinhos. */
function detalhe(q, w, x0, x1, y0, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1 - 1; x++) { s += Math.abs(q[y * w + x] - q[y * w + x + 1]) + Math.abs(q[y * w + x] - q[(y + 1) * w + x]); n++; }
  return s / n;
}
function difRegiao(a, b, w, x0, x1, y0, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Math.abs(a[y * w + x] - b[y * w + x]); n++; }
  return s / n;
}
const gbPorHora = (arq, dur) => (fs.statSync(arq).size / dur) * 3600 / 1e9;

async function escolher(s, formato, qualidade) {
  if (formato) await s.w.check(`#formato-${formato}`);
  if (qualidade) await s.w.check(`#qualidade-${qualidade}`);
}

/** Grava e espera a tela "Gravação pronta" (Salvar e finalizar ou Melhorar). */
async function gravar(s, { segundos = 2, pausa = 0, mover = false, durante = null } = {}) {
  const { w, ate } = s;
  const antes = await w.evaluate(() => window.__gravador.original && window.__gravador.original.arquivo);
  await w.keyboard.press('Alt+KeyR');
  await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  const t0 = Date.now();
  if (durante) await durante();
  await espera(Math.max(0, segundos * 500 - (Date.now() - t0)));
  if (mover) await w.keyboard.press('ArrowDown');
  if (pausa) {
    await w.keyboard.press('Alt+KeyT');
    await espera(pausa * 1000);
    await w.keyboard.press('Alt+KeyT');
  }
  await espera(Math.max(0, segundos * 1000 - (Date.now() - t0)));
  await w.keyboard.press('Alt+KeyR');
  await ate((a) => window.__gravador.original && window.__gravador.original.arquivo !== a && !document.getElementById('tela-decidir').hidden, antes, 180000);
  return w.evaluate(() => window.__gravador.original);
}
async function finalizar(s) {
  await s.w.click('#finalizar');
  await espera(500);
}
/** Melhorar a partir da tela "Gravação pronta" ou "Vídeo salvo". */
async function melhorar(s, { efeito, fundo, amostra }) {
  const { w, ate } = s;
  const botao = await w.evaluate(() => (!document.getElementById('tela-decidir').hidden ? 'melhorar' : 'melhorar-de-novo'));
  await w.click('#' + botao);
  await espera(300);
  await w.check(`#efeito-${efeito}`);
  if (fundo) await w.check(`#fundo-${fundo}`);
  const n0 = await w.evaluate(() => window.__gravador.anuncios.length);
  const antes = await w.evaluate(() => window.__gravador.ultimaMelhoria && window.__gravador.ultimaMelhoria.arquivo);
  const t0 = Date.now();
  await w.click(amostra ? '#amostra' : '#todo');
  const ok = await ate((a) => window.__gravador.ultimaMelhoria && window.__gravador.ultimaMelhoria.arquivo !== a && !document.getElementById('tela-pronto').hidden, antes, 900000);
  await espera(500);
  const r = await w.evaluate(() => window.__gravador.ultimaMelhoria);
  const falas = (await w.evaluate(() => window.__gravador.anuncios.slice())).slice(n0);
  return { ok, r, falas, ms: Date.now() - t0, tempos: await w.evaluate(() => window.__gravador.temposMelhoria) };
}

const TAMANHOS = { horizontal: { alta: [1920, 1080], padrao: [1920, 1080], leve: [1280, 720] },
  vertical: { alta: [1080, 1920], padrao: [1080, 1920], leve: [720, 1280] }, quadrado: { alta: [1080, 1080], padrao: [1080, 1080], leve: [720, 720] } };

(async () => {
  const so = process.argv[2] ? process.argv[2].split(',') : null;
  const fazer = (n) => !so || so.includes(n);
  // ---------------------------------------------------------------- 1. Sessão principal
  if (fazer('principal')) {
    const s = await abrir('centrado', { GRAVADOR_TESTE_TEXTO: path.join(RAIZ, 'testdata', 'texto.docx') });
    const { w, ate, ultimo, anuncios } = s;
    const cams = await w.$$eval('#camera option', (o) => o.map((x) => x.textContent));
    const mics = await w.$$eval('#microfone option', (o) => o.map((x) => x.textContent));
    conferir('lista as câmeras com nome', cams.length >= 1 && cams.every((c) => c.trim() && !/Nenhuma/.test(c)), cams);
    conferir('lista os microfones com nome (e o padrão do Windows)', mics[0] === 'Padrão do Windows' && mics.length >= 2 && mics.every(Boolean), mics);
    for (let i = 0; i < 20 && !(await anuncios()).some((a) => /Gravador pronto/.test(a)); i++) await espera(150);
    conferir('anuncia que está pronto e pede as escolhas', (await anuncios()).some((a) => /Gravador pronto.*escolha a proporção e a qualidade/.test(a)), (await anuncios()).join(' | '));
    conferir('foco começa na primeira opção de proporção', await w.evaluate(() => document.activeElement.id === 'formato-horizontal'));
    const grupos = await w.evaluate(() => ['formato', 'qualidade', 'uso'].map((n) => [...document.querySelectorAll(`input[name="${n}"]`)].map((r) => ({
      v: r.value, rotulo: document.querySelector(`label[for="${r.id}"]`).textContent, desc: document.getElementById(r.getAttribute('aria-describedby')).textContent,
      marcado: r.checked, legenda: r.closest('fieldset').querySelector('legend').textContent }))));
    conferir('proporção: horizontal, vertical e quadrado, cada uma com descrição', grupos[0].map((g) => g.v).join() === 'horizontal,vertical,quadrado' && grupos[0].every((g) => g.desc.length > 40 && g.rotulo), JSON.stringify(grupos[0]));
    conferir('qualidade: alta, padrão e leve, com tamanho por hora na descrição', grupos[1].map((g) => g.v).join() === 'alta,padrao,leve' && grupos[1].every((g) => /por hora/.test(g.desc)), JSON.stringify(grupos[1]));
    conferir('proporção e qualidade começam sem escolha', grupos[0].every((g) => !g.marcado) && grupos[1].every((g) => !g.marcado));
    conferir('uso do texto: "só no leitor de tela" já vem marcado', grupos[2].map((g) => g.v).join() === 'leitor,legenda' && grupos[2][0].marcado && grupos[2].every((g) => g.desc.length > 30), JSON.stringify(grupos[2]));
    conferir('a nota da qualidade fala do som AAC 48 kHz', /AAC, 48 kHz/.test(await w.textContent('#nota-qualidade')));

    await w.focus('#gravar');
    await w.keyboard.press('Alt+KeyR');
    await espera(300);
    conferir('Alt R sem proporção: avisa e leva o foco para a proporção', /ALERTA: Antes de gravar, escolha a proporção/.test(await ultimo()) && await w.evaluate(() => document.activeElement.name === 'formato') && !(await w.evaluate(() => !!window.__gravador.gravador)), await ultimo());
    await w.check('#formato-horizontal');
    await w.keyboard.press('Alt+KeyR');
    await espera(300);
    conferir('Alt R sem qualidade: avisa e leva o foco para a qualidade', /ALERTA: Antes de gravar, escolha a qualidade/.test(await ultimo()) && await w.evaluate(() => document.activeElement.name === 'qualidade'), await ultimo());
    await w.check('#qualidade-alta');

    let t = await s.enquadrar();
    conferir('Alt E antes de gravar: rosto centralizado, até o peito', t === 'Um rosto, centralizado. Mostrando até o peito.', t);
    await espera(3000);
    const nEnq = (await anuncios()).filter((a) => /rosto/i.test(a)).length;
    conferir('enquadramento não é falado sozinho', nEnq === 1, nEnq);

    await w.fill('#texto', 'Primeira frase do teste. O Sr. Lima chegou cedo! Terceira e última?');
    await w.dispatchEvent('#texto', 'change');
    conferir('cartão da frase aparece só com a frase', await w.evaluate(() => !document.getElementById('frase').hidden &&
      document.getElementById('frase-texto').textContent === 'Primeira frase do teste.' && document.getElementById('frase').innerText.trim() === 'Primeira frase do teste.'));
    await w.focus('#frase');
    const frase = () => w.textContent('#frase-texto');
    await w.keyboard.press('ArrowDown');
    conferir('seta para baixo avança e fala a frase', (await frase()) === 'O Sr. Lima chegou cedo!' && (await ultimo()).trim() === 'O Sr. Lima chegou cedo!', await ultimo());
    await w.keyboard.press('ArrowUp');
    await w.keyboard.press('ArrowUp');
    conferir('no começo avisa "Começo do texto."', (await ultimo()).trim() === 'Começo do texto.' && (await frase()) === 'Primeira frase do teste.');
    await w.keyboard.press('End');
    await w.keyboard.press('ArrowDown');
    conferir('End vai para a última; no fim avisa "Fim do texto."', (await frase()) === 'Terceira e última?' && (await ultimo()).trim() === 'Fim do texto.');
    await w.keyboard.press('Home');
    conferir('Home volta para a primeira', (await frase()) === 'Primeira frase do teste.');

    await w.click('#abrir-texto');
    await ate(() => document.getElementById('frase-texto').textContent === 'O conto de teste');
    await espera(400);
    conferir('abre texto do Word e avisa', (await frase()) === 'O conto de teste' && /Texto aberto: texto\.docx/.test(await ultimo()), await ultimo());
    await w.focus('#frase');
    await w.keyboard.press('ArrowDown');
    conferir('frase do Word sem cortar em "Dra."', (await frase()) === 'A Dra. Ana abriu a porta.', await frase());
    await w.keyboard.press('Home');

    await w.focus('#gravar');
    await w.keyboard.press('Alt+KeyT');
    conferir('Alt T sem gravação avisa', /Nenhuma gravação em andamento/.test(await ultimo()));

    // Gravação horizontal, alta, com pausa, sem legenda.
    await w.keyboard.press('Alt+KeyR');
    await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
    conferir('Alt R anuncia "Gravando." e leva o foco para a frase', (await ultimo()).trim() === 'Gravando.' && await w.evaluate(() => document.activeElement.id === 'frase'));
    conferir('durante a gravação, proporção, qualidade, câmera e microfone ficam bloqueados', await w.evaluate(() =>
      ['camera', 'microfone'].every((i) => document.getElementById(i).disabled) && [...document.querySelectorAll('input[name=formato],input[name=qualidade]')].every((r) => r.disabled)));
    await espera(2000);
    await w.keyboard.press('Alt+KeyT');
    conferir('Alt T pausa e anuncia', /^Gravação pausada/.test(await ultimo()) && await w.evaluate(() => window.__gravador.gravador.state === 'paused'));
    await espera(1500);
    await w.keyboard.press('Alt+KeyT');
    conferir('Alt T continua e anuncia', /^Gravação retomada/.test(await ultimo()) && await w.evaluate(() => window.__gravador.gravador.state === 'recording'));
    await w.keyboard.press('ArrowDown');
    conferir('setas andam pelas frases durante a gravação', (await frase()) === 'A Dra. Ana abriu a porta.');
    await espera(1500);
    await w.keyboard.press('Alt+KeyR');
    conferir('Alt R para e avisa que está salvando', await ate(() => window.__gravador.anuncios.some((a) => /Gravação parada\. Salvando/.test(a))));
    await ate(() => !!window.__gravador.original && !document.getElementById('tela-decidir').hidden, null, 90000);
    const r1 = await w.evaluate(() => window.__gravador.original);
    await espera(600);
    let fala = await ultimo();
    conferir('depois de parar: "Tudo pronto", nome, duração, e as duas opções', /^Tudo pronto\. Vídeo gravado com o nome Vídeo \d{4}-\d\d-\d\d \d\dh\d\dm\d\ds \(horizontal\)\. Duração: [34] segundos\. Escolha Salvar e finalizar, ou Melhorar\./.test(fala.trim()), fala);
    conferir('foco em "Salvar e finalizar"; "Melhorar" ao lado', await w.evaluate(() => document.activeElement.id === 'finalizar' && !document.getElementById('melhorar').hidden));
    await w.keyboard.press('Enter');
    await espera(600);
    fala = await ultimo();
    conferir('Salvar e finalizar: anuncia onde salvou', /^Vídeo salvo na pasta Documentos, Gravador de Vídeo, com o nome Vídeo .* \(horizontal\)\. Duração: [34] segundos\./.test(fala.trim()), fala);
    conferir('arquivo na pasta Documentos/Gravador de Vídeo', r1.arquivo === path.join(s.tmp, 'Documentos', 'Gravador de Vídeo', r1.nome) && fs.existsSync(r1.arquivo), r1.arquivo);
    const p1 = sonda(r1.arquivo);
    conferir('MP4 horizontal alta: H.264 1920x1080, 30 qps, yuv420p', p1.v.codec_name === 'h264' && p1.v.width === 1920 && p1.v.height === 1080 && p1.v.avg_frame_rate === '30/1' && p1.v.pix_fmt === 'yuv420p', JSON.stringify(p1.v));
    conferir('MP4 com áudio AAC 48 kHz', p1.a.codec_name === 'aac' && p1.a.sample_rate === '48000', JSON.stringify(p1.a));
    conferir('duração sem o tempo pausado (~3,5 s)', p1.duracao > 2.8 && p1.duracao < 4.4, p1.duracao);
    const vol = volumeMedio(r1.arquivo);
    conferir('o áudio do microfone foi gravado (sem silêncio)', vol > -40, vol + ' dB');
    const bipes = await w.evaluate(() => window.__gravador.bipes.map((b) => b.tipo));
    conferir('bipes: gravar, pausar, retomar e parar, na ordem', bipes.join() === 'gravar,pausar,retomar,parar', bipes.join());
    // O microfone falso é um tom de 440 Hz; os bipes de gravar e parar têm 660 e 990 Hz. Se vazassem, apareceriam no arquivo.
    const banda = (f) => { const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', r1.arquivo, '-map', '0:a', '-af', `bandpass=f=${f}:width_type=q:w=30,bandpass=f=${f}:width_type=q:w=30,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
      const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr); return m ? Number(m[1]) : -200; };
    const b990 = banda(990), b440 = banda(440);
    conferir('os bipes não entram na gravação (nada em 990 Hz; o tom do microfone em 440 Hz está lá)', b440 > -35 && b990 < b440 - 30, `440 Hz ${b440} dB, 990 Hz ${b990} dB`);
    conferir('não sobra arquivo temporário', fs.readdirSync(path.join(s.tmp, 'dados', 'gravando')).length === 0);
    conferir('tela de pronto com foco em "Voltar ao início"', await w.evaluate(() => !document.getElementById('tela-pronto').hidden && document.getElementById('tela-gravar').hidden && document.activeElement.id === 'voltar'));
    await w.keyboard.press('Enter');
    await espera(400);
    conferir('Voltar ao início volta para a gravação', await w.evaluate(() => !document.getElementById('tela-gravar').hidden && document.activeElement.id === 'gravar') && /Pronto para gravar outro/.test(await ultimo()));

    // 0.3: Alt E durante a gravação fala, e o som da gravação NÃO fica mudo (grava-se com fone de ouvido).
    await w.check('#qualidade-padrao');
    const r5 = await gravar(s, { segundos: 11, durante: async () => {
      await espera(2500);
      await w.evaluate(() => { window.__gravador.ultimoEnquadramento = null; });
      await w.keyboard.press('Alt+KeyE');
      await ate(() => !!window.__gravador.ultimoEnquadramento, null, 20000);
    } });
    const enqDurante = await w.evaluate(() => window.__gravador.ultimoEnquadramento);
    conferir('Alt E durante a gravação funciona', enqDurante && enqDurante.durante && enqDurante.texto === 'Um rosto, centralizado. Mostrando até o peito.', JSON.stringify(enqDurante && enqDurante.texto));
    const p5 = sonda(r5.arquivo);
    const niveis = rms(r5.arquivo).filter((_, i) => i / 10 > 0.6 && i / 10 < p5.duracao - 0.6);
    conferir('0.3: o som NÃO fica mudo no Alt E (nenhum trecho em silêncio)', niveis.length > 80 && Math.min(...niveis) > -45 && !('silencios' in (await w.evaluate(() => window.__gravador))),
      `mínimo ${Math.min(...niveis).toFixed(0)} dB em ${niveis.length} trechos`);
    conferir('vídeo inteiro (~11 s)', p5.duracao > 10 && p5.duracao < 12.5 && p5.v.width === 1920, p5.duracao);
    await finalizar(s);
    await w.click('#voltar');

    // Com legenda (opção "mostrar na tela").
    await w.check('#qualidade-alta');
    await w.check('#uso-legenda');
    await w.focus('#frase');
    await w.keyboard.press('Home');
    const r2 = await gravar(s, { segundos: 2 });
    await finalizar(s);
    const p2 = sonda(r2.arquivo);
    conferir('vídeo com legenda salvo', p2.v.width === 1920 && p2.a.codec_name === 'aac', JSON.stringify(p2.v));
    const q1 = quadroCinza(r1.arquivo, 0.5, 96, 54), q2 = quadroCinza(r2.arquivo, 1, 96, 54);
    const baixo = diferenca(q1, q2, 96, 45, 50, 36, 60), cima = diferenca(q1, q2, 96, 0, 30);
    conferir('legenda queimada embaixo só quando "mostrar na tela"', baixo > 12 && cima < 4, `embaixo ${baixo.toFixed(1)}, em cima ${cima.toFixed(1)}`);

    // Quadrado e vertical (Alt R na tela de pronto já grava outro).
    await w.click('#voltar');
    await w.check('#formato-quadrado');
    const rq = await gravar(s, { segundos: 2 });
    await finalizar(s);
    const pq = sonda(rq.arquivo);
    conferir('MP4 quadrado 1080x1080 com áudio e nome "(quadrado)"', pq.v.width === 1080 && pq.v.height === 1080 && pq.a.codec_name === 'aac' && / \(quadrado\)\.mp4$/.test(rq.nome), JSON.stringify(pq.v) + rq.nome);
    const qq = quadroCinza(rq.arquivo, 1, 54, 54);
    conferir('legenda também cabe no quadrado', diferenca(qq, quadroCinza(rq.arquivo, 1, 54, 54), 54, 0, 54) === 0 && qq.subarray(54 * 47, 54 * 50).some((v) => v > 200), 'linha clara da legenda embaixo');
    await w.click('#voltar');
    await w.check('#formato-vertical');
    await w.check('#uso-leitor');
    const r3 = await gravar(s, { segundos: 2 });
    await finalizar(s);
    const p3 = sonda(r3.arquivo);
    conferir('MP4 vertical 1080x1920 com áudio', p3.v.width === 1080 && p3.v.height === 1920 && p3.a.codec_name === 'aac' && / \(vertical\)\.mp4$/.test(r3.nome), JSON.stringify(p3.v));
    const r4 = await gravar(s, { segundos: 1 });
    conferir('Alt R na tela de pronto já grava outro', r4.arquivo !== r3.arquivo && fs.existsSync(r4.arquivo));
    await w.keyboard.press('Alt+KeyR');
    await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
    conferir('Alt R na tela "Gravação pronta" também grava outro (o anterior fica salvo)', fs.existsSync(r4.arquivo) && await w.evaluate(() => !document.getElementById('tela-gravar').hidden));
    await espera(1200);
    await w.keyboard.press('Alt+KeyR');
    await ate(() => !document.getElementById('tela-decidir').hidden, null, 60000);
    const cfg = JSON.parse(fs.readFileSync(path.join(s.tmp, 'dados', 'configuracoes.json'), 'utf8'));
    conferir('guarda proporção, qualidade e uso do texto para a próxima vez', cfg.formato === 'vertical' && cfg.qualidade === 'alta' && cfg.legenda === false, JSON.stringify(cfg).slice(0, 160));
    conferir('sem erros na página', s.erros.length === 0, s.erros.join(' | '));
    await s.app.close();
    // Abre de novo: as escolhas já vêm marcadas.
    const s2 = await abrir('centrado', { GRAVADOR_TESTE_DADOS: path.join(s.tmp, 'dados'), GRAVADOR_TESTE_DOCUMENTOS: path.join(s.tmp, 'Documentos') });
    const marc = await s2.w.evaluate(() => [...document.querySelectorAll('input:checked')].map((r) => r.id).join());
    conferir('ao abrir de novo, proporção e qualidade já vêm escolhidas', /formato-vertical/.test(marc) && /qualidade-alta/.test(marc), marc);
    await s2.app.close();
  }

  // ---------------------------------------------------------------- 2. Qualidades x proporções
  if (fazer('qualidades')) {
    const s = await abrir('ruido');
    const SEG = 16;
    const lim = { alta: [0.5, 5.8], padrao: [1.3, 2.1], leve: [0.6, 1.1] };
    for (const q of ['alta', 'padrao', 'leve']) {
      for (const f of ['horizontal', 'vertical', 'quadrado']) {
        await escolher(s, f, q);
        const r = await gravar(s, { segundos: SEG });
        await finalizar(s);
        await s.w.click('#voltar');
        const p = sonda(r.arquivo);
        const [W, H] = TAMANHOS[f][q];
        const g = gbPorHora(r.arquivo, p.duracao);
        const kbps = (fs.statSync(r.arquivo).size * 8) / p.duracao / 1000;
        conferir(`${q} ${f}: ${W}x${H}, 30 qps, AAC 48 kHz; ${g.toFixed(2)} GB por hora (muito movimento)`,
          p.v.width === W && p.v.height === H && p.v.avg_frame_rate === '30/1' && p.a.codec_name === 'aac' && p.a.sample_rate === '48000' && g >= lim[q][0] && g <= lim[q][1],
          `${p.v.width}x${p.v.height}, ${kbps.toFixed(0)} kbit/s, ${p.duracao.toFixed(1)} s`);
      }
    }
    conferir('sem erros na página (qualidades)', s.erros.length === 0, s.erros.join(' | '));
    await s.app.close();
  }

  // ---------------------------------------------------------------- 3. Gravação longa: memória estável
  if (fazer('longa')) {
    const minutos = Number(process.env.MINUTOS || 4);
    const s = await abrir('ruido');
    await escolher(s, 'horizontal', 'padrao');
    const memoria = async () => (await s.app.evaluate(({ app }) => app.getAppMetrics())).reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024;
    const pasta = path.join(s.tmp, 'dados', 'gravando');
    const tamTemp = () => fs.readdirSync(pasta).reduce((a, n) => a + fs.statSync(path.join(pasta, n)).size, 0) / 1e6;
    const amostras = [];
    const r = await gravar(s, { segundos: minutos * 60, durante: async () => {
      for (let i = 0; i < minutos * 6; i++) {
        await espera(10000);
        amostras.push({ t: (i + 1) * 10, mem: await memoria(), disco: tamTemp() });
      }
    } });
    const depoisDe1min = amostras.filter((a) => a.t >= 60);
    const memMin = Math.min(...depoisDe1min.map((a) => a.mem)), memMax = Math.max(...depoisDe1min.map((a) => a.mem));
    const ultimaMem = amostras[amostras.length - 1].mem, primeiraMem = depoisDe1min[0].mem;
    conferir(`gravação de ${minutos} minutos: memória estável (de 1 min até o fim)`, ultimaMem - primeiraMem < 120 && memMax - memMin < 200,
      `${primeiraMem.toFixed(0)} → ${ultimaMem.toFixed(0)} MB (mín ${memMin.toFixed(0)}, máx ${memMax.toFixed(0)})`);
    const discos = amostras.map((a) => a.disco);
    conferir('o vídeo vai para o disco durante a gravação (arquivo temporário cresce)', discos.every((d, i) => i === 0 || d > discos[i - 1]) && discos[discos.length - 1] > 50,
      discos.map((d) => d.toFixed(0)).join(', ') + ' MB');
    const p = sonda(r.arquivo);
    conferir(`vídeo longo salvo inteiro (~${minutos * 60} s)`, Math.abs(p.duracao - minutos * 60) < 3, p.duracao);
    const g = gbPorHora(r.arquivo, p.duracao);
    conferir('padrão no vídeo longo: entre 1,3 e 2,1 GB por hora', g > 1.3 && g < 2.1, g.toFixed(2));
    const falas = await s.anuncios();
    const pcts = falas.filter((a) => /^Salvando: \d+ por cento\.$/.test(a.trim()));
    conferir('a conversão anuncia a porcentagem', pcts.length >= 1, pcts.join(' | ') || falas.slice(-4).join(' | '));
    fs.writeFileSync(path.join(RAIZ, 'test', 'e2e', 'memoria-longa.json'), JSON.stringify(amostras, null, 1));
    conferir('sem erros na página (longa)', s.erros.length === 0, s.erros.join(' | '));
    await s.app.close();
  }

  // ---------------------------------------------------------------- 4. Melhorar
  if (fazer('melhorar')) {
    const s = await abrir('cenario');
    const { w } = s;
    await escolher(s, 'horizontal', 'padrao');
    const o = await gravar(s, { segundos: 12 });
    const hashOriginal = sha(o.arquivo);
    const po = sonda(o.arquivo);
    await w.click('#melhorar');
    await espera(500);
    const efeitos = await w.evaluate(() => [...document.querySelectorAll('input[name=efeito]')].map((r) => ({ v: r.value, marcado: r.checked,
      desc: document.getElementById(r.getAttribute('aria-describedby')).textContent })));
    conferir('Melhorar: só "borrar" e "substituir" o fundo, com descrições; borrar já marcado', efeitos.map((e) => e.v).join() === 'borrar,substituir' && efeitos[0].marcado && efeitos.every((e) => e.desc.length > 60), JSON.stringify(efeitos));
    conferir('os fundos só aparecem ao escolher "substituir"', await w.evaluate(() => document.getElementById('grupo-fundo').hidden));
    await w.check('#efeito-substituir');
    const fundos = await w.evaluate(() => ({ visivel: !document.getElementById('grupo-fundo').hidden, f: [...document.querySelectorAll('input[name=fundo]')].map((r) => ({ v: r.value, marcado: r.checked,
      nome: document.querySelector(`label[for="${r.id}"]`).textContent, desc: document.getElementById(r.getAttribute('aria-describedby')).textContent })) }));
    conferir('quatro fundos (ambiente neutro, praia, sala de estar, carro com crochê), com descrições', fundos.visivel && fundos.f.map((f) => f.v).join() === 'consultorio,praia,sala,carro' && fundos.f[0].marcado && fundos.f.every((f) => f.desc.length > 60) &&
      fundos.f[0].nome === 'Ambiente neutro e calmo' && /irreverentes/.test(fundos.f[3].desc) && !/psic|consultório/i.test(JSON.stringify(fundos)), JSON.stringify(fundos));
    conferir('0.3: Melhorar não mostra "Melhorar áudio"', await w.evaluate(() => !document.getElementById('grupo-audio') && !document.getElementById('eq-volume')));
    await w.click('#melhorar-voltar');
    await espera(300);

    const qo = cinza(o.arquivo, 6, 160, 90);
    const casos = [['borrar', null], ['substituir', 'consultorio'], ['substituir', 'praia'], ['substituir', 'sala'], ['substituir', 'carro']];
    const tempos = [];
    for (const amostra of process.env.SO_CANCELAR ? [] : [true, false]) {
      for (const [efeito, fundo] of casos) {
        const nome = `${efeito}${fundo ? ' ' + fundo : ''} (${amostra ? 'amostra' : 'vídeo todo'})`;
        const m = await melhorar(s, { efeito, fundo, amostra });
        if (!conferir(`Melhorar ${nome}: termina`, m.ok, m.falas.join(' | '))) continue;
        const sufixo = { borrar: 'fundo borrado', consultorio: 'fundo neutro', praia: 'fundo praia', sala: 'fundo sala de estar', carro: 'fundo carro' }[fundo || efeito];
        const dia = fs.statSync(o.arquivo).mtime;
        const dm = `${String(dia.getDate()).padStart(2, '0')}-${String(dia.getMonth() + 1).padStart(2, '0')}`;
        const esperado = `${dm} horizontal 30 quadros ${sufixo}${amostra ? ' amostra' : ''}.mp4`;
        conferir(`  nome com o sufixo, na mesma pasta`, m.r.nome === esperado && path.dirname(m.r.arquivo) === path.dirname(o.arquivo) && fs.existsSync(m.r.arquivo), m.r.nome);
        const p = sonda(m.r.arquivo);
        const durEsp = amostra ? 5 : po.duracao;
        conferir(`  1920x1080, 30 qps, com som; duração ${durEsp.toFixed(1)} s`, p.v.width === 1920 && p.v.height === 1080 && p.v.avg_frame_rate === '30/1' && p.a.codec_name === 'aac' && Math.abs(p.duracao - durEsp) < 0.3,
          `${p.v.width}x${p.v.height} ${p.duracao}`);
        const tq = amostra ? 2.5 : 6;
        const q = cinza(m.r.arquivo, tq, 160, 90);
        const qRef = amostra ? cinza(o.arquivo, (po.duracao / 2 - 2.5) + tq, 160, 90) : qo;
        // Fundo: faixas coloridas à esquerda (colunas 0–35) e à direita (128–160). Pessoa: rosto, no meio.
        const rosto = difRegiao(q, qRef, 160, 70, 92, 15, 45);
        if (efeito === 'borrar') {
          // Região da bandeira, atrás e à esquerda da pessoa.
          const nitAntes = detalhe(qRef, 160, 46, 64, 3, 35), nitDepois = detalhe(q, 160, 46, 64, 3, 35);
          conferir('  fundo borrado (menos detalhe) e rosto igual', nitDepois < nitAntes * 0.5 && rosto < 8, `detalhe do fundo ${nitAntes.toFixed(1)} → ${nitDepois.toFixed(1)}; rosto ${rosto.toFixed(1)}`);
        } else {
          const img = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(RAIZ, 'vendor', 'fundos', `${fundo}-horizontal.jpg`), '-vf', 'scale=160:90:flags=area,format=gray', '-f', 'rawvideo', '-']);
          const igualFundo = (difRegiao(q, img, 160, 0, 30, 5, 85) + difRegiao(q, img, 160, 132, 160, 5, 85)) / 2;
          const mudou = (difRegiao(q, qRef, 160, 0, 30, 5, 85) + difRegiao(q, qRef, 160, 132, 160, 5, 85)) / 2;
          conferir(`  fundo trocado pela imagem "${fundo}" e rosto igual`, igualFundo < 12 && mudou > 30 && rosto < 8, `igual ao fundo ${igualFundo.toFixed(1)}; diferença do original ${mudou.toFixed(1)}; rosto ${rosto.toFixed(1)}`);
        }
        const pcts = m.falas.filter((a) => /^Processando: \d+ por cento\.$/.test(a.trim())).map((a) => Number(/\d+/.exec(a)[0]));
        conferir('  anuncia "Processando…" e a porcentagem (em ordem, de 10 em 10)', /^Processando (a amostra de 5 segundos|o vídeo todo) com /.test(m.falas[0] || '') && pcts.length >= (amostra ? 1 : 2) && pcts.every((v, i) => v % 10 === 0 && (i === 0 || v > pcts[i - 1])), m.falas.slice(0, 12).join(' | '));
        const final = m.falas[m.falas.length - 1] || '';
        conferir('  no fim: nome, pasta, "o original continua guardado", foco em "Voltar ao início"', final.includes(esperado.replace(/\.mp4$/, '')) && /na pasta Documentos, Gravador de Vídeo/.test(final) && /original continua guardado/.test(final) &&
          await w.evaluate(() => document.activeElement.id === 'voltar' && !document.getElementById('melhorar-de-novo').hidden), final);
        conferir('  original intacto', sha(o.arquivo) === hashOriginal);
        tempos.push(`${nome}: ${(m.ms / 1000).toFixed(1)} s (segmentação ${(m.tempos.segmentar / m.tempos.quadros).toFixed(1)} ms/quadro)`);
      }
    }
    // Alt R durante o processamento e Cancelar.
    await w.click(await w.evaluate(() => (!document.getElementById('tela-decidir').hidden ? '#melhorar' : '#melhorar-de-novo')));
    await w.check('#efeito-borrar');
    await w.click('#todo');
    await s.ate(() => !!window.__gravador.melhoria && !!window.__gravador.melhoria.id, null, 20000);
    await w.keyboard.press('Alt+KeyR');
    await espera(200);
    conferir('Alt R durante o processamento pede para aguardar', (await s.anuncios()).some((a) => /Aguarde, estou processando/.test(a)) && !(await w.evaluate(() => !!window.__gravador.gravador)), await s.ultimo());
    await w.click('#cancelar');
    await s.ate(() => window.__gravador.anuncios.some((a) => /Processamento cancelado/.test(a)), null, 10000);
    await espera(300);
    const arquivos = fs.readdirSync(path.dirname(o.arquivo));
    conferir('Cancelar: avisa, volta às opções e não deixa arquivo pela metade', /Processamento cancelado/.test(await s.ultimo()) && await w.evaluate(() => !document.getElementById('tela-melhorar').hidden && document.activeElement.name === 'efeito') &&
      arquivos.length === (process.env.SO_CANCELAR ? 1 : 11), `${(await s.anuncios()).slice(-5).join(' | ')} | ${arquivos.length} arquivos`);
    conferir('original intacto depois de tudo', sha(o.arquivo) === hashOriginal);
    if (!process.env.SO_CANCELAR) {
      // O mesmo efeito de novo: não substitui, ganha um número no fim.
      await w.click('#melhorar-voltar');
      const rep1 = await melhorar(s, { efeito: 'borrar', amostra: true });
      conferir('nome repetido ganha " 2" e não apaga o anterior', rep1.ok && / 30 quadros fundo borrado amostra 2\.mp4$/.test(rep1.r.nome) && fs.readdirSync(path.dirname(o.arquivo)).length === 12, rep1.r && rep1.r.nome);
      await w.click('#melhorar-de-novo');
      await espera(300);
    }
    await w.click('#melhorar-voltar');
    await finalizar(s);
    await w.click('#voltar');

    // Vertical e quadrado usam o fundo no formato certo.
    for (const f of ['vertical', 'quadrado']) {
      await escolher(s, f, 'leve');
      const o2 = await gravar(s, { segundos: 6 });
      const m = await melhorar(s, { efeito: 'substituir', fundo: 'sala', amostra: true });
      const p = sonda(m.r.arquivo);
      const [W, H] = TAMANHOS[f].leve;
      const [gw, gh] = f === 'vertical' ? [54, 96] : [72, 72];
      const q = cinza(m.r.arquivo, 2.5, gw, gh);
      const img = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(RAIZ, 'vendor', 'fundos', `sala-${f}.jpg`), '-vf', `scale=${gw}:${gh}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
      const canto = difRegiao(q, img, gw, 0, Math.round(gw * 0.12), 0, Math.round(gh * 0.3));
      conferir(`Melhorar ${f} leve, sala de estar: ${W}x${H} e fundo no formato ${f}`, m.ok && p.v.width === W && p.v.height === H && canto < 14, `${p.v.width}x${p.v.height}, canto ${canto.toFixed(1)}`);
      await w.click('#voltar');
      void o2;
    }
    fs.writeFileSync(path.join(RAIZ, 'test', 'e2e', 'tempos-melhorar.txt'), tempos.join('\n') + '\n');
    console.log(tempos.join('\n'));
    conferir('sem erros na página (melhorar)', s.erros.length === 0, s.erros.join(' | '));
    await s.app.close();
  }

  // ---------------------------------------------------------------- 5. Enquadramentos
  if (fazer('enquadramentos')) {
    const casos = [
      ['deslocado', 'horizontal', (t) => /^Um rosto, um pouco deslocado para a sua direita\. Vá um pouco para a sua esquerda\./.test(t), 'rosto à esquerda da imagem: "vá para a sua esquerda"'],
      ['deslocado', 'vertical', (t) => t === 'Nenhum rosto.', 'no recorte vertical o rosto da borda fica fora do quadro'],
      ['deslocado2', 'horizontal', (t) => /^Um rosto, um pouco deslocado para a sua direita\./.test(t), 'rosto um pouco à esquerda no horizontal'],
      ['deslocado2', 'vertical', (t) => /^Um rosto, bem deslocado para a sua direita\. Vá para a sua esquerda\./.test(t) && /cortado/.test(t), 'no recorte vertical o mesmo rosto fica bem deslocado e cortado'],
      ['deslocado2', 'quadrado', (t) => /^Um rosto, (um pouco|bem) deslocado para a sua direita\./.test(t), 'no recorte quadrado o rosto também fica deslocado'],
      ['centrado', 'vertical', (t) => /^Um rosto, centralizado\./.test(t), 'vertical centralizado'],
      ['centrado', 'quadrado', (t) => /^Um rosto, centralizado\./.test(t), 'quadrado centralizado'],
      ['vazio', 'horizontal', (t) => t === 'Nenhum rosto.', 'sem ninguém: "Nenhum rosto."'],
      ['escuro', 'horizontal', (t) => /^Um rosto, centralizado\..*Ambiente escuro\.$/.test(t), 'ambiente escuro'],
      ['perto', 'horizontal', (t) => /Muito perto da câmera/.test(t) && /cortado em cima/.test(t), 'muito perto e cortado em cima'],
      ['corpo', 'horizontal', (t) => /^Um rosto, centralizado\. Mostrando o corpo inteiro\.$/.test(t), 'corpo inteiro'],
      ['corpo', 'vertical', (t) => /^Um rosto, centralizado\. Mostrando o corpo inteiro\.$/.test(t), 'corpo inteiro no vertical'],
      ['grupo', 'horizontal', (t) => /^Seis rostos\./.test(t) && !/escuro/.test(t), 'seis pessoas, fundo escuro mas rostos iluminados'],
      ['jemison', 'horizontal', (t) => /^Um rosto, centralizado\./.test(t) && !/escuro/.test(t) && /Mostrando até (o peito|a cintura)\./.test(t), 'pele escura não vira "ambiente escuro"']
    ];
    const porClipe = {};
    for (const c of casos) (porClipe[c[0]] = porClipe[c[0]] || []).push(c);
    for (const [clipe, lista] of Object.entries(porClipe)) {
      const s = await abrir(clipe, {}, { espelhada: false }); // a câmera falsa não espelha
      for (const [, fmt, ok, nome] of lista) {
        await s.w.check(`#formato-${fmt}`);
        await espera(300);
        const t = await s.enquadrar();
        conferir(`Alt E (${clipe}, ${fmt}): ${nome}`, ok(t), t);
      }
      conferir(`sem erros na página (${clipe})`, s.erros.length === 0, s.erros.join(' | '));
      await s.app.close();
    }
  }

  // ---------------------------------------------------------------- 6. Espelho e objetos (0.3)
  if (fazer('espelho')) {
    // Padrão da 0.3: "Minha câmera espelha a imagem" marcado; os lados ficam ao contrário da 0.2.
    const s = await abrir('deslocado');
    const { w } = s;
    const marc = await w.evaluate(() => ({ c: document.getElementById('espelhada').checked, d: document.getElementById('espelhada-desc').textContent,
      desc: document.getElementById('espelhada').getAttribute('aria-describedby') }));
    conferir('"Minha câmera espelha a imagem" vem marcado, com descrição', marc.c && marc.desc === 'espelhada-desc' && /espelho/.test(marc.d) && marc.d.length > 60, JSON.stringify(marc));
    await w.check('#formato-horizontal');
    let t = await s.enquadrar();
    conferir('espelhada: rosto à esquerda da imagem = "vá para a sua direita" (contrário da 0.2)', /^Um rosto, um pouco deslocado para a sua esquerda\. Vá um pouco para a sua direita\./.test(t), t);
    await w.uncheck('#espelhada');
    await espera(400);
    conferir('desmarcar anuncia e fica salvo', /Câmera espelhada: desmarcado/.test(await s.ultimo()) &&
      JSON.parse(fs.readFileSync(path.join(s.tmp, 'dados', 'configuracoes.json'), 'utf8')).espelhada === false, await s.ultimo());
    t = await s.enquadrar();
    conferir('sem espelho: volta a "vá para a sua esquerda"', /^Um rosto, um pouco deslocado para a sua direita\. Vá um pouco para a sua esquerda\./.test(t), t);
    // Testar o espelho sem mão levantada: avisa e não muda nada.
    await w.evaluate(() => { window.__gravador.esperaEspelho = 0; window.__gravador.ultimoTesteEspelho = null; });
    await w.click('#testar-espelho');
    await s.ate(() => !!window.__gravador.ultimoTesteEspelho, null, 30000);
    await espera(200);
    conferir('Testar o espelho sem mão levantada: avisa e não muda a opção', /Não consegui ver uma mão levantada/.test(await s.ultimo()) && !(await w.evaluate(() => document.getElementById('espelhada').checked)), await s.ultimo());
    await s.app.close();
    // A opção salva vale ao abrir de novo.
    const s2 = await abrir('deslocado', {}, { espelhada: false });
    conferir('opção salva "não espelha" vale ao abrir', !(await s2.w.evaluate(() => document.getElementById('espelhada').checked)));
    conferir('sem erros na página (espelho)', s.erros.length === 0 && s2.erros.length === 0, [...s.erros, ...s2.erros].join(' | '));
    await s2.app.close();
  }
  if (fazer('objetos')) {
    const casos = [
      ['obj5', (t) => /Na imagem: .*notebook/.test(t) && /xícara/.test(t) && /teclado/.test(t), 'mesa com notebook, caneca e teclado'],
      ['obj3', (t) => /Na imagem: .*celular/.test(t) && !/pessoa/i.test(t), 'pessoa com celular (e notebook pouco visível): fala o celular, não "pessoa"'],
      ['obj4', (t) => /Na imagem: .*notebook/.test(t) && /cadeira|vaso de planta/.test(t), 'escritório: notebook, cadeira, planta'],
      ['vazio', (t) => !/Na imagem/.test(t), 'sem objetos: não fala "Na imagem"']
    ];
    for (const [clipe, ok, nome] of casos) {
      const s = await abrir(clipe);
      await s.w.check('#formato-horizontal');
      const t = await s.enquadrar();
      const ent = await s.w.evaluate(() => window.__gravador.ultimoEnquadramento);
      conferir(`Alt E objetos (${clipe}): ${nome}`, ok(t), t);
      if (clipe === 'obj3') conferir('  "Na imagem" vem no fim da frase do enquadramento', /\.\s*Na imagem: [^.]+\.$/.test(t) && ent.objetos && t.endsWith(ent.objetos), t);
      conferir(`  sem erros (${clipe})`, s.erros.length === 0, s.erros.join(' | '));
      await s.app.close();
    }
  }

  console.log(`\n${linhas.length - falhas} de ${linhas.length} conferências ok.`);
  fs.writeFileSync(path.join(RAIZ, 'test', 'e2e', `ultimo-resultado${so ? '-' + so.join('-') : ''}.txt`), linhas.join('\n') + `\n\n${linhas.length - falhas} de ${linhas.length} ok\n`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
