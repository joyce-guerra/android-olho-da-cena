'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const RAIZ = process.argv[2], MIDIA = process.argv[3], CASO = process.argv[4];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x !== '' ? ' — ' + String(x).slice(0, 300) : ''}`); if (!c) falhas++; };
const dims = (a) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', a]).toString().trim();
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-en-'));
  const pasta = path.join(tmp, 'meus'); fs.mkdirSync(pasta);
  for (const f of ['pessoa-leg-youtube.mp4', 'comlogo.mp4', 'fala.mp3', 'img1.png']) fs.copyFileSync(path.join(MIDIA, f), path.join(pasta, f));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  const erros = []; w.on('pageerror', (e) => erros.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await app.evaluate(({ dialog }) => { global.__abrir = []; dialog.showOpenDialog = async () => { const p = global.__abrir.shift(); return p ? { canceled: false, filePaths: [].concat(p) } : { canceled: true, filePaths: [] }; }; });
  const abrir = (p) => app.evaluate((_e, x) => { global.__abrir.push(x); }, p);
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(200); } return false; };
  const clicar = async (id) => { await ate((i) => { const e = document.getElementById(i); return e && !e.disabled && e.offsetParent !== null; }, id); await w.click('#' + id); };
  const visivel = (id) => w.evaluate((i) => { const e = document.getElementById(i); return !!e && e.offsetParent !== null; }, id);
  const tela = () => w.evaluate(() => window.olho.telaAtual());
  const status = () => w.evaluate(() => document.getElementById('status').textContent);
  const etapasAudio = async () => {
    await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 120000);
    for (const [b, prox] of [['au-continuar', 'au-silencios'], ['aus-continuar', 'au-trilhas'], ['aut-continuar', 'au-eq']]) { await clicar(b); await ate((i) => !document.getElementById(i).hidden, prox, 120000); }
    await clicar('aue-continuar');
  };
  const soCortes = async () => {
    await ate(() => window.olho.telaAtual() === 'audio' && window.__audioCortes.video && !window.__audioCortes.salvando, null, 120000);
    ok('Editar vídeo: só os Cortes, sem as outras etapas de áudio', await w.evaluate(() => document.getElementById('au-telas').hidden && document.getElementById('au-cortes-titulo').textContent === 'Cortes'));
    await clicar('au-continuar');
  };
  const pastaOlho = path.join(tmp, 'Documentos', 'Olho da Cena');
  const novos = () => (fs.existsSync(pastaOlho) ? fs.readdirSync(pastaOlho).filter((f) => /\.mp4$/.test(f)) : []);
  await ate(() => window.gravarTela && window.olho); await espera(1000);
  ok('botão da tela inicial: Editar', (await w.textContent('#ir-cortar')) === 'Editar');
  await clicar('ir-cortar');
  if (CASO === 'pessoa') {
    await abrir(path.join(pasta, 'pessoa-leg-youtube.mp4')); await clicar('ed-adicionar');
    await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-video');
    ok('Editar vídeo abre a análise', await ate(() => !document.getElementById('grav-editar').hidden, null, 10000));
    ok('análise automática terminou', await ate(() => /Tem pessoa no vídeo|Não achei pessoa/.test(document.getElementById('ed-an-info').textContent), null, 300000), await w.textContent('#ed-an-info'));
    console.log('ANÁLISE:', await w.textContent('#ed-an-info'));
    ok('marcou pessoa e legenda, sem logo', await w.evaluate(() => document.getElementById('ed-tem-pessoa').checked && document.getElementById('ed-tem-legenda').checked && !document.getElementById('ed-tem-logo').checked));
    await clicar('ed-an-continuar');
    ok('com pessoa: a etapa do fundo', await ate(() => window.olho.telaAtual() === 'melhorar' && !document.getElementById('grav-melhorar').hidden && !document.getElementById('mel-efeito-bloco').hidden, null, 10000));
    await w.check('#efeito-borrar');
    await clicar('mel-continuar');
    await soCortes();
    ok('depois do áudio: título e logo', await ate(() => window.olho.telaAtual() === 'melhorar' && !document.getElementById('mel-abertura-bloco').hidden && document.getElementById('mel-efeito-bloco').hidden, null, 120000));
    await w.fill('#mel-abertura-titulo', 'Teste do Editar');
    await clicar('mel-continuar');
    ok('vídeo com legenda: pula a legenda e vai para orientação e qualidade', await ate(() => !document.getElementById('grav-orientacao').hidden, null, 10000) && await ate(() => /já tem legenda/.test(document.getElementById('status').textContent), null, 3000), await status());
    ok('orientação e qualidade: o que a análise viu', /^Na análise: vídeo horizontal, 1280 por 720, qualidade boa\. A luz está boa; a imagem está nítida\. O vídeo tem legenda gravada na imagem\.$/.test(await w.textContent('#ori-diag')), await w.textContent('#ori-diag'));
    await w.check('#sai-qualidade-alta');
    ok('Alta num original de 720 linhas: avisa que não melhora', await ate(() => /Alta não deixa a imagem mais nítida/.test(document.getElementById('ori-efeito').textContent), null, 3000), await w.textContent('#ori-efeito'));
    await w.check('#sai-qualidade-manter');
    await w.check(process.env.CHEIO ? '#sai-formato-vertical-cheio' : '#sai-formato-vertical');
    ok('vertical: o efeito avisa o que acontece', await ate((cheio) => (cheio ? /laterais/ : /faixa no meio/).test(document.getElementById('ori-efeito').textContent), !!process.env.CHEIO, 3000), await w.textContent('#ori-efeito'));
    await clicar('ori-continuar');
    ok('vídeo pronto, de volta à tela Editar', await ate(() => window.olho.telaAtual() === 'edicao', null, 900000), await status());
    const v = novos(); ok('vídeo na pasta Olho da Cena, vertical, com o nome do original', v.length === 1 && v[0] === 'pessoa-leg-youtube editado.mp4' && dims(path.join(pastaOlho, v[0])) === '720,1280', v.join() + ' ' + (v[0] ? dims(path.join(pastaOlho, v[0])) : ''));
    if (v[0]) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', path.join(pastaOlho, v[0]), '-frames:v', '1', '-vf', 'scale=-1:640', path.join(MIDIA, 'quadro-editar-pessoa.png')]);
  }
  if (CASO === 'sempessoa') {
    await abrir(path.join(pasta, 'comlogo.mp4')); await clicar('ed-adicionar');
    await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-video');
    ok('análise automática terminou', await ate(() => /Tem pessoa no vídeo|Não achei pessoa/.test(document.getElementById('ed-an-info').textContent), null, 300000));
    console.log('ANÁLISE:', await w.textContent('#ed-an-info'));
    ok('sem pessoa: luz e nitidez, sem falar de rosto', /Luz: a luz está boa\. Nitidez: a imagem está nítida\./.test(await w.textContent('#ed-an-info')) && !/rosto|enquadre/i.test(await w.textContent('#ed-an-info')), await w.textContent('#ed-an-info'));
    ok('sem pessoa, com logo', await w.evaluate(() => !document.getElementById('ed-tem-pessoa').checked && document.getElementById('ed-tem-logo').checked && !document.getElementById('ed-tem-legenda').checked));
    await clicar('ed-an-continuar');
    ok('sem pessoa: pula o fundo e vai direto para o áudio', await ate(() => window.olho.telaAtual() === 'audio', null, 60000));
    await soCortes();
    ok('com logo: pula título e logo, vai para a legenda', await ate(() => window.olho.telaAtual() === 'legenda', null, 120000));
    await w.keyboard.press('Alt+KeyA');
    ok('sem legenda: orientação e qualidade', await ate(() => !document.getElementById('grav-orientacao').hidden, null, 10000));
    await clicar('ori-continuar');
    ok('vídeo pronto, de volta à tela Editar', await ate(() => window.olho.telaAtual() === 'edicao', null, 600000), await status());
    const v = novos(); ok('vídeo na pasta, mesma orientação', v.length === 1 && dims(path.join(pastaOlho, v[0])) === '640,360', v.join());
  }
  if (CASO === 'foto' || CASO === 'imagens') {
    await abrir(path.join(pasta, 'fala.mp3')); await clicar('ed-adicionar');
    await ate(() => !document.getElementById('ed-opcoes').hidden); await clicar('ed-audio');
    await etapasAudio();
    ok('depois das etapas de áudio: imagem do vídeo', await ate(() => window.olho.telaAtual() === 'melhorar' && !document.getElementById('grav-imagem').hidden, null, 120000), await tela());
    ok('quatro opções de imagem', await w.evaluate(() => document.querySelectorAll('input[name="img-tipo"]').length === 4));
    if (CASO === 'foto') {
      await w.check('#img-tipo-foto');
      ok('foto: o botão de escolher a foto aparece, os fundos não', (await visivel('img-foto')) && !(await visivel('grupo-img-fundo')));
      await abrir(path.join(pasta, 'img1.png')); await clicar('img-foto');
      await ate(() => /img1/.test(document.getElementById('img-foto-info').textContent));
      await w.check('#img-formato-vertical');
      await clicar('img-continuar');
      ok('vídeo da imagem feito: título e logo', await ate(() => !document.getElementById('mel-abertura-bloco').hidden && !document.getElementById('grav-melhorar').hidden, null, 120000));
      await clicar('mel-continuar');
      ok('depois: a legenda', await ate(() => window.olho.telaAtual() === 'legenda', null, 10000));
      await w.keyboard.press('Alt+KeyA');
      ok('vídeo pronto, de volta à tela Editar', await ate(() => window.olho.telaAtual() === 'edicao', null, 600000), await status());
      const v = novos(); ok('vídeo vertical com a foto e o som', v.length === 1 && dims(path.join(pastaOlho, v[0])) === '1080,1920', v.join());
      if (v[0]) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', path.join(pastaOlho, v[0]), '-frames:v', '1', '-vf', 'scale=-1:640', path.join(MIDIA, 'quadro-editar-foto.png')]);
    } else {
      await w.check('#img-tipo-imagens');
      await clicar('img-continuar');
      ok('imagens: o áudio vai pronto para o Montar, Etapa 2', await ate(() => window.olho.telaAtual() === 'gerar' && !document.getElementById('g-etapa-2').hidden, null, 60000), await status());
      ok('Montar com o áudio pronto', await w.evaluate(() => window.olho && document.getElementById('info-audio') !== null));
    }
  }
  ok('sem erros na página', erros.length === 0, erros.join(' | '));
  await app.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
