const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ini = src.indexOf('async function quadrosCinza'), fim = src.indexOf('/** Orientação e qualidade escolhidas');
let corpo = src.slice(ini, fim).replace("lidar('editar:detectar', async ({ arquivo, duracao }) => {", 'const detectar = async ({ arquivo, duracao }) => {');
const exigir = (n) => n;
async function faixasDoArquivo(a) {
  return new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', a]); let o = ''; p.stdout.on('data', (b) => o += b); p.on('close', () => { const j = JSON.parse(o); ok({ largura: j.streams[0].width, altura: j.streams[0].height, duracao: Number(j.format.duration) }); }); });
}
corpo = corpo.replace(/\}\);\s*$/, '};'); eval(corpo + '; module.exports.detectar = detectar;');
(async () => { for (const a of process.argv.slice(3)) console.log(path.basename(a), JSON.stringify(await module.exports.detectar({ arquivo: a }))); })();
