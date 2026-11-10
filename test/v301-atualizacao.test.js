'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const A = require('../src/atualizacao');
const H = require('../helper/trocar-asar');

const sha = 'a'.repeat(64);
const base = { versao: '3.0.2', arquivo: 'Olho-da-Cena-Setup-3.0.2.exe', sha256: sha, tamanho: 500000000, notas: 'x' };
const leve = { formato: 'app-asar-v1', arquivo: 'Olho-da-Cena-3.0.2-app.asar', sha256: 'b'.repeat(64), tamanho: 9000000, versaoMinima: '3.0.1', baseRuntime: 'windows-x64-runtime-A' };
const ctx = { versaoAtual: '3.0.1', baseRuntimeLocal: 'windows-x64-runtime-A', temHelper: true, empacotado: true, pastaGravavel: true, leveFalhouNaVersao: '' };

test('versões comparadas como números, não como texto', () => {
  assert.strictEqual(A.compararVersoes('3.0.10', '3.0.9'), 1);
  assert.strictEqual(A.compararVersoes('3.1', '3.1.0'), 0);
  assert.strictEqual(A.compararVersoes('3.0.0', '3.0.1'), -1);
});
test('manifesto antigo, só com os cinco campos, continua valendo', () => {
  const r = A.validarManifesto(base);
  assert.ok(r.ok); assert.strictEqual(r.manifesto.leve, null);
});
test('manifesto com leve válido traz o leve, e leve inválido é descartado sem derrubar o completo', () => {
  assert.ok(A.validarManifesto({ ...base, leve }).manifesto.leve);
  for (const ruim of [{ ...leve, arquivo: '../x.asar' }, { ...leve, arquivo: 'a/b.asar' }, { ...leve, sha256: 'zz' }, { ...leve, formato: 'zip' }, { ...leve, tamanho: 0 }, { ...leve, tamanho: 9e9 }, { ...leve, baseRuntime: '' }]) {
    const r = A.validarManifesto({ ...base, leve: ruim }); assert.ok(r.ok); assert.strictEqual(r.manifesto.leve, null);
  }
});
test('manifesto inválido é recusado', () => {
  for (const m of [null, [], { ...base, versao: '3.x' }, { ...base, arquivo: '..\\a.exe' }, { ...base, arquivo: 'http://x/a.exe' }, { ...base, arquivo: 'a/b.exe' }, { ...base, sha256: 'abc' }, { ...base, tamanho: -1 }, { ...base, arquivo: 'a.zip' }]) assert.strictEqual(A.validarManifesto(m).ok, false);
});
test('rota: leve só quando tudo é compatível, senão completo', () => {
  const m = A.validarManifesto({ ...base, leve }).manifesto;
  assert.strictEqual(A.escolherRota(m, ctx).rota, 'leve');
  assert.strictEqual(A.escolherRota(m, { ...ctx, versaoAtual: '3.0.0' }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, baseRuntimeLocal: 'windows-x64-runtime-B' }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, baseRuntimeLocal: '' }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, temHelper: false }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, empacotado: false }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, pastaGravavel: false }).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, leveFalhouNaVersao: '3.0.2' }).rota, 'completo');
  assert.strictEqual(A.escolherRota(A.validarManifesto(base).manifesto, ctx).rota, 'completo');
  assert.strictEqual(A.escolherRota(m, { ...ctx, versaoAtual: '3.0.2' }).rota, 'nenhuma');
});

