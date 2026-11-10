/* Olho da Cena 3.0.2: o jeito único de mexer em qualquer lista de escolhas (fundos, molduras, presets, figurinhas, formatos).
   - Cada opção fala o nome e para que serve. A descrição completa não fica na tela nem no Tab: o Espaço numa opção abre um
     textinho com tom, indicação, descrição e, por último, contraindicação. O Escape, ou o Espaço de novo, fecha e volta à opção.
   - Nas listas com categorias o jeito é o de uma árvore de arquivos: cima e baixo andam sem escolher, direita abre ou entra,
     esquerda fecha ou sobe um nível, Enter ou espaço escolhem, Escape sai da seleção.
   - Escape numa opção, ou numa seção, fecha a seleção: o leitor avisa o que está escolhido, e Tab vai ao próximo ponto da tela.
   Este módulo vale para todas as telas: ele observa a página e arruma as listas que forem aparecendo. */

const $ = (id) => document.getElementById(id);
const ROTULOS = ['Tom', 'Indicação', 'Contraindicação', 'Descrição', 'Você vai precisar de', 'Capa', 'Onde serve', 'Sensação'];
const DIVISOR = new RegExp(`(?:^|\\s)(${ROTULOS.join('|')}):\\s*`, 'g');

let alterna = false;
function falar(msg) {
  const s = $('status'); if (!s) return;
  alterna = !alterna;
  s.textContent = msg ? msg + (alterna ? ' ' : '') : '';
}

/** "Tom: a. Indicação: b. Descrição: c." vira [{ r: 'Tom', t: 'A.' }, ...], na ordem em que veio. */
function partirDescricao(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const achados = [...t.matchAll(DIVISOR)];
  if (achados.length < 2) return null;
  const itens = [];
  achados.forEach((m, i) => {
    const ini = m.index + m[0].length, fim = i + 1 < achados.length ? achados[i + 1].index : t.length;
    const txt = t.slice(ini, fim).trim();
    if (txt) itens.push({ r: m[1], t: txt.replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.') });
  });
  // Na ordem que a pessoa pediu: tom, indicação, descrição e contraindicação.
  const ordem = ['Tom', 'Indicação', 'Descrição', 'Sensação', 'Contraindicação'];
  itens.sort((a, b) => (ordem.indexOf(a.r) < 0 ? 99 : ordem.indexOf(a.r)) - (ordem.indexOf(b.r) < 0 ? 99 : ordem.indexOf(b.r)));
  return itens.length >= 2 ? itens : null;
}
/** Para que serve, em poucas palavras, a partir da indicação. Corta sempre numa vírgula inteira, nunca no meio de uma frase. */
const SOLTAS = new Set(['um', 'uma', 'uns', 'umas', 'e', 'ou', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'para', 'com', 'o', 'a', 'os', 'as', 'que', 'por', 'sem']);
function paraQue(itens) {
  const ind = itens.find((x) => x.r === 'Indicação');
  if (!ind) return '';
  let f = ind.t.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '').trim();
  const MAX = 14;
  if (f.split(/\s+/).length > MAX) {
    const partes = f.split(/,\s*/);
    let acc = [];
    for (const parte of partes) {
      const prox = [...acc, parte];
      if (prox.join(', ').split(/\s+/).length > MAX) break;
      acc = prox;
    }
    if (acc.length) f = acc.join(', ');
    else {
      const w = f.split(/\s+/).slice(0, MAX);
      while (w.length > 3 && SOLTAS.has(w[w.length - 1].toLowerCase().replace(/[,;:]$/, ''))) w.pop();
      f = w.join(' ').replace(/[,;:]$/, '');
    }
  }
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(f)) f = f.charAt(0).toLowerCase() + f.slice(1);
  return f;
}

