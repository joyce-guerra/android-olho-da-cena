'use strict';
// 3.0.1: regras do atualizador, sem tocar em rede nem em arquivo, para dar para testar.
// O manifesto antigo (versao, arquivo, sha256, tamanho, notas) continua valendo e aponta sempre para o setup completo.
// O objeto opcional "leve" é ignorado por quem não o conhece e traz o app.asar novo.
const FORMATO_LEVE = 'app-asar-v1';
const LIMITE_LEVE = 300 * 1024 * 1024;     // um app.asar maior que isso não é leve
const LIMITE_SETUP = 1024 * 1024 * 1024;
const NOME_EXE = /^[A-Za-z0-9][\w.\- ]{0,120}\.exe$/;
const NOME_ASAR = /^[A-Za-z0-9][\w.\-]{0,120}\.asar$/;
const SHA = /^[0-9a-f]{64}$/i;
const VERSAO = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const BASE = /^[A-Za-z0-9][\w.\-]{0,60}$/;

/** Compara versões como números, parte por parte: devolve -1, 0 ou 1. */
function compararVersoes(a, b) {
  const p = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
const versaoMaior = (a, b) => compararVersoes(a, b) > 0;

const nomeSimples = (n) => typeof n === 'string' && !/[\\/:*?"<>|\u0000-\u001f]/.test(n) && n !== '.' && n !== '..' && !n.includes('..');
const inteiroOk = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;

/** Confere o manifesto. Devolve { ok, manifesto } ou { ok: false, motivo }. O leve inválido é descartado, sem derrubar o completo. */
function validarManifesto(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, motivo: 'O manifesto não é um objeto.' };
  if (typeof j.versao !== 'string' || !VERSAO.test(j.versao)) return { ok: false, motivo: 'Versão inválida.' };
  if (typeof j.arquivo !== 'string' || !nomeSimples(j.arquivo) || !NOME_EXE.test(j.arquivo)) return { ok: false, motivo: 'Nome do setup inválido.' };
  if (typeof j.sha256 !== 'string' || !SHA.test(j.sha256)) return { ok: false, motivo: 'SHA-256 do setup inválido.' };
  const tamanho = j.tamanho === undefined ? 0 : Number(j.tamanho);
  if (!inteiroOk(tamanho, LIMITE_SETUP)) return { ok: false, motivo: 'Tamanho do setup inválido.' };
  const m = { versao: j.versao, arquivo: j.arquivo, sha256: j.sha256.toLowerCase(), tamanho, notas: String(j.notas || '').slice(0, 600), leve: null };
  const l = j.leve;
  if (l && typeof l === 'object' && !Array.isArray(l) && l.formato === FORMATO_LEVE && typeof l.arquivo === 'string' && nomeSimples(l.arquivo) && NOME_ASAR.test(l.arquivo)
    && typeof l.sha256 === 'string' && SHA.test(l.sha256) && typeof l.versaoMinima === 'string' && VERSAO.test(l.versaoMinima)
    && typeof l.baseRuntime === 'string' && BASE.test(l.baseRuntime) && Number.isInteger(Number(l.tamanho)) && Number(l.tamanho) > 0 && Number(l.tamanho) <= LIMITE_LEVE) {
    m.leve = { formato: FORMATO_LEVE, arquivo: l.arquivo, sha256: l.sha256.toLowerCase(), tamanho: Number(l.tamanho), versaoMinima: l.versaoMinima, baseRuntime: l.baseRuntime };
  }
  return { ok: true, manifesto: m };
}

/**
 * Escolhe entre o pacote leve e o setup completo.
 * ctx: { versaoAtual, baseRuntimeLocal, temHelper, empacotado, pastaGravavel, leveFalhouNaVersao }
 * Qualquer dúvida cai no setup completo.
 */
function escolherRota(manifesto, ctx) {
  const completo = (motivo) => ({ rota: 'completo', motivo });
  if (!manifesto || !versaoMaior(manifesto.versao, ctx.versaoAtual)) return { rota: 'nenhuma', motivo: 'Já está na versão mais nova.' };
  const l = manifesto.leve;
  if (!l) return completo('Esta versão não tem pacote leve.');
  if (ctx.leveFalhouNaVersao === manifesto.versao) return completo('O pacote leve desta versão já falhou aqui.');
  if (!ctx.empacotado) return completo('O programa não está instalado, então não troca o pacote.');
  if (!ctx.temHelper) return completo('Esta instalação não tem o ajudante de troca.');
  if (!ctx.baseRuntimeLocal) return completo('Não consegui ler a base desta instalação.');
  if (compararVersoes(ctx.versaoAtual, l.versaoMinima) < 0) return completo('A versão instalada é antiga demais para o pacote leve.');
  if (l.baseRuntime !== ctx.baseRuntimeLocal) return completo('O pacote leve é de outra base do programa.');
  if (!ctx.pastaGravavel) return completo('A pasta do programa não aceita troca sem permissão extra.');
  return { rota: 'leve', motivo: 'Compatível.' };
}

/** Os argumentos do ajudante, em lista, sem juntar texto de comando. */
function argumentosDoHelper(o) {
  return ['--pid', String(o.pid), '--asar', o.asar, '--novo', o.novo, '--backup', o.backup, '--exe', o.exe, '--versao', o.versao,
    '--marca', o.marca, '--diagnostico', o.diagnostico];
}
module.exports = { FORMATO_LEVE, LIMITE_LEVE, compararVersoes, versaoMaior, validarManifesto, escolherRota, argumentosDoHelper };