// --- o ajudante, em pasta de verdade, com o programa e o relógio de mentira ---
function cenario() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-'));
  const asar = path.join(d, 'app.asar');
  fs.writeFileSync(asar, 'VELHO'); fs.writeFileSync(asar + '.novo', 'NOVO');
  const o = { pid: '999999', asar, novo: asar + '.novo', backup: asar + '.anterior', exe: path.join(d, 'x.exe'), versao: '3.0.2', marca: path.join(d, 'saude.txt'), diagnostico: path.join(d, 'diag.json') };
  let t = 0; const lancados = [];
  const dep = (extra = {}) => ({ fsx: fs, dormir: async (ms) => { t += ms; }, agora: () => t, vivoPid: () => false, lancar: (exe, env) => { lancados.push(env); return { pid: 0 }; }, ...extra });
  return { d, o, lancados, dep };
}
test('argumentos do ajudante: só caminhos absolutos, app.asar e mesma pasta', () => {
  const { o } = cenario();
  const lista = A.argumentosDoHelper(o);
  assert.ok(H.lerArgumentos(lista));
  assert.throws(() => H.lerArgumentos(A.argumentosDoHelper({ ...o, asar: 'app.asar' })));
  assert.throws(() => H.lerArgumentos(A.argumentosDoHelper({ ...o, asar: path.join(path.dirname(o.asar), 'outro.dat') })));
  assert.throws(() => H.lerArgumentos(A.argumentosDoHelper({ ...o, novo: path.join(os.tmpdir(), 'fora.asar') })));
  assert.throws(() => H.lerArgumentos(['--pid', 'abc']));
});
test('troca feliz: app.asar vira o novo, a marca de saúde confirma e o backup some', async () => {
  const c = cenario();
  const d = c.dep({ lancar: (exe, env) => { c.lancados.push(env); if (env.OLHO_MARCA_SAUDE) fs.writeFileSync(env.OLHO_MARCA_SAUDE, '3.0.2'); return { pid: 0 }; } });
  const r = await H.executar(c.o, d);
  assert.ok(r.ok);
  assert.strictEqual(fs.readFileSync(c.o.asar, 'utf8'), 'NOVO'); assert.ok(!fs.existsSync(c.o.backup));
  assert.strictEqual(JSON.parse(fs.readFileSync(c.o.diagnostico, 'utf8')).ok, true);
});
test('o novo não abre bem: o arquivo anterior volta e o programa abre uma vez só, avisando a falha', async () => {
  const c = cenario();
  const r = await H.executar(c.o, c.dep());
  assert.strictEqual(r.ok, false); assert.strictEqual(r.fase, 'saude'); assert.ok(r.restaurado);
  assert.strictEqual(fs.readFileSync(c.o.asar, 'utf8'), 'VELHO');
  assert.strictEqual(c.lancados.length, 2); assert.ok(c.lancados[1].OLHO_ATUALIZACAO_FALHOU);
  assert.strictEqual(JSON.parse(fs.readFileSync(c.o.diagnostico, 'utf8')).restaurado, true);
});
test('arquivo bloqueado: tenta de novo e, se não der, mantém o anterior e abre o programa', async () => {
  const c = cenario();
  const fake = { ...fs, existsSync: fs.existsSync, unlinkSync: fs.unlinkSync, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync,
    renameSync: (a, b) => { if (a === c.o.asar) { const e = new Error('bloqueado'); e.code = 'EBUSY'; throw e; } return fs.renameSync(a, b); } };
  const r = await H.executar(c.o, c.dep({ fsx: fake }));
  assert.strictEqual(r.fase, 'troca'); assert.strictEqual(fs.readFileSync(c.o.asar, 'utf8'), 'VELHO');
  assert.ok(c.lancados[0].OLHO_ATUALIZACAO_FALHOU);
});
test('falha no meio da troca: o backup volta ao lugar', async () => {
  const c = cenario();
  const fake = { ...fs, existsSync: fs.existsSync, unlinkSync: fs.unlinkSync, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync,
    renameSync: (a, b) => { if (a === c.o.novo) { const e = new Error('negado'); e.code = 'EACCES'; throw e; } return fs.renameSync(a, b); } };
  const r = await H.executar(c.o, c.dep({ fsx: fake }));
  assert.strictEqual(r.ok, false); assert.strictEqual(fs.readFileSync(c.o.asar, 'utf8'), 'VELHO');
});
test('o programa não fecha: nada é trocado', async () => {
  const c = cenario();
  const r = await H.executar(c.o, c.dep({ vivoPid: () => true }));
  assert.strictEqual(r.fase, 'espera'); assert.strictEqual(fs.readFileSync(c.o.asar, 'utf8'), 'VELHO'); assert.strictEqual(c.lancados.length, 0);
});
