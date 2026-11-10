const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2], MIDIA = process.argv[3];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (m, c, extra) => { if (!c) falhas++; console.log(c ? 'ok    ' : 'FALHOU', m, c ? '' : (extra || '')); };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-li-'));
  const imgs = ['img1.png', 'img2.png', 'foto-pessoa.png'].map((n) => path.resolve(MIDIA, n));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  await espera(2500);
  await w.evaluate((imgs) => {
    window.__f = [];
    new MutationObserver(() => window.__f.push(document.getElementById('status').textContent)).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true });
    document.getElementById('ir-gerar').click();
    document.querySelectorAll('.etapa').forEach((e) => { e.hidden = e.id !== 'g-etapa-3'; });
    estado.imagens = imgs.slice(); desenharLista(); aplicarAtalhos('gerar');
    descritor.instalado = true; window.descreverComModelo = async (c) => { estado.descModelo[c] = 'DESC'; };
  }, imgs);
  const nomes = () => w.evaluate(() => estado.imagens.map((c) => c.split(/[\\/]/).pop()));
  ok('sem botões Subir, Descer, Remover', (await w.evaluate(() => [...document.querySelectorAll('#lista-imagens button')].length)) === 0);
  ok('itens da lista focáveis', await w.evaluate(() => [...document.querySelectorAll('#lista-imagens li')].every((l) => l.tabIndex === 0)));
  // Alt L no primeiro item: pergunta, leva para a posição 3
  await w.evaluate(() => document.querySelector('#lista-imagens li').focus());
  await w.keyboard.press('Alt+KeyL');
  ok('Alt L abre a pergunta da posição', await w.evaluate(() => document.getElementById('pos-dlg').open && /de 1 a 3/.test(document.getElementById('pos-dlg-rotulo').textContent)));
  await w.keyboard.type('3'); await w.keyboard.press('Enter'); await espera(500);
  ok('imagem foi para a posição 3', (await nomes()).join() === 'img2.png,foto-pessoa.png,img1.png', (await nomes()).join());
  ok('foco ficou na imagem movida', await w.evaluate(() => document.activeElement === document.querySelectorAll('#lista-imagens li')[2]));
  // posição inválida
  await w.keyboard.press('Alt+KeyL'); await w.keyboard.press('Control+a'); await w.keyboard.type('9'); await w.keyboard.press('Enter'); await espera(300);
  ok('número fora do intervalo continua perguntando', await w.evaluate(() => document.getElementById('pos-dlg').open));
  await w.keyboard.press('Escape'); await espera(300);
  ok('Escape cancela e nada muda', (await nomes()).join() === 'img2.png,foto-pessoa.png,img1.png');
  // Alt D descreve a imagem em foco
  await w.evaluate(() => document.querySelectorAll('#lista-imagens li')[1].focus());
  await w.keyboard.press('Alt+KeyD'); await espera(400);
  ok('Alt D descreve a imagem em foco', await w.evaluate(() => !!estado.descModelo[estado.imagens[1]] && !estado.descModelo[estado.imagens[0]]));
  // Delete remove
  await w.keyboard.press('Delete'); await espera(300);
  ok('Delete remove a imagem em foco', (await nomes()).join() === 'img2.png,img1.png', (await nomes()).join());
  ok('foco segue para um item da lista', await w.evaluate(() => !!document.activeElement.closest('#lista-imagens li')));
  // Alt I continua sendo Adicionar imagens
  const r = await w.evaluate(() => { document.querySelector('#lista-imagens li').focus(); const ev = new KeyboardEvent('keydown', { code: 'KeyI', key: 'i', altKey: true, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(ev); return { barrado: ev.defaultPrevented, tecla: document.getElementById('btn-imagens').accessKey }; });
  ok('Alt I segue livre para Adicionar imagens (tecla de acesso i, não barrada)', !r.barrado && r.tecla === 'i', JSON.stringify(r));
  // formato quadrado existe
  const formatos = await w.evaluate(() => [...document.getElementById('formato').options].map((o) => o.value));
  ok('Formato quadrado na lista', formatos.includes('quadrado'), formatos.join());
  console.log(falhas ? 'COM FALHAS ' + falhas : 'tudo certo');
  await app.close(); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
