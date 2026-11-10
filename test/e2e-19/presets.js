'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const RAIZ = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olho-pr-'));
  const app = await _electron.launch({ executablePath: require(path.join(RAIZ, 'node_modules', 'electron')), args: ['--no-sandbox', RAIZ], cwd: RAIZ,
    env: { ...process.env, OLHO_TESTE_DADOS: path.join(tmp, 'dados'), OLHO_TESTE_DOCUMENTOS: path.join(tmp, 'Documentos') } });
  const w = await app.firstWindow();
  await w.waitForFunction(() => document.querySelectorAll('input[name="preset-escolha"]').length > 0);
  const r = await w.evaluate(() => {
    const rs = [...document.querySelectorAll('input[name="preset-escolha"]')];
    const primeiro = rs[0], d = document.getElementById(primeiro.getAttribute('aria-describedby')).textContent;
    rs[3].checked = true; rs[3].dispatchEvent(new Event('change'));
    return { n: rs.length, nome: document.querySelector(`label[for="${primeiro.id}"]`).textContent, d, valor: document.getElementById('preset').value, escolhido: rs[3].value };
  });
  console.log(JSON.stringify(r));
  console.log(r.n === 10 && /^Bom para .* Menos indicado para /.test(r.d) && r.valor === r.escolhido ? 'tudo certo' : 'FALHOU');
  await app.close();
})();
