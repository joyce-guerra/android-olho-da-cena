'use strict';

/**
 * Encontra o ffmpeg e o ffprobe sem depender do PATH.
 *
 * Instalador de FFmpeg no Windows quase nunca acrescenta a pasta no PATH
 * direito — o winget, em especial, joga tudo num caminho comprido dentro do
 * AppData e não mexe em variável nenhuma. Em vez de exigir que o usuário
 * conserte isso na mão, o programa procura nos lugares conhecidos.
 *
 * Ordem de busca:
 *   1. Variável FFMPEG_DIR, se a pessoa quiser apontar na marra
 *   2. Uma pasta "ffmpeg" ao lado do executável — é o caso da versão portátil,
 *      que leva o FFmpeg junto e não depende de nada instalado na máquina
 *   3. O PATH normal
 *   4. Pastas onde winget, chocolatey e scoop costumam instalar
 *   5. Caminhos manuais comuns (C:\ffmpeg\bin e afins)
 *
 * O resultado é guardado em memória: a busca acontece uma vez por execução.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EXE = process.platform === 'win32' ? '.exe' : '';

let cache = null;

/** Roda "-version" e diz se o executável daquele caminho responde. */
function funciona(caminho) {
  try {
    const r = spawnSync(caminho, ['-version'], {
      windowsHide: true,
      timeout: 10000,
      stdio: 'ignore'
    });
    return r.status === 0;
  } catch (_) {
    return false;
  }
}

/** Subpastas de um diretório, sem explodir se ele não existir. */
function subpastas(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name));
  } catch (_) {
    return [];
  }
}

/**
 * Pastas candidatas a conter os executáveis.
 *
 * O winget cria dois níveis de pasta com nome variável — algo como
 * Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin
 * — e esses nomes mudam a cada versão. Por isso a busca desce por listagem, em
 * vez de tentar adivinhar o caminho completo.
 */
function candidatas() {
  const lista = [];
  const env = process.env;

  if (env.FFMPEG_DIR) lista.push(env.FFMPEG_DIR);

  // Versão portátil: o FFmpeg viaja numa pasta ao lado do executável.
  try {
    const aoLado = path.dirname(process.execPath);
    lista.push(path.join(aoLado, 'ffmpeg'));
    lista.push(path.join(aoLado, 'ffmpeg', 'bin'));
    lista.push(path.join(aoLado, 'resources', 'ffmpeg'));
  } catch (_) {}

  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

    // winget
    const winget = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    for (const pacote of subpastas(winget)) {
      if (!/ffmpeg/i.test(path.basename(pacote))) continue;
      lista.push(path.join(pacote, 'bin'));
      for (const build of subpastas(pacote)) lista.push(path.join(build, 'bin'));
    }

    // winget também cria atalhos nesta pasta
    lista.push(path.join(local, 'Microsoft', 'WinGet', 'Links'));

    // scoop
    lista.push(path.join(os.homedir(), 'scoop', 'apps', 'ffmpeg', 'current', 'bin'));

    // chocolatey
    lista.push(path.join(env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'));

    // instalação manual
    lista.push('C:\\ffmpeg\\bin');
    lista.push(path.join(env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin'));
  } else {
    lista.push('/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/snap/bin');
  }

  return lista;
}

function procurar(nome) {
  const dirs = candidatas();

  // As duas primeiras opções (FFMPEG_DIR e a pasta portátil) têm prioridade
  // sobre o PATH: se o programa trouxe o próprio FFmpeg, é ele que manda.
  const prioritarias = dirs.slice(0, 4);
  for (const dir of prioritarias) {
    const alvo = path.join(dir, nome + EXE);
    if (fs.existsSync(alvo) && funciona(alvo)) return alvo;
  }

  // Depois o jeito normal: se o PATH estiver certo, acaba aqui.
  if (funciona(nome)) return nome;

  for (const dir of dirs) {
    const alvo = path.join(dir, nome + EXE);
    if (fs.existsSync(alvo) && funciona(alvo)) return alvo;
  }

  return null;
}

/** { ffmpeg, ffprobe } com o caminho de cada um, ou null se não achou. */
function localizar() {
  if (cache) return cache;
  cache = { ffmpeg: procurar('ffmpeg'), ffprobe: procurar('ffprobe') };
  return cache;
}

/** Força uma nova busca — útil se a pessoa instalar o FFmpeg com o app aberto. */
function esquecer() {
  cache = null;
}

module.exports = { procurar, localizar, esquecer };
