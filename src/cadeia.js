'use strict';
/**
 * 1.8.6: cortes do áudio da gravação aplicados à imagem de verdade, uma vez só (no Finalizar).
 *
 * Cada tela de áudio cortou um vídeo leve (16x16, com os mesmos quadros e tempos) e devolveu o plano
 * que usou: trechos mantidos, sobreposições do crossfade e velocidade. Aqui os mesmos planos, na mesma
 * ordem, viram um filtro só do FFmpeg sobre o vídeo original: trim e concat (ou xfade) iguais aos do
 * argsCortar. Assim imagem e som continuam juntos.
 */
function filtroCadeia(planos, entrada = '[0:v]', saida = '[vc]') {
  const partes = [];
  let atual = entrada;
  (planos || []).forEach((p, k) => {
    if (!p) return;
    const ms = p.cortes ? p.mantidos || [] : [];
    if (ms.length) {
      const n = ms.length;
      const sob = Array.isArray(p.sobreposicoes) && p.sobreposicoes.length === n - 1 && n > 1;
      const fps = Number((p.fps || 30).toFixed(5));
      partes.push(`${atual}split=${n}${ms.map((_, i) => `[c${k}s${i}]`).join('')}`);
      ms.forEach((m, i) => partes.push(`[c${k}s${i}]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS${sob ? `,fps=${fps},settb=AVTB` : ''}[c${k}v${i}]`));
      if (sob) {
        let v = `[c${k}v0]`, comp = ms[0].ate - ms[0].de;
        for (let i = 0; i < n - 1; i++) {
          const d = p.sobreposicoes[i];
          const o = `[c${k}x${i}]`;
          partes.push(`${v}[c${k}v${i + 1}]xfade=transition=fade:duration=${d.toFixed(4)}:offset=${(comp - d).toFixed(4)}${o}`);
          v = o;
          comp += (ms[i + 1].ate - ms[i + 1].de) - d;
        }
        atual = v;
      } else {
        partes.push(`${ms.map((_, i) => `[c${k}v${i}]`).join('')}concat=n=${n}:v=1:a=0[c${k}o]`);
        atual = `[c${k}o]`;
      }
    }
    if (p.velocidade) { partes.push(`${atual}${p.velocidade}[c${k}vel]`); atual = `[c${k}vel]`; }
  });
  partes.push(`${atual}null${saida}`);
  return partes.join(';');
}
const temCortes = (planos) => (planos || []).some((p) => p && ((p.cortes && p.mantidos && p.mantidos.length) || p.velocidade));
module.exports = { filtroCadeia, temCortes };
