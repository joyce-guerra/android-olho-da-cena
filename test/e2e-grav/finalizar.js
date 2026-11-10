/* 1.8.6: caminho novo do Finalizar (gravação): telas de áudio leves e um render só, com a sincronia
 * imagem/som conferida quadro a quadro. Uso: xvfb-run -a node test/e2e-grav/finalizar.js
 * Vídeo de teste: /tmp/sinc.mp4 (flash branco e bipe juntos a cada segundo, em k+0,5 s). */
const { _electron } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..', '..');
const VID = process.env.VID || '/tmp/sinc.mp4';
function eventos(f) {
  const out = execFileSync('bash', ['/tmp/sinc-medir.sh', f]).toString().trim().split('\n');
  return { v: out.filter((l) => l[0] === 'V').map((l) => +l.split(' ')[1]), a: out.filter((l) => l[0] === 'A').map((l) => +l.split(' ')[1]) };
}
function sincronia(nome, f) {
  const { v, a } = eventos(f);
  const difs = v.map((t) => { const b = a.reduce((m, x) => (Math.abs(x - t) < Math.abs(m - t) ? x : m), Infinity); return (b - t) * 1000; }).filter((d) => Math.abs(d) < 400);
  const max = Math.max(...difs.map(Math.abs));
  console.log(`${nome}: ${v.length} flashes, ${a.length} bipes, pares ${difs.length}, diferença som-imagem ${Math.min(...difs).toFixed(0)} a ${Math.max(...difs).toFixed(0)} ms (máx ${max.toFixed(0)} ms, 1 quadro = 33 ms) ${max <= 50 ? 'OK' : 'FORA'}`);
}
(async () => {
  sincronia('original', VID);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finalizar-'));
  const app = await _electron.launch({ args: ['--no-sandbox', RAIZ], cwd: RAIZ, env: { ...process.env,
    GRAVADOR_TESTE_DADOS: path.join(tmp, 'd'), GRAVADOR_TESTE_DOCUMENTOS: path.join(tmp, 'D'),
    GRAVADOR_TESTE_VIDEO: '/tmp/gravador-teste-midia/centrado.y4m', GRAVADOR_TESTE_MIC: '/tmp/gravador-teste-midia/mic.wav' } });
  const w = await app.firstWindow();
  w.on('pageerror', (e) => console.log('ERRO', e.message));
  for (let i = 0; i < 300 && !(await w.evaluate(() => window.__gravador && window.__gravador.pronto).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
  // Telas de áudio como o programa faz (leve): Cortes, Silêncios com crossfade, e o salvar com volume.
  const etapas = await w.evaluate(async ({ arq }) => {
    const c = (n, a) => window.api[n](a).then((r) => { if (!r.ok) throw new Error(r.erro); return r.valor; });
    const t = [], t0 = performance.now();
    const cortes = [3, 9, 15].map((k) => ({ inicio: k + 0.7, fim: k + 2.2 }));
    const e1 = await c('audiocortesAplicar', { entrada: arq, descartes: cortes, fade: false, leve: true }); t.push(performance.now() - t0);
    const sil = []; for (let k = 0; k < 30; k += 2) sil.push({ inicio: k + 0.75, fim: k + 1.2 });
    const t1 = performance.now();
    const e2 = await c('audiocortesAplicar', { entrada: e1.arquivo, descartes: sil, fade: true, leve: true }); t.push(performance.now() - t1);
    const t2 = performance.now();
    const s = await c('audiocortesSalvar', { entrada: e2.arquivo, original: arq, descartes: [], ajuste: { volume: 1.3, velocidade: 1 }, fade: false, camadas: [], leve: true }); t.push(performance.now() - t2);
    return { tempos: t.map((x) => (x / 1000).toFixed(1)), salvo: { ...s, original: arq, planos: [e1.plano, e2.plano, s.plano].filter(Boolean) } };
  }, { arq: VID });
  console.log('salvar e continuar (s): cortes', etapas.tempos[0], '| silêncios', etapas.tempos[1], '| final do áudio', etapas.tempos[2], '| duração', etapas.salvo.duracao.toFixed(2));
  sincronia('som editado (imagem leve 16x16)', etapas.salvo.arquivo);
  for (const efeito of ['nenhum', 'borrar']) {
    const t0 = Date.now();
    const final = await w.evaluate(async ({ salvo, efeito }) => {
      const g = window.__gravador;
      g.origem = 'gravar'; g.modoSalvar = 'continuar'; g.ultimoSalvo = null;
      g.original = { arquivo: salvo.original, nome: 'sinc.mp4', duracao: 40, formato: 'horizontal', qualidade: 'alta' };
      window.gravarTela.abrirMelhorar();
      g.fonteMelhoria = salvo; window.gravarTela.abrirMelhorar();
      document.querySelector(`input[name="efeito"][value="${efeito}"]`).checked = true;
      document.getElementById('mel-continuar').click();
      for (let i = 0; i < 1500 && !(g.ultimoSalvo && g.ultimoSalvo.arquivo); i++) await new Promise((r) => setTimeout(r, 200));
      return { arquivo: g.ultimoSalvo && g.ultimoSalvo.arquivo, status: document.getElementById('status').textContent.slice(0, 160) };
    }, { salvo: etapas.salvo, efeito });
    console.log(`Finalizar ${efeito}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${final.arquivo ? path.basename(final.arquivo) : 'SEM ARQUIVO'} | ${final.status}`);
    if (final.arquivo) {
      const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,duration', '-of', 'csv=p=0', final.arquivo]).toString().trim().replace(/\n/g, ' ; ');
      console.log('  faixas', dur);
      sincronia(`  final ${efeito}`, final.arquivo);
    }
  }
  await app.close();
})().catch((e) => { console.log('FALHOU', e.message); process.exit(1); });
