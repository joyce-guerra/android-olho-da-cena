'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = '/tmp/gravador-teste-midia';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
const banda = (arq, filtro) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', arq, '-vn', '-af', filtro + ',volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr); return m ? Number(m[1]) : -99; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-fa-'));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'),
      OLHO_TESTE_VIDEO: path.join(MIDIA, 'centrado.y4m'), OLHO_TESTE_MIC: path.join(MIDIA, 'mic.wav') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message));
  const ate = async (f, arg, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(150); } return false; };
  await ate(() => window.gravarTela && window.olho); await espera(1200);
  await w.evaluate(() => document.getElementById('ir-gravar').click()); await ate(() => window.gravarTela.estado.pronto, null, 30000);
  await w.check('input[name="formato"][value="horizontal"]');
  await w.evaluate(() => document.querySelector('input[name="qualidade"]').click());
  await w.click('#grav-e1-continuar'); await espera(500);
  ok('Etapa 2 tem o grupo O que gravar de áudio, com três opções e Só o microfone marcado',
    await w.evaluate(() => document.querySelectorAll('input[name="fonte-audio"]').length === 3 && document.getElementById('fonte-audio-mic').checked));
  ok('cada opção lê indicação, contraindicação e descrição', await w.evaluate(() => [...document.querySelectorAll('#grupo-fonte-audio .desc')].every((p) => /^Indicação: .+ Contraindicação: .+ Descrição: .+/.test(p.textContent))));
  await w.evaluate(() => { window.__gravador.fornecerPc = async () => { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 2217; const d = c.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; }; });
  await w.click('#grav-e2-continuar'); await w.click('#grav-nav-4'); await espera(500);
  const gravar = async (modo) => {
    await w.click('#grav-nav-2'); await espera(300);
    await w.evaluate((m) => document.getElementById('fonte-audio-' + m).click(), modo); await espera(700);
    await w.click('#grav-e2-continuar'); await w.click('#grav-nav-4'); await espera(300);
    await w.keyboard.press('Alt+KeyR');
    await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
    await espera(3500);
    await w.keyboard.press('Alt+KeyR');
    await ate(() => !document.getElementById('grav-decidir').hidden && !!window.__gravador.original, null, 120000);
    const arq = await w.evaluate(() => window.__gravador.original.arquivo || window.__gravador.original.caminho || JSON.stringify(window.__gravador.original));
    const r = { tom: banda(arq, 'bandpass=f=2217:width_type=h:w=80'), total: banda(arq, 'anull'), resto: banda(arq, 'bandreject=f=2217:width_type=h:w=400') };
    await w.click('#descartar'); await ate(() => !document.getElementById('grav-captura').hidden);
    return r;
  };
  const mic = await gravar('mic'); console.log('mic', JSON.stringify(mic));
  const pc = await gravar('pc'); console.log('pc', JSON.stringify(pc));
  const ambos = await gravar('ambos'); console.log('ambos', JSON.stringify(ambos));
  ok('só microfone: sem o tom do computador', mic.tom < -50, mic.tom);
  ok('só computador: o tom entra', pc.tom > mic.tom + 20, `${pc.tom} contra ${mic.tom}`);
  ok('microfone e computador: o tom entra', ambos.tom > mic.tom + 20, `${ambos.tom} contra ${mic.tom}`);
  ok('microfone e computador: a voz do microfone também fica', ambos.resto > pc.resto + 8, `${ambos.resto} contra ${pc.resto}`);
  ok('só computador: a voz do microfone não entra', pc.resto < mic.resto - 8, `${pc.resto} contra ${mic.resto}`);
  ok('a escolha fica guardada', await w.evaluate(async () => (await window.api.configLer()).valor.fonteAudio === 'ambos'));
  // sem permissão do computador: volta para o microfone
  await w.evaluate(() => { window.__gravador.fornecerPc = async () => { throw new Error('sem som'); }; window.__gravador.pcStream && window.__gravador.pcStream.getTracks().forEach((t) => t.stop()); window.__gravador.pcStream = null; });
  await w.click('#grav-nav-2'); await w.evaluate(() => document.getElementById('fonte-audio-mic').click()); await espera(300);
  await w.evaluate(() => document.getElementById('fonte-audio-pc').click()); await espera(700);
  ok('se o som do computador falha, volta para só o microfone e avisa', await w.evaluate(() => document.getElementById('fonte-audio-mic').checked && /Não consegui captar o som do computador/.test(document.getElementById('alerta').textContent)));
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
