/* Olho da Cena 3.0.1: o player simples para ouvir a gravação antes de decidir se salva ou descarta.
   Alt P toca e pausa. Com o foco no botão Ouvir: seta para a direita avança 5 segundos, seta para a esquerda volta 5,
   Home volta ao começo e End vai ao fim. O leitor fala onde a gravação está. Vale para vídeo e para áudio. */

const ativos = new Set();
const mmss = (s) => {
  const t = Math.max(0, Math.round(s || 0)), m = Math.floor(t / 60), x = t % 60;
  return m ? `${m} ${m === 1 ? 'minuto' : 'minutos'}${x ? ` e ${x} ${x === 1 ? 'segundo' : 'segundos'}` : ''}` : `${x} ${x === 1 ? 'segundo' : 'segundos'}`;
};

/** Liga um player a uma mídia (<video> ou <audio>) e a três botões. Devolve { carregar, alternar, pular, parar }. */
function ligar({ midia, tocar, voltar, avancar, falar, nome = 'a gravação' }) {
  const rotuloTocar = () => `Ouvir ${nome}, Alt P`;
  const api = {
    carregar(url) { midia.pause(); midia.src = url; midia.load(); tocar.textContent = rotuloTocar(); },
    parar() { try { midia.pause(); } catch (_) { /* */ } if (midia.readyState) midia.currentTime = 0; tocar.textContent = rotuloTocar(); },
    visivel() { return tocar.offsetParent !== null && !tocar.disabled; },
    alternar() {
      if (!midia.getAttribute('src')) return falar('Ainda não há nada para ouvir.');
      if (midia.paused || midia.ended) {
        if (midia.ended) midia.currentTime = 0;
        midia.play().then(() => falar(`Tocando ${nome}, de ${mmss(midia.duration)}. Alt P pausa.`)).catch(() => falar('Não consegui tocar.'));
      } else { midia.pause(); falar(`Pausado em ${mmss(midia.currentTime)} de ${mmss(midia.duration)}. Alt P continua.`); }
    },
    pular(d) {
      if (!midia.getAttribute('src') || !Number.isFinite(midia.duration)) return;
      midia.currentTime = Math.min(Math.max(0, midia.currentTime + d), midia.duration);
      falar(`${mmss(midia.currentTime)} de ${mmss(midia.duration)}.`);
    },
  };
  midia.addEventListener('play', () => { tocar.textContent = `Pausar ${nome}, Alt P`; });
  midia.addEventListener('pause', () => { tocar.textContent = rotuloTocar(); });
  midia.addEventListener('ended', () => { tocar.textContent = rotuloTocar(); falar(`${nome.charAt(0).toUpperCase() + nome.slice(1)} terminou. Alt P ouve de novo, ou escolha o que fazer.`); });
  tocar.addEventListener('click', () => api.alternar());
  voltar.addEventListener('click', () => api.pular(-5));
  avancar.addEventListener('click', () => api.pular(5));
  tocar.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); api.pular(5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); api.pular(-5); }
    else if (e.key === 'Home') { e.preventDefault(); midia.currentTime = 0; falar('No começo.'); }
    else if (e.key === 'End') { e.preventDefault(); if (Number.isFinite(midia.duration)) { midia.currentTime = Math.max(0, midia.duration - 0.2); falar('No fim.'); } }
  });
  ativos.add(api);
  return api;
}

// Alt P toca e pausa o player que estiver à vista. Roda antes dos atalhos das outras telas, que usam Alt P para pausar a gravação.
document.addEventListener('keydown', (e) => {
  if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) || e.code !== 'KeyP') return;
  if (document.querySelector('dialog[open]')) return;
  const p = [...ativos].find((x) => x.visivel());
  if (!p) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!e.repeat) p.alternar();
}, true);

window.PlayerSimples = { ligar, pararTodos: () => ativos.forEach((p) => p.parar()), mmss };
