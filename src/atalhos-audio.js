'use strict';
/**
 * 1.3: atalhos e contas das telas de ajuste de áudio depois da gravação (Cortes agora;
 * Silêncios e crossfade, Efeitos e trilhas, Equalização e ajustes nas próximas versões).
 * Puro: funciona no Node (testes) e no navegador (window.AtalhosAudio).
 * Nenhum atalho vale dentro de campo editável.
 */
(function (raiz) {
  const SALTO_PADRAO = 5;      // segundos, como no Editar vídeo da 1.0.0
  const PASSO_SETA = 0.5;      // 1.7.1: setas para os lados: meio segundo
  const PREVIA_LADO = 5;       // Alt G: 5 segundos antes e 5 depois

  const MSG = {
    semDescartes: 'Nenhum descarte encontrado. Use Alt I e Alt F para marcar os descartes desejados antes de selecionar. Del e Alt S descartam ou salvam todos.',
    previa: 'Prévia de 10 segundos. Avance e recue para ouvir outros trechos.'
  };

  /**
   * 1.4: níveis do corte de silêncio. O equilibrado é, sem nenhuma mudança, o nível único do
   * Gerador de Vídeo 2.0.3 (= Olho da Cena 1.0.0, NIVEL_SILENCIO_PADRAO em ui/renderer.js):
   * limiar -30 dB, pausa mínima 0,6 s, margem 0,15 s de cada lado. Leve e agressivo são os
   * dois outros níveis já usados no Olho da Cena (commit 6ff1d6d), também sem mudança.
   */
  const NIVEIS_SILENCIO = {
    // 1.8.1: silêncio = mais de 19 dB abaixo da voz (respirações contam como silêncio).
    // pausaMinima: só corta pausas a partir disso; deixar: quanto fica entre as frases (metade de cada lado).
    leve: { pausaMinima: 0.7, deixar: 0.4 },
    equilibrado: { pausaMinima: 0.4, deixar: 0.25 },
    agressivo: { pausaMinima: 0.12, deixar: 0.1 }
  };
  /** Só os silêncios que ainda caem no que fica (fora do que já foi cortado à mão). */
  function silenciosQueFicam(silencios, cortes) {
    const cs = unir(cortes);
    return (silencios || []).filter((s) => !cs.some((c) => s.inicio >= c.inicio - 0.01 && s.fim <= c.fim + 0.01));
  }

  /** Campo onde se digita (ou controle que usa as setas): ali nenhum atalho dispara. */
  function emCampoEditavel(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(String(el.type || 'text').toLowerCase());
    return false;
  }

  /**
   * Qual ação a tecla pede, ou null. e: { key, code, altKey, ctrlKey, shiftKey, metaKey, target }.
   */
  function acaoDaTecla(e, alvo) {
    if (!e || emCampoEditavel(alvo !== undefined ? alvo : e.target)) return null;
    if (e.metaKey || e.shiftKey) return null;
    const alt = e.altKey && !e.ctrlKey, ctrl = e.ctrlKey && !e.altKey, nada = !e.altKey && !e.ctrlKey;
    const code = e.code || '', k = String(e.key || '').toLowerCase();
    if (alt) {
      if (code === 'KeyI' || k === 'i') return 'inicio';
      if (code === 'KeyF' || k === 'f') return 'fim';
      if (code === 'KeyS' || k === 's') return 'salvarTodos';
      if (code === 'KeyD' || k === 'd') return 'listaDescartes';
      if (code === 'KeyG' || k === 'g') return 'previa';
      if (code === 'KeyP' || k === 'p') return 'ouvirPrevia'; // 1.4: verificação de silêncios
      if (code === 'KeyZ' || k === 'z') return 'desfazer'; // 1.8: volta para a última versão salva
      return null;
    }
    if (ctrl) {
      if (e.key === 'ArrowUp') return 'maisVelocidade';
      if (e.key === 'ArrowDown') return 'menosVelocidade';
      if (e.key === 'ArrowRight') return 'maisVolume';
      if (e.key === 'ArrowLeft') return 'menosVolume';
      return null;
    }
    if (nada) {
      switch (e.key) {
        case 'Delete': return 'descartarTodos';
        case 'ArrowLeft': return 'voltar1';
        case 'ArrowRight': return 'avancar1';
        case 'F2': return 'salto';
        case 'PageUp': return 'proximoSalto';
        case 'PageDown': return 'saltoAnterior';
        case ' ': case 'Spacebar': return 'tocar';
        case 'Home': return 'comeco';
        case 'End': return 'final';
        default: return null;
      }
    }
    return null;
  }

  const dois = (n) => String(n).padStart(2, '0');
  /** "00:08", "12:30"; com horas ("01:02:03") só se o vídeo tiver mais de uma hora. */
  function formatarTempo(seg, duracaoTotal) {
    const t = Math.max(0, Math.floor(Number(seg) || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (Number(duracaoTotal) > 3600) return `${dois(h)}:${dois(m)}:${dois(s)}`;
    return `${dois(h * 60 + m)}:${dois(s)}`;
  }
  /** Lê "1:30", "01:30", "90", "1:02:03" (horas só se o vídeo tiver mais de uma hora). null se inválido. */
  function lerTempo(texto, duracaoTotal) {
    const t = String(texto || '').trim().replace(/[.,]/g, ':');
    if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
    const p = t.split(':').map(Number);
    if (p.length === 3 && !(Number(duracaoTotal) > 3600)) return null;
    if (p.slice(1).some((n) => n > 59)) return null;
    return p.reduce((a, n) => a * 60 + n, 0);
  }

  /** Une cortes que se encostam ou cruzam, em ordem. */
  function unir(cortes) {
    const out = [];
    for (const c of [...(cortes || [])].map((x) => ({ inicio: x.inicio, fim: x.fim })).sort((a, b) => a.inicio - b.inicio)) {
      const u = out[out.length - 1];
      if (u && c.inicio <= u.fim + 0.05) u.fim = Math.max(u.fim, c.fim);
      else out.push(c);
    }
    return out;
  }
  /** O que fica (em tempo do original), dado o que é cortado. */
  function mantidos(cortes, duracao) {
    const out = [];
    let t = 0;
    for (const c of unir(cortes)) {
      if (c.inicio > t) out.push({ de: t, ate: Math.min(c.inicio, duracao) });
      t = Math.max(t, c.fim);
    }
    if (t < duracao) out.push({ de: t, ate: duracao });
    return out.filter((m) => m.ate - m.de > 0.01);
  }
  /** Tocando: se o ponto caiu num corte, pula para o fim dele. */
  function pularCorte(t, cortes) {
    for (const c of unir(cortes)) if (t >= c.inicio - 0.01 && t < c.fim) return c.fim;
    return t;
  }
  /**
   * Alt G: pedaços do original para 5 s antes e 5 s depois do ponto, contando só o que fica
   * (sem os cortes e sem as seleções de descarte).
   */
  function segmentosPrevia(ponto, cortes, duracao, lado = PREVIA_LADO) {
    const ms = mantidos(cortes, duracao);
    if (!ms.length) return [];
    // ponto no tempo editado
    const p = pularCorte(Math.min(Math.max(0, ponto), duracao), cortes);
    let te = 0;
    for (const m of ms) {
      if (p >= m.ate) { te += m.ate - m.de; continue; }
      te += Math.max(0, p - m.de);
      break;
    }
    const total = ms.reduce((a, m) => a + m.ate - m.de, 0);
    let ini = te - lado, fim = te + lado;
    if (ini < 0) { fim = Math.min(total, fim - ini); ini = 0; }
    if (fim > total) { ini = Math.max(0, ini - (fim - total)); fim = total; }
    const out = [];
    let acc = 0;
    for (const m of ms) {
      const d = m.ate - m.de, a = acc, b = acc + d;
      const x = Math.max(a, ini), y = Math.min(b, fim);
      if (y - x > 0.01) out.push({ de: m.de + (x - a), ate: m.de + (y - a) });
      acc = b;
    }
    return out;
  }

  /** "Descarte 1, de 00:00 a 00:08" */
  function textoDescarte(i, tr, duracaoTotal) {
    return `Descarte ${i + 1}, de ${formatarTempo(tr.inicio, duracaoTotal)} a ${formatarTempo(tr.fim, duracaoTotal)}`;
  }
  /** Itens da lista do Alt D: rótulo e os três botões. */
  function itensDescartes(trechos, duracaoTotal) {
    return [...(trechos || [])].sort((a, b) => a.inicio - b.inicio).map((tr, i) => ({
      trecho: tr, rotulo: textoDescarte(i, tr, duracaoTotal),
      botoes: [`Ouvir trecho ${i + 1}`, `Descartar trecho ${i + 1}`, `Salvar trecho ${i + 1}`]
    }));
  }

  /** Volume que toca na tela: o ganho do nivelamento (dB) vezes o volume escolhido. */
  function ganhoLinear(ganhoDb, volume) {
    return Math.pow(10, (Number(ganhoDb) || 0) / 20) * (Number(volume) || 1);
  }
  /** Ganho total em dB (nivelamento + volume), para salvar trechos com o mesmo volume da tela. */
  function ganhoTotalDb(ganhoDb, volume) {
    return Math.round(((Number(ganhoDb) || 0) + 20 * Math.log10(Number(volume) || 1)) * 10) / 10;
  }

  const api = { SALTO_PADRAO, PASSO_SETA, PREVIA_LADO, MSG, emCampoEditavel, acaoDaTecla, formatarTempo, lerTempo,
    unir, mantidos, pularCorte, NIVEIS_SILENCIO, silenciosQueFicam, segmentosPrevia, textoDescarte, itensDescartes, ganhoLinear, ganhoTotalDb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.AtalhosAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