function converterOpcao(radio) {
  if (radio.dataset.sel) return;
  const desc = radio.querySelector(':scope > p.desc');
  const input = radio.querySelector('input[type="radio"]');
  const label = radio.querySelector('label');
  if (!desc || !input || !label || radio._itens) return;
  // Só as listas com categorias, em árvore, têm o Espaço com o textinho. As outras ficam como botões de rádio simples: nome, e a descrição lida junto, como sempre.
  const lista = radio.closest('fieldset.escolha');
  if (!lista || lista.hasAttribute('data-simples') || !lista.querySelector('details.secao')) return;
  radio.dataset.sel = '1';
  const itens = partirDescricao(desc.textContent);
  if (!itens) return;
  const nome = label.textContent.trim();
  label.dataset.nome = nome;
  const que = paraQue(itens);
  if (que) label.textContent = `${nome}, para ${que}`;
  input.removeAttribute('aria-describedby');
  radio._itens = itens;
  desc.remove();
}
/** Os itens de uma opção, em um texto só, na ordem: tom, indicação, descrição e contraindicação por último. */
const textoDosItens = (itens) => itens.map((x) => `${x.r}: ${x.t}`).join(' ');
const blocoAberto = (fs) => fs.querySelector('.detalhe-aberto');
function fecharDetalhe(fs, voltar = true) {
  const b = blocoAberto(fs); if (!b) return false;
  const dono = b.parentElement, radio = dono && dono.querySelector('input[type="radio"]');
  b.remove();
  if (voltar && radio) radio.focus();
  return true;
}
function abrirDetalhe(dono) {
  const fs = dono.closest('fieldset.escolha');
  fecharDetalhe(fs, false);
  const b = document.createElement('div');
  // 3.0.4: um item para cada coisa (tom, indicação, descrição e contraindicação), andando com as setas.
  // Cada item leva o próprio texto como nome, para o leitor de tela dizer o conteúdo e não só "nota".
  const label = dono.querySelector('label');
  const nome = label ? (label.dataset.nome || label.textContent).trim() : '';
  b.className = 'detalhe-aberto'; b.setAttribute('role', 'list'); b.setAttribute('aria-label', `Detalhes de ${nome}`);
  for (const x of dono._itens) {
    const li = document.createElement('div');
    li.className = 'detalhe-item'; li.setAttribute('role', 'listitem'); li.tabIndex = -1;
    li.textContent = `${x.r}: ${x.t}`;
    li.setAttribute('aria-label', li.textContent);
    b.append(li);
  }
  dono.append(b);
  b.addEventListener('focusout', () => setTimeout(() => { if (b.isConnected && !b.contains(document.activeElement)) b.remove(); }, 0));
  b.querySelector('.detalhe-item').focus();
}
function varrer(raiz) {
  raiz.querySelectorAll('fieldset.escolha .radio').forEach(converterOpcao);
}

// --- Teclado --------------------------------------------------------------------------------------------------

function nomeDoEscolhido(fs) {
  const r = fs.querySelector('input[type="radio"]:checked');
  if (!r) return '';
  const l = fs.querySelector(`label[for="${r.id}"]`);
  return l ? (l.dataset.nome || l.textContent).trim() : '';
}
function sentinelaDe(fs) {
  let s = fs.nextElementSibling;
  if (!s || !s.classList.contains('fim-selecao')) {
    s = document.createElement('span');
    s.className = 'fim-selecao'; s.tabIndex = -1;
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
    fs.after(s);
  }
  return s;
}
function fecharSelecao(fs) {
  fecharDetalhe(fs, false);
  fs.querySelectorAll('details.secao[open]').forEach((d) => { d.open = false; });
  const escolhido = nomeDoEscolhido(fs);
  sentinelaDe(fs).focus();
  falar(escolhido ? `Seleção fechada. Escolhido: ${escolhido}. Tab vai ao próximo ponto.` : 'Seleção fechada. Nada escolhido ainda. Tab vai ao próximo ponto.');
  const r = fs.querySelector('input[type="radio"]:checked');
  document.dispatchEvent(new CustomEvent('selecao-fechada', { detail: { id: fs.id, valor: r ? r.value : '', nome: escolhido } }));
}

