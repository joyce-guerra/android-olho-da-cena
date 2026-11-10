'use strict';
// Montar vídeo com legenda gerada pelo Whisper: baixa motor e modelo pequeno (servidor local), transcreve,
// salva transcrição e SRT, escolhe o estilo Conto e monta o vídeo com a legenda queimada.
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = process.argv[3], SERVIDOR = process.argv[4];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 400) : ''}`); if (!c) falhas++; };
/** Brilho máximo (0 a 255) no recorte de baixo do quadro em t segundos. */
function brilhoEmbaixo(arq, t, largura, altura) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', arq, '-frames:v', '1', '-vf', `crop=${largura}:${Math.round(altura * 0.2)}:0:${Math.round(altura * 0.8)},format=gray`, '-f', 'rawvideo', '-']);
  let max = 0, min = 255; for (const b of buf) { if (b > max) max = b; if (b < min) min = b; }
  return max - min;
}
(async () => {
  const servidor = http.createServer((req, res) => {
    const f = path.join(SERVIDOR, path.basename(req.url));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const st = fs.statSync(f);
    res.writeHead(200, { 'content-length': st.size });
    fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.on('listening', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-lg-'));
  const pasta = path.join(tmp, 'meus'); fs.mkdirSync(pasta);
  for (const f of ['conto.mp3', 'img1.png', 'img2.png']) fs.copyFileSync(path.join(MIDIA, f), path.join(pasta, f));
  const saida = path.join(tmp, 'saida.mp4');
  const dados = path.join(tmp, 'dados'), docs = path.join(tmp, 'Documentos');
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: dados, OLHO_TESTE_DOCUMENTOS: docs, OLHO_TESTE_WHISPER_BASE: base, OLHO_TESTE_WHISPER_WINE: '1' } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  w.on('console', (m) => { if (m.type() === 'error' && !/Autofill|DevTools|XNNPACK/.test(m.text())) erros.push('console: ' + m.text()); });
  await app.evaluate(({ dialog }, s) => {
    global.__abrir = [];
    dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: s });
  }, saida);
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  const passo = () => w.evaluate(() => ['lg-origem', 'lg-baixar', 'lg-gerar', 'lg-estilo'].find((i) => !document.getElementById(i).hidden));
  const falas = () => w.evaluate(() => window.__gravador.anuncios.slice(-6).join(' | '));
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  await ate(() => window.gravarTela && window.olho);
  await espera(1200);

  ok('Configurações sem fonte, tamanho e posição de legenda', await w.evaluate(() => !document.querySelector('[name="cf-legendaLocal"]') && !document.querySelector('[name="cf-legendaTamanho"]')));
  await clicar('ir-gerar');
  ok('Montar: Etapa 4 se chama Legendas', (await w.textContent('#g-nav-4')) === 'Etapa 4: Legendas');
  await abrir(path.join(pasta, 'conto.mp3'));
  await clicar('btn-audio');
  await espera(500);
  await clicar('g-continuar-1');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando);
  for (const [b, prox] of [['au-continuar', 'au-silencios'], ['aus-continuar', 'au-trilhas'], ['aut-continuar', 'au-eq']]) { await clicar(b); await ate((i) => !document.getElementById(i).hidden, prox); }
  await clicar('aue-continuar');
  await ate(() => window.olho.telaAtual() === 'gerar' && !document.getElementById('g-etapa-2').hidden, null, 120000);
  await clicar('g-continuar-2');
  await abrir([path.join(pasta, 'img1.png'), path.join(pasta, 'img2.png')]);
  await clicar('btn-imagens');
  await ate(() => /2/.test(document.getElementById('info-imagens').textContent));
  await clicar('g-continuar-3');
  ok('Imagens, Salvar e continuar: tela de legenda, Passo 1', await ate(() => window.olho.telaAtual() === 'legenda') && (await passo()) === 'lg-origem', await falas());
  ok('Passo 1 com Inserir SRT e Gerar legenda com o modelo', (await w.textContent('#lg-inserir-srt')) === 'Inserir SRT' && (await w.textContent('#lg-com-modelo')) === 'Gerar legenda com o modelo');
  ok('botões Alt A e Alt V', (await w.textContent('#lg-origem-continuar')) === 'Salvar e continuar, Alt A' && (await w.textContent('#lg-origem-voltar')) === 'Voltar, Alt V');
  await w.keyboard.press('Alt+KeyV');
  ok('Voltar do Passo 1 volta para Imagens', await ate(() => window.olho.telaAtual() === 'gerar' && !document.getElementById('g-etapa-3').hidden, null, 5000));
  await clicar('g-continuar-3');
  await ate(() => window.olho.telaAtual() === 'legenda');
  await clicar('lg-com-modelo');
  ok('sem modelo: Passo 2, Baixar um modelo', await ate(() => !document.getElementById('lg-baixar').hidden, null, 10000), await falas());
  ok('Passo 2: pequeno, grande e não baixar', (await w.textContent('#lg-baixar-pequeno')) === 'Baixar o modelo pequeno, uns 190 MB' && (await w.textContent('#lg-baixar-grande')) === 'Baixar o modelo grande, uns 1,6 GB' && (await w.textContent('#lg-nao-baixar')) === 'Não baixar nada');
  await clicar('lg-nao-baixar');
  ok('Não baixar nada volta para o Passo 1', (await passo()) === 'lg-origem' && /Nenhum modelo baixado/.test(await w.textContent('#lg-origem-info')));
  await clicar('lg-com-modelo');
  await ate(() => !document.getElementById('lg-baixar').hidden);
  await clicar('lg-baixar-pequeno');
  ok('download conferido: vai para o Passo 3', await ate(() => !document.getElementById('lg-gerar').hidden, null, 120000), await falas());
  ok('motor e modelo guardados na pasta do programa', fs.existsSync(path.join(dados, 'whisper', 'motor', 'whisper-cli.exe')) && fs.existsSync(path.join(dados, 'whisper', 'modelos', 'ggml-small-q5_1.bin')) &&
    !fs.readdirSync(path.join(dados, 'whisper', 'modelos')).some((f) => /parcial/.test(f)));
  ok('andamento do download falado', /Download: \d+ por cento/.test(await w.evaluate(() => window.__gravador.anuncios.join(' | '))));
  ok('Passo 3: Baixar o outro modelo à vista', !(await w.evaluate(() => document.getElementById('lg-outro-modelo').hidden)));
  await clicar('lg-transcricao');
  ok('transcrição salva', await ate(() => /Transcrição salva/.test(document.getElementById('lg-gerar-estado').textContent), null, 300000), await w.textContent('#lg-gerar-estado'));
  const pastaOlho = path.join(docs, 'Olho da Cena');
  const txt = fs.existsSync(pastaOlho) ? fs.readdirSync(pastaOlho).find((f) => /transcrição\.txt$/.test(f)) : null;
  ok('transcrição na raiz da pasta Olho da Cena', !!txt, fs.existsSync(pastaOlho) ? fs.readdirSync(pastaOlho).join(', ') : 'sem pasta');
  if (txt) { const t = fs.readFileSync(path.join(pastaOlho, txt), 'utf8'); ok('texto da transcrição com a fala', /menina/i.test(t) && /pedra/i.test(t), t); }
  ok('andamento da transcrição falado', /Transcrição: \d+ por cento|Ainda transcrevendo/.test(await w.evaluate(() => window.__gravador.anuncios.join(' | '))));
  await clicar('lg-gerar-srt');
  ok('SRT: Passo 4, Pra onde é esse vídeo?, sem transcrever de novo', await ate(() => !document.getElementById('lg-estilo').hidden, null, 5000));
  ok('quatro estilos com para que serve, pontos fortes e quando evitar', await w.evaluate(() => {
    const r = [...document.querySelectorAll('input[name="lg-estilo"]')];
    return r.length === 4 && r.every((x) => /Para que serve: .+Pontos fortes: .+Quando evitar: /.test(document.getElementById(x.getAttribute('aria-describedby')).textContent));
  }));
  await clicar('lg-estilo-continuar');
  await ate(() => /Escolha pra onde/.test(document.getElementById('alerta').textContent), null, 3000);
  ok('sem estilo, não segue e pede a escolha', (await passo()) === 'lg-estilo' && /Escolha pra onde é esse vídeo/.test(await w.textContent('#alerta')), await w.textContent('#alerta'));
  await w.check('#lg-estilo-shorts');
  const resumoShorts = await w.textContent('#lg-estilo-resumo');
  await w.check('#lg-estilo-conto');
  const resumoConto = await w.textContent('#lg-estilo-resumo');
  ok('o resumo muda com o estilo: Shorts tem mais legendas que Conto', Number(/(\d+) legendas/.exec(resumoShorts)[1]) > Number(/(\d+) legendas/.exec(resumoConto)[1]), `${resumoShorts} / ${resumoConto}`);
  await w.keyboard.press('Alt+KeyA');
  ok('Salvar e continuar volta para o Montar, Etapa 5', await ate(() => window.olho.telaAtual() === 'gerar' && !document.getElementById('g-etapa-5').hidden, null, 10000), await falas());
  const srt = fs.readdirSync(pastaOlho).find((f) => /legenda\.srt$/.test(f));
  ok('SRT salvo na pasta Olho da Cena', !!srt, fs.readdirSync(pastaOlho).join(', '));
  ok('Etapa 4 mostra a legenda escolhida', /^Legenda: conto - legenda\.srt, \d+ legendas, estilo Conto narrado com ilustrações\.$/.test(await w.textContent('#g-info-legenda')), await w.textContent('#g-info-legenda'));
  await w.keyboard.press('Control+8');
  await clicar('btn-gerar');
  ok('vídeo montado', await ate(() => !document.getElementById('btn-abrir').hidden, null, 1500000), await w.textContent('#status'));
  if (fs.existsSync(saida)) {
    const cues = fs.readFileSync(path.join(pastaOlho, srt), 'utf8').split('\n\n').filter(Boolean).map((b) => b.split('\n')[1].split(' --> ').map((t) => { const [h, m, s] = t.replace(',', '.').split(':'); return h * 3600 + m * 60 + Number(s); }));
    const meio = (cues[0][0] + cues[0][1]) / 2;
    const comLegenda = brilhoEmbaixo(saida, meio, 1920, 1080);
    ok('legenda queimada embaixo, no tempo da primeira legenda', comLegenda > 120, comLegenda);
    fs.copyFileSync(saida, path.join(MIDIA, 'resultado-legenda-montar.mp4'));
  }
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  servidor.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
