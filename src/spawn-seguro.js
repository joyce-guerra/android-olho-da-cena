'use strict';
/**
 * 1.8.6: no Windows, a linha de comando tem limite de 32767 caracteres. Com muitos cortes (vídeo de
 * 17 minutos, centenas de silêncios), o -filter_complex passa disso e o FFmpeg nem abre ("muito longo").
 * Aqui, filtro grande vai para um arquivo temporário (-/filter_complex, FFmpeg 7 ou mais novo) e é apagado no fim.
 */
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIMITE = 8000;
let n = 0;

function prepararArgs(args) {
  const i = Array.isArray(args) ? args.indexOf('-filter_complex') : -1;
  if (i < 0 || String(args[i + 1] || '').length <= LIMITE) return { args, arquivo: null };
  const arquivo = path.join(os.tmpdir(), `olho_filtro_${process.pid}_${Date.now()}_${n++}.txt`);
  fs.writeFileSync(arquivo, String(args[i + 1]), 'utf8');
  const novos = args.slice();
  // FFmpeg 7+ (o do programa é o 9.0.2, sem -filter_complex_script): "-/opção arquivo" lê o valor do arquivo.
  novos.splice(i, 2, '-/filter_complex', arquivo);
  return { args: novos, arquivo };
}

function spawn(comando, args, opcoes) {
  const { args: a, arquivo } = prepararArgs(args);
  const p = cp.spawn(comando, a, opcoes);
  if (arquivo) {
    const limpar = () => { try { fs.unlinkSync(arquivo); } catch (_) { /* */ } };
    p.on('close', limpar); p.on('error', limpar);
  }
  return p;
}
module.exports = { spawn, prepararArgs, LIMITE };
