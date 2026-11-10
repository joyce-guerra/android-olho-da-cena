'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], CAM = '/tmp/gravador-teste-midia', NOVA = process.argv[3] === 'nova';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-tr-'));
  fs.mkdirSync(path.join(tmp, 'dados'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dados', 'configuracoes.json'), JSON.stringify({ formato: 'horizontal', qualidade: 'leve' }));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'), OLHO_TESTE_VIDEO: path.join(CAM, 'centrado.y4m'), OLHO_TESTE_MIC: path.join(CAM, 'mic.wav') } });
  const w = await app.firstWindow();
  const erros = [];
  w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  w.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const falas = () => w.evaluate(() => window.__gravador.anuncios.slice(-5).join(' | '));
  await ate(() => window.gravarTela && window.olho); await espera(1200);
  await clicar('ir-gravar');
  await ate(() => window.gravarTela.estado.pronto, null, 30000);
  if (NOVA) for (const n of [1, 2, 3]) await clicar(`grav-e${n}-continuar`);
  await w.keyboard.press('Alt+KeyR'); await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  await espera(4000); await w.keyboard.press('Alt+KeyR');
  await ate(() => !document.getElementById('grav-decidir').hidden && !!window.__gravador.original, null, 120000);
  await clicar('melhorar'); await ate(() => window.olho.telaAtual() === 'melhorar', null, 30000);
  await clicar('mel-continuar');
  await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 60000);
  await clicar('au-continuar'); await ate(() => !document.getElementById('au-silencios').hidden);
  for (const modo of process.argv.slice(4)) {
    console.log('== silêncio:', modo);
    if (modo !== 'nenhum') { await w.check('#aus-' + modo); }
    if (modo !== 'nenhum') {
      // Tab a partir do corte marcado: tem de chegar ao Crossfade, como no agressivo.
      await w.focus('#aus-' + modo);
      let chegou = false;
      for (let i = 0; i < 4 && !chegou; i++) { await w.keyboard.press('Tab'); chegou = await w.evaluate(() => document.activeElement && document.activeElement.id === 'aus-crossfade'); }
      console.log('Tab chega ao crossfade a partir do', modo + '?', chegou);
    }
    const cross = await w.evaluate(() => !document.getElementById('aus-crossfade').disabled);
    console.log('crossfade disponível?', cross);
    if (cross && process.env.CROSS) await w.check('#aus-crossfade');
    await clicar('aus-continuar');
    const chegou3 = await ate(() => !document.getElementById('au-trilhas').hidden && !window.__audioCortes.salvando, null, 60000);
    console.log('Etapa 3?', chegou3, await falas());
    console.log('teclas de acesso A ou V na tela de áudio:', await w.evaluate(() => [...document.querySelectorAll('#tela-audio [accesskey]')].filter((b) => /^[av]$/i.test(b.getAttribute('accesskey'))).map((b) => b.id).join() || 'nenhuma'));
    for (const alvo of ['e-trilha-volume', 'e-trilha-tipo-estatico', 'e-btn-trilha-arquivo', 'aut-tocar']) {
      await w.evaluate((i) => document.getElementById(i).focus(), alvo);
      await w.keyboard.press('Alt+KeyA');
      const foi = await ate(() => !document.getElementById('au-eq').hidden, null, 15000);
      console.log('Alt A com o foco em', alvo, '-> Etapa 4?', foi);
      if (foi) { await clicar('aue-voltar'); await ate(() => !document.getElementById('au-trilhas').hidden && !window.__audioCortes.salvando); }
    }
    // Alt A com o foco no título da etapa
    await w.evaluate(() => document.getElementById('au-trilhas-titulo').focus());
    await w.keyboard.press('Alt+KeyA');
    const chegou4 = await ate(() => !document.getElementById('au-eq').hidden, null, 30000);
    console.log('Alt A -> Etapa 4?', chegou4, await falas(), erros.join(' | '));
    console.log('etapa 2 com crossfade:', await w.evaluate(() => { try { return JSON.parse(window.__audioCortes.etapas[2].chave)[2]; } catch (_) { return null; } }));
    if (!chegou4) { await clicar('aut-continuar'); console.log('clique -> Etapa 4?', await ate(() => !document.getElementById('au-eq').hidden, null, 30000), await falas()); }
    await clicar('aue-voltar'); await ate(() => !document.getElementById('au-trilhas').hidden);
    await clicar('aut-voltar'); await ate(() => !document.getElementById('au-silencios').hidden);
  }
  console.log('erros:', erros.join(' | '));
  await app.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
