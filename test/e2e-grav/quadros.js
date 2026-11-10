'use strict';
/* Confere se a gravação repete, pula ou volta quadros da câmera (imagem "tremida, vai e vem").
   Câmera falsa: y4m em que cada quadro traz o próprio número em código de barras (16 blocos no alto).
   Uso: xvfb-run -a node test/e2e-grav/quadros.js [fps da câmera, padrão 30] [segundos, padrão 8] */
const { _electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const FPS = Number(process.argv[2] || 30);
const SEG = Number(process.argv[3] || 8);
const N = 600;
const PASTA = '/tmp/olho-quadros';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function camera(fps) {
  fs.mkdirSync(PASTA, { recursive: true });
  const f = path.join(PASTA, `codigo${fps}.y4m`);
  if (!fs.existsSync(f)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=gray:s=640x360:r=${fps},format=gray`, '-frames:v', String(N),
    '-vf', "geq=lum='if(lt(Y\\,60)\\,255*mod(floor(N/pow(2\\,floor(X/40)))\\,2)\\,100+60*sin(N/5+X/50))',format=yuv420p", '-r', String(fps), f]);
  return f;
}

function codigos(arq) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', arq, '-vf', 'scale=640:360,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const T = 640 * 360, r = [];
  for (let o = 0; o + T <= buf.length; o += T) {
    let n = 0;
    for (let i = 0; i < 16; i++) if (buf[o + 30 * 640 + 40 * i + 20] > 128) n |= 1 << i;
    r.push(n);
  }
  return r;
}

function analisar(c) {
  // Tira o começo e o fim (1 s cada), onde a câmera pode estar entrando ou saindo.
  const s = c.slice(30, c.length - 30);
  const passos = [];
  for (let i = 1; i < s.length; i++) { let d = (s[i] - s[i - 1] + N) % N; if (d > N / 2) d -= N; passos.push(d); }
  const repetidos = passos.filter((d) => d === 0).length;
  const pulos = passos.filter((d) => d > 1).length;
  const voltas = passos.filter((d) => d < 0).length;
  // Quantas vezes seguidas cada quadro da câmera aparece (com câmera a 30 q/s o ideal é sempre 1; a 15, sempre 2).
  const corridas = {}; let k = 1;
  for (let i = 1; i <= s.length; i++) { if (i < s.length && s[i] === s[i - 1]) k++; else { corridas[k] = (corridas[k] || 0) + 1; k = 1; } }
  return { quadros: s.length, repetidos, pulos, voltas, corridas, amostra: passos.slice(0, 60).join('') };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-quadros-'));
  const app = await _electron.launch({ args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos'), OLHO_TESTE_VIDEO: camera(FPS) } });
  const w = await app.firstWindow();
  const ate = async (f, arg, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await w.evaluate(f, arg)) return true; await espera(150); } return false; };
  await ate(() => !!document.getElementById('ir-gravar'));
  await w.evaluate(() => document.getElementById('ir-gravar').click());
  await ate(() => window.__gravador && window.__gravador.pronto);
  await w.check('#formato-horizontal');
  await w.check('#qualidade-leve');
  await espera(1500);
  await w.focus('#gravar');
  await w.keyboard.press('Alt+KeyR');
  await ate(() => window.__gravador.gravador && window.__gravador.gravador.state === 'recording');
  await espera(SEG * 1000);
  await w.keyboard.press('Alt+KeyR');
  await ate(() => window.__gravador.original && window.__gravador.original.arquivo, null, 180000);
  const arq = await w.evaluate(() => window.__gravador.original.arquivo);
  const desenho = await w.evaluate(() => { const d = window.__gravador.desenho; return d && d.porCamera !== undefined ? { porCamera: d.porCamera, porRelogio: d.porRelogio } : 'relógio fixo (versão antiga)'; });
  await app.close();
  const r = analisar(codigos(arq));
  console.log(JSON.stringify({ camera_fps: FPS, arquivo: path.basename(arq), desenho, ...r }));
})().catch((e) => { console.error(e); process.exit(1); });
