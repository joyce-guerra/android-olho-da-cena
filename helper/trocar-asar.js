'use strict';
// Olho da Cena: ajudante da atualização leve. Roda fora do app.asar, com o próprio executável em modo Node
// (ELECTRON_RUN_AS_NODE=1), espera o programa fechar, troca resources\app.asar por renomeação, guarda o anterior,
// abre o programa e confere que ele subiu bem. Se não subiu, devolve o arquivo anterior. Nunca mexe em dados do usuário.
// Não usa nenhum módulo além dos do Node.
process.noAsar = true; // o Electron trata .asar como pasta; aqui ele precisa ser tratado como arquivo comum
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ESPERA_FECHAR_MS = 60000, TENTATIVAS = 10, INTERVALO_MS = 1000, ESPERA_SAUDE_MS = 45000;
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

function lerArgumentos(lista) {
  const o = {};
  for (let i = 0; i < lista.length; i += 2) { const k = lista[i]; if (!/^--[a-z]+$/.test(k) || i + 1 >= lista.length) throw new Error('Argumentos inválidos.'); o[k.slice(2)] = lista[i + 1]; }
  for (const k of ['pid', 'asar', 'novo', 'backup', 'exe', 'versao', 'marca', 'diagnostico']) if (!o[k]) throw new Error('Falta o argumento ' + k + '.');
  if (!/^\d+$/.test(o.pid) || Number(o.pid) < 1) throw new Error('PID inválido.');
  for (const k of ['asar', 'novo', 'backup', 'exe', 'marca', 'diagnostico']) if (!path.isAbsolute(o[k])) throw new Error('O caminho precisa ser absoluto: ' + k + '.');
  if (path.basename(o.asar) !== 'app.asar') throw new Error('O alvo da troca precisa ser app.asar.');
  const pasta = path.dirname(o.asar);
  if (path.dirname(o.novo) !== pasta || path.dirname(o.backup) !== pasta) throw new Error('O arquivo novo e o backup ficam na mesma pasta do app.asar.');
  if (o.novo === o.asar || o.backup === o.asar || o.novo === o.backup) throw new Error('Caminhos repetidos.');
  return o;
}
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Troca com recuperação: o app.asar válido nunca deixa de existir sob outro nome. */
async function trocar(o, d) {
  const { fsx, dormir } = d;
  if (!fsx.existsSync(o.novo)) throw new Error('O arquivo novo não está lá.');
  let ultimo = null;
  for (let i = 0; i < TENTATIVAS; i++) {
    try {
      if (fsx.existsSync(o.backup)) fsx.unlinkSync(o.backup);
      fsx.renameSync(o.asar, o.backup);
      try { fsx.renameSync(o.novo, o.asar); }
      catch (e) { try { fsx.renameSync(o.backup, o.asar); } catch (_) { /* a recuperação final está abaixo */ } throw e; }
      return;
    } catch (e) {
      ultimo = e;
      if (!['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(e.code)) break;
      await dormir(INTERVALO_MS);
    }
  }
  if (!fsx.existsSync(o.asar) && fsx.existsSync(o.backup)) { try { fsx.renameSync(o.backup, o.asar); } catch (_) { /* nada mais a fazer */ } }
  throw new Error('Não consegui trocar o arquivo: ' + (ultimo && ultimo.code ? ultimo.code : String(ultimo)));
}
function voltar(o, d) {
  const { fsx } = d;
  if (fsx.existsSync(o.backup)) {
    if (fsx.existsSync(o.asar)) { try { fsx.renameSync(o.asar, o.asar + '.falhou'); } catch (_) { try { fsx.unlinkSync(o.asar); } catch (__) { /* */ } } }
    fsx.renameSync(o.backup, o.asar);
    return true;
  }
  return false;
}
function registrar(o, d, dados) {
  try { d.fsx.mkdirSync(path.dirname(o.diagnostico), { recursive: true }); d.fsx.writeFileSync(o.diagnostico, JSON.stringify({ quando: new Date().toISOString(), versao: o.versao, ...dados }, null, 2)); } catch (_) { /* sem diagnóstico */ }
}

async function executar(o, d) {
  const { fsx, dormir, vivoPid, lancar, agora } = d;
  // 1. espera o programa fechar
  const t0 = agora();
  while (vivoPid(Number(o.pid))) {
    if (agora() - t0 > ESPERA_FECHAR_MS) { registrar(o, d, { ok: false, fase: 'espera', motivo: 'O programa não fechou a tempo, então nada foi trocado.' }); return { ok: false, fase: 'espera' }; }
    await dormir(300);
  }
  await dormir(500);
  // 2. troca
  try { fsx.unlinkSync(o.marca); } catch (_) { /* não havia */ }
  try { await trocar(o, d); }
  catch (e) {
    registrar(o, d, { ok: false, fase: 'troca', motivo: e.message });
    lancar(o.exe, { OLHO_ATUALIZACAO_FALHOU: o.versao });
    return { ok: false, fase: 'troca' };
  }
  // 3. abre o programa novo e espera a confirmação de inicialização saudável
  const filho = lancar(o.exe, { OLHO_POS_ATUALIZACAO: o.versao, OLHO_MARCA_SAUDE: o.marca });
  const t1 = agora();
  let saudavel = false;
  while (agora() - t1 < ESPERA_SAUDE_MS) {
    try { if (fsx.readFileSync(o.marca, 'utf8').trim() === o.versao) { saudavel = true; break; } } catch (_) { /* ainda não */ }
    await dormir(500);
  }
  if (saudavel) {
    try { fsx.unlinkSync(o.backup); } catch (_) { /* fica o backup, sem problema */ }
    registrar(o, d, { ok: true, fase: 'fim' });
    return { ok: true };
  }
  // 4. não subiu bem: fecha o que abriu, devolve o arquivo anterior e abre uma vez só
  try { if (filho && filho.pid) process.kill(filho.pid); } catch (_) { /* já fechou */ }
  await dormir(1500);
  let voltou = false;
  try { voltou = voltar(o, d); } catch (_) { voltou = false; }
  registrar(o, d, { ok: false, fase: 'saude', motivo: 'A versão nova não confirmou que abriu bem.', restaurado: voltou });
  lancar(o.exe, { OLHO_ATUALIZACAO_FALHOU: o.versao });
  return { ok: false, fase: 'saude', restaurado: voltou };
}

const reais = () => ({
  fsx: fs, dormir: dorme, vivoPid: vivo, agora: () => Date.now(),
  lancar: (exe, env) => {
    const e = { ...process.env, ...env }; delete e.ELECTRON_RUN_AS_NODE;
    const f = spawn(exe, [], { detached: true, stdio: 'ignore', env: e, windowsHide: false }); f.unref(); return f;
  }
});
module.exports = { lerArgumentos, trocar, voltar, executar, reais };

if (require.main === module) {
  (async () => {
    try { const o = lerArgumentos(process.argv.slice(2)); await executar(o, reais()); }
    catch (e) { try { console.error(e.message); } catch (_) { /* */ } process.exit(2); }
  })();
}