/** Os pontos que se alcançam com as setas, na ordem da tela: categorias, opções e, se abertos, os itens da descrição. */
/** Um ponto só existe na árvore se todas as seções por cima dele estão abertas (um item dentro de uma seção fechada não conta). */
function aberto(el) {
  let d = (el.matches('summary') ? el.parentElement.parentElement : el.parentElement).closest('details');
  while (d) { if (!d.open) return false; d = d.parentElement.closest('details'); }
  return true;
}
function nosDa(fs) {
  return [...fs.querySelectorAll('summary, input[type="radio"]')].filter((el) => aberto(el));
}
const foco = (el) => { if (el) el.focus(); };
const summaryDoPai = (det) => { const pai = det.parentElement.closest('details.secao'); return pai ? pai.querySelector(':scope > summary') : null; };

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (document.querySelector('dialog[open]')) return;
  const alvo = document.activeElement;
  if (!alvo || !alvo.closest) return;
  const fs = alvo.closest('fieldset.escolha');
  if (!fs) return;
  const k = e.key;
  const parar = () => { e.preventDefault(); e.stopPropagation(); };
  // O textinho de uma opção: Escape ou Espaço fecham só ele e voltam à opção.
  if (alvo.closest('.detalhe-aberto')) {
    if (k === 'Escape' || k === ' ' || k === 'Enter') { parar(); fecharDetalhe(fs); }
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) {
      parar();
      const itens = [...alvo.closest('.detalhe-aberto').querySelectorAll('.detalhe-item')];
      const i = Math.max(0, itens.indexOf(alvo.closest('.detalhe-item')));
      const j = k === 'Home' ? 0 : k === 'End' ? itens.length - 1 : k === 'ArrowDown' ? Math.min(itens.length - 1, i + 1) : Math.max(0, i - 1);
      itens[j].focus();
    } else if (['ArrowLeft', 'ArrowRight'].includes(k)) parar();
    return;
  }
  const arvore = !!fs.querySelector('details.secao'); // lista com categorias: andar com as setas, escolher com Enter ou espaço

  if (k === 'Escape') { if (!$('ajuda') || $('ajuda').hidden) { parar(); fecharSelecao(fs); } return; }

  const ehRadio = alvo.matches('input[type="radio"]');
  const ehResumo = alvo.matches('summary') && alvo.parentElement.classList.contains('secao');
  const dono = ehRadio ? alvo.parentElement : null;
  if (k === ' ' && ehRadio && dono._itens) { parar(); abrirDetalhe(dono); return; }

  if (!arvore) {
    // Lista sem categorias: as setas para cima e para baixo escolhem, como sempre.
    return;
  }
  // Lista com categorias: uma árvore de arquivos.
  if (!ehRadio && !ehResumo) return;
  const nos = nosDa(fs), i = nos.indexOf(alvo);
  if (k === 'ArrowDown') { parar(); foco(nos[Math.min(nos.length - 1, i + 1)]); return; }
  if (k === 'ArrowUp') { parar(); foco(nos[Math.max(0, i - 1)]); return; }
  if (k === 'Home') { parar(); foco(nos[0]); return; }
  if (k === 'End') { parar(); foco(nos[nos.length - 1]); return; }
  if (k === 'ArrowRight') {
    parar();
    if (ehResumo) {
      const d = alvo.parentElement;
      if (!d.open) { d.open = true; falar(`${alvo.textContent.trim()}, aberta.`); }
      else foco(nosDa(fs)[i + 1]);
    }
    return;
  }
  if (k === 'ArrowLeft') {
    parar();
    if (ehRadio) { const d = alvo.closest('details.secao'); if (d) foco(d.querySelector(':scope > summary')); }
    else {
      const d = alvo.parentElement;
      if (d.open) { d.open = false; falar(`${alvo.textContent.trim()}, fechada.`); }
      else foco(summaryDoPai(d));
    }
    return;
  }
  if (k === 'Enter' && ehRadio) { parar(); alvo.click(); }
}, true);

// --- Arruma o que já existe e o que for aparecendo ---------------------------------------------------------------

let pendente = false;
const observador = new MutationObserver(() => {
  if (pendente) return;
  pendente = true;
  queueMicrotask(() => { pendente = false; varrer(document); });
});
observador.observe(document.body, { childList: true, subtree: true });
varrer(document);
window.selecaoUnica = { varrer, partirDescricao, paraQue, fecharSelecao };
