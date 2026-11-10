'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = path.resolve(process.argv[3]);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
const sonda = (a) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', a]).toString());
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-lt-'));
  const mk = (nome) => { const d = path.join(tmp, nome); fs.mkdirSync(d); return d; };
  const soAudios = mk('Só áudios'), comLogo = mk('Com logo'), completa = mk('Completa');
  for (const d of [soAudios, comLogo, completa]) {
    fs.copyFileSync(path.join(MIDIA, 'fala.mp3'), path.join(d, 'Capítulo 1 - O começo.mp3'));
    fs.copyFileSync(path.join(MIDIA, 'conto.wav'), path.join(d, 'Capítulo 2 - Uma história bem comprida com título grande o bastante para quebrar em duas linhas.wav'));
  }
  fs.copyFileSync(path.join(MIDIA, 'img1.png'), path.join(comLogo, 'logo.png'));
  fs.copyFileSync(path.join(MIDIA, 'img1.png'), path.join(completa, 'logo.png'));
  fs.copyFileSync(path.join(MIDIA, 'foto-pessoa.png'), path.join(completa, 'capa.png'));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  await app.evaluate(({ dialog }) => { global.__pasta = null; dialog.showOpenDialog = async () => ({ canceled: !global.__pasta, filePaths: [global.__pasta] }); });
  const escolhe = (p) => app.evaluate((_e, x) => { global.__pasta = x; }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  await ate(() => window.gravarTela && window.olho); await espera(1000);
  await w.evaluate(() => { window.__f = []; new MutationObserver(() => window.__f.push(document.getElementById('status').textContent)).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true }); window.__b = []; const o = window.gravarTela.bipe; window.gravarTela.bipe = (t) => { window.__b.push(t); return o(t); }; });
  const botoes = await w.evaluate(() => [...document.querySelectorAll('#tela-inicial button')].map((b) => b.id));
  ok('o botão fica antes de Configurações', botoes.indexOf('ir-lote') === botoes.indexOf('ir-config') - 1, botoes.join());
  ok('o botão tem o nome combinado', (await w.textContent('#ir-lote')) === 'Converter áudios em lote em vídeo simples');
  await w.evaluate(() => document.getElementById('ir-lote').click()); await ate(() => window.olho.telaAtual() === 'lote');
  ok('a tela abre com o título combinado', (await w.textContent('#tela-lote h1')) === 'Converter áudios em lote em vídeo simples');
  ok('a dica do Tab diz que o título é o nome do arquivo e para montar a pasta', await w.evaluate(() => { const d = document.getElementById('lt-dica'); return d.tabIndex === 0 && /igual ao nome do arquivo/.test(d.textContent) && /Monte a pasta com tudo que você quer que conste nos vídeos, incluindo a logo e a imagem, se quiser/.test(d.textContent); }));
  await w.keyboard.press('Tab'); await espera(200);
  ok('Tab chega na dica primeiro, sem abrir nada', await w.evaluate(() => document.activeElement.id === 'lt-dica'));
  ok('só pasta, proporção e converter', await w.evaluate(() => ['lt-pasta', 'lt-converter'].every((i) => document.getElementById(i).offsetParent !== null) && document.querySelectorAll('input[name="lt-formato"]').length === 3));
  ok('cada proporção lê indicação, contraindicação e descrição', await w.evaluate(() => [...document.querySelectorAll('#lt-grupo-formato .desc')].every((p) => /^Indicação: .+ Contraindicação: .+ Descrição: .+/.test(p.textContent))));
  // sem pasta
  await w.evaluate(() => { window.__f = []; }); await w.click('#lt-converter'); await espera(300);
  ok('sem pasta, pede para escolher', /Escolha a pasta/.test(await w.evaluate(() => window.__f.join(' '))));
  const rodar = async (pasta, formato) => {
    await escolhe(pasta); await w.click('#lt-pasta'); await espera(900);
    await w.evaluate((f) => document.getElementById('lt-formato-' + f).click(), formato);
    await w.evaluate(() => { window.__f = []; window.__b = []; });
    await w.click('#lt-converter');
    return null;
  };
  const fim = () => ate(() => /^(Pronto|Conversão cancelada|Não consegui)/.test(document.getElementById('lt-andamento').textContent), null, 300000);
  const saidas = (nome) => { const base = path.join(tmp, 'Documentos', 'Olho da Cena', 'Áudios em vídeo - ' + nome); return fs.existsSync(base) ? fs.readdirSync(base).map((f) => path.join(base, f)) : []; };
  // 1) só áudios, horizontal
  await rodar(soAudios, 'horizontal');
  ok('1 só áudios: terminou', await fim(), await w.textContent('#lt-andamento'));
  let s = saidas('Só áudios');
  ok('1 dois vídeos com o nome dos áudios', s.length === 2 && s.some((f) => /Capítulo 1 - O começo\.mp4$/.test(f)), s.map((f) => path.basename(f)).join(' | '));
  const j1 = sonda(s.find((f) => /O começo/.test(f)));
  ok('1 horizontal 1280 por 720, com vídeo e som', j1.streams.some((x) => x.codec_type === 'video' && x.width === 1280 && x.height === 720) && j1.streams.some((x) => x.codec_type === 'audio'));
  const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  ok('1 a duração do vídeo é a do áudio', Math.abs(Number(j1.format.duration) - dur(path.join(MIDIA, 'fala.mp3'))) < 1, `${j1.format.duration} contra ${dur(path.join(MIDIA, 'fala.mp3'))}`);
  const falas = await w.evaluate(() => window.__f.join(' | '));
  ok('1 fala "Áudio 1 de 2." e "Áudio 2 de 2."', /Áudio 1 de 2\./.test(falas) && /Áudio 2 de 2\./.test(falas), falas);
  ok('1 diz no fim quantos vídeos ficaram prontos', /Pronto: 2 de 2 vídeos/.test(await w.textContent('#lt-andamento')), await w.textContent('#lt-andamento'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', s.find((f) => /comprida/.test(f)), '-frames:v', '1', path.join(tmp, 'quadro1.png')]);
  // 2) com logo, vertical
  await rodar(comLogo, 'vertical');
  ok('2 com logo: terminou', await fim(), await w.textContent('#lt-andamento'));
  s = saidas('Com logo');
  const j2 = sonda(s.find((f) => /O começo/.test(f)));
  ok('2 vertical 720 por 1280', j2.streams.some((x) => x.codec_type === 'video' && x.width === 720 && x.height === 1280));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', s.find((f) => /comprida/.test(f)), '-frames:v', '1', path.join(tmp, 'quadro2.png')]);
  // 3) completa (logo + imagem), quadrado
  await rodar(completa, 'quadrado');
  ok('3 completa: terminou', await fim(), await w.textContent('#lt-andamento'));
  s = saidas('Completa');
  const j3 = sonda(s.find((f) => /O começo/.test(f)));
  ok('3 quadrado 720 por 720', j3.streams.some((x) => x.codec_type === 'video' && x.width === 720 && x.height === 720));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', s.find((f) => /comprida/.test(f)), '-frames:v', '1', path.join(tmp, 'quadro3.png')]);
  const bips = await w.evaluate(() => window.__b);
  ok('os bipes de andamento são números que só sobem', bips.filter((x) => typeof x === 'number').every((x, i, a) => i === 0 || x >= a[i - 1]), JSON.stringify(bips));
  // 4) aviso de imagem ruim: imagem horizontal em vertical, escolher trocar
  await escolhe(completa); await w.click('#lt-pasta'); await espera(800);
  await w.evaluate(() => document.getElementById('lt-formato-vertical').click());
  await w.evaluate(() => { window.__f = []; });
  await w.click('#lt-converter'); await espera(1200);
  const dlg = await w.evaluate(() => ({ aberto: document.getElementById('lt-dlg').open, txt: document.getElementById('lt-dlg-avisos').textContent }));
  console.log('AVISO:', dlg.aberto, dlg.txt);
  if (dlg.aberto) { await w.click('#lt-dlg-trocar'); await espera(400); ok('trocar a proporção fecha o aviso, não converte e leva às proporções', await w.evaluate(() => !document.getElementById('lt-dlg').open && !document.getElementById('lt-cancelar').offsetParent && document.activeElement.name === 'lt-formato')); }
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  fs.cpSync(tmp, path.join(path.dirname(MIDIA), 'lote-resultado'), { recursive: true, filter: (p) => !/dados/.test(p) });
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  await app.close(); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
