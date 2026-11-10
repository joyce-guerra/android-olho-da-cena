/* Olho da Cena 3.0: o menu da tela inicial, em árvore.
   Setas para cima e para baixo andam, seta para a direita abre um grupo (ou entra nele), seta para a esquerda fecha
   (ou volta ao grupo), Home e End vão ao primeiro e ao último, Enter ou espaço escolhem. Uma letra salta para o item que começa com ela.
   Alt mais a letra de cada item abre direto, de qualquer lugar da tela inicial. O leitor fala o nome e o atalho de cada item. */

const $ = (id) => document.getElementById(id);
const raiz = $('menu-inicial');
const todos = () => [...raiz.querySelectorAll('[role="treeitem"]')];
const visivel = (li) => !li.parentElement.closest('[role="group"][hidden]');
const visiveis = () => todos().filter(visivel);
const ehGrupo = (li) => li.hasAttribute('aria-expanded');
const filhos = (li) => [...li.querySelectorAll(':scope > [role="group"] > [role="treeitem"]')];
const paiDe = (li) => { const g = li.parentElement.closest('[role="treeitem"]'); return g || null; };
const teclaDe = (li) => `Alt ${li.dataset.tecla.toUpperCase()}`;

let ultimoId = '';
const st = { ultimo: () => ultimoId, falas: [] };
window.menuInicial = st; // usado também pelos testes automáticos

function nomeFalado(li) {
  const n = li.dataset.nome;
  if (ehGrupo(li)) { const k = filhos(li).length; return `${n}, ${k} opções, ${teclaDe(li)}`; }
  return `${n}, ${teclaDe(li)}`;
}
function rotular() {
  for (const li of todos()) li.setAttribute('aria-label', nomeFalado(li));
}
function irPara(li, { lembrar = true } = {}) {
  if (!li) return;
  for (const x of todos()) x.tabIndex = -1;
  li.tabIndex = 0;
  li.focus();
  if (lembrar) ultimoId = li.id;
}
function abrir(li) { if (ehGrupo(li)) { li.setAttribute('aria-expanded', 'true'); li.querySelector(':scope > [role="group"]').hidden = false; } }
function fechar(li) { if (ehGrupo(li)) { li.setAttribute('aria-expanded', 'false'); li.querySelector(':scope > [role="group"]').hidden = true; } }
function alternar(li) { if (li.getAttribute('aria-expanded') === 'true') fechar(li); else abrir(li); }

raiz.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const li = e.target.closest('[role="treeitem"]');
  if (!li) return;
  const lista = visiveis(), i = lista.indexOf(li);
  const k = e.key;
  let tratou = true;
  if (k === 'ArrowDown') irPara(lista[Math.min(lista.length - 1, i + 1)]);
  else if (k === 'ArrowUp') irPara(lista[Math.max(0, i - 1)]);
  else if (k === 'Home') irPara(lista[0]);
  else if (k === 'End') irPara(lista[lista.length - 1]);
  else if (k === 'ArrowRight') { if (ehGrupo(li)) { if (li.getAttribute('aria-expanded') !== 'true') abrir(li); else irPara(filhos(li)[0]); } }
  else if (k === 'ArrowLeft') { if (ehGrupo(li) && li.getAttribute('aria-expanded') === 'true') fechar(li); else irPara(paiDe(li)); }
  else if (k === 'Enter' || k === ' ') { if (ehGrupo(li)) alternar(li); else li.click(); }
  else if (k.length === 1 && /\S/.test(k)) {
    const inicial = k.toLowerCase();
    const depois = [...lista.slice(i + 1), ...lista.slice(0, i + 1)];
    const alvo = depois.find((x) => x.dataset.nome.toLowerCase().startsWith(inicial) || x.textContent.trim().toLowerCase().startsWith(inicial));
    if (alvo) irPara(alvo); else tratou = false;
  } else tratou = false;
  if (tratou) { e.preventDefault(); e.stopPropagation(); }
});
raiz.addEventListener('click', (e) => {
  const li = e.target.closest('[role="treeitem"]');
  if (!li) return;
  if (ehGrupo(li) && e.target.closest('[role="treeitem"]') === li) { alternar(li); irPara(li); }
  else ultimoId = li.id;
});
raiz.addEventListener('focusin', (e) => { const li = e.target.closest('[role="treeitem"]'); if (li && li === e.target) { for (const x of todos()) x.tabIndex = -1; li.tabIndex = 0; } });

// Alt mais a letra do item, na tela inicial.
document.addEventListener('keydown', (e) => {
  if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
  if ($('tela-inicial').hidden || document.querySelector('dialog[open]') || !$('ajuda').hidden) return;
  const li = todos().find((x) => x.dataset.tecla && e.code === 'Key' + x.dataset.tecla.toUpperCase());
  if (!li) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  if (ehGrupo(li)) { abrir(li); irPara(li); } else { ultimoId = li.id; li.click(); }
}, true);

/** Ao voltar para a tela inicial, o foco volta ao item que foi aberto, com a árvore ainda aberta onde estava. */
st.restaurarFoco = () => {
  const li = (ultimoId && $(ultimoId)) || $('mi-video');
  const pai = paiDe(li);
  if (pai) abrir(pai);
  irPara(li, { lembrar: false });
};
st.todos = todos; st.abrir = abrir; st.fechar = fechar; st.irPara = irPara;

// Título com a versão, só na tela inicial.
async function titulo() {
  try {
    const r = await window.api.appVersao();
    const v = r && r.ok ? r.valor : '';
    $('titulo-inicial').textContent = `Olho da Cena${v ? ` (versão ${v})` : ''}, seu olhar autônomo para inclusão nas redes sociais`;
    document.title = `Olho da Cena${v ? ` ${v}` : ''}`;
  } catch (_) { /* fica sem a versão */ }
}
rotular();
titulo();
