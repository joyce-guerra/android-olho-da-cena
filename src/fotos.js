'use strict';
/**
 * 2.0.7: Tirar fotos. Proporções, as molduras com fundo (desenhadas por código, então servem em qualquer
 * proporção), as figurinhas, o escrito e a composição da foto. Só usa a API do canvas 2D: roda na tela
 * (canvas comum, como window.Fotos, pois um contexto de canvas não atravessa a ponte do preload) e em OffscreenCanvas. As opções dizem Indicação, Contraindicação e Descrição, como no resto do programa.
 */
(function (raiz) {
const descricaoPadrao = typeof module !== 'undefined' && module.exports ? require('./padrao').descricaoPadrao : raiz.Padrao.descricaoPadrao;

// --- Proporções ---------------------------------------------------------------------------

const PROPORCOES_FOTO = [
  { valor: 'quadrada', nome: 'Quadrada, 1 por 1', w: 1, h: 1, largura: 1440, altura: 1440,
    indicacao: 'Foto de perfil, aquela pequena que aparece ao lado do seu nome nas redes sociais e nos aplicativos de mensagem.',
    contra: 'Quando quer mostrar mais do corpo ou um cenário grande.',
    descricao: 'Um quadrado, com os quatro lados iguais. Com a pessoa sentada, mostra a cabeça e os ombros. Combina com moldura e fundo de lugar. Evite escrito, porque ele some quando a foto é reduzida.' },
  { valor: 'feed', nome: 'Feed, 4 por 5', w: 4, h: 5, largura: 1440, altura: 1800,
    indicacao: 'Publicação comum do Instagram e do Facebook, aquela que você vê ao rolar a tela e que ocupa bastante espaço.',
    contra: 'Capa de vídeo e imagem deitada.',
    descricao: 'Um retângulo em pé, um pouco mais alto que largo. Com a pessoa sentada, mostra da cabeça até o peito. Combina com fundo de lugar, moldura e um escrito curto.' },
  { valor: 'retrato', nome: 'Retrato, 3 por 4', w: 3, h: 4, largura: 1440, altura: 1920,
    indicacao: 'Currículo, cadastros, crachás e apresentação profissional, como a foto de documento.',
    contra: 'Imagem para ocupar a tela inteira do celular.',
    descricao: 'O retrato clássico, em pé. Com a pessoa sentada, mostra a cabeça e os ombros, até o peito. Combina com moldura sóbria, escritório ou fundo liso. Evite figurinha.' },
  { valor: 'cartao', nome: 'Cartão, 2 por 3', w: 2, h: 3, largura: 1280, altura: 1920,
    indicacao: 'Foto para imprimir no tamanho 10 por 15 centímetros, para dar de presente ou pôr em cartão.',
    contra: 'Foto de perfil.',
    descricao: 'Um retângulo alto e estreito. Com a pessoa sentada, mostra da cabeça até a cintura, com as mãos à vista. Combina com moldura festiva, figurinha e escrito.' },
  { valor: 'stories', nome: 'Stories, 9 por 16', w: 9, h: 16, largura: 1080, altura: 1920,
    indicacao: 'Stories do Instagram e do WhatsApp, a imagem que preenche a tela inteira do celular quando ele está em pé na mão.',
    contra: 'Impressão e publicações do feed.',
    descricao: 'O retângulo mais alto e estreito. Com a pessoa sentada, mostra da cabeça à cintura, com bastante cenário em cima e embaixo. Combina com fundo de lugar e figurinha.' },
  { valor: 'capa', nome: 'Capa, 16 por 9', w: 16, h: 9, largura: 1920, altura: 1080,
    indicacao: 'Capa de vídeo do YouTube, banner e imagem deitada, do formato da tela do computador ou da televisão.',
    contra: 'Foto de perfil.',
    descricao: 'Um retângulo deitado. Com a pessoa sentada, você ocupa o meio e sobra espaço dos dois lados. Combina com fundo de lugar e escrito grande.' },
  { valor: 'capa-quadrada', nome: 'Capa quadrada, 3000 por 3000 (Spotify)', w: 1, h: 1, largura: 3000, altura: 3000, fixo: true, grande: true,
    indicacao: 'Capa de álbum, podcast e playlist no Spotify e em outras plataformas de áudio.',
    contra: 'Foto de perfil comum, que não precisa desse tamanho.',
    descricao: 'Um quadrado de 3000 por 3000 pontos, o tamanho ideal do Spotify, que aceita de 640 a 10000. Com a pessoa sentada, mostra a cabeça e os ombros, grandes. O escrito, se houver, sai em letras bem grandes, em até duas linhas. Combina com fundo de lugar e moldura.' },
  { valor: 'capa-ebook', nome: 'Capa de ebook, 5 por 8', w: 5, h: 8, largura: 1600, altura: 2560, fixo: true, grande: true, destino: 'o tamanho recomendado pela Amazon',
    indicacao: 'Capa de livro digital na Amazon e na Central de Escrita.',
    contra: 'Foto de perfil e publicação comum de rede social.',
    descricao: 'Um retângulo alto, de 1600 por 2560 pontos, o tamanho recomendado pela Amazon. A capa sai sempre com esse tamanho exato, sem cortar o que você enquadrou. Com a pessoa sentada, mostra da cabeça à cintura, com espaço em cima para o título e embaixo para o nome da autora ou do autor. Combina com moldura e fundo de lugar.' }
].map((p) => ({ ...p, texto: descricaoPadrao({ indicacao: p.indicacao, contraindicacao: p.contra, descricao: p.descricao }) }));

const acharProporcao = (v) => PROPORCOES_FOTO.find((p) => p.valor === v) || null;

/** Maior pedaço da câmera (vw x vh) com a razão pedida (largura/altura), centrado em cx (0 a 1) na largura, sem deformar. */
function recorteRazao(vw, vh, razao, cx = 0.5) {
  if (!vw || !vh || !razao) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  if (vw / vh > razao) {
    const sw = Math.round(vh * razao);
    const sx = Math.min(vw - sw, Math.max(0, Math.round(cx * vw - sw / 2)));
    return { sx, sy: 0, sw, sh: vh };
  }
  const sh = Math.round(vw / razao);
  return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
}

// --- Ferramentas de desenho -----------------------------------------------------------------

/** Números sempre iguais para a mesma moldura (confete, estrelas): a foto não muda de um clique para outro. */
function sorteio(semente) {
  let s = semente >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function gradiente(ctx, x0, y0, x1, y1, paradas) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  paradas.forEach(([p, c]) => g.addColorStop(p, c));
  return g;
}
function retArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function estrela(ctx, cx, cy, R, r, pontas = 5, giro = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < pontas * 2; i++) {
    const raio = i % 2 ? r : R, a = giro + (i * Math.PI) / pontas;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * raio, cy + Math.sin(a) * raio);
  }
  ctx.closePath();
}
function coracao(ctx, cx, cy, t) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + t * 0.9);
  ctx.bezierCurveTo(cx - t * 1.6, cy - t * 0.2, cx - t * 0.8, cy - t * 1.2, cx, cy - t * 0.4);
  ctx.bezierCurveTo(cx + t * 0.8, cy - t * 1.2, cx + t * 1.6, cy - t * 0.2, cx, cy + t * 0.9);
  ctx.closePath();
}
function flor(ctx, cx, cy, t, petala = '#ff8fb1', miolo = '#ffd166', n = 6) {
  ctx.fillStyle = petala;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * t * 0.62, cy + Math.sin(a) * t * 0.62, t * 0.52, t * 0.34, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = miolo;
  ctx.beginPath(); ctx.arc(cx, cy, t * 0.34, 0, Math.PI * 2); ctx.fill();
}
function folha(ctx, cx, cy, comp, larg, giro, cor = '#1f7a3a', nervura = '#14582a') {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(giro);
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(comp * 0.5, -larg, comp, 0);
  ctx.quadraticCurveTo(comp * 0.5, larg, 0, 0);
  ctx.fill();
  ctx.strokeStyle = nervura; ctx.lineWidth = Math.max(1, larg * 0.08);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(comp * 0.95, 0); ctx.stroke();
  ctx.restore();
}
function ovo(ctx, cx, cy, t, base, faixa) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, t * 0.75, t, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(cx - t, cy - t, t * 2, t * 2);
  ctx.strokeStyle = faixa; ctx.lineWidth = t * 0.16;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const y = cy + i * t * 0.3;
    ctx.moveTo(cx - t, y);
    for (let k = 0; k < 8; k++) ctx.lineTo(cx - t + (k + 1) * t * 0.25, y + (k % 2 ? -1 : 1) * t * 0.12);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = t * 0.05;
  ctx.beginPath(); ctx.ellipse(cx, cy, t * 0.75, t, 0, 0, Math.PI * 2); ctx.stroke();
}
function coelho(ctx, cx, cy, t) {
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = t * 0.04;
  const el = (x, y, rx, ry, g = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, g, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  el(cx, cy + t * 0.55, t * 0.85, t * 0.7);
  el(cx + t * 0.85, cy + t * 0.95, t * 0.2, t * 0.2);
  el(cx - t * 0.35, cy - t * 0.9, t * 0.2, t * 0.9, -0.15);
  el(cx + t * 0.35, cy - t * 0.9, t * 0.2, t * 0.9, 0.15);
  ctx.fillStyle = '#ffc2d1';
  ctx.beginPath(); ctx.ellipse(cx - t * 0.35, cy - t * 0.9, t * 0.09, t * 0.65, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + t * 0.35, cy - t * 0.9, t * 0.09, t * 0.65, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  el(cx, cy, t * 0.55, t * 0.5);
  ctx.fillStyle = '#4a3b3b';
  ctx.beginPath(); ctx.arc(cx - t * 0.2, cy - t * 0.05, t * 0.06, 0, Math.PI * 2); ctx.arc(cx + t * 0.2, cy - t * 0.05, t * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8fa3';
  ctx.beginPath(); ctx.ellipse(cx, cy + t * 0.12, t * 0.07, t * 0.05, 0, 0, Math.PI * 2); ctx.fill();
}
function floco(ctx, cx, cy, t) {
  ctx.lineWidth = Math.max(1, t * 0.18); ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * t, cy - Math.sin(a) * t); ctx.lineTo(cx + Math.cos(a) * t, cy + Math.sin(a) * t); ctx.stroke();
  }
}

// --- As 20 molduras com fundo ------------------------------------------------------------------
// janela(W, H, u): onde a pessoa aparece (u = 1% do menor lado). modo: 'recorte' (a pessoa sobre o fundo da moldura)
// ou 'foto' (a foto inteira dentro da moldura). fundo: pinta a imagem toda antes. janelaFundo: pinta só dentro da janela.
// moldura: desenha por cima de tudo.

const cheia = (W, H) => ({ x: 0, y: 0, w: W, h: H, forma: 'ret' });
const margem = (m, r = 0) => (W, H, u) => ({ x: m * u, y: m * u, w: W - 2 * m * u, h: H - 2 * m * u, forma: 'ret', raio: r * u });

function bordaFina(cor, recuo, grossura) {
  return (ctx, W, H, j, u) => {
    ctx.strokeStyle = cor; ctx.lineWidth = grossura * u;
    retArredondado(ctx, recuo * u, recuo * u, W - 2 * recuo * u, H - 2 * recuo * u, 0.8 * u); ctx.stroke();
  };
}
function contornoJanela(ctx, j) {
  if (j.forma === 'circulo') { ctx.beginPath(); ctx.arc(j.x + j.w / 2, j.y + j.h / 2, j.w / 2, 0, Math.PI * 2); }
  else retArredondado(ctx, j.x, j.y, j.w, j.h, j.raio || 0);
}
/** Elementos ao longo do contorno da janela (corações, confete, manchas). */
function aoLongoDaJanela(j, passo, fazer) {
  const lados = [[j.x, j.y, 1, 0, j.w], [j.x + j.w, j.y, 0, 1, j.h], [j.x + j.w, j.y + j.h, -1, 0, j.w], [j.x, j.y + j.h, 0, -1, j.h]];
  let k = 0;
  for (const [x, y, dx, dy, comp] of lados) {
    const n = Math.max(1, Math.round(comp / passo));
    for (let i = 0; i < n; i++) { const t = ((i + 0.5) / n) * comp; fazer(x + dx * t, y + dy * t, k++); }
  }
}

const M = [];
const moldura = (o) => M.push({ janela: cheia, modo: 'recorte', ...o, texto: descricaoPadrao({ indicacao: o.indicacao, contraindicacao: o.contra, descricao: o.descricao }) });

// Sóbrios
moldura({ valor: 'grafite-fio', nome: 'Grafite com fio branco', indicacao: 'Perfil profissional, currículo e apresentação de trabalho.', contra: 'Fotos alegres, de festa ou infantis.',
  descricao: 'Fundo cinza escuro liso, com uma linha branca fina perto da borda.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#343a42'], [1, '#1b1e23']]); c.fillRect(0, 0, W, H); },
  moldura: bordaFina('#ffffff', 3, 0.35) });
moldura({ valor: 'marinho-dourado', nome: 'Azul marinho com borda dupla dourada', indicacao: 'Foto formal, de palestrante, autora ou autor, e perfis de negócios.', contra: 'Fotos descontraídas.',
  descricao: 'Fundo azul marinho e duas linhas finas douradas, uma por fora e outra mais por dentro.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#1d2f5c'], [1, '#0d1730']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => { bordaFina('#d4af37', 3, 0.9)(c, W, H, j, u); bordaFina('#d4af37', 5.2, 0.3)(c, W, H, j, u); } });
moldura({ valor: 'branco-gelo', nome: 'Branco gelo com margem larga', indicacao: 'Retrato de estúdio, portfólio e apresentação limpa.', contra: 'Fotos que pedem cor e energia.',
  descricao: 'Margem branca larga em volta, e a pessoa sobre um cinza muito claro, como num estúdio.',
  janela: margem(7),
  fundo: (c, W, H) => { c.fillStyle = '#f7f8fa'; c.fillRect(0, 0, W, H); },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#eceff3'], [1, '#d3d8df']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => { c.strokeStyle = '#c3c9d1'; c.lineWidth = 0.25 * u; c.strokeRect(j.x, j.y, j.w, j.h); } });
moldura({ valor: 'madeira-quadro', nome: 'Parede bege com moldura de madeira', indicacao: 'Retrato com ar de quadro na parede, homenagens e lembranças.', contra: 'Fotos modernas ou divertidas.',
  descricao: 'Parede bege clara e, em volta da pessoa, uma moldura de madeira marrom de cantos retos.',
  janela: margem(8),
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#e3d5bd'], [1, '#c9b998']]); c.fillRect(0, 0, W, H); },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#f1e9da'], [1, '#d5c7ac']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => {
    const e = 2 * u, f = 3.2 * u;
    c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#8a5a2b'], [0.5, '#a9743c'], [1, '#6d4420']]);
    c.beginPath(); c.rect(j.x - f, j.y - f, j.w + 2 * f, j.h + 2 * f); c.rect(j.x, j.y, j.w, j.h); c.fill('evenodd');
    c.strokeStyle = 'rgba(255,230,190,0.5)'; c.lineWidth = 0.3 * u; c.strokeRect(j.x - f + e * 0.25, j.y - f + e * 0.25, j.w + 2 * f - e * 0.5, j.h + 2 * f - e * 0.5);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.4 * u; c.strokeRect(j.x, j.y, j.w, j.h);
  } });
moldura({ valor: 'musgo-redondo', nome: 'Verde musgo com cantos arredondados', indicacao: 'Perfil tranquilo, ligado a natureza, bem-estar e terapias.', contra: 'Assuntos de tecnologia ou de negócios.',
  descricao: 'Fundo verde musgo e uma moldura grossa de cantos bem redondos, em verde mais claro.',
  janela: margem(5, 9),
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#4c6b4d'], [1, '#2f4731']]); c.fillRect(0, 0, W, H); },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#9db99c'], [1, '#6f8f70']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => { c.strokeStyle = '#b7d3b0'; c.lineWidth = 1.2 * u; retArredondado(c, j.x, j.y, j.w, j.h, j.raio); c.stroke(); } });
moldura({ valor: 'areia-dobrada', nome: 'Areia com cantos dobrados', indicacao: 'Foto leve e calorosa para apresentar um trabalho artesanal ou de cuidado.', contra: 'Fotos formais.',
  descricao: 'Fundo cor de areia e quatro cantos dobrados, como um papel virado.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#efe3cb'], [1, '#d9c7a3']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    const t = 11 * u;
    [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(([x, y, dx, dy]) => {
      c.fillStyle = '#b8a47c'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * t, y); c.lineTo(x, y + dy * t); c.closePath(); c.fill();
      c.fillStyle = '#f7efdc'; c.beginPath(); c.moveTo(x + dx * t, y); c.lineTo(x, y + dy * t); c.lineTo(x + dx * t * 0.92, y + dy * t * 0.92); c.closePath(); c.fill();
    });
  } });

// Criativos
moldura({ valor: 'polaroide', nome: 'Polaroide', indicacao: 'Foto descontraída, lembranças e publicações pessoais.', contra: 'Foto formal ou de documento.',
  descricao: 'A foto dentro de um cartão branco, com a margem de baixo mais larga, sobre um fundo rosa claro.',
  janela: (W, H, u) => ({ x: 9 * u, y: 8 * u, w: W - 18 * u, h: H - 8 * u - 20 * u, forma: 'ret' }), modo: 'foto',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#f8d7dc'], [1, '#f1b9c6']]); c.fillRect(0, 0, W, H);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 2 * u; c.shadowOffsetY = 0.6 * u;
    c.fillStyle = '#fffdf8'; c.fillRect(4 * u, 3 * u, W - 8 * u, H - 6 * u); c.restore();
  },
  moldura: (c, W, H, j, u) => { c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.25 * u; c.strokeRect(j.x, j.y, j.w, j.h); } });
moldura({ valor: 'filme', nome: 'Filme de cinema', indicacao: 'Vídeos e conteúdos de cinema, memórias e fotos com clima de história.', contra: 'Foto formal.',
  descricao: 'Faixas pretas dos lados, com furinhos retangulares como numa tira de filme, e a foto no meio.',
  janela: (W, H, u) => ({ x: 12 * u, y: 3 * u, w: W - 24 * u, h: H - 6 * u, forma: 'ret' }), modo: 'foto',
  fundo: (c, W, H) => { c.fillStyle = '#0e0e10'; c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    c.fillStyle = '#f2efe6';
    const passo = 5.4 * u;
    for (let y = 1.5 * u; y < H - 3 * u; y += passo) {
      retArredondado(c, 3.4 * u, y, 5.2 * u, 3.4 * u, 0.7 * u); c.fill();
      retArredondado(c, W - 8.6 * u, y, 5.2 * u, 3.4 * u, 0.7 * u); c.fill();
    }
  } });
moldura({ valor: 'aquarela', nome: 'Aquarela rosa e lilás', indicacao: 'Foto sensível: arte, escrita, terapia e delicadeza.', contra: 'Foto técnica ou de negócios.',
  descricao: 'Manchas de tinta rosa e lilás que escorrem pelas bordas, e a pessoa sobre um fundo bem claro.',
  janela: margem(7),
  fundo: (c, W, H, j, u) => {
    c.fillStyle = '#fff8fb'; c.fillRect(0, 0, W, H);
    const r = sorteio(7), cores = ['rgba(246,160,196,', 'rgba(190,160,235,', 'rgba(250,190,170,'];
    for (let i = 0; i < 28; i++) {
      const x = r() * W, y = r() * H, raio = (6 + r() * 12) * u;
      const g = c.createRadialGradient(x, y, 0, x, y, raio);
      g.addColorStop(0, cores[i % 3] + '0.55)'); g.addColorStop(1, cores[i % 3] + '0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, raio, 0, Math.PI * 2); c.fill();
    }
  },
  janelaFundo: (c, j) => { c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => {
    const r = sorteio(11), cores = ['rgba(240,140,185,0.55)', 'rgba(176,140,230,0.5)', 'rgba(255,175,150,0.5)'];
    aoLongoDaJanela(j, 4.5 * u, (x, y, k) => { c.fillStyle = cores[k % 3]; c.beginPath(); c.arc(x + (r() - 0.5) * 2 * u, y + (r() - 0.5) * 2 * u, (2.2 + r() * 2.6) * u, 0, Math.PI * 2); c.fill(); });
  } });
moldura({ valor: 'coracoes', nome: 'Corações românticos', indicacao: 'Foto de casal, de aniversário de namoro, Dia dos Namorados e mensagens de carinho.', contra: 'Assuntos sérios, formais ou de negócios.',
  descricao: 'Fundo rosa suave, corações pequenos espalhados e uma fileira de corações vermelhos e rosa em volta da pessoa.',
  janela: margem(9),
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#ffe0e8'], [1, '#ffb3c6']]); c.fillRect(0, 0, W, H);
    const r = sorteio(3); c.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 26; i++) { coracao(c, r() * W, r() * H, (1.2 + r() * 2.2) * u); c.fill(); }
  },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#fff2f5'], [1, '#ffd9e2']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => {
    const cores = ['#e63956', '#ff7096', '#c9184a'];
    aoLongoDaJanela({ x: j.x - 3.6 * u, y: j.y - 3.6 * u, w: j.w + 7.2 * u, h: j.h + 7.2 * u }, 5.2 * u, (x, y, k) => { c.fillStyle = cores[k % 3]; coracao(c, x, y, (1.6 + (k % 2) * 0.4) * u); c.fill(); });
  } });
moldura({ valor: 'por-do-sol', nome: 'Pôr do sol', indicacao: 'Foto inspiradora, de reflexão, viagens e mensagens de esperança.', contra: 'Assuntos técnicos ou formais.',
  descricao: 'Céu em degradê de laranja para roxo, com um sol baixo, e uma linha branca fina de cantos redondos em volta.',
  janela: margem(4, 10),
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#4a2c6e'], [0.45, '#c0476b'], [0.8, '#ff9a56'], [1, '#ffd37a']]); c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,230,160,0.9)'; c.beginPath(); c.arc(W * 0.5, H * 0.74, 11 * u, 0, Math.PI * 2); c.fill();
  },
  moldura: (c, W, H, j, u) => { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.5 * u; retArredondado(c, j.x, j.y, j.w, j.h, j.raio); c.stroke(); } });
moldura({ valor: 'revista', nome: 'Capa de revista', indicacao: 'Foto de destaque para divulgar um trabalho, entrevista ou projeto.', contra: 'Foto íntima ou de documento.',
  descricao: 'Uma faixa vermelha em cima e uma faixa azul escura embaixo, com a pessoa no meio sobre um fundo claro. As faixas ficam sem texto, e o seu escrito pode entrar nelas.',
  janela: (W, H, u) => ({ x: 0, y: 12 * u, w: W, h: H - 24 * u, forma: 'ret' }),
  fundo: (c, W, H, j, u) => { c.fillStyle = '#f5f1ea'; c.fillRect(0, 0, W, H); c.fillStyle = '#d62839'; c.fillRect(0, 0, W, 12 * u); c.fillStyle = '#1d3557'; c.fillRect(0, H - 12 * u, W, 12 * u); },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#dfe9f3'], [1, '#b7c9dc']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => { c.fillStyle = '#f7c548'; c.fillRect(0, 12 * u, W, 0.6 * u); c.fillRect(0, H - 12.6 * u, W, 0.6 * u); } });

// Festivos e temáticos
moldura({ valor: 'confete', nome: 'Confete', indicacao: 'Aniversário, comemoração, boas notícias e formaturas.', contra: 'Assuntos sérios, luto ou formais.',
  descricao: 'Fundo claro com confetes coloridos nas bordas, que passam um pouco por cima da pessoa.',
  janela: margem(7),
  fundo: (c, W, H) => { c.fillStyle = '#fff6e5'; c.fillRect(0, 0, W, H); },
  janelaFundo: (c, j) => { c.fillStyle = gradiente(c, 0, j.y, 0, j.y + j.h, [[0, '#fffdf7'], [1, '#ffe9bf']]); c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => {
    const r = sorteio(21), cores = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b'];
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = r() * H;
      const dentro = x > j.x + 2 * u && x < j.x + j.w - 2 * u && y > j.y + 2 * u && y < j.y + j.h - 2 * u;
      if (dentro && r() < 0.96) continue;
      c.fillStyle = cores[i % cores.length]; c.save(); c.translate(x, y); c.rotate(r() * 6);
      if (i % 3) c.fillRect(-0.9 * u, -0.45 * u, 1.8 * u, 0.9 * u); else { c.beginPath(); c.arc(0, 0, 0.7 * u, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  } });
moldura({ valor: 'estrelas', nome: 'Estrelas douradas', indicacao: 'Conquistas, prêmios, noite de gala e mensagens de brilho.', contra: 'Assuntos discretos ou de luto.',
  descricao: 'Fundo azul noite com estrelas douradas de vários tamanhos, e quatro estrelas maiores nos cantos.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#0b1a45'], [1, '#243b86']]); c.fillRect(0, 0, W, H);
    const r = sorteio(5); c.fillStyle = 'rgba(255,214,102,0.85)';
    for (let i = 0; i < 40; i++) { const t = (0.5 + r() * 1.4) * u; estrela(c, r() * W, r() * H, t, t * 0.42); c.fill(); }
  },
  moldura: (c, W, H, j, u) => { c.fillStyle = '#ffd166'; [[6, 6], [W / u - 6, 6], [6, H / u - 6], [W / u - 6, H / u - 6]].forEach(([x, y]) => { estrela(c, x * u, y * u, 3.8 * u, 1.6 * u); c.fill(); }); } });
moldura({ valor: 'flores', nome: 'Flores nos quatro cantos', indicacao: 'Dia das Mães, aniversário, primavera e mensagens de carinho.', contra: 'Assuntos técnicos ou formais.',
  descricao: 'Fundo verde claro com um buquê de flores rosa, amarelas e brancas em cada canto, passando um pouco sobre a pessoa.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#e6f6dc'], [1, '#bfe3b4']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    const cores = [['#ff8fb1', '#ffd166'], ['#ffd166', '#f78c6b'], ['#ffffff', '#ffd166'], ['#c77dff', '#ffd166']];
    [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(([x, y, dx, dy], q) => {
      for (let i = 0; i < 4; i++) folha(c, x, y, 13 * u, 3 * u, Math.atan2(dy, dx) + (i - 1.5) * 0.45, '#4f9d4a', '#2e6b2c');
      [[7, 7, 3.4], [13, 4.5, 2.6], [4.5, 13, 2.6], [10.5, 11, 2.2], [3.2, 5, 1.8], [5, 3, 1.8]].forEach(([a, b, t], k) => flor(c, x + dx * a * u, y + dy * b * u, t * u, cores[(q + k) % 4][0], cores[(q + k) % 4][1]));
    });
  } });
moldura({ valor: 'tropical', nome: 'Folhas tropicais', indicacao: 'Verão, viagem, bem-estar e vídeos leves e alegres.', contra: 'Assuntos sérios ou formais.',
  descricao: 'Fundo amarelo claro, com folhas grandes de um verde forte saindo dos cantos.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#fff6bf'], [1, '#ffe38a']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    [[0, H, -0.9], [W, H, -2.2], [0, 0, 0.9], [W, 0, 2.2]].forEach(([x, y, g], q) => {
      for (let i = 0; i < 4; i++) folha(c, x, y, (20 - i * 2) * u, (5.5 - i * 0.5) * u, g + (i - 1.5) * 0.4, i % 2 ? '#2d8a4b' : '#1a6b38', '#0f4d28');
    });
  } });
moldura({ valor: 'serpentinas', nome: 'Serpentinas', indicacao: 'Festa, carnaval, aniversário e comemorações animadas.', contra: 'Assuntos sérios ou de luto.',
  descricao: 'Fundo claro com fitas coloridas e onduladas caindo de cima, deixando o meio livre.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#fff9f2'], [1, '#ffeedd']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    const cores = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'];
    c.lineWidth = 1.3 * u; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const lado = i % 2 ? 1 : 0, x0 = lado ? W - (3 + (i >> 1) * 4.2) * u : (3 + (i >> 1) * 4.2) * u, comp = (14 + ((i * 7) % 18)) * u;
      c.strokeStyle = cores[i % cores.length]; c.beginPath();
      for (let t = 0; t <= comp; t += u * 0.6) { const x = x0 + Math.sin(t / (2.2 * u) + i) * 1.8 * u, y = t; c[t ? 'lineTo' : 'moveTo'](x, y); }
      c.stroke();
    }
  } });
moldura({ valor: 'medalha', nome: 'Medalha', indicacao: 'Foto de perfil redonda, avatar e crachá digital.', contra: 'Fotos em que o corpo aparece inteiro.',
  descricao: 'A pessoa dentro de um círculo com borda dourada grossa, sobre um fundo azul liso.',
  janela: (W, H, u) => { const d = Math.min(W, H) - 14 * u; return { x: (W - d) / 2, y: (H - d) / 2, w: d, h: d, forma: 'circulo' }; },
  fundo: (c, W, H) => { const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, '#2f4d8a'); g.addColorStop(1, '#14264d'); c.fillStyle = g; c.fillRect(0, 0, W, H); },
  janelaFundo: (c, j) => { const g = c.createRadialGradient(j.x + j.w / 2, j.y + j.h * 0.4, 0, j.x + j.w / 2, j.y + j.h / 2, j.w * 0.7); g.addColorStop(0, '#eaf0fb'); g.addColorStop(1, '#a9bbdd'); c.fillStyle = g; c.fillRect(j.x, j.y, j.w, j.h); },
  moldura: (c, W, H, j, u) => {
    const cx = j.x + j.w / 2, cy = j.y + j.h / 2;
    c.strokeStyle = gradiente(c, j.x, j.y, j.x + j.w, j.y + j.h, [[0, '#fff1a8'], [0.5, '#d4a72c'], [1, '#8a6a12']]); c.lineWidth = 2.6 * u;
    c.beginPath(); c.arc(cx, cy, j.w / 2 + 1.3 * u, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.3 * u; c.beginPath(); c.arc(cx, cy, j.w / 2 + 2.4 * u, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffd166'; for (let i = 0; i < 24; i++) { const a = (i * Math.PI * 2) / 24; c.beginPath(); c.arc(cx + Math.cos(a) * (j.w / 2 + 4.6 * u), cy + Math.sin(a) * (j.w / 2 + 4.6 * u), 0.5 * u, 0, Math.PI * 2); c.fill(); }
  } });
moldura({ valor: 'natal', nome: 'Natal', indicacao: 'Mensagens de Natal, fim de ano e cartões de boas festas.', contra: 'Qualquer outra época do ano.',
  descricao: 'Fundo verde escuro com flocos de neve, uma borda de bengala doce vermelha e branca, e azevinho com frutinhas vermelhas nos cantos de cima.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#0d4a2e'], [1, '#1f7a46']]); c.fillRect(0, 0, W, H);
    const r = sorteio(9); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 38; i++) { const x = r() * W, y = r() * H, t = (0.6 + r() * 1.3) * u; if (i % 3) { c.beginPath(); c.arc(x, y, t * 0.5, 0, Math.PI * 2); c.fill(); } else floco(c, x, y, t); }
  },
  moldura: (c, W, H, j, u) => {
    const b = 3.4 * u;
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(b, b, W - 2 * b, H - 2 * b); c.clip('evenodd');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d62839'; c.lineWidth = 1.7 * u;
    for (let k = -H; k < W + H; k += 4.2 * u) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + H, H); c.stroke(); }
    c.restore();
    [[7.5 * u, b + 4 * u, 1], [W - 7.5 * u, b + 4 * u, -1]].forEach(([x, y, d]) => {
      for (let i = 0; i < 3; i++) folha(c, x, y, 9 * u, 2.6 * u, d > 0 ? 0.3 + i * 0.6 : Math.PI - 0.3 - i * 0.6, '#1b7f3c', '#0c4f22');
      c.fillStyle = '#e63946'; [[0, 0], [1.9 * u, 1.2 * u], [-1.6 * u, 1.6 * u]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx, y + dy, 1.5 * u, 0, Math.PI * 2); c.fill(); });
    });
  } });
moldura({ valor: 'pascoa', nome: 'Páscoa', indicacao: 'Mensagens de Páscoa, família, crianças e primavera.', contra: 'Qualquer outra época do ano.',
  descricao: 'Fundo em tons pastel de rosa e verde claro, uma faixa de grama embaixo, um coelhinho branco num canto e ovos de Páscoa enfeitados no outro.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#fff0f6'], [0.7, '#e3f6e8'], [1, '#cdeed2']]); c.fillRect(0, 0, W, H);
    c.fillStyle = '#7bc47f'; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 2 * u) c.lineTo(x, H - (6 + Math.sin(x / (3 * u)) * 1.4 + ((x / u) % 4 === 0 ? 1.5 : 0)) * u);
    c.lineTo(W, H); c.closePath(); c.fill();
  },
  moldura: (c, W, H, j, u) => {
    coelho(c, W - 14 * u, H - 16 * u, 8.5 * u);
    const par = [['#ffd6e0', '#ff8fab'], ['#d0f0c0', '#5fb760'], ['#fff3b0', '#f2b134']];
    [[8, 9.5, 5.5], [17, 7.5, 4.5], [25, 8.2, 3.8]].forEach(([x, y, t], k) => ovo(c, x * u, H - y * u, t * u, par[k][0], par[k][1]));
    [[4, 18], [30, 14]].forEach(([x, y]) => flor(c, x * u, H - y * u, 2.2 * u, '#ffffff', '#ffd166', 5));
  } });

// São João, casamento e ano novo: datas e comemorações que a Joy pediu.
function bandeirinhas(c, W, y0, folga, u, cores, deslocamento = 0) {
  const fio = (x) => y0 + folga * 4 * (x / W) * (1 - x / W);
  c.strokeStyle = '#6b4a2f'; c.lineWidth = 0.35 * u; c.beginPath();
  for (let x = 0; x <= W; x += u) c[x ? 'lineTo' : 'moveTo'](x, fio(x));
  c.stroke();
  let k = deslocamento;
  for (let x = 3 * u; x < W - 2 * u; x += 6 * u, k++) {
    const y = fio(x), l = 2.7 * u;
    c.fillStyle = cores[k % cores.length]; c.strokeStyle = 'rgba(60,35,20,0.55)'; c.lineWidth = 0.2 * u;
    c.beginPath(); c.moveTo(x - l, y); c.lineTo(x + l, y); c.lineTo(x, y + 5.6 * u); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.28 * u; c.beginPath(); c.moveTo(x - l * 0.55, y + 1.4 * u); c.lineTo(x, y + 3.4 * u); c.lineTo(x + l * 0.55, y + 1.4 * u); c.stroke();
  }
}
function fogueira(c, cx, base, t) {
  c.strokeStyle = '#3b2415'; c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = t * 0.22; c.fillStyle = '#7a4a2b';
  [[-0.9, 1], [0.9, -1]].forEach(([d, s]) => { c.save(); c.translate(cx + d * t * 0.12, base - t * 0.12); c.rotate(s * 0.22); retArredondado(c, -t * 0.95, -t * 0.11, t * 1.9, t * 0.22, t * 0.1); c.fill(); c.lineWidth = t * 0.05; c.stroke(); c.restore(); });
  const chama = (h, larg, cor, dx = 0) => { c.fillStyle = cor; c.beginPath(); c.moveTo(cx + dx - larg, base - t * 0.14); c.bezierCurveTo(cx + dx - larg * 1.1, base - h * 0.5, cx + dx - larg * 0.2, base - h * 0.55, cx + dx, base - h); c.bezierCurveTo(cx + dx + larg * 0.3, base - h * 0.55, cx + dx + larg * 1.1, base - h * 0.5, cx + dx + larg, base - t * 0.14); c.closePath(); c.fill(); };
  chama(t * 1.7, t * 0.62, '#e8472b'); chama(t * 1.4, t * 0.42, '#ff9a1f', -t * 0.12); chama(t * 0.95, t * 0.26, '#ffd23f', t * 0.06);
  c.fillStyle = '#ffb703'; [[0.7, 1.5], [-0.8, 1.3], [0.2, 2.0]].forEach(([a, b]) => { c.beginPath(); c.arc(cx + a * t, base - b * t, t * 0.05, 0, Math.PI * 2); c.fill(); });
}
function milho(c, cx, cy, t, giro) {
  c.save(); c.translate(cx, cy); c.rotate(giro);
  c.fillStyle = '#5fae4f'; c.strokeStyle = '#2f6f2b'; c.lineWidth = t * 0.05;
  [[-1, 0], [1, 0]].forEach(([s]) => { c.beginPath(); c.moveTo(0, t * 0.9); c.quadraticCurveTo(s * t * 0.95, t * 0.35, s * t * 0.45, -t * 0.55); c.quadraticCurveTo(s * t * 0.2, t * 0.2, 0, t * 0.9); c.fill(); c.stroke(); });
  c.fillStyle = '#ffd23f'; c.strokeStyle = '#c78e0e'; c.beginPath(); c.ellipse(0, -t * 0.2, t * 0.38, t * 0.82, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#f2a900'; for (let i = -3; i <= 3; i++) for (let j = -4; j <= 3; j++) { const x = i * t * 0.1, y = -t * 0.2 + j * t * 0.17; if ((x * x) / (t * 0.32) ** 2 + ((y + t * 0.2) ** 2) / (t * 0.74) ** 2 < 1) { c.beginPath(); c.ellipse(x, y, t * 0.045, t * 0.06, 0, 0, Math.PI * 2); c.fill(); } }
  c.restore();
}
moldura({ valor: 'sao-joao', nome: 'São João', indicacao: 'Festa junina, São João, arraial e mensagens de quermesse e de comida de festa.', contra: 'Qualquer outra época do ano.',
  descricao: 'Fundo amarelo quente, como papel de festa, com duas fileiras de bandeirinhas coloridas em cima, uma fogueira de lenha com chamas num canto de baixo e uma espiga de milho no outro.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#fff0c2'], [1, '#ffd08a']]); c.fillRect(0, 0, W, H);
    const r = sorteio(24); c.fillStyle = 'rgba(214,120,40,0.18)';
    for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(r() * W, r() * H, (0.4 + r() * 0.7) * u, 0, Math.PI * 2); c.fill(); }
  },
  moldura: (c, W, H, j, u) => {
    const cores = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#8338ec', '#ffbe0b'];
    bandeirinhas(c, W, 1.4 * u, 2.6 * u, u, cores, 0); bandeirinhas(c, W, 9 * u, 2.2 * u, u, cores, 3);
    fogueira(c, 14 * u, H - 3 * u, 8 * u);
    milho(c, W - 13 * u, H - 12 * u, 8.5 * u, 0.5);
  } });
function igreja(c, cx, base, u) {
  c.lineJoin = 'round'; c.strokeStyle = '#7d5f45'; c.lineWidth = 0.3 * u;
  c.fillStyle = '#f4e8d6'; c.beginPath(); c.rect(cx - 15 * u, base - 13 * u, 30 * u, 13 * u); c.fill(); c.stroke();
  c.fillStyle = '#a65d4a'; c.beginPath(); c.moveTo(cx - 16.5 * u, base - 13 * u); c.lineTo(cx, base - 19 * u); c.lineTo(cx + 16.5 * u, base - 13 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#f4e8d6'; c.beginPath(); c.rect(cx - 6.5 * u, base - 23 * u, 13 * u, 23 * u); c.fill(); c.stroke();
  c.fillStyle = '#a65d4a'; c.beginPath(); c.moveTo(cx - 8 * u, base - 23 * u); c.lineTo(cx, base - 31 * u); c.lineTo(cx + 8 * u, base - 23 * u); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#d4af37'; c.lineWidth = 0.55 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx, base - 31 * u); c.lineTo(cx, base - 35 * u); c.moveTo(cx - 1.4 * u, base - 33.4 * u); c.lineTo(cx + 1.4 * u, base - 33.4 * u); c.stroke();
  c.strokeStyle = '#7d5f45'; c.lineWidth = 0.3 * u;
  c.fillStyle = '#9ad0f5'; [-10.5, 10.5].forEach((dx) => { c.beginPath(); c.moveTo(cx + (dx - 1.5) * u, base - 4 * u); c.lineTo(cx + (dx - 1.5) * u, base - 8 * u); c.arc(cx + dx * u, base - 8 * u, 1.5 * u, Math.PI, 0); c.lineTo(cx + (dx + 1.5) * u, base - 4 * u); c.closePath(); c.fill(); c.stroke(); });
  c.fillStyle = '#9ad0f5'; c.beginPath(); c.arc(cx, base - 17.5 * u, 1.9 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(cx - 1.9 * u, base - 17.5 * u); c.lineTo(cx + 1.9 * u, base - 17.5 * u); c.moveTo(cx, base - 19.4 * u); c.lineTo(cx, base - 15.6 * u); c.stroke();
  c.fillStyle = '#7a4a2e'; c.beginPath(); c.moveTo(cx - 3.8 * u, base); c.lineTo(cx - 3.8 * u, base - 8.4 * u); c.arc(cx, base - 8.4 * u, 3.8 * u, Math.PI, 0); c.lineTo(cx + 3.8 * u, base); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#d8cbb8'; c.beginPath(); c.rect(cx - 5.5 * u, base - 0.9 * u, 11 * u, 0.9 * u); c.fill(); c.stroke();
}
function noivos(c, cx, base, u) {
  const rosto = (x, y, r) => { c.fillStyle = '#ffd9c0'; c.strokeStyle = '#8c6a55'; c.lineWidth = 0.2 * u; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#3a2a22'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + s * r * 0.38, y - r * 0.05, r * 0.11, 0, Math.PI * 2); c.fill(); }); c.strokeStyle = '#8a4a4a'; c.lineWidth = 0.18 * u; c.beginPath(); c.arc(x, y + r * 0.2, r * 0.32, 0.2, Math.PI - 0.2); c.stroke(); };
  const xn = cx - 2.9 * u, xg = cx + 2.9 * u;
  // noiva: véu, vestido e cabelo
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.strokeStyle = '#a89a8a'; c.lineWidth = 0.2 * u;
  c.beginPath(); c.moveTo(xn - 1.5 * u, base - 8.2 * u); c.quadraticCurveTo(xn - 4.2 * u, base - 4 * u, xn - 3.2 * u, base - 0.4 * u); c.lineTo(xn + 0.4 * u, base - 0.4 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(xn - 1 * u, base - 6.1 * u); c.lineTo(xn + 1 * u, base - 6.1 * u); c.lineTo(xn + 3 * u, base - 0.3 * u); c.lineTo(xn - 3 * u, base - 0.3 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#6b4226'; c.beginPath(); c.arc(xn, base - 8.3 * u, 1.75 * u, Math.PI, 0); c.fill();
  rosto(xn, base - 7.9 * u, 1.5 * u);
  // noivo: terno escuro, camisa e gravata
  c.fillStyle = '#2b2d42'; c.strokeStyle = '#14151f'; c.beginPath(); c.moveTo(xg - 1.3 * u, base - 6.1 * u); c.lineTo(xg + 1.3 * u, base - 6.1 * u); c.lineTo(xg + 1.9 * u, base - 0.3 * u); c.lineTo(xg - 1.9 * u, base - 0.3 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(xg - 0.55 * u, base - 6.1 * u); c.lineTo(xg + 0.55 * u, base - 6.1 * u); c.lineTo(xg, base - 3.8 * u); c.closePath(); c.fill();
  c.fillStyle = '#d62839'; c.beginPath(); c.moveTo(xg, base - 5.9 * u); c.lineTo(xg + 0.45 * u, base - 5.5 * u); c.lineTo(xg, base - 5.1 * u); c.lineTo(xg - 0.45 * u, base - 5.5 * u); c.closePath(); c.fill();
  c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(xg, base - 8.3 * u, 1.6 * u, Math.PI, 0); c.fill();
  rosto(xg, base - 7.9 * u, 1.5 * u);
  // mãos dadas e buquê
  c.fillStyle = '#ffd9c0'; c.strokeStyle = '#8c6a55'; c.beginPath(); c.arc(cx, base - 3.4 * u, 0.7 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  flor(c, xn + 1.6 * u, base - 3.7 * u, 1.1 * u, '#ff8fb1', '#fff3b0', 5);
}
moldura({ valor: 'casamento', nome: 'Casamento', indicacao: 'Convite, lembrança e mensagem de casamento, bodas e renovação de votos.', contra: 'Assuntos sérios, de luto ou que nada têm a ver com festa de casamento.',
  descricao: 'Fundo marfim com um toque de rosa, uma fina borda dourada, uma igrejinha no canto de baixo, à direita, com os noivos de mãos dadas na porta, ela de vestido e véu brancos e ele de terno escuro, e uma fileira de flores brancas e rosadas no canto de baixo, à esquerda.',
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#fffaf4'], [1, '#f8e1e4']]); c.fillRect(0, 0, W, H); },
  moldura: (c, W, H, j, u) => {
    bordaFina('#d4af37', 3, 0.7)(c, W, H, j, u);
    const base = H - 4 * u;
    const cx = W - 21 * u;
    c.save(); c.translate(cx, base); c.scale(1.12, 1.12); c.translate(-cx, -base);
    igreja(c, cx, base, u);
    noivos(c, cx, base, u);
    c.restore();
    [[8, 7], [15, 4.6], [22, 6.4], [29, 4.2], [W / u - 45, 4.4]].forEach(([x, y], k) => { folha(c, x * u - 2 * u, H - (y + 1) * u, 5 * u, 1.6 * u, 3.6, '#7fb77e', '#4e8a4d'); folha(c, x * u + 2 * u, H - (y + 1) * u, 5 * u, 1.6 * u, -0.5, '#7fb77e', '#4e8a4d'); flor(c, x * u, H - y * u, 2.6 * u, k % 2 ? '#ffd6e0' : '#ffffff', '#ffd166', 6); });
  } });
function fogos(c, cx, cy, R, cor, u) {
  c.strokeStyle = cor; c.fillStyle = cor; c.lineCap = 'round'; c.lineWidth = 0.55 * u;
  for (let i = 0; i < 16; i++) { const a = (i * Math.PI * 2) / 16, r0 = R * (i % 2 ? 0.42 : 0.3), r1 = R * (i % 2 ? 0.8 : 1);
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    c.beginPath(); c.arc(cx + Math.cos(a) * (r1 + 1.2 * u), cy + Math.sin(a) * (r1 + 1.2 * u), 0.5 * u, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.arc(cx, cy, 0.9 * u, 0, Math.PI * 2); c.fill();
}
moldura({ valor: 'ano-novo', nome: 'Ano Novo', indicacao: 'Mensagens de Ano Novo, virada, recomeço, gratidão e metas para o ano que começa.', contra: 'Qualquer outra época do ano, e assuntos de luto.',
  descricao: 'Fundo azul noite que vai para o roxo, com estrelinhas, fogos de artifício dourados, rosa e azul claro nos cantos, estrelas douradas e confete brilhante, e uma fina borda dourada.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#0b1235'], [0.6, '#1d1a52'], [1, '#34205f']]); c.fillRect(0, 0, W, H);
    const r = sorteio(2026); c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 70; i++) { c.beginPath(); c.arc(r() * W, r() * H, (0.15 + r() * 0.35) * u, 0, Math.PI * 2); c.fill(); }
  },
  moldura: (c, W, H, j, u) => {
    bordaFina('#d4af37', 3, 0.6)(c, W, H, j, u);
    fogos(c, 12 * u, 12 * u, 7.5 * u, '#ffd166', u); fogos(c, W - 12 * u, 11 * u, 6.5 * u, '#ff7ab6', u); fogos(c, W - 6 * u, 25 * u, 3.5 * u, '#7fe0ff', u);
    fogos(c, 10 * u, H - 12 * u, 6.5 * u, '#7fe0ff', u); fogos(c, W - 12 * u, H - 13 * u, 7.5 * u, '#ffd166', u);
    const r = sorteio(77), cores = ['#ffd166', '#ff7ab6', '#7fe0ff', '#ffffff'];
    for (let i = 0; i < 26; i++) { c.fillStyle = cores[i % 4]; c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 6); c.fillRect(-0.7 * u, -0.25 * u, 1.4 * u, 0.5 * u); c.restore(); }
    c.fillStyle = '#ffd166'; [[28, 6, 1.6], [W / u - 30, 5, 1.2], [6, 48, 1.3], [W / u - 6, 56, 1.5], [24, H / u - 6, 1.4], [W / u - 26, H / u - 5, 1.2]].forEach(([x, y, t]) => { estrela(c, x * u, y * u, t * u, t * 0.42 * u); c.fill(); });
  } });

// Lugares
function nuvem(ctx, cx, cy, t, cor = '#ffffff', sombra = 'rgba(120,150,190,0.35)') {
  const bolas = [[-1.1, 0.25, 0.65], [-0.45, -0.1, 0.85], [0.35, -0.2, 0.95], [1.05, 0.12, 0.7], [0.1, 0.3, 0.8]];
  ctx.fillStyle = sombra;
  bolas.forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(cx + a * t, cy + b * t + t * 0.12, r * t, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = cor;
  bolas.forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(cx + a * t, cy + b * t, r * t, 0, Math.PI * 2); ctx.fill(); });
}
function brilhinho(ctx, x, y, r, cor) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, cor + '1)'); g.addColorStop(0.35, cor + '0.55)'); g.addColorStop(1, cor + '0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
moldura({ valor: 'lua', nome: 'Na Lua', indicacao: 'Foto divertida e simbólica, de quem está nas nuvens, sonhando alto ou falando de espaço.', contra: 'Assuntos formais ou de luto.',
  descricao: 'Céu preto cheio de estrelas, a Terra pequena e azul lá no alto e o chão cinza da Lua com crateras, com a pessoa no meio.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#02030a'], [1, '#101a3d']]); c.fillRect(0, 0, W, H);
    const r = sorteio(31); c.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) { c.globalAlpha = 0.4 + r() * 0.6; c.beginPath(); c.arc(r() * W, r() * H * 0.85, (0.15 + r() * 0.45) * u, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    brilhinho(c, W * 0.8, H * 0.14, 14 * u, 'rgba(120,180,255,');
    c.fillStyle = gradiente(c, W * 0.7, H * 0.08, W * 0.9, H * 0.2, [[0, '#4aa3ff'], [1, '#1b4f9c']]); c.beginPath(); c.arc(W * 0.8, H * 0.14, 7 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(80,190,110,0.85)'; c.beginPath(); c.ellipse(W * 0.8 - 2 * u, H * 0.14 - u, 3 * u, 2 * u, 0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(W * 0.8 + 2 * u, H * 0.14 + 2 * u, 3 * u, 0.8 * u, -0.3, 0, Math.PI * 2); c.fill();
    const topo = H * 0.78;
    c.fillStyle = gradiente(c, 0, topo, 0, H, [[0, '#c9ccd3'], [1, '#6f7380']]);
    c.beginPath(); c.moveTo(0, H); c.lineTo(0, topo + 2 * u); c.quadraticCurveTo(W * 0.25, topo - 3 * u, W * 0.5, topo + u); c.quadraticCurveTo(W * 0.78, topo + 5 * u, W, topo - u); c.lineTo(W, H); c.closePath(); c.fill();
    c.fillStyle = 'rgba(60,64,75,0.35)';
    [[0.12, 0.88, 5, 1.6], [0.4, 0.93, 7, 2], [0.7, 0.86, 4.5, 1.4], [0.88, 0.94, 6, 1.8], [0.25, 0.8, 3, 1]].forEach(([a, b, rx, ry]) => { c.beginPath(); c.ellipse(W * a, H * b, rx * u, ry * u, 0, 0, Math.PI * 2); c.fill(); });
  },
  moldura: (c, W, H, j, u) => { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.4 * u; c.strokeRect(3 * u, 3 * u, W - 6 * u, H - 6 * u); } });
moldura({ valor: 'nuvens', nome: 'Nas nuvens', indicacao: 'Foto leve, de sonho, esperança, espiritualidade e bem-estar.', contra: 'Assuntos técnicos ou formais.',
  descricao: 'Céu azul claro com raios de sol saindo de trás, nuvens macias no meio do céu e uma faixa de nuvens grandes embaixo.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#5fb4ff'], [1, '#dff3ff']]); c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H * 0.1);
    for (let i = 0; i < 9; i++) { c.rotate((Math.PI * 2) / 18); c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-6 * u, H * 1.4); c.lineTo(6 * u, H * 1.4); c.closePath(); c.fill(); }
    c.restore();
    brilhinho(c, W / 2, H * 0.1, 20 * u, 'rgba(255,250,210,');
    nuvem(c, W * 0.2, H * 0.3, 6 * u); nuvem(c, W * 0.82, H * 0.22, 5 * u); nuvem(c, W * 0.75, H * 0.52, 4.5 * u);
  },
  moldura: (c, W, H, j, u) => { [[0.08, 0.97, 9], [0.3, 1.0, 10], [0.55, 0.98, 9], [0.8, 1.0, 10], [1.0, 0.96, 9]].forEach(([a, b, t]) => nuvem(c, W * a, H * b, t * u)); } });
moldura({ valor: 'futurista', nome: 'Futurista', indicacao: 'Tecnologia, ficção científica, jogos e apresentações modernas.', contra: 'Assuntos tradicionais, de luto ou formais.',
  descricao: 'Noite roxa com um sol de neon no horizonte, chão de grade luminosa que foge para o fundo e duas colunas de luz azul e rosa nas laterais.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#07031a'], [0.6, '#2a0f55'], [1, '#12062e']]); c.fillRect(0, 0, W, H);
    const hz = H * 0.58;
    c.fillStyle = gradiente(c, 0, hz - 14 * u, 0, hz, [[0, '#ff4fa3'], [1, '#ffb347']]);
    c.beginPath(); c.arc(W / 2, hz, 14 * u, Math.PI, 0); c.fill();
    c.fillStyle = '#12062e'; c.fillRect(0, hz, W, H - hz);
    c.strokeStyle = 'rgba(0,229,255,0.85)'; c.lineWidth = 0.28 * u;
    for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(W / 2 + i * 1.5 * u, hz); c.lineTo(W / 2 + i * 14 * u, H); c.stroke(); }
    for (let k = 1; k <= 9; k++) { const y = hz + (H - hz) * Math.pow(k / 9, 2); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(255,79,163,0.9)'; c.lineWidth = 0.35 * u; c.beginPath(); c.moveTo(0, hz); c.lineTo(W, hz); c.stroke();
  },
  moldura: (c, W, H, j, u) => {
    [[3 * u, '#00e5ff'], [W - 3 * u, '#ff4fa3']].forEach(([x, cor]) => { const g = c.createLinearGradient(x - 3 * u, 0, x + 3 * u, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, cor); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 3 * u, 0, 6 * u, H); });
  } });
moldura({ valor: 'parque', nome: 'Parque de diversões', indicacao: 'Foto alegre, de diversão, infância, festa e vídeos leves.', contra: 'Assuntos sérios, de luto ou formais.',
  descricao: 'Céu de fim de tarde em laranja e roxo, uma roda-gigante com cabines coloridas, trilho de montanha-russa, fio de lâmpadas acesas no alto e balões no canto.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#5d3a8e'], [0.5, '#ff7e8a'], [1, '#ffd29a']]); c.fillRect(0, 0, W, H);
    c.strokeStyle = '#3b2564'; c.lineWidth = 0.8 * u; c.beginPath();
    for (let x = 0; x <= W; x += u) { const y = H * 0.62 + Math.sin(x / (6 * u)) * 7 * u - Math.sin(x / (15 * u)) * 5 * u; c[x ? 'lineTo' : 'moveTo'](x, y); }
    c.stroke();
    const cx = W * 0.76, cy = H * 0.55, r = Math.min(W, H) * 0.24;
    c.strokeStyle = '#f4f1ff'; c.lineWidth = 0.7 * u;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
      c.fillStyle = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'][i % 4]; c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r + 1.6 * u, 1.8 * u, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - r * 0.5, H); c.moveTo(cx, cy); c.lineTo(cx + r * 0.5, H); c.stroke();
    c.fillStyle = '#2b1a4a'; c.fillRect(0, H * 0.9, W, H * 0.1);
  },
  moldura: (c, W, H, j, u) => {
    c.strokeStyle = '#2b1a4a'; c.lineWidth = 0.35 * u; c.beginPath();
    for (let x = 0; x <= W; x += u) { const y = 2 * u + Math.sin((x / W) * Math.PI) * 6 * u; c[x ? 'lineTo' : 'moveTo'](x, y); }
    c.stroke();
    for (let i = 0; i < 14; i++) { const x = ((i + 0.5) / 14) * W, y = 2 * u + Math.sin((x / W) * Math.PI) * 6 * u + 1.2 * u; brilhinho(c, x, y, 3 * u, ['rgba(255,220,100,', 'rgba(255,120,160,', 'rgba(120,230,255,'][i % 3]); }
    [['#ef476f', 7, 8], ['#ffd166', 12, 5], ['#06d6a0', 4, 4], ['#118ab2', 9.5, 2]].forEach(([cor, x, y]) => {
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.18 * u; c.beginPath(); c.moveTo(x * u, H - (y - 0) * u * 0 - 1 * u); c.lineTo(x * u, H - (y + 9) * u + 6 * u); c.stroke();
      c.fillStyle = cor; c.beginPath(); c.ellipse(x * u, H - (y + 14) * u, 3.4 * u, 4.2 * u, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(x * u - 1 * u, H - (y + 15.5) * u, 0.8 * u, 1.3 * u, 0.4, 0, Math.PI * 2); c.fill();
    });
  } });
moldura({ valor: 'toalete', nome: 'Toalete bem-humorado', indicacao: 'Foto engraçada, meme e vídeos de humor. A pessoa parece estar no banheiro ou em vias de usá-lo.', contra: 'Qualquer assunto sério, profissional ou de luto.',
  descricao: 'Parede de azulejo branco e azul claro, rolo de papel higiênico na parede, escovinha ao lado e, no cantinho de baixo, uma curva branca de vaso de louça.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = '#eaf6fa'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#b4d6e2'; c.lineWidth = 0.35 * u;
    const t = 9 * u;
    for (let x = 0; x <= W; x += t) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H * 0.82); c.stroke(); }
    for (let y = 0; y <= H * 0.82; y += t) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = '#9fb2bd'; c.fillRect(0, H * 0.82, W, H * 0.18);
    c.strokeStyle = '#8da2ae'; for (let x = 0; x <= W; x += 12 * u) { c.beginPath(); c.moveTo(x, H * 0.82); c.lineTo(x, H); c.stroke(); }
    c.fillStyle = '#d6e4ea'; c.fillRect(0, H * 0.815, W, 0.8 * u);
  },
  moldura: (c, W, H, j, u) => {
    const rx = W - 9 * u, ry = H * 0.4;
    c.fillStyle = '#b8b8b8'; c.fillRect(rx - 4.5 * u, ry - 1 * u, 9 * u, 1.4 * u);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#c9ced4'; c.lineWidth = 0.25 * u; c.beginPath(); c.arc(rx, ry + 5 * u, 5 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#e5e8ec'; c.beginPath(); c.arc(rx, ry + 5 * u, 1.8 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(rx - 5 * u, ry + 5 * u); c.lineTo(rx - 5 * u, ry + 12 * u); c.lineTo(rx - 3.4 * u, ry + 12 * u); c.lineTo(rx - 3.4 * u, ry + 5 * u); c.fill(); c.stroke();
    const bx = 7 * u, by = H * 0.82;
    c.fillStyle = '#3d5a80'; retArredondado(c, bx - 2.8 * u, by - 4 * u, 5.6 * u, 6 * u, 1 * u); c.fill();
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.7 * u; c.beginPath(); c.moveTo(bx, by - 4 * u); c.lineTo(bx, by - 20 * u); c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.ellipse(bx, by - 22 * u, 2.2 * u, 3.4 * u, 0, 0, Math.PI * 2); c.fill();
    const vx = W - 8 * u, vy = H;
    c.fillStyle = '#f7fbfd'; c.strokeStyle = '#c3ccd2'; c.lineWidth = 0.35 * u;
    retArredondado(c, vx - 9 * u, vy - 24 * u, 15 * u, 14 * u, 2 * u); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(vx - 17 * u, vy - 10 * u); c.quadraticCurveTo(vx - 19 * u, vy - 3 * u, vx - 10 * u, vy + 1 * u); c.lineTo(vx + 8 * u, vy + 1 * u); c.lineTo(vx + 8 * u, vy - 10 * u); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(vx - 5.5 * u, vy - 10.5 * u, 11.5 * u, 2.4 * u, 0, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill(); c.stroke();
    c.fillStyle = '#c8d3da'; c.beginPath(); c.ellipse(vx - 5.5 * u, vy - 10.5 * u, 8 * u, 1.3 * u, 0, 0, Math.PI * 2); c.fill();
  } });
moldura({ valor: 'praia-lua-cheia', nome: 'Praia na lua cheia', indicacao: 'Foto calma, romântica, de reflexão, poesia, viagem e vídeos de noite tranquila.', contra: 'Assuntos técnicos, de negócios ou muito alegres.',
  descricao: 'Praia à noite, com uma lua cheia grande e clara no céu, o caminho de luz dela brilhando no mar escuro, areia clara embaixo e a silhueta de um coqueiro no canto.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H * 0.62, [[0, '#050a24'], [1, '#26397a']]); c.fillRect(0, 0, W, H);
    const r = sorteio(61); c.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) { c.globalAlpha = 0.35 + r() * 0.6; c.beginPath(); c.arc(r() * W, r() * H * 0.5, (0.15 + r() * 0.4) * u, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    const mx = W * 0.3, my = H * 0.2, mr = 11 * u, mar = H * 0.6;
    brilhinho(c, mx, my, 34 * u, 'rgba(235,240,255,');
    c.fillStyle = '#fbf6df'; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(190,180,150,0.45)'; [[-0.35, -0.2, 0.22], [0.25, 0.1, 0.3], [-0.1, 0.45, 0.18], [0.4, -0.4, 0.14]].forEach(([a, b, k]) => { c.beginPath(); c.arc(mx + a * mr, my + b * mr, k * mr, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = gradiente(c, 0, mar, 0, H * 0.84, [[0, '#14295c'], [1, '#07122e']]); c.fillRect(0, mar, W, H * 0.24);
    for (let i = 0; i < 22; i++) { const y = mar + 1.2 * u + i * (H * 0.22 / 22), larg = (14 - i * 0.45) * u * (0.6 + r() * 0.8); c.fillStyle = `rgba(250,244,205,${0.75 - i * 0.027})`; c.fillRect(mx - larg / 2 + (r() - 0.5) * 2 * u, y, Math.max(1.5 * u, larg), 0.5 * u); }
    c.fillStyle = gradiente(c, 0, H * 0.84, 0, H, [[0, '#c9bd9e'], [1, '#8f8468']]); c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.86);
    for (let x = 0; x <= W; x += 2 * u) c.lineTo(x, H * 0.85 + Math.sin(x / (7 * u)) * 1.3 * u);
    c.lineTo(W, H); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.5 * u; c.beginPath();
    for (let x = 0; x <= W; x += 2 * u) { const y = H * 0.845 + Math.sin(x / (7 * u)) * 1.3 * u; c[x ? 'lineTo' : 'moveTo'](x, y); }
    c.stroke();
  },
  moldura: (c, W, H, j, u) => {
    const bx = W - 7 * u, by = H;
    c.strokeStyle = '#05080f'; c.lineWidth = 1.7 * u; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx - 4 * u, by - 20 * u, bx - 9 * u, by - 34 * u); c.stroke();
    const tx = bx - 9 * u, ty = by - 34 * u;
    c.lineWidth = 0.9 * u;
    [-2.6, -1.9, -1.2, -0.5, 0.2].forEach((a) => { c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * 7 * u, ty + Math.sin(a) * 7 * u - 4 * u, tx + Math.cos(a) * 13 * u, ty + Math.sin(a) * 13 * u + 3 * u); c.stroke(); });
    c.fillStyle = '#05080f'; c.beginPath(); c.arc(tx, ty + 0.8 * u, 1.3 * u, 0, Math.PI * 2); c.fill();
  } });
moldura({ valor: 'outono', nome: 'Rua vazia no outono', indicacao: 'Despedida, saudade, luto e conversas sobre perdas, fins e recomeços.', contra: 'Divulgação e assuntos alegres.',
  descricao: 'Uma rua vazia e gasta num dia de outono: casas de reboco descascado e janelas fechadas dos dois lados, calçada e asfalto rachados, uma árvore sem folhas, um poste apagado e folhas amareladas pelo chão, sob um céu cinza.',
  fundo: (c, W, H, j, u) => {
    const r = sorteio(808), hz = H * 0.55, vx = W * 0.5, topoRua = hz + 6 * u;
    const mix = (a, b, f) => a + (b - a) * f;
    c.fillStyle = gradiente(c, 0, 0, 0, hz, [[0, '#a3a19a'], [1, '#dcd3b8']]); c.fillRect(0, 0, W, hz + 6 * u);
    for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * hz * 0.8, rx = (14 + r() * 22) * u; const g = c.createRadialGradient(x, y, 0, x, y, rx); const claro = i % 2; g.addColorStop(0, claro ? 'rgba(235,228,208,0.28)' : 'rgba(110,108,104,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2); c.fill(); }
    const xl = W * 0.34, alt = 20 * u;
    const lado = (esq) => {
      const sx = esq ? 1 : -1, x0 = esq ? 0 : W, x1 = esq ? xl : W - xl;
      const top = (f) => mix(-H * 0.05, vy0 - alt, f), bot = (f) => mix(H * 0.9, topoRua, f), xs = (f) => mix(x0, x1, f);
      c.beginPath(); c.moveTo(x0, top(0)); c.lineTo(x1, top(1)); c.lineTo(x1, bot(1)); c.lineTo(x0, bot(0)); c.closePath();
      c.fillStyle = gradiente(c, x0, 0, x1, 0, esq ? [[0, '#9d927f'], [1, '#bdb29b']] : [[0, '#948e80'], [1, '#b4ad9a']]); c.fill();
      for (let k = 0; k < 9; k++) { const f = 0.05 + r() * 0.85, w = 0.06 + r() * 0.1; const q = [[f, 0.1 + r() * 0.5], [f + w, 0.1 + r() * 0.5]]; c.fillStyle = 'rgba(214,206,186,0.5)'; c.beginPath(); [f, f + w].forEach((ff, i) => c[i ? 'lineTo' : 'moveTo'](xs(ff), mix(top(ff), bot(ff), 0.15 + r() * 0.2))); [f + w, f].forEach((ff) => c.lineTo(xs(ff), mix(top(ff), bot(ff), 0.4 + r() * 0.3))); c.closePath(); c.fill(); }
      [[0.2, 0.36], [0.62, 0.8]].forEach(([a, b]) => { for (let jn = 0; jn < 6; jn++) { const f0 = 0.04 + jn * 0.16, f1 = f0 + 0.09; c.fillStyle = '#4a4338'; c.beginPath(); c.moveTo(xs(f0), mix(top(f0), bot(f0), a)); c.lineTo(xs(f1), mix(top(f1), bot(f1), a)); c.lineTo(xs(f1), mix(top(f1), bot(f1), b)); c.lineTo(xs(f0), mix(top(f0), bot(f0), b)); c.closePath(); c.fill(); c.strokeStyle = 'rgba(60,52,40,0.25)'; c.lineWidth = 0.35 * u; for (let i = 1; i < 4; i++) { const ff = mix(f0, f1, i / 4); c.beginPath(); c.moveTo(xs(ff), mix(top(ff), bot(ff), a)); c.lineTo(xs(ff), mix(top(ff), bot(ff), b)); c.stroke(); } c.fillStyle = 'rgba(70,58,44,0.2)'; c.beginPath(); c.moveTo(xs(f0), mix(top(f0), bot(f0), b)); c.lineTo(xs(f1), mix(top(f1), bot(f1), b)); c.lineTo(xs(f1), mix(top(f1), bot(f1), b + 0.22)); c.lineTo(xs(f0), mix(top(f0), bot(f0), b + 0.22)); c.closePath(); c.fill(); } });
    };
    const vy0 = hz; lado(true); lado(false);
    c.fillStyle = gradiente(c, 0, topoRua, 0, H, [[0, '#9a958a'], [1, '#6f6a60']]);
    c.beginPath(); c.moveTo(0, H * 0.9); c.lineTo(xl, topoRua); c.lineTo(W - xl, topoRua); c.lineTo(W, H * 0.9); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
    c.fillStyle = gradiente(c, 0, topoRua, 0, H, [[0, '#6c6a6c'], [1, '#4a484b']]);
    c.beginPath(); c.moveTo(vx - 5 * u, topoRua); c.lineTo(vx + 5 * u, topoRua); c.lineTo(W * 0.88, H); c.lineTo(W * 0.12, H); c.closePath(); c.fill();
    for (let k = 0; k < 7; k++) { const f0 = Math.pow(k / 7, 1.6), f1 = Math.pow((k + 0.55) / 7, 1.6); const y0 = mix(topoRua, H, f0), y1 = mix(topoRua, H, f1), w0 = mix(0.4, 3.4, f0) * u, w1 = mix(0.4, 3.4, f1) * u; c.fillStyle = 'rgba(190,170,90,0.55)'; c.beginPath(); c.moveTo(vx - w0 / 2, y0); c.lineTo(vx + w0 / 2, y0); c.lineTo(vx + w1 / 2, y1); c.lineTo(vx - w1 / 2, y1); c.closePath(); c.fill(); }
    c.strokeStyle = 'rgba(30,26,24,0.6)'; c.lineCap = 'round';
    for (let k = 0; k < 9; k++) { let x = r() * W, y = mix(topoRua, H, 0.15 + r() * 0.85); c.lineWidth = (0.2 + (y - topoRua) / H * 0.5) * u; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 6 * u; y += (r() - 0.2) * 3 * u; c.lineTo(x, Math.min(H, y)); } c.stroke(); }
    const ramo = (x, y, ang, comp, prof, esp) => { const x2 = x + Math.cos(ang) * comp, y2 = y + Math.sin(ang) * comp; c.strokeStyle = '#2f261d'; c.lineWidth = esp; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); if (prof <= 0) return; ramo(x2, y2, ang - 0.5 - r() * 0.3, comp * (0.7 + r() * 0.1), prof - 1, esp * 0.66); ramo(x2, y2, ang + 0.45 + r() * 0.3, comp * (0.68 + r() * 0.1), prof - 1, esp * 0.66); };
    ramo(W * 0.16, H * 0.92, -Math.PI / 2 + 0.05, H * 0.17, 6, 2.6 * u);
    const px = W * 0.84; c.strokeStyle = '#34312e'; c.lineWidth = 1 * u; c.beginPath(); c.moveTo(px, H * 0.93); c.lineTo(px, H * 0.22); c.lineTo(px - 7 * u, H * 0.2); c.stroke();
    c.fillStyle = '#3c3a38'; c.beginPath(); c.ellipse(px - 8 * u, H * 0.205, 3.2 * u, 1.3 * u, 0.1, 0, Math.PI * 2); c.fill();
    const cores = ['#b99a3a', '#9c6b2f', '#caa94e', '#8a5a2b', '#a35b2a'];
    for (let i = 0; i < 44; i++) folha(c, r() * W, mix(topoRua, H, 0.1 + r() * 0.9), (2.2 + r() * 2.4) * u, (0.9 + r() * 0.7) * u, r() * 6.28, cores[i % cores.length], 'rgba(70,45,20,0.6)');
  },
  moldura: (c, W, H, j, u) => {
    const r = sorteio(909), cores = ['#b99a3a', '#9c6b2f', '#caa94e', '#8a5a2b', '#a35b2a'];
    for (let i = 0; i < 14; i++) folha(c, r() * W, r() * H * 0.75, (2.2 + r() * 2) * u, (0.9 + r() * 0.6) * u, r() * 6.28, cores[i % cores.length], 'rgba(70,45,20,0.6)');
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(25,20,15,0)'); g.addColorStop(1, 'rgba(25,20,15,0.5)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  } });
moldura({ valor: 'floresta-vagalumes', nome: 'Floresta com vaga-lumes', indicacao: 'Foto de conto, mistério, fantasia, noite e vídeos de tom mágico ou contemplativo.', contra: 'Assuntos técnicos, de negócios ou muito alegres.',
  descricao: 'Floresta escura azul e verde, troncos nos dois lados, neblina clara entre as árvores e pontinhos amarelos brilhando, os vaga-lumes.',
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, '#04120e'], [0.55, '#0b2b24'], [1, '#143f31']]); c.fillRect(0, 0, W, H);
    const r = sorteio(44);
    for (let i = 0; i < 9; i++) { const x = r() * W, w = (1.4 + r() * 2.2) * u; c.fillStyle = `rgba(3,14,11,${0.45 + r() * 0.4})`; c.fillRect(x, 0, w, H); }
    for (let k = 0; k < 4; k++) { const g = c.createRadialGradient(r() * W, H * (0.5 + r() * 0.4), 0, W * 0.5, H * 0.7, W * 0.7); g.addColorStop(0, 'rgba(180,220,210,0.16)'); g.addColorStop(1, 'rgba(180,220,210,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    for (let i = 0; i < 26; i++) brilhinho(c, r() * W, r() * H, (1.2 + r() * 2.4) * u, 'rgba(255,238,120,');
  },
  moldura: (c, W, H, j, u) => {
    c.fillStyle = 'rgba(2,10,8,0.92)'; c.fillRect(0, 0, 4.5 * u, H); c.fillRect(W - 3.5 * u, 0, 3.5 * u, H);
    c.strokeStyle = 'rgba(2,10,8,0.92)'; c.lineWidth = 1.2 * u;
    [[4.5, 25, 14, 22], [4.5, 55, 12, 50], [W / u - 3.5, 35, W / u - 13, 30], [W / u - 3.5, 70, W / u - 12, 64]].forEach(([x0, y0, x1, y1]) => { c.beginPath(); c.moveTo(x0 * u, y0 * u * (H / W)); c.lineTo(x1 * u, y1 * u * (H / W)); c.stroke(); });
    const r = sorteio(77); for (let i = 0; i < 10; i++) brilhinho(c, r() * W, r() * H, (1.4 + r() * 2.2) * u, 'rgba(255,238,120,');
  } });
moldura({ valor: 'escritorio', nome: 'Escritório profissional', indicacao: 'Foto de perfil de trabalho, currículo, página de empresa e apresentação profissional.', contra: 'Fotos descontraídas, festivas ou íntimas.',
  descricao: 'Parede clara com um quadro, estante com livros coloridos, planta em vaso e uma mesa de madeira, com uma faixa azul escura discreta embaixo, como um crachá.',
  janela: (W, H, u) => ({ x: 0, y: 0, w: W, h: H - 9 * u, forma: 'ret' }),
  fundo: (c, W, H, j, u) => {
    c.fillStyle = gradiente(c, 0, 0, W, H, [[0, '#ece9e2'], [1, '#d7d2c6']]); c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.strokeStyle = '#6b5a45'; c.lineWidth = 0.9 * u; c.fillRect(8 * u, 8 * u, 18 * u, 13 * u); c.strokeRect(8 * u, 8 * u, 18 * u, 13 * u);
    c.fillStyle = '#7aa5c7'; c.fillRect(10 * u, 10 * u, 14 * u, 6 * u); c.fillStyle = '#a9c47f'; c.fillRect(10 * u, 16 * u, 14 * u, 3.5 * u);
    const sx = W - 22 * u, sy = H * 0.18;
    c.fillStyle = '#8a6a45'; c.fillRect(sx, sy, 18 * u, 1.2 * u); c.fillRect(sx, sy + 12 * u, 18 * u, 1.2 * u); c.fillRect(sx, sy + 24 * u, 18 * u, 1.2 * u);
    const cores = ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
    [0, 12, 24].forEach((dy, k) => { let x = sx + 0.8 * u; for (let i = 0; i < 6; i++) { const w = (1.8 + ((i + k) % 3) * 0.5) * u, h = (7 + ((i * 3 + k) % 4)) * u; c.fillStyle = cores[(i + k) % 6]; c.fillRect(x, sy + dy - h, w, h); x += w + 0.4 * u; } });
    c.fillStyle = '#b5651d'; c.fillRect(0, H - 22 * u, W, 13 * u);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, H - 22 * u, W, 1.2 * u);
    c.fillStyle = '#a0522d'; c.fillRect(5 * u, H - 34 * u, 7 * u, 12 * u);
    for (let i = 0; i < 5; i++) folha(c, 8.5 * u, H - 34 * u, 11 * u, 2.6 * u, -Math.PI / 2 + (i - 2) * 0.5, '#3a8f4a', '#276b34');
  },
  janelaFundo: null,
  moldura: (c, W, H, j, u) => {
    c.fillStyle = '#1d3557'; c.fillRect(0, H - 9 * u, W, 9 * u);
    c.fillStyle = '#f7c548'; c.fillRect(0, H - 9 * u, W, 0.7 * u);
  } });

// Minimalistas e lisas: fundo de uma cor só e um fio fino. Cores firmes, para a roupa brigar menos com o fundo.
// soPost: só aparece no Criar post, porque o preto some com roupa e cabelo escuros numa foto.
const lisa = (valor, nome, c1, c2, fio, grossura, cor, extra = {}) => moldura({ valor, nome,
  descricao: `Fundo liso ${cor}, com uma linha fina perto da borda.`,
  fundo: (c, W, H) => { c.fillStyle = gradiente(c, 0, 0, 0, H, [[0, c1], [1, c2]]); c.fillRect(0, 0, W, H); },
  moldura: bordaFina(fio, 4, grossura), ...extra });
lisa('azul-calmo', 'Azul com fio branco', '#bcd6ee', '#9fc3e3', '#ffffff', 0.4, 'azul médio, de céu limpo');
lisa('rosa-quartzo', 'Rosa com fio rosado', '#f4bfcd', '#eaa3b8', '#c0607c', 0.3, 'rosa suave, mas com cor');
lisa('verde-sage', 'Verde sálvia com fio verde', '#bcd2b4', '#9fbd96', '#4f7a52', 0.3, 'verde sálvia, um verde acinzentado e suave');
lisa('manteiga', 'Amarelo manteiga com fio mostarda', '#f9dd82', '#f3c94f', '#a57c00', 0.3, 'amarelo manteiga, firme e quente');
lisa('preto-vermelho', 'Preto com fio vermelho', '#17171c', '#0f0f13', '#e63946', 0.3, 'preto', { soPost: true });

// Cores vivas só para os cartões de abertura e de fecho dos posts em vídeo. Não entram nas listas de fundo nem de moldura.
lisa('cartao-coral', 'Coral vivo', '#ff7468', '#ee4a3f', '#ffffff', 0.5, 'coral vivo');
lisa('cartao-azul-royal', 'Azul royal', '#3a78ea', '#1d52bd', '#ffd166', 0.5, 'azul royal, forte');
lisa('cartao-esmeralda', 'Verde esmeralda', '#18bd8c', '#0c946b', '#ffffff', 0.5, 'verde esmeralda, vivo');
lisa('cartao-amarelo-sol', 'Amarelo sol', '#ffd84a', '#ffbd0a', '#c26a00', 0.5, 'amarelo sol, brilhante');
lisa('cartao-violeta', 'Violeta', '#9248ff', '#5f22c8', '#ffd6ff', 0.5, 'violeta, intenso');
lisa('cartao-laranja', 'Laranja', '#ff9226', '#f36d00', '#fff2d6', 0.5, 'laranja forte');
lisa('cartao-pink', 'Rosa pink', '#ff4aa1', '#d91a72', '#ffffff', 0.5, 'rosa pink, vibrante');
const MOLDURAS_CARTAO = M.splice(M.length - 7, 7);
const MOLDURAS = M;
const acharMoldura = (v) => MOLDURAS.find((m) => m.valor === v) || MOLDURAS_CARTAO.find((m) => m.valor === v) || null;

// --- Lista única: fundos completos e molduras, em seções por assunto e tom ---------------------------------
// Fundo completo: cenário detalhado que tira o fundo real da foto. Moldura: enquadramento com enfeites em volta;
// a maioria troca o fundo real por um desenhado, e Polaroide e Filme mantêm o fundo real.

const EXTRA_FUNDOS = {
  escritorio: ['sério e acessível', 'Divulgar trabalho, atender, explicar e orientar, para um público que espera um profissional.', 'Assuntos íntimos, de humor ou infantis. Roupa bege ou marrom clara se mistura com a parede.'],
  estudio: ['criativo e artístico', 'Música, canto, poesia, podcast e conteúdo de arte.', 'Assuntos formais ou de negócios. Cabelo e roupa escuros se misturam com a espuma escura da parede.'],
  biblioteca: ['sábio e calmo', 'Análises, resenhas de livros, debates e conteúdo acadêmico.', 'Assuntos leves, infantis ou de humor. Roupa marrom escura se perde nas estantes.'],
  'sala-de-aula': ['didático e simples', 'Explicações, tutoriais e conteúdo escolar.', 'Assuntos de adulto, tom pessoal ou de negócios.'],
  'quarto-feminino': ['íntimo e afetuoso', 'Desabafo, relato pessoal, carinho e conversa de confiança.', 'Assuntos formais, técnicos ou de negócios. Roupa rosa clara some no fundo rosa.'],
  'quarto-masculino': ['direto e reservado', 'Relato, opinião e conversa pessoal, sem enfeite.', 'Assuntos alegres, infantis ou de festa. Roupa cinza ou azul marinho se mistura com os tons do quarto.'],
  sala: ['acolhedor e simples', 'Conversa de coração, desabafo, conto e relato pessoal.', 'Assuntos técnicos, formais ou de negócios. Roupa cor de terracota se perde no sofá.'],
  'sala-dos-gatos': ['fofo e leve', 'Conteúdo sobre bichos, humor suave e assuntos alegres.', 'Assuntos sérios, luto ou técnicos.'],
  cafe: ['descontraído e acolhedor', 'Bate-papo, conto, conversa leve e relato pessoal.', 'Assuntos técnicos ou muito sérios. Roupa cor de tijolo se mistura com a parede.'],
  jardim: ['delicado e romântico', 'Mensagem de afeto, reflexão, conto e conversa tranquila.', 'Assuntos técnicos ou formais. Roupa verde se mistura com as folhas.'],
  praia: ['leve e inspirador', 'Bem-estar, reflexão, esperança e conto.', 'Assuntos sérios ou técnicos. Roupa laranja ou dourada se mistura com o pôr do sol.'],
  'ceu-estrelado': ['calmo e misterioso', 'Conto, história para dormir, reflexão e conversa tranquila.', 'Assuntos técnicos, formais ou de humor. Roupa e cabelo escuros somem no céu escuro.'],
  'estacao-espacial': ['divertido e imaginativo', 'Ficção científica, curiosidade sobre o espaço e conteúdo infantil.', 'Assuntos sérios. Roupa branca ou cinza clara se mistura com as paredes.'],
  indiano: ['espiritual e livre', 'Poesia, música, conversa livre e conteúdo alternativo.', 'Assuntos formais ou de negócios. Estampa forte briga com os tecidos do fundo.'],
  grafite: ['jovem e urbano', 'Arte, música, cultura de rua e tecnologia.', 'Assuntos formais ou sérios. Roupa escura some no muro escuro.'],
  capela: ['sereno e respeitoso', 'Reflexão, fé e esperança, homenagem, luto e gratidão.', 'Assuntos leves, de humor ou de negócios.'],
  carro: ['irreverente e bem-humorado', 'Conversa descontraída e humor.', 'Assuntos sérios. Estampa colorida briga com o crochê.'],
  'carro-masculino': ['informal e rápido', 'Recado rápido, desabafo e conversa informal.', 'Assuntos sérios ou que pedem calma e atenção.'],
  anime: ['jovem e imaginativo', 'Animes, mangás, jogos, música e conversas descontraídas.', 'Assuntos formais ou de negócios. Roupa roxa escura se mistura com a cidade.']
};
const FUNDOS_ESTILIZADOS = ['anime'];

const EXTRA_MOLDURAS = {
  'preto-vermelho': ['forte e dramático', 'Aviso importante, frase de impacto e assunto sério, com contraste alto. Só aparece no Criar post.', 'Assuntos leves ou infantis.'],
  'azul-calmo': ['sereno e confiável', 'Dica, aviso, bem-estar, saúde e texto explicativo.', 'Assuntos de festa. Roupa azul médio some no fundo.'],
  'rosa-quartzo': ['suave e acolhedor', 'Mensagem de carinho, autocuidado e frase delicada.', 'Assuntos técnicos ou de negócios. Roupa rosa some no fundo.'],
  'verde-sage': ['calmo e natural', 'Terapia, natureza, bem-estar e reflexão.', 'Assuntos de tecnologia ou de festa. Roupa verde acinzentada some no fundo.'],
  manteiga: ['alegre e leve', 'Boas notícias, bom dia e dicas do dia a dia.', 'Assuntos sérios ou de luto. Roupa amarela some no fundo.'],
  'grafite-fio': ['sério e elegante', 'Apresentação profissional, para quem fala de trabalho, saúde, direito, finanças ou ensino.', 'Roupa ou cabelo escuros somem no fundo escuro. Pesa para assuntos leves ou acolhedores.'],
  'marinho-dourado': ['formal e distinto', 'Palestrante, autora ou autor, evento e apresentação de negócios.', 'Assuntos descontraídos. Roupa azul marinho some no fundo.'],
  'branco-gelo': ['limpo e neutro', 'Pasta de trabalhos, retrato de estúdio e apresentação sem enfeite.', 'Quando quer cor e energia. Roupa branca perde o contorno.'],
  'madeira-quadro': ['tradicional e caloroso', 'Homenagem, lembrança e retrato de família.', 'Assuntos modernos ou divertidos. Roupa marrom se mistura com a madeira.'],
  'musgo-redondo': ['calmo e natural', 'Assuntos tranquilos, de natureza, saúde e terapias.', 'Tecnologia ou negócios. Roupa verde se mistura com o fundo.'],
  'areia-dobrada': ['caloroso e artesanal', 'Trabalho manual, cuidado e conversa acolhedora.', 'Assuntos formais. Roupa bege some no fundo.'],
  escritorio: ['profissional e próximo', 'Divulgação de trabalho, atendimento, consultoria e página de empresa.', 'Assuntos íntimos, festivos ou de humor. Estampa forte briga com a estante.'],
  polaroide: ['descontraído e nostálgico', 'Lembrança, publicação pessoal e foto de um momento.', 'Apresentação profissional.'],
  filme: ['cinematográfico e narrativo', 'Conteúdo sobre cinema, história e memória.', 'Assuntos formais. Se o fundo real é bagunçado, ele continua aparecendo.'],
  aquarela: ['delicado e sensível', 'Arte, escrita, terapia e mensagens suaves.', 'Assuntos técnicos ou de negócios. Roupa clara some no fundo branco.'],
  coracoes: ['romântico e afetuoso', 'Casal, Dia dos Namorados e mensagens de carinho.', 'Assuntos sérios, formais ou de negócios. Roupa rosa some no fundo.'],
  'por-do-sol': ['inspirador e acolhedor', 'Reflexão, viagem, esperança e mensagem de fim de dia.', 'Assuntos técnicos ou formais. Roupa laranja ou roxa se mistura com o céu.'],
  revista: ['de destaque e divulgação', 'Divulgar trabalho, entrevista ou projeto, como numa capa.', 'Foto íntima. As faixas ficam sem texto, e o seu escrito entra nelas.'],
  confete: ['festivo e alegre', 'Aniversário, boas notícias e formatura.', 'Assuntos sérios, de luto ou formais.'],
  estrelas: ['brilhante e comemorativo', 'Conquistas, prêmios e mensagens de brilho.', 'Assuntos discretos. Roupa e cabelo escuros somem no azul noite.'],
  flores: ['afetuoso e primaveril', 'Dia das Mães, aniversário e mensagens de carinho.', 'Assuntos técnicos ou formais. Roupa verde clara some no fundo.'],
  tropical: ['alegre e solar', 'Verão, viagem e conteúdo leve.', 'Assuntos sérios. Roupa amarela some no fundo.'],
  serpentinas: ['animado e festivo', 'Festa, carnaval e comemoração.', 'Assuntos sérios ou de luto.'],
  medalha: ['honroso e de identidade', 'Foto pequena e redonda que acompanha o seu nome em aplicativos.', 'Foto em que o corpo aparece inteiro.'],
  natal: ['festivo e acolhedor', 'Mensagem de Natal e de fim de ano.', 'Qualquer outra época do ano. Roupa verde escura some no fundo.'],
  'sao-joao': ['animado e caseiro', 'Festa junina, São João e arraial: mensagens de quermesse, de forró e de comida de festa.', 'Qualquer outra época do ano. Roupa amarela ou laranja some no fundo quente.'],
  casamento: ['romântico e solene', 'Convite, lembrança e mensagem de casamento e de bodas.', 'Assuntos sérios ou de luto. Roupa branca perde o contorno no fundo claro.'],
  'ano-novo': ['esperançoso e brilhante', 'Mensagem de Ano Novo, virada, recomeço, gratidão e metas.', 'Qualquer outra época do ano. Roupa e cabelo escuros somem no azul noite.'],
  pascoa: ['terno e alegre', 'Mensagem de Páscoa, família e crianças.', 'Qualquer outra época do ano. Roupa branca perde o contorno no fundo claro.'],
  lua: ['bem-humorado e distraído', 'Brincar com estar avoada ou distraída, a famosa pessoa no mundo da Lua, ou falar de espaço, astronomia, ficção científica e conteúdo para crianças e jovens.', 'Assuntos sérios, de saúde ou luto. Roupa e cabelo escuros somem no céu preto.'],
  nuvens: ['leve e esperançoso', 'Sonho, esperança, fé e bem-estar.', 'Assuntos técnicos. Roupa azul clara ou branca se perde no céu.'],
  futurista: ['moderno e ousado', 'Tecnologia, ficção científica, jogos e apresentações modernas.', 'Assuntos tradicionais ou de luto. Roupa escura some no fundo roxo escuro.'],
  parque: ['alegre e brincalhão', 'Diversão, infância e festa.', 'Assuntos sérios ou de luto.'],
  toalete: ['bem-humorado e irreverente', 'Foto engraçada e vídeos de humor. A pessoa parece estar no banheiro ou em vias de usá-lo.', 'Qualquer assunto sério ou profissional.'],
  'floresta-vagalumes': ['mágico e misterioso', 'Conto, fantasia, noite e contemplação.', 'Assuntos técnicos, de negócios ou muito alegres. Roupa e cabelo escuros somem na mata escura.'],
  outono: ['melancólico e honesto', 'Despedida, saudade, luto, fim de ciclo e conversas sobre perdas e recomeços.', 'Divulgação e assuntos alegres. Roupa cinza ou bege se mistura com as casas e a calçada.'],
  'praia-lua-cheia': ['romântico e sereno', 'Poesia, reflexão, viagem e noite tranquila.', 'Assuntos técnicos ou alegres demais. Roupa azul marinho some no mar escuro.']
};
const MOLDURAS_QUE_MANTEM_O_FUNDO = ['polaroide', 'filme'];
const COMO_FUNCIONA = {
  fundo: 'Sensação: natural, como se você estivesse mesmo no lugar.',
  fundoEstilizado: 'Sensação: de desenho, estilizada, menos natural que um cenário de foto.',
  moldura: 'Sensação: gráfica, como um cartão ilustrado, menos natural que um fundo completo.',
  molduraMantem: 'Mantém o seu fundo real. Sensação: a mais natural de todas, porque a imagem é a que a câmera viu.'
};
MOLDURAS.forEach((m) => {
  const e = EXTRA_MOLDURAS[m.valor];
  m.tom = e[0]; m.indicacao = e[1]; m.contra = e[2];
  m.fundoReal = MOLDURAS_QUE_MANTEM_O_FUNDO.includes(m.valor) ? 'mantem' : 'substitui';
  m.comoFunciona = m.fundoReal === 'mantem' ? COMO_FUNCIONA.molduraMantem : COMO_FUNCIONA.moldura;
  m.texto = `Tom: ${m.tom}. ` + descricaoPadrao({ indicacao: m.indicacao, contraindicacao: m.contra, descricao: `${m.descricao} ${m.comoFunciona}` });
});
/** Texto de um fundo completo (o cenário vem de textos.js, como em PU.FUNDOS). */
function textoDoFundo(f) {
  const e = EXTRA_FUNDOS[f.valor] || ['', f.indicacao || '', f.contraindicacao || ''];
  const como = FUNDOS_ESTILIZADOS.includes(f.valor) ? COMO_FUNCIONA.fundoEstilizado : COMO_FUNCIONA.fundo;
  return (e[0] ? `Tom: ${e[0]}. ` : '') + descricaoPadrao({ indicacao: e[1], contraindicacao: e[2], descricao: `${f.cena || ''} ${como}`.trim() });
}
const CATEGORIAS_VISUAL = [
  { valor: 'formais', nome: 'Formais e profissionais', itens: ['f:escritorio', 'f:carro-masculino', 'm:escritorio', 'm:grafite-fio', 'm:marinho-dourado', 'm:branco-gelo', 'm:madeira-quadro', 'm:revista', 'm:medalha'] },
  { valor: 'casa', nome: 'Em casa', itens: ['f:quarto-feminino', 'f:quarto-masculino', 'f:sala', 'f:sala-dos-gatos', 'm:toalete'] },
  { valor: 'externos', nome: 'Ambientes externos informais', itens: ['m:parque', 'f:grafite', 'f:carro'] },
  { valor: 'educativos', nome: 'Educativos', itens: ['f:sala-de-aula', 'f:biblioteca', 'f:estacao-espacial'] },
  { valor: 'literarios', nome: 'Literários e podcaster', itens: ['f:estudio', 'f:cafe', 'm:aquarela', 'm:areia-dobrada', 'm:musgo-redondo', 'm:filme'] },
  { valor: 'natureza', nome: 'Natureza', itens: ['f:jardim', 'f:praia', 'f:ceu-estrelado', 'm:por-do-sol', 'm:floresta-vagalumes', 'm:praia-lua-cheia', 'm:flores', 'm:tropical'] },
  { valor: 'vibes', nome: 'Minhas vibes', subs: [
    { valor: 'vibes-meu-jeito', nome: 'Do meu jeito', itens: ['f:capela', 'f:indiano', 'm:lua', 'm:nuvens', 'f:anime', 'm:futurista', 'm:polaroide', 'm:outono'] },
    // Comemorações que não têm data: servem para qualquer dia, ou para um clima.
    { valor: 'vibes-comemoracoes', nome: 'Comemorações', itens: ['m:estrelas', 'm:coracoes'] }
  ] },
  { valor: 'lisas', nome: 'Minimalistas e lisas', itens: ['m:azul-calmo', 'm:rosa-quartzo', 'm:verde-sage', 'm:manteiga', 'm:preto-vermelho'] },
  { valor: 'datas', nome: 'Datas comemorativas', itens: ['m:natal', 'm:ano-novo', 'm:pascoa', 'm:sao-joao', 'm:serpentinas'] },
  { valor: 'festas', nome: 'Festas', itens: ['m:casamento', 'm:confete'] }
];
/** Filtra as categorias visuais por um critério sobre cada item, mantendo as subcategorias e tirando as que ficaram vazias. */
function filtrarCategoriasVisual(cats, passa, mapa = (x) => x) {
  const f = (itens) => itens.filter(passa).map(mapa);
  return cats.map((c) => (c.subs ? { ...c, subs: c.subs.map((s) => ({ ...s, itens: f(s.itens) })).filter((s) => s.itens.length) } : { ...c, itens: f(c.itens) })).filter((c) => (c.subs ? c.subs.length : c.itens.length));
}


// --- Figurinhas e escrito --------------------------------------------------------------------------

const FIGURINHAS = [
  { valor: 'coracao', nome: 'Coração', desenhar: (c, x, y, t) => { c.fillStyle = '#e63956'; coracao(c, x, y, t * 0.55); c.fill(); } },
  { valor: 'estrela', nome: 'Estrela', desenhar: (c, x, y, t) => { c.fillStyle = '#ffd166'; c.strokeStyle = '#d99a00'; c.lineWidth = t * 0.06; estrela(c, x, y, t * 0.5, t * 0.22); c.fill(); c.stroke(); } },
  { valor: 'sol', nome: 'Sol', desenhar: (c, x, y, t) => { c.fillStyle = '#ffb703'; c.strokeStyle = '#ffb703'; c.lineWidth = t * 0.08; c.lineCap = 'round'; for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; c.beginPath(); c.moveTo(x + Math.cos(a) * t * 0.36, y + Math.sin(a) * t * 0.36); c.lineTo(x + Math.cos(a) * t * 0.5, y + Math.sin(a) * t * 0.5); c.stroke(); } c.beginPath(); c.arc(x, y, t * 0.28, 0, Math.PI * 2); c.fill(); } },
  { valor: 'flor', nome: 'Flor', desenhar: (c, x, y, t) => flor(c, x, y, t * 0.42, '#ff8fb1', '#ffd166') },
  { valor: 'folha', nome: 'Folha', desenhar: (c, x, y, t) => folha(c, x - t * 0.4, y + t * 0.3, t * 0.85, t * 0.3, -0.7) },
  { valor: 'nuvem', nome: 'Nuvem', desenhar: (c, x, y, t) => {
    const bolas = [[-0.22, 0.04, 0.2], [0.02, -0.08, 0.27], [0.28, 0.04, 0.2]];
    [['#8fa9cc', 0.03], ['#ffffff', 0]].forEach(([cor, extra]) => {
      c.fillStyle = cor;
      bolas.forEach(([a, b, r]) => { c.beginPath(); c.arc(x + a * t, y + b * t, (r + extra) * t, 0, Math.PI * 2); c.fill(); });
      retArredondado(c, x - (0.3 + extra) * t, y - (0.02 + extra) * t, (0.6 + 2 * extra) * t, (0.22 + 2 * extra) * t, 0.11 * t); c.fill();
    });
  } },
  { valor: 'raio', nome: 'Raio', desenhar: (c, x, y, t) => { c.fillStyle = '#ffd60a'; c.strokeStyle = '#c99a00'; c.lineWidth = t * 0.05; c.beginPath(); [[0.1, -0.5], [-0.25, 0.05], [-0.02, 0.05], [-0.12, 0.5], [0.27, -0.12], [0.04, -0.12]].forEach(([a, b], i) => c[i ? 'lineTo' : 'moveTo'](x + a * t, y + b * t)); c.closePath(); c.fill(); c.stroke(); } },
  { valor: 'gato', nome: 'Rostinho de gato', desenhar: (c, x, y, t) => {
    const r = t * 0.42;
    c.lineJoin = 'round'; c.lineCap = 'round';
    [-1, 1].forEach((d) => {
      c.fillStyle = '#f2a65a'; c.strokeStyle = '#8a4b14'; c.lineWidth = t * 0.035;
      c.beginPath(); c.moveTo(x + d * r * 0.95, y - r * 0.15); c.lineTo(x + d * r * 0.78, y - r * 1.12); c.lineTo(x + d * r * 0.18, y - r * 0.82); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffb3c1'; c.beginPath(); c.moveTo(x + d * r * 0.82, y - r * 0.38); c.lineTo(x + d * r * 0.72, y - r * 0.88); c.lineTo(x + d * r * 0.34, y - r * 0.7); c.closePath(); c.fill();
    });
    c.fillStyle = '#f2a65a'; c.strokeStyle = '#8a4b14'; c.lineWidth = t * 0.035;
    c.beginPath(); c.ellipse(x, y, r * 1.1, r, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#c9772a'; c.lineWidth = t * 0.04;
    [[-0.12, -0.95, -0.12, -0.6], [0.12, -0.95, 0.12, -0.6], [0, -1, 0, -0.65]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * r, y + b * r); c.lineTo(x + d * r, y + e * r); c.stroke(); });
    c.fillStyle = '#fff6e8'; c.beginPath(); c.ellipse(x, y + r * 0.42, r * 0.55, r * 0.38, 0, 0, Math.PI * 2); c.fill();
    [-1, 1].forEach((d) => {
      c.fillStyle = '#ffffff'; c.strokeStyle = '#3a2410'; c.lineWidth = t * 0.025;
      c.beginPath(); c.ellipse(x + d * r * 0.46, y - r * 0.12, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#2d1b08'; c.beginPath(); c.ellipse(x + d * r * 0.48, y - r * 0.08, r * 0.13, r * 0.22, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + d * r * 0.43, y - r * 0.2, r * 0.07, 0, Math.PI * 2); c.fill();
    });
    c.fillStyle = '#ff8fa3'; c.beginPath(); c.moveTo(x - r * 0.14, y + r * 0.2); c.lineTo(x + r * 0.14, y + r * 0.2); c.lineTo(x, y + r * 0.36); c.closePath(); c.fill();
    c.strokeStyle = '#3a2410'; c.lineWidth = t * 0.03;
    c.beginPath(); c.moveTo(x, y + r * 0.36); c.lineTo(x, y + r * 0.5); c.moveTo(x, y + r * 0.5); c.quadraticCurveTo(x - r * 0.14, y + r * 0.66, x - r * 0.3, y + r * 0.5); c.moveTo(x, y + r * 0.5); c.quadraticCurveTo(x + r * 0.14, y + r * 0.66, x + r * 0.3, y + r * 0.5); c.stroke();
    c.lineWidth = t * 0.022;
    [-1, 1].forEach((d) => { [-0.1, 0.12].forEach((dy) => { c.beginPath(); c.moveTo(x + d * r * 0.55, y + r * (0.42 + dy)); c.lineTo(x + d * r * 1.22, y + r * (0.34 + dy * 2)); c.stroke(); }); });
  } },
  { valor: 'maquina', nome: 'Máquina de escrever retrô', desenhar: (c, x, y, t) => {
    c.lineJoin = 'round';
    c.fillStyle = '#ffffff'; c.strokeStyle = '#9aa5b1'; c.lineWidth = t * 0.015; c.fillRect(x - 0.18 * t, y - 0.48 * t, 0.36 * t, 0.32 * t); c.strokeRect(x - 0.18 * t, y - 0.48 * t, 0.36 * t, 0.32 * t);
    c.strokeStyle = '#b8c0c9'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 0.13 * t, y - (0.42 - i * 0.065) * t); c.lineTo(x + 0.13 * t, y - (0.42 - i * 0.065) * t); c.stroke(); }
    c.fillStyle = '#1d2d38'; retArredondado(c, x - 0.4 * t, y - 0.2 * t, 0.8 * t, 0.09 * t, 0.04 * t); c.fill();
    c.fillStyle = '#2f4858'; c.beginPath(); c.moveTo(x - 0.38 * t, y - 0.1 * t); c.lineTo(x + 0.38 * t, y - 0.1 * t); c.lineTo(x + 0.46 * t, y + 0.24 * t); c.lineTo(x - 0.46 * t, y + 0.24 * t); c.closePath(); c.fill();
    c.fillStyle = '#f2e9d8'; c.strokeStyle = '#1d2d38'; c.lineWidth = t * 0.01;
    [[7, -0.02, 0.07], [8, 0.07, 0.065], [7, 0.16, 0.06]].forEach(([n, dy, esp]) => { for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + (i - (n - 1) / 2) * esp * t, y + dy * t, 0.026 * t, 0, Math.PI * 2); c.fill(); c.stroke(); } });
    c.fillStyle = '#c0392b'; c.fillRect(x - 0.52 * t, y + 0.24 * t, 1.04 * t, 0.07 * t);
  } },
  { valor: 'caneta', nome: 'Caneta-tinteiro', desenhar: (c, x, y, t) => {
    c.save(); c.translate(x, y); c.rotate(0.75); c.lineJoin = 'round';
    c.fillStyle = '#1d3557'; retArredondado(c, -0.07 * t, -0.42 * t, 0.14 * t, 0.58 * t, 0.05 * t); c.fill();
    c.fillStyle = '#d4af37'; c.fillRect(-0.075 * t, -0.08 * t, 0.15 * t, 0.035 * t); c.fillRect(-0.075 * t, -0.3 * t, 0.15 * t, 0.025 * t);
    c.fillStyle = '#f0c75e'; c.strokeStyle = '#a07a12'; c.lineWidth = t * 0.012;
    c.beginPath(); c.moveTo(-0.07 * t, 0.16 * t); c.lineTo(0.07 * t, 0.16 * t); c.lineTo(0.015 * t, 0.42 * t); c.lineTo(-0.015 * t, 0.42 * t); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 0.2 * t); c.lineTo(0, 0.4 * t); c.stroke();
    c.restore();
    c.fillStyle = '#1d3557'; c.beginPath(); c.moveTo(x - 0.3 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.4 * t, y + 0.4 * t, x - 0.3 * t, y + 0.44 * t); c.quadraticCurveTo(x - 0.2 * t, y + 0.4 * t, x - 0.3 * t, y + 0.3 * t); c.fill();
  } },
  { valor: 'livro', nome: 'Livro aberto', desenhar: (c, x, y, t) => {
    c.lineJoin = 'round';
    c.fillStyle = '#8c2f39'; c.beginPath(); c.moveTo(x, y - 0.1 * t); c.lineTo(x - 0.47 * t, y - 0.22 * t); c.lineTo(x - 0.47 * t, y + 0.28 * t); c.lineTo(x, y + 0.38 * t); c.lineTo(x + 0.47 * t, y + 0.28 * t); c.lineTo(x + 0.47 * t, y - 0.22 * t); c.closePath(); c.fill();
    [-1, 1].forEach((d) => {
      c.fillStyle = '#fffaf0'; c.strokeStyle = '#d6cdb8'; c.lineWidth = t * 0.012;
      c.beginPath(); c.moveTo(x, y - 0.13 * t); c.lineTo(x + d * 0.43 * t, y - 0.25 * t); c.lineTo(x + d * 0.43 * t, y + 0.22 * t); c.lineTo(x, y + 0.33 * t); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#b9b2a0'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x + d * 0.05 * t, y + (-0.06 + i * 0.07) * t); c.lineTo(x + d * 0.37 * t, y + (-0.17 + i * 0.07) * t); c.stroke(); }
    });
  } },
  { valor: 'papeis', nome: 'Pilha de papéis', desenhar: (c, x, y, t) => {
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(x, y + 0.03 * t); c.rotate((i - 1) * 0.13);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#aeb6bf'; c.lineWidth = t * 0.014; c.fillRect(-0.23 * t, -0.32 * t, 0.46 * t, 0.6 * t); c.strokeRect(-0.23 * t, -0.32 * t, 0.46 * t, 0.6 * t);
      if (i === 2) { c.strokeStyle = '#b8c0c9'; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(-0.17 * t, (-0.22 + k * 0.08) * t); c.lineTo((k % 3 === 2 ? 0.05 : 0.17) * t, (-0.22 + k * 0.08) * t); c.stroke(); } }
      c.restore();
    }
    c.strokeStyle = '#d4af37'; c.lineWidth = t * 0.025; c.beginPath(); c.moveTo(x - 0.16 * t, y - 0.34 * t); c.lineTo(x - 0.16 * t, y - 0.2 * t); c.quadraticCurveTo(x - 0.16 * t, y - 0.14 * t, x - 0.11 * t, y - 0.14 * t); c.lineTo(x - 0.11 * t, y - 0.3 * t); c.stroke();
  } },
  { valor: 'vassoura', nome: 'Vassoura e espanador', desenhar: (c, x, y, t) => {
    c.save(); c.translate(x - 0.17 * t, y + 0.02 * t); c.rotate(-0.4); c.lineCap = 'round';
    c.strokeStyle = '#8a5a2b'; c.lineWidth = t * 0.04; c.beginPath(); c.moveTo(0, -0.48 * t); c.lineTo(0, 0.1 * t); c.stroke();
    c.fillStyle = '#c0392b'; c.fillRect(-0.06 * t, 0.08 * t, 0.12 * t, 0.05 * t);
    c.fillStyle = '#e0b13a'; c.beginPath(); c.moveTo(-0.06 * t, 0.13 * t); c.lineTo(0.06 * t, 0.13 * t); c.lineTo(0.17 * t, 0.46 * t); c.lineTo(-0.17 * t, 0.46 * t); c.closePath(); c.fill();
    c.strokeStyle = '#b8892a'; c.lineWidth = t * 0.012; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.012 * t, 0.14 * t); c.lineTo(i * 0.045 * t, 0.46 * t); c.stroke(); }
    c.restore();
    c.save(); c.translate(x + 0.2 * t, y - 0.04 * t); c.rotate(0.4); c.lineCap = 'round';
    c.strokeStyle = '#2e86c1'; c.lineWidth = t * 0.04; c.beginPath(); c.moveTo(0, -0.46 * t); c.lineTo(0, 0.04 * t); c.stroke();
    ['#e84393', '#a55eea', '#f78fb3', '#c56cf0', '#fd79a8'].forEach((cor, i) => { c.fillStyle = cor; c.beginPath(); c.ellipse((i - 2) * 0.06 * t, 0.2 * t, 0.045 * t, 0.2 * t, (i - 2) * 0.22, 0, Math.PI * 2); c.fill(); });
    c.restore();
  } },
  { valor: 'lata', nome: 'Lata de lixo', desenhar: (c, x, y, t) => {
    c.fillStyle = '#ffffff'; c.strokeStyle = '#aeb6bf'; c.lineWidth = t * 0.012; c.save(); c.translate(x + 0.04 * t, y - 0.3 * t); c.rotate(0.35); c.fillRect(-0.09 * t, -0.08 * t, 0.18 * t, 0.2 * t); c.strokeRect(-0.09 * t, -0.08 * t, 0.18 * t, 0.2 * t); c.restore();
    c.fillStyle = '#9aa5b1'; c.strokeStyle = '#5f6b78'; c.lineWidth = t * 0.025; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - 0.25 * t, y - 0.18 * t); c.lineTo(x + 0.25 * t, y - 0.18 * t); c.lineTo(x + 0.19 * t, y + 0.42 * t); c.lineTo(x - 0.19 * t, y + 0.42 * t); c.closePath(); c.fill(); c.stroke();
    c.lineWidth = t * 0.018; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 0.085 * t, y - 0.1 * t); c.lineTo(x + i * 0.065 * t, y + 0.36 * t); c.stroke(); }
    c.fillStyle = '#7b8794'; c.lineWidth = t * 0.025; retArredondado(c, x - 0.3 * t, y - 0.29 * t, 0.6 * t, 0.12 * t, 0.04 * t); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 0.07 * t, y - 0.29 * t); c.lineTo(x - 0.07 * t, y - 0.34 * t); c.lineTo(x + 0.07 * t, y - 0.34 * t); c.lineTo(x + 0.07 * t, y - 0.29 * t); c.stroke();
  } },
  { valor: 'xicara', nome: 'Xícara de café', desenhar: (c, x, y, t) => {
    c.lineCap = 'round'; c.strokeStyle = '#b8c0c9'; c.lineWidth = t * 0.028;
    [-0.1, 0.02, 0.14].forEach((dx) => { c.beginPath(); c.moveTo(x + dx * t, y - 0.12 * t); c.bezierCurveTo(x + (dx - 0.07) * t, y - 0.22 * t, x + (dx + 0.07) * t, y - 0.3 * t, x + dx * t, y - 0.42 * t); c.stroke(); });
    c.fillStyle = '#ffffff'; c.strokeStyle = '#8c96a1'; c.lineWidth = t * 0.018;
    c.beginPath(); c.ellipse(x, y + 0.34 * t, 0.42 * t, 0.07 * t, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(x + 0.28 * t, y + 0.08 * t, 0.1 * t, -1.3, 1.5); c.lineWidth = t * 0.04; c.stroke(); c.lineWidth = t * 0.018;
    c.beginPath(); c.moveTo(x - 0.27 * t, y - 0.06 * t); c.lineTo(x + 0.27 * t, y - 0.06 * t); c.bezierCurveTo(x + 0.27 * t, y + 0.28 * t, x + 0.12 * t, y + 0.33 * t, x, y + 0.33 * t); c.bezierCurveTo(x - 0.12 * t, y + 0.33 * t, x - 0.27 * t, y + 0.28 * t, x - 0.27 * t, y - 0.06 * t); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#5b3a1e'; c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.27 * t, 0.045 * t, 0, 0, Math.PI * 2); c.fill();
  } },
  { valor: 'violao', nome: 'Violão', desenhar: (c, x, y, t) => {
    c.save(); c.translate(x, y); c.rotate(-0.7); c.lineJoin = 'round';
    c.fillStyle = '#4a2c12'; c.fillRect(-0.035 * t, -0.48 * t, 0.07 * t, 0.5 * t); retArredondado(c, -0.06 * t, -0.58 * t, 0.12 * t, 0.13 * t, 0.02 * t); c.fill();
    c.fillStyle = '#c0782f'; c.strokeStyle = '#7a4513'; c.lineWidth = t * 0.02;
    c.beginPath(); c.arc(0, 0.04 * t, 0.15 * t, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0.27 * t, 0.2 * t, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0.04 * t, 0.15 * t, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1608'; c.beginPath(); c.arc(0, 0.2 * t, 0.06 * t, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a2c12'; c.fillRect(-0.07 * t, 0.36 * t, 0.14 * t, 0.025 * t);
    c.strokeStyle = '#efe6cf'; c.lineWidth = t * 0.007; [-0.02, 0, 0.02].forEach((dx) => { c.beginPath(); c.moveTo(dx * t, -0.46 * t); c.lineTo(dx * t, 0.37 * t); c.stroke(); });
    c.restore();
  } },
  { valor: 'nota', nome: 'Nota musical', desenhar: (c, x, y, t) => {
    c.fillStyle = '#1f2430'; c.strokeStyle = '#1f2430'; c.lineCap = 'round';
    c.save(); c.translate(x - 0.07 * t, y + 0.26 * t); c.rotate(-0.4); c.beginPath(); c.ellipse(0, 0, 0.14 * t, 0.095 * t, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.lineWidth = t * 0.05; c.beginPath(); c.moveTo(x + 0.06 * t, y + 0.23 * t); c.lineTo(x + 0.06 * t, y - 0.36 * t); c.stroke();
    c.beginPath(); c.moveTo(x + 0.06 * t, y - 0.36 * t); c.bezierCurveTo(x + 0.06 * t, y - 0.16 * t, x + 0.32 * t, y - 0.2 * t, x + 0.26 * t, y + 0.02 * t); c.lineWidth = t * 0.055; c.stroke();
  } },
  { valor: 'balao', nome: 'Balão de fala', desenhar: (c, x, y, t) => { c.fillStyle = '#ffffff'; c.strokeStyle = '#4a5568'; c.lineWidth = t * 0.05; retArredondado(c, x - t * 0.45, y - t * 0.35, t * 0.9, t * 0.55, t * 0.18); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - t * 0.15, y + t * 0.2); c.lineTo(x - t * 0.3, y + t * 0.45); c.lineTo(x + t * 0.05, y + t * 0.2); c.closePath(); c.fill(); c.stroke(); } },
  { valor: 'cachorro', nome: 'Rostinho de cachorro', desenhar: (c, x, y, t) => {
    const r = t * 0.4; c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = '#8a5a34'; c.strokeStyle = '#4e2f16'; c.lineWidth = t * 0.035;
    [-1, 1].forEach((d) => { c.beginPath(); c.ellipse(x + d * r * 1.0, y + r * 0.1, r * 0.3, r * 0.62, d * 0.18, 0, 7); c.fill(); c.stroke(); });
    c.fillStyle = '#e8b878'; c.beginPath(); c.ellipse(x, y, r * 0.95, r * 0.9, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#8a5a34'; c.beginPath(); c.ellipse(x - r * 0.42, y - r * 0.18, r * 0.3, r * 0.34, 0.3, 0, 7); c.fill();
    c.fillStyle = '#fff4e0'; c.beginPath(); c.ellipse(x, y + r * 0.38, r * 0.5, r * 0.38, 0, 0, 7); c.fill();
    [-1, 1].forEach((d) => { c.fillStyle = '#2d1b08'; c.beginPath(); c.arc(x + d * r * 0.4, y - r * 0.12, r * 0.12, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + d * r * 0.37, y - r * 0.17, r * 0.04, 0, 7); c.fill(); });
    c.fillStyle = '#2d1b08'; c.beginPath(); c.ellipse(x, y + r * 0.2, r * 0.2, r * 0.14, 0, 0, 7); c.fill();
    c.strokeStyle = '#2d1b08'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(x, y + r * 0.3); c.lineTo(x, y + r * 0.42); c.moveTo(x - r * 0.22, y + r * 0.5); c.quadraticCurveTo(x, y + r * 0.62, x + r * 0.22, y + r * 0.5); c.stroke();
    c.fillStyle = '#ff7b93'; c.beginPath(); c.moveTo(x - r * 0.1, y + r * 0.56); c.quadraticCurveTo(x, y + r * 0.9, x + r * 0.1, y + r * 0.56); c.closePath(); c.fill(); c.stroke();
  } },
  { valor: 'dragao', nome: 'Dragãozinho soltando fumaça', desenhar: (c, x, y, t) => {
    const r = t * 0.3; c.lineJoin = 'round'; c.lineCap = 'round'; const yy = y + t * 0.14;
    c.fillStyle = '#e6edf2'; c.strokeStyle = '#8c9aa6'; c.lineWidth = t * 0.018;
    [[0.3, -0.02, 0.045], [0.36, -0.13, 0.062], [0.3, -0.27, 0.08]].forEach(([a, b, s]) => { c.beginPath(); c.arc(x + a * t, y + b * t, s * t, 0, 7); c.fill(); c.stroke(); });
    c.fillStyle = '#f6c344'; c.strokeStyle = '#8a5a00'; c.lineWidth = t * 0.025;
    [-1, 1].forEach((d) => { c.beginPath(); c.moveTo(x + d * r * 0.35, yy - r * 0.8); c.quadraticCurveTo(x + d * r * 0.4, yy - r * 1.3, x + d * r * 0.85, yy - r * 1.45); c.quadraticCurveTo(x + d * r * 0.8, yy - r * 1.0, x + d * r * 0.75, yy - r * 0.7); c.closePath(); c.fill(); c.stroke(); });
    c.fillStyle = '#5cc27a'; c.strokeStyle = '#1f6b3a'; c.lineWidth = t * 0.03; c.beginPath(); c.ellipse(x, yy, r * 1.2, r * 0.95, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#a8e6b8'; c.beginPath(); c.ellipse(x + r * 0.35, yy + r * 0.3, r * 0.7, r * 0.5, -0.2, 0, 7); c.fill();
    [-1, 1].forEach((d) => { c.fillStyle = '#fff'; c.strokeStyle = '#1f3a2a'; c.lineWidth = t * 0.018; c.beginPath(); c.arc(x + d * r * 0.45, yy - r * 0.25, r * 0.22, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#1f3a2a'; c.beginPath(); c.arc(x + d * r * 0.47, yy - r * 0.2, r * 0.11, 0, 7); c.fill(); });
    c.fillStyle = '#1f6b3a'; [0.55, 0.95].forEach((a) => { c.beginPath(); c.arc(x + r * a, yy + r * 0.2, r * 0.06, 0, 7); c.fill(); });
    c.strokeStyle = '#1f6b3a'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(x - r * 0.2, yy + r * 0.58); c.quadraticCurveTo(x + r * 0.3, yy + r * 0.75, x + r * 0.7, yy + r * 0.58); c.stroke();
  } },
  { valor: 'ninho', nome: 'Passarinho no ninho', desenhar: (c, x, y, t) => {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = '#58b2e8'; c.strokeStyle = '#1d5f8c'; c.lineWidth = t * 0.03;
    c.beginPath(); c.ellipse(x, y - t * 0.05, t * 0.22, t * 0.24, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#f6e7c1'; c.beginPath(); c.ellipse(x, y + t * 0.0, t * 0.12, t * 0.14, 0, 0, 7); c.fill();
    c.fillStyle = '#ffb703'; c.strokeStyle = '#8a5a00'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(x - t * 0.02, y - t * 0.1); c.lineTo(x + t * 0.1, y - t * 0.07); c.lineTo(x - t * 0.02, y - t * 0.04); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#2d1b08'; c.beginPath(); c.arc(x - t * 0.08, y - t * 0.12, t * 0.025, 0, 7); c.fill();
    c.strokeStyle = '#1d5f8c'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(x - t * 0.02, y - t * 0.28); c.quadraticCurveTo(x, y - t * 0.37, x + t * 0.04, y - t * 0.31); c.stroke();
    c.fillStyle = '#a9743f'; c.strokeStyle = '#5a3a1a'; c.lineWidth = t * 0.03;
    c.beginPath(); c.ellipse(x, y + t * 0.16, t * 0.38, t * 0.17, 0, 0, Math.PI); c.lineTo(x - t * 0.38, y + t * 0.16); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(x, y + t * 0.16, t * 0.38, t * 0.06, 0, 0, 7); c.fill(); c.stroke();
    c.lineWidth = t * 0.015; [-0.24, -0.08, 0.1, 0.26].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y + t * 0.2); c.quadraticCurveTo(x + a * t + t * 0.05, y + t * 0.26, x + a * t + t * 0.02, y + t * 0.31); c.stroke(); });
  } },
  { valor: 'voando', nome: 'Passarinhos voando', desenhar: (c, x, y, t) => {
    c.lineJoin = 'round'; c.lineCap = 'round';
    [[-0.26, 0.16, 0.85, '#f2557a'], [0.0, -0.12, 1.2, '#58b2e8'], [0.3, 0.2, 0.75, '#f6c344']].forEach(([a, b, s, cor]) => {
      const px = x + a * t, py = y + b * t, k = t * 0.12 * s;
      c.fillStyle = cor; c.strokeStyle = '#3a2a2a'; c.lineWidth = t * 0.016;
      [-1, 1].forEach((d) => { c.beginPath(); c.ellipse(px + d * k * 1.35, py - k * 0.15, k * 1.15, k * 0.3, d * -0.22, 0, 7); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(px, py, k * 0.85, k * 0.65, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff4e0'; c.beginPath(); c.ellipse(px, py + k * 0.22, k * 0.5, k * 0.32, 0, 0, 7); c.fill();
      c.fillStyle = '#ffb703'; c.beginPath(); c.moveTo(px - k * 0.18, py + k * 0.05); c.lineTo(px, py + k * 0.5); c.lineTo(px + k * 0.18, py + k * 0.05); c.closePath(); c.fill();
      c.fillStyle = '#2d1b08'; [-1, 1].forEach((d) => { c.beginPath(); c.arc(px + d * k * 0.3, py - k * 0.15, k * 0.1, 0, 7); c.fill(); });
    });
  } }
];
const CATEGORIAS_FIGURINHA = [
  { valor: 'classicas', nome: 'Clássicas', itens: ['coracao', 'estrela', 'sol', 'flor', 'folha', 'nuvem', 'raio', 'balao', 'maquina', 'caneta', 'livro', 'papeis', 'vassoura', 'lata', 'xicara', 'violao', 'nota', 'gato', 'cachorro', 'dragao', 'ninho', 'voando'] },
  { valor: 'retro', nome: 'Retrô, papel de carta', itens: ['r-confeiteira', 'r-dino-birra', 'r-dino-frigideira', 'r-ursinhos', 'r-ursinhos-abraco', 'r-gato-juiz', 'r-gato-rede', 'r-gato-domingo', 'r-persa-lotus', 'r-golden', 'r-menina-margarida', 'r-menina-cesto', 'r-morango'] },
  { valor: 'vida-real', nome: 'Vida real', itens: ['r-ursos-costas', 'r-siameses', 'r-gnomo', 'r-ratinhos', 'r-concha', 'r-coelho-urso', 'r-estrelas', 'r-pandas', 'r-gatinho-relogio', 'r-margaridas-murchas'] },
  { valor: 'anime', nome: 'Anime', subs: [
    { valor: 'anime-criaturas', nome: 'Criaturinhas', itens: ['a-bateria-social', 'a-dragao-bravo', 'a-derretido', 'a-fisiculturista', 'a-fantasminha', 'a-arrepiada', 'a-raposinha', 'a-lagartinho-sono', 'a-tartaruguinha', 'a-monstrinho-flor'] },
    { valor: 'magicas', nome: 'Garotas mágicas', itens: ['m-estrela-rosa', 'm-capa-escura', 'm-violinista', 'm-coragem', 'm-exausta', 'm-lanca', 'm-ampulheta', 'm-petalas', 'm-contrato'] },
    { valor: 'elemental', nome: 'Aventura elemental', itens: ['e-viajante', 'e-flautista', 'e-raio', 'e-arqueira', 'e-gelo', 'e-erudito', 'e-samurai', 'e-guardiao'] }
  ] },
  { valor: 'minimalista', nome: 'Minimalista', subs: [
    { valor: 'mini-esporte', nome: 'Esporte', itens: ['n-corredor', 'n-raquetes', 'n-bicicleta', 'n-cesta', 'n-escalador', 'n-luvas', 'n-chute', 'n-rosto'] },
    { valor: 'mini-musica', nome: 'Música', itens: ['n-clave', 'n-pauta', 'n-violao', 'n-fones', 'n-teclas', 'n-onda', 'n-microfone', 'n-vinil', 'n-colcheias', 'n-caixa'] }
  ] },
  { valor: 'jogos', nome: 'Jogos de tabuleiro', itens: ['j-peao', 'j-rei', 'j-cavalo', 'j-rainha', 'j-xeque-mate'] },
  { valor: 'rpg', nome: 'RPG', itens: ['g-d20-neon', 'g-d20-critico', 'g-d20-falha', 'g-torre-dados', 'g-escudo-mestre', 'g-mimic', 'g-taverna', 'g-iniciativa', 'g-mago', 'g-ladino', 'g-bardo'] }
];
/** Todos os itens de uma lista de categorias, com ou sem subcategorias. */
function itensDasCategorias(cats) { return cats.flatMap((c) => (c.subs ? c.subs.flatMap((x) => x.itens) : c.itens)); }
const EXTRA_FIGURINHAS = {
  coracao: ['afetuoso', 'Carinho, amor, gratidão e mensagens de afeto.', 'Assuntos sérios, formais ou de luto.', 'Um coração vermelho liso, grande, de cantos suaves.'],
  estrela: ['brilhante e de conquista', 'Destaque, conquista, boa avaliação e novidade.', 'Assuntos discretos ou de luto.', 'Uma estrela de cinco pontas, amarela, com contorno dourado.'],
  sol: ['alegre e acolhedor', 'Bom dia, energia, verão e esperança.', 'Luto e assuntos sombrios.', 'Um disco amarelo e laranja, com doze raios curtos em volta.'],
  flor: ['delicado e carinhoso', 'Dia das Mães, carinho, primavera e delicadeza.', 'Assuntos técnicos ou de negócios.', 'Uma flor rosa de seis pétalas, com o miolo amarelo.'],
  folha: ['calmo e natural', 'Natureza, saúde, terapias e sustentabilidade.', 'Assuntos de festa e de tecnologia.', 'Uma folha verde, inclinada, com a nervura do meio mais escura.'],
  nuvem: ['leve e tranquilo', 'Sonho, calma, tempo e previsão.', 'Assuntos urgentes.', 'Uma nuvem branca de contorno azul acinzentado.'],
  raio: ['energético e urgente', 'Energia, rapidez, novidade forte e alerta.', 'Assuntos calmos ou de luto.', 'Um raio amarelo em zigue-zague, com contorno dourado escuro.'],
  cachorro: ['leal e carinhoso', 'Amizade, lealdade, bichinhos de estimação e humor leve.', 'Assuntos sérios ou de luto.', 'O rosto de um cachorro caramelo, de orelhas marrons caídas, focinho claro, nariz preto e a língua para fora.'],
  dragao: ['bravinho e engraçado', 'Humor, mau humor leve, fantasia e conteúdo infantil.', 'Assuntos sérios ou de perigo real.', 'A cabeça redonda de um dragão verde, com dois chifres amarelos, olhos grandes e três nuvenzinhas de fumaça subindo das narinas.'],
  ninho: ['sereno e acolhedor', 'Casa, família, descanso, primavera e cuidado.', 'Assuntos de perda do lar.', 'Um passarinho azul de barriga clara e bico amarelo, sentado num ninho de palha marrom.'],
  voando: ['livre e leve', 'Liberdade, amizade, viagem e recomeço.', 'Assuntos de prisão ou de luto.', 'Três passarinhos de cores diferentes, rosa, azul e amarelo, de asas abertas, voando juntos.'],
  gato: ['fofo e brincalhão', 'Bichinhos, humor leve e conteúdo infantil.', 'Assuntos sérios.', 'O rosto de um gato laranja listrado, de olhos grandes, focinho rosa e bigodes.'],
  maquina: ['nostálgico e literário', 'Escrita, contos, crônicas, livros e poesia.', 'Assuntos de tecnologia moderna.', 'Uma máquina de escrever antiga, azul petróleo, com uma folha branca saindo e teclas cor de creme.'],
  caneta: ['elegante e reflexivo', 'Escrita, cartas, assinatura e poesia.', 'Assuntos muito descontraídos.', 'Uma caneta-tinteiro azul marinho com detalhes e pena dourados, e uma gota de tinta.'],
  livro: ['sábio e calmo', 'Leitura, estudo, resenhas e contos.', 'Assuntos de festa.', 'Um livro aberto, de capa vinho e páginas cor de creme com linhas de texto.'],
  papeis: ['organizado e de trabalho', 'Documentos, estudo, roteiro e trabalho.', 'Assuntos íntimos.', 'Uma pilha de folhas brancas, um pouco bagunçada, com um clipe dourado.'],
  vassoura: ['bem-humorado e doméstico', 'Limpeza, faxina, arrumação e humor sobre tarefas de casa.', 'Assuntos sérios ou formais.', 'Uma vassoura de cabo marrom e palha amarela, cruzada com um espanador de penas rosa e roxas.'],
  lata: ['irreverente', 'Humor, descarte, desapego e limpeza da vida.', 'Assuntos delicados ou de luto.', 'Uma lata de lixo cinza, com tampa e um papel saindo.'],
  xicara: ['acolhedor', 'Conversa, café, pausa e bom dia.', 'Assuntos urgentes.', 'Uma xícara branca de café fumegando, com pires e três fios de vapor.'],
  violao: ['musical e descontraído', 'Música, canto e poesia cantada.', 'Assuntos formais.', 'Um violão de madeira marrom, inclinado, de cordas claras.'],
  nota: ['musical e leve', 'Música, podcast e canção.', 'Assuntos que pedem silêncio.', 'Uma nota musical preta, com haste e uma bandeirinha.'],
  balao: ['conversador', 'Frases, diálogo e perguntas.', 'Quando já há muito escrito na foto.', 'Um balão de fala branco, de contorno cinza, com um rabinho para baixo.']
};
const LEGENDAS_CLASSICAS = {
  coracao: 'Sentir bonito também é coisa séria.', estrela: 'Brilhar não é vaidade, é sinalização.', sol: 'Amanheceu, e o dia ainda está inteiro pela frente.',
  flor: 'Tem coisa que só floresce quando ninguém apressa.', folha: 'Cair também é um jeito de recomeçar.', nuvem: 'Cabeça nas nuvens, pés onde der.',
  raio: 'Ideia boa chega sem avisar.', gato: 'Gato não ignora, só prioriza.', maquina: 'Cada tecla bate uma história.',
  caneta: 'O que a tinta guarda, a memória empresta.', livro: 'Um livro aberto nunca fica sozinho.', papeis: 'Papel na mesa é ideia esperando a vez.',
  vassoura: 'Organizar a casa é organizar a cabeça.', lata: 'Jogar fora também é um jeito de cuidar.', xicara: 'Café quente, conversa boa, e o mundo que espere.',
  violao: 'Toda canção começa em três acordes e uma saudade.', nota: 'Uma nota só já muda o clima da sala.', balao: 'Fala que eu escuto com atenção.',
  cachorro: 'Quem tem um cachorro nunca chega em casa sozinho.', dragao: 'Se eu me irritar, é só fumaça, prometo.',
  ninho: 'Ninho é qualquer lugar onde dá para descansar.', voando: 'Voar junto é metade do caminho.'
};
/** Os detalhes de uma figurinha, um a um, para abrir só o que a pessoa quer ouvir: tom, indicação, descrição e contraindicação. */
const detalhesDaFigurinha = (tom, ind, descr, contra) => [['Tom', tom], ['Indicação', ind], ['Descrição', descr], ['Contraindicação', contra]].map(([r, t]) => ({ r, t: String(t).replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.') }));
FIGURINHAS.forEach((f) => { const e = EXTRA_FIGURINHAS[f.valor]; if (LEGENDAS_CLASSICAS[f.valor]) f.legenda = LEGENDAS_CLASSICAS[f.valor]; f.texto = `${f.legenda ? f.nome + '. ' : ''}Tom: ${e[0]}. ` + descricaoPadrao({ indicacao: e[1], contraindicacao: e[2], descricao: e[3] }); f.detalhes = detalhesDaFigurinha(e[0], e[1], e[3], e[2]); });

// --- Figurinhas retrô: papel de carta dos anos 90, personagens originais ----------------------------------------------
// Cada uma tem a frase (que aparece primeiro na lista) e a descrição. Desenhadas por código, pequenas, com traço fino e bochechas rosadas.

const TINTA = '#4a3434';
function cartaoRetro(c, x, y, t, cor1, cor2, padrao) {
  const w = t * 0.98, x0 = x - w / 2, y0 = y - w / 2, n = 9, r = w / (n * 2);
  c.fillStyle = cor1;
  for (let i = 0; i < n; i++) {
    const p = x0 + r + i * 2 * r, q = y0 + r + i * 2 * r;
    [[p, y0 + r * 0.2], [p, y0 + w - r * 0.2], [x0 + r * 0.2, q], [x0 + w - r * 0.2, q]].forEach(([a, b]) => { c.beginPath(); c.arc(a, b, r, 0, Math.PI * 2); c.fill(); });
  }
  retArredondado(c, x0 + r * 0.5, y0 + r * 0.5, w - r, w - r, t * 0.04); c.fill();
  const i0 = x0 + t * 0.06, j0 = y0 + t * 0.06, iw = w - t * 0.12;
  c.save(); retArredondado(c, i0, j0, iw, iw, t * 0.05); c.clip();
  c.fillStyle = cor2; c.fillRect(i0, j0, iw, iw);
  if (padrao === 'xadrez') { c.fillStyle = 'rgba(255,255,255,0.45)'; const q = iw / 8; for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) if ((a + b) % 2 === 0) c.fillRect(i0 + a * q, j0 + b * q, q, q); }
  else if (padrao === 'bolinhas') { c.fillStyle = 'rgba(255,255,255,0.6)'; for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) { c.beginPath(); c.arc(i0 + (a + 0.5 + (b % 2) * 0.5) * iw / 7, j0 + (b + 0.5) * iw / 7, t * 0.014, 0, 7); c.fill(); } }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = t * 0.012; c.setLineDash([t * 0.03, t * 0.025]);
  retArredondado(c, i0 + t * 0.014, j0 + t * 0.014, iw - t * 0.028, iw - t * 0.028, t * 0.045); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#ffffff';
  [[i0 + t * 0.07, j0 + t * 0.07], [i0 + iw - t * 0.07, j0 + t * 0.07], [i0 + t * 0.07, j0 + iw - t * 0.07]].forEach(([a, b]) => { estrela(c, a, b, t * 0.04, t * 0.015, 4); c.fill(); });
}
const bochechas = (c, x, y, t, d = 0.11, rr = 0.032) => { c.fillStyle = 'rgba(255,125,160,0.6)'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * d * t, y, rr * t * 1.25, rr * t, 0, 0, 7); c.fill(); }); };
function olho(c, x, y, t, tipo, pele = '#fff') {
  c.strokeStyle = TINTA; c.fillStyle = TINTA; c.lineWidth = t * 0.012; c.lineCap = 'round';
  if (tipo === 'ponto') { c.beginPath(); c.ellipse(x, y, t * 0.015, t * 0.022, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - t * 0.004, y - t * 0.008, t * 0.005, 0, 7); c.fill(); }
  else if (tipo === 'vazio') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, t * 0.04, t * 0.05, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(x, y, t * 0.007, 0, 7); c.fill(); }
  else if (tipo === 'grande') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, t * 0.035, t * 0.045, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x, y + t * 0.005, t * 0.022, t * 0.032, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - t * 0.008, y - t * 0.01, t * 0.008, 0, 7); c.fill(); }
  else if (tipo === 'meio') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, t * 0.04, t * 0.04, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(x, y + t * 0.01, t * 0.017, 0, 7); c.fill(); c.fillStyle = pele; c.beginPath(); c.rect(x - t * 0.045, y - t * 0.047, t * 0.09, t * 0.047); c.fill(); c.beginPath(); c.moveTo(x - t * 0.045, y); c.lineTo(x + t * 0.045, y); c.stroke(); }
  else if (tipo === 'cima') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, t * 0.04, t * 0.04, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(x, y - t * 0.018, t * 0.016, 0, 7); c.fill(); c.fillStyle = pele; c.beginPath(); c.rect(x - t * 0.045, y - t * 0.047, t * 0.09, t * 0.038); c.fill(); c.beginPath(); c.moveTo(x - t * 0.045, y - t * 0.009); c.lineTo(x + t * 0.045, y - t * 0.009); c.stroke(); }
  else if (tipo === 'fechado') { c.beginPath(); c.arc(x, y - t * 0.012, t * 0.035, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); }
  else if (tipo === 'chora') { c.beginPath(); c.moveTo(x - t * 0.04, y - t * 0.01); c.lineTo(x + t * 0.04, y + t * 0.01); c.stroke(); c.fillStyle = '#7ec8ff'; c.beginPath(); c.moveTo(x + t * 0.02, y + t * 0.02); c.quadraticCurveTo(x + t * 0.05, y + t * 0.07, x + t * 0.01, y + t * 0.07); c.quadraticCurveTo(x - t * 0.01, y + t * 0.05, x + t * 0.02, y + t * 0.02); c.fill(); }
}
const linha = (c, t, pts, fechar = false) => { c.beginPath(); pts.forEach(([a, b], i) => c[i ? 'lineTo' : 'moveTo'](a, b)); if (fechar) c.closePath(); };
const contorno = (c, t) => { c.strokeStyle = TINTA; c.lineWidth = t * 0.014; c.lineJoin = 'round'; c.lineCap = 'round'; };
function chamas(c, x, y, t, n = 5) { for (let i = 0; i < n; i++) { const a = x + (i - (n - 1) / 2) * t * 0.055, h = t * (0.1 + ((i * 7) % 5) * 0.025); c.fillStyle = i % 2 ? '#ff9f1c' : '#ff5a36'; c.beginPath(); c.moveTo(a - t * 0.03, y); c.quadraticCurveTo(a - t * 0.03, y - h * 0.6, a, y - h); c.quadraticCurveTo(a + t * 0.03, y - h * 0.6, a + t * 0.03, y); c.closePath(); c.fill(); c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(a - t * 0.015, y); c.quadraticCurveTo(a - t * 0.012, y - h * 0.35, a, y - h * 0.55); c.quadraticCurveTo(a + t * 0.012, y - h * 0.35, a + t * 0.015, y); c.fill(); } }


// Ajudantes das garotas mágicas: brilho de fundo e rosto de mangá (olhos grandes, cílios, brilho nos olhos).
function magia(c, x, y, t, cor) {
  const g = c.createRadialGradient(x, y, 0, x, y, t * 0.38); g.addColorStop(0, cor); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, t * 0.38, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.95)'; [[-0.3, -0.28], [0.3, -0.3], [0.32, 0.26], [-0.31, 0.28], [0.0, -0.34]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.022 * t, 0.008 * t, 4); c.fill(); });
}
function olhoManga(c, x, y, r, iris, tipo, olhar) {
  const dy = olhar === 'baixo' ? r * 0.25 : 0, dx = olhar === 'lado' ? r * 0.22 : 0;
  c.strokeStyle = TINTA; c.lineCap = 'round';
  if (tipo === 'fechado' || tipo === 'sereno') { c.lineWidth = r * 0.3; c.beginPath(); c.arc(x, y - r * 0.15, r * 0.95, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); c.lineWidth = r * 0.15; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * r * 0.9, y + r * 0.2); c.lineTo(x + s * r * 1.15, y + r * 0.4); c.stroke(); }); return; }
  const ry = tipo === 'cansado' ? r * 0.75 : tipo === 'frio' ? r * 0.9 : r * 1.25;
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, r, ry, 0, 0, Math.PI * 2); c.fill();
  const g = c.createLinearGradient(x, y - ry, x, y + ry); g.addColorStop(0, '#2a1f3a'); g.addColorStop(0.45, iris); g.addColorStop(1, '#ffffff'); c.fillStyle = g; c.beginPath(); c.ellipse(x + dx, y + dy, r * 0.8, ry * 0.88, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1a1222'; c.beginPath(); c.ellipse(x + dx, y + dy, r * 0.36, ry * 0.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x + dx - r * 0.28, y + dy - ry * 0.3, r * 0.26, 0, 7); c.fill(); c.beginPath(); c.arc(x + dx + r * 0.25, y + dy + ry * 0.32, r * 0.12, 0, 7); c.fill();
  c.lineWidth = r * 0.28; c.beginPath(); c.ellipse(x, y, r, ry, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  c.lineWidth = r * 0.1; c.beginPath(); c.ellipse(x, y, r, ry, 0, 0.2, Math.PI - 0.2); c.stroke();
  if (tipo === 'cansado' || tipo === 'frio') { c.fillStyle = 'rgba(255,225,205,0.95)'; c.beginPath(); c.ellipse(x, y - ry * 0.55, r * 1.05, ry * 0.55, 0, Math.PI, 0); c.fill(); c.lineWidth = r * 0.2; c.beginPath(); c.moveTo(x - r * 1.0, y - ry * 0.1); c.lineTo(x + r * 1.0, y - ry * 0.1); c.stroke(); }
  c.lineWidth = r * 0.2; c.beginPath(); c.moveTo(x - r * 1.0, y - ry * 0.55); c.lineTo(x - r * 1.35, y - ry * 0.85); c.stroke();
}
function rostoManga(c, x, y, t, o) {
  c.fillStyle = o.pele; c.strokeStyle = TINTA; c.lineWidth = t * 0.014; c.lineJoin = 'round';
  c.beginPath(); c.ellipse(x, y, 0.115 * t, 0.135 * t, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  if (o.cabelo) { c.fillStyle = o.cabelo; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.12 * t, 0.06 * t, 0, Math.PI, 0); c.fill(); c.stroke(); for (let i = 0; i < 5; i++) { const a = -0.08 + i * 0.04; linha(c, t, [[x + (a - 0.03) * t, y - 0.12 * t], [x + a * t, y - 0.045 * t - (i % 2) * 0.014 * t], [x + (a + 0.03) * t, y - 0.12 * t]], true); c.fill(); c.stroke(); } }
  const r = 0.034 * t, ey = y + 0.012 * t;
  [-1, 1].forEach((s) => olhoManga(c, x + s * 0.052 * t, ey, r, o.iris, o.olho, o.olhar));
  c.strokeStyle = TINTA; c.lineWidth = t * 0.011;
  const triste = o.olho === 'determinado' && o.lagrima;
  [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * 0.02 * t, ey - r * 1.9); c.lineTo(x + s * 0.085 * t, ey - r * (triste ? 1.55 : 1.8) - (o.olho === 'frio' ? 0 : 0)); c.stroke(); });
  if (o.olheiras) { c.strokeStyle = 'rgba(150,100,150,0.55)'; c.lineWidth = t * 0.008; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + s * 0.052 * t, ey + r * 0.2, r * 1.15, 0.3, Math.PI - 0.3); c.stroke(); }); }
  if (o.bochechas !== false) { c.fillStyle = 'rgba(255,125,160,0.45)'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.075 * t, y + 0.05 * t, 0.022 * t, 0.014 * t, 0, 0, 7); c.fill(); }); }
  c.fillStyle = '#c99'; c.beginPath(); c.arc(x, y + 0.045 * t, 0.004 * t, 0, 7); c.fill();
  c.strokeStyle = TINTA; c.lineWidth = t * 0.01; const my = y + 0.085 * t;
  if (o.boca === 'sorriso') { c.beginPath(); c.arc(x, my - 0.012 * t, 0.025 * t, 0.2, Math.PI - 0.2); c.stroke(); }
  else if (o.boca === 'firme') { c.beginPath(); c.moveTo(x - 0.022 * t, my); c.quadraticCurveTo(x, my + 0.012 * t, x + 0.022 * t, my - 0.004 * t); c.stroke(); }
  else if (o.boca === 'sereno') { c.beginPath(); c.arc(x, my - 0.012 * t, 0.018 * t, 0.3, Math.PI - 0.3); c.stroke(); }
  else { c.beginPath(); c.moveTo(x - 0.018 * t, my); c.lineTo(x + 0.018 * t, my); c.stroke(); }
  if (o.lagrima) { c.fillStyle = '#9fdcff'; c.beginPath(); c.moveTo(x + 0.075 * t, ey + r * 1.4); c.quadraticCurveTo(x + 0.09 * t, ey + r * 2.6, x + 0.075 * t, ey + r * 2.9); c.quadraticCurveTo(x + 0.06 * t, ey + r * 2.6, x + 0.075 * t, ey + r * 1.4); c.fill(); c.strokeStyle = '#5a9ac8'; c.lineWidth = t * 0.006; c.stroke(); }
}


// Ajudantes das cenas elementais: redemoinho de vento e floco de neve.
function vento(c, x, y, t, cor) {
  c.strokeStyle = cor; c.lineCap = 'round'; c.lineWidth = t * 0.016;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x, y, (0.2 - i * 0.045) * t, (0.045 - i * 0.01) * t, 0, Math.PI * 0.1, Math.PI * (1.4 + i * 0.1)); c.stroke(); }
  c.lineWidth = t * 0.012; [[0.2, -0.04], [-0.2, 0.0]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.022 * t, 0, Math.PI * 1.6); c.stroke(); });
}
function floco(c, x, y, r, cor) {
  c.strokeStyle = cor; c.lineWidth = Math.max(1.2, r * 0.18); c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
}


// Estilo minimalista: cartão liso e limpo, traço preto firme e um único toque de cor.
const INK = '#202026', VERMELHO = '#e63946', AMARELO = '#ffd23f', LARANJA = '#ff8a3d', VERDE = '#2fb872';
function cartaoMini(c, x, y, t, fundo) {
  const w = t * 0.98;
  c.fillStyle = fundo; retArredondado(c, x - w / 2, y - w / 2, w, w, t * 0.05); c.fill();
  c.strokeStyle = INK; c.lineWidth = t * 0.012; retArredondado(c, x - w / 2, y - w / 2, w, w, t * 0.05); c.stroke();
}
function tinta(c, t, espessura) { c.strokeStyle = INK; c.lineWidth = t * espessura; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]); }

const RETRO = [
  { valor: 'r-confeiteira', nome: 'Gatinha confeiteira', legenda: 'Parabéns para mim.', cat: 'retro', tom: 'ironico e de humor negro leve',
    ind: 'Aniversário solitário, dia ruim levado com humor e autoironia.', contra: 'Assuntos de luto ou de pessoas que não gostam de humor ácido.',
    descr: 'Uma gatinha branca de laço vermelho, chapéu de cozinheira e avental, com olhos grandes e vazios e um sorrisinho neutro, tirando do forno uma torta completamente preta e pegando fogo. Fundo de papel de carta rosa, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd6e4', '#ffeaf1', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#fff'; retArredondado(c, x - 0.17 * t, y + 0.04 * t, 0.34 * t, 0.26 * t, 0.06 * t); c.fill(); c.stroke();
      c.fillStyle = '#ffb3cb'; c.fillRect(x - 0.12 * t, y + 0.1 * t, 0.24 * t, 0.2 * t); c.strokeRect(x - 0.12 * t, y + 0.1 * t, 0.24 * t, 0.2 * t);
      c.fillStyle = '#fff'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.2 * t, y - 0.16 * t], [x + s * 0.13 * t, y - 0.3 * t], [x + s * 0.03 * t, y - 0.2 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.09 * t, 0.23 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.07 * t, y - 0.3 * t, 0.07 * t, 0, 7); c.arc(x, y - 0.34 * t, 0.08 * t, 0, 7); c.arc(x + 0.07 * t, y - 0.3 * t, 0.07 * t, 0, 7); c.fill(); c.stroke(); retArredondado(c, x - 0.1 * t, y - 0.27 * t, 0.2 * t, 0.05 * t, 0.015 * t); c.fill(); c.stroke();
      c.fillStyle = '#e63956'; linha(c, t, [[x - 0.19 * t, y - 0.2 * t], [x - 0.13 * t, y - 0.24 * t], [x - 0.13 * t, y - 0.16 * t]], true); c.fill(); linha(c, t, [[x - 0.19 * t, y - 0.2 * t], [x - 0.25 * t, y - 0.24 * t], [x - 0.25 * t, y - 0.16 * t]], true); c.fill();
      olho(c, x - 0.08 * t, y - 0.1 * t, t, 'vazio'); olho(c, x + 0.08 * t, y - 0.1 * t, t, 'vazio'); bochechas(c, x, y - 0.045 * t, t, 0.14);
      c.fillStyle = '#ffd166'; c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x - 0.03 * t, y - 0.035 * t); c.lineTo(x + 0.03 * t, y - 0.035 * t); c.stroke();
      c.fillStyle = '#2a1d17'; c.beginPath(); c.ellipse(x, y + 0.31 * t, 0.22 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#4b3a2c'; c.beginPath(); c.ellipse(x, y + 0.29 * t, 0.17 * t, 0.045 * t, 0, 0, 7); c.fill();
      chamas(c, x, y + 0.29 * t, t, 6);
      c.fillStyle = '#e63956'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.2 * t, y + 0.27 * t, 0.05 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'r-dino-birra', nome: 'Dinossauro bebê birrento', legenda: 'Não é o meu café, não é a minha paz!', cat: 'retro', tom: 'birrento e engraçado',
    ind: 'Reclamar com humor de uma segunda-feira, do café errado ou de um dia difícil.', contra: 'Assuntos sérios, de luto ou de saúde.',
    descr: 'Um dinossauro bebê verde, de fralda branca, sentado no chão com os braços cruzados e a cara de choro, mas segurando uma xícara de café com leite pela asa com muita delicadeza. Fundo de papel de carta xadrez em azul claro, com corações.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cfe8ff', '#e8f4ff', 'xadrez'); contorno(c, t);
      c.fillStyle = '#ff9aa9'; [[-0.3, -0.28], [0.3, -0.26], [-0.32, 0.22]].forEach(([a, b]) => { coracao(c, x + a * t, y + b * t, 0.035 * t); c.fill(); });
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.2 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#d4f2b8'; c.beginPath(); c.ellipse(x, y + 0.17 * t, 0.12 * t, 0.12 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y + 0.27 * t, 0.17 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x - 0.2 * t, y + 0.3 * t, 0.07 * t, 0.045 * t, 0.3, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.2 * t, y + 0.3 * t, 0.07 * t, 0.045 * t, -0.3, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.22 * t, 0.2 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#ff9f4a'; const topo = (a) => -0.1 - 0.2 * Math.sqrt(Math.max(0, 1 - (a / 0.22) ** 2)); [-0.12, 0, 0.12].forEach((a) => { linha(c, t, [[x + (a - 0.04) * t, y + (topo(a - 0.04) + 0.02) * t], [x + a * 1.12 * t, y + (topo(a) - 0.085) * t], [x + (a + 0.04) * t, y + (topo(a + 0.04) + 0.02) * t]], true); c.fill(); c.stroke(); });
      olho(c, x - 0.09 * t, y - 0.12 * t, t, 'chora'); olho(c, x + 0.09 * t, y - 0.12 * t, t, 'chora'); bochechas(c, x, y - 0.06 * t, t, 0.15);
      c.beginPath(); c.moveTo(x - 0.07 * t, y - 0.02 * t); c.quadraticCurveTo(x, y - 0.075 * t, x + 0.07 * t, y - 0.02 * t); c.stroke();
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x - 0.13 * t, y + 0.12 * t, 0.12 * t, 0.045 * t, 0.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.03 * t, y + 0.11 * t, 0.12 * t, 0.045 * t, -0.2, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; retArredondado(c, x + 0.17 * t, y + 0.05 * t, 0.12 * t, 0.11 * t, 0.03 * t); c.fill(); c.stroke(); c.fillStyle = '#c98f5f'; c.fillRect(x + 0.18 * t, y + 0.06 * t, 0.1 * t, 0.03 * t);
      c.beginPath(); c.arc(x + 0.31 * t, y + 0.1 * t, 0.035 * t, -1.4, 1.4); c.stroke();
    } },
  { valor: 'r-ursinhos', nome: 'Dois ursinhos, um zangado', legenda: 'Respire fundo e ature.', cat: 'retro', tom: 'paciente e bem-humorado',
    ind: 'Falar de amizade, de convivência difícil e de paciência com quem a gente ama.', contra: 'Assuntos sérios ou de conflito de verdade.',
    descr: 'Dois ursinhos de pelúcia em cores pastel, abraçados. O rosa está de careta, revirando os olhos e esmagando a bochecha do azul com força demais, enquanto o azul sorri, completamente alheio. Fundo de papel de carta lilás, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e6d9ff', '#f3ecff', 'bolinhas'); contorno(c, t);
      const urso = (cx, cy, cor, pele, claro) => { c.fillStyle = cor; [-1, 1].forEach((s) => { c.beginPath(); c.arc(cx + s * 0.11 * t, cy - 0.12 * t, 0.045 * t, 0, 7); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(cx, cy + 0.1 * t, 0.12 * t, 0.13 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = claro; c.beginPath(); c.ellipse(cx, cy + 0.12 * t, 0.07 * t, 0.08 * t, 0, 0, 7); c.fill(); c.fillStyle = cor; c.beginPath(); c.ellipse(cx, cy - 0.04 * t, 0.14 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = claro; c.beginPath(); c.ellipse(cx, cy, 0.05 * t, 0.038 * t, 0, 0, 7); c.fill(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(cx, cy - 0.012 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); };
      urso(x - 0.14 * t, y + 0.02 * t, '#ffb3d1', '#ffb3d1', '#ffe3ee');
      urso(x + 0.14 * t, y + 0.02 * t, '#a9d6ff', '#a9d6ff', '#e3f2ff');
      c.fillStyle = '#ff7aa8'; coracao(c, x - 0.14 * t, y + 0.13 * t, 0.03 * t); c.fill(); c.fillStyle = '#ffd166'; estrela(c, x + 0.14 * t, y + 0.13 * t, 0.032 * t, 0.014 * t); c.fill();
      olho(c, x - 0.2 * t, y - 0.07 * t, t, 'cima', '#ffb3d1'); olho(c, x - 0.09 * t, y - 0.07 * t, t, 'cima', '#ffb3d1');
      c.beginPath(); c.moveTo(x - 0.175 * t, y + 0.055 * t); c.quadraticCurveTo(x - 0.14 * t, y + 0.036 * t, x - 0.105 * t, y + 0.055 * t); c.stroke();
      olho(c, x + 0.1 * t, y - 0.07 * t, t, 'ponto'); olho(c, x + 0.19 * t, y - 0.07 * t, t, 'ponto'); bochechas(c, x + 0.145 * t, y - 0.03 * t, t, 0.08, 0.026);
      c.beginPath(); c.arc(x + 0.145 * t, y + 0.03 * t, 0.02 * t, 0.15, Math.PI - 0.15); c.stroke();
      c.fillStyle = '#ffb3d1'; c.beginPath(); c.ellipse(x + 0.0 * t, y + 0.05 * t, 0.075 * t, 0.032 * t, -0.15, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-gato-juiz', nome: 'Gato laranja juiz', legenda: 'Sua opinião foi anotada... e incinerada.', cat: 'retro', tom: 'preguiçoso e ácido',
    ind: 'Responder a críticas, opiniões não pedidas e conselhos demais, com humor.', contra: 'Conversas em que a opinião do outro importa de verdade.',
    descr: 'Um gato laranja, gordo e preguiçoso, sentado numa cadeira de balanço, com óculos de leitura na ponta do nariz e uma prancheta com uma lista de erros dos outros. Ele olha por cima dos óculos com o pior julgamento possível. Fundo de papel de carta amarelo claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#fff0b8', '#fff8dc', 'xadrez'); contorno(c, t);
      c.strokeStyle = '#a0683a'; c.lineWidth = t * 0.03; c.beginPath(); c.arc(x, y + 0.2 * t, 0.26 * t, 0.15, Math.PI - 0.15); c.stroke(); c.beginPath(); c.moveTo(x - 0.22 * t, y + 0.05 * t); c.lineTo(x - 0.25 * t, y + 0.27 * t); c.stroke(); contorno(c, t);
      c.fillStyle = '#ffa84a'; c.beginPath(); c.ellipse(x, y + 0.12 * t, 0.21 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe2b3'; c.beginPath(); c.ellipse(x, y + 0.16 * t, 0.12 * t, 0.11 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ffa84a'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.2 * t, y - 0.12 * t], [x + s * 0.16 * t, y - 0.27 * t], [x + s * 0.06 * t, y - 0.19 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.07 * t, 0.22 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#d97b1f'; c.lineWidth = t * 0.02; [[-0.05, -0.23, -0.05, -0.17], [0.02, -0.23, 0.02, -0.17], [0.09, -0.22, 0.08, -0.17]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); }); contorno(c, t);
      olho(c, x - 0.085 * t, y - 0.08 * t, t, 'meio', '#ffa84a'); olho(c, x + 0.085 * t, y - 0.08 * t, t, 'meio', '#ffa84a');
      c.fillStyle = '#ffe2b3'; c.beginPath(); c.ellipse(x, y - 0.02 * t, 0.07 * t, 0.045 * t, 0, 0, 7); c.fill(); c.fillStyle = '#ff8fa3'; c.beginPath(); c.ellipse(x, y - 0.035 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(x - 0.03 * t, y - 0.005 * t); c.lineTo(x + 0.03 * t, y - 0.005 * t); c.stroke();
      c.lineWidth = t * 0.01; c.beginPath(); c.arc(x - 0.085 * t, y - 0.055 * t, 0.048 * t, 0, 7); c.stroke(); c.beginPath(); c.arc(x + 0.085 * t, y - 0.055 * t, 0.048 * t, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 0.037 * t, y - 0.06 * t); c.lineTo(x + 0.037 * t, y - 0.06 * t); c.stroke(); contorno(c, t);
      c.fillStyle = '#fff'; c.save(); c.translate(x + 0.18 * t, y + 0.12 * t); c.rotate(0.15); c.fillRect(-0.07 * t, -0.1 * t, 0.14 * t, 0.2 * t); c.strokeRect(-0.07 * t, -0.1 * t, 0.14 * t, 0.2 * t); c.strokeStyle = '#a0a8b0'; c.lineWidth = t * 0.008; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-0.045 * t, (-0.07 + i * 0.035) * t); c.lineTo(0.045 * t, (-0.07 + i * 0.035) * t); c.stroke(); } c.strokeStyle = '#e63946'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(-0.05 * t, -0.075 * t); c.lineTo(-0.035 * t, -0.06 * t); c.moveTo(-0.035 * t, -0.075 * t); c.lineTo(-0.05 * t, -0.06 * t); c.stroke(); c.restore(); contorno(c, t);
      c.fillStyle = '#ffa84a'; c.beginPath(); c.ellipse(x + 0.13 * t, y + 0.1 * t, 0.04 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-persa-lotus', nome: 'Gatinho persa em lótus', legenda: 'Muita luz na sua vida... bem longe de mim.', cat: 'retro', tom: 'zen de araque e debochado',
    ind: 'Falar de paz interior com humor, de limites e de gente de que a gente prefere ficar longe.', contra: 'Assuntos espirituais tratados com seriedade, meditação de verdade e luto.',
    descr: 'Um gatinho persa branco, bem redondo e de pelo macio, sentado em posição de lótus, com as patinhas cruzadas e uma auréola dourada sobre a cabeça. A carinha é o oposto da paz: olhos meio fechados de julgamento, bigodes tremendo de raiva escondida e um sorriso cínico de canto de boca. Fundo de papel de carta rosa e lilás, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffe0f0', '#f4e8ff', 'bolinhas'); contorno(c, t);
      c.strokeStyle = '#f2b705'; c.lineWidth = t * 0.025; c.beginPath(); c.ellipse(x, y - 0.29 * t, 0.12 * t, 0.032 * t, 0, 0, 7); c.stroke(); contorno(c, t);
      const pelo = (cx, cy, rx, ry, n) => { c.beginPath(); for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, f = i % 2 ? 0.93 : 1.07; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f); } c.closePath(); };
      c.fillStyle = '#fff'; pelo(x, y + 0.17 * t, 0.2 * t, 0.15 * t, 16); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.1 * t, y + 0.27 * t, 0.07 * t, 0.04 * t, s * 0.3, 0, 7); c.fill(); c.stroke(); });
      [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.19 * t, y - 0.12 * t], [x + s * 0.16 * t, y - 0.24 * t], [x + s * 0.07 * t, y - 0.19 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#ffc2d6'; linha(c, t, [[x + s * 0.165 * t, y - 0.14 * t], [x + s * 0.15 * t, y - 0.21 * t], [x + s * 0.1 * t, y - 0.18 * t]], true); c.fill(); c.fillStyle = '#fff'; });
      pelo(x, y - 0.05 * t, 0.22 * t, 0.17 * t, 18); c.fill(); c.stroke();
      olho(c, x - 0.085 * t, y - 0.06 * t, t, 'meio', '#fff'); olho(c, x + 0.085 * t, y - 0.06 * t, t, 'meio', '#fff'); bochechas(c, x, y - 0.01 * t, t, 0.15);
      c.fillStyle = '#ffa6bf'; c.beginPath(); c.ellipse(x, y - 0.02 * t, 0.011 * t, 0.008 * t, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x - 0.035 * t, y + 0.015 * t); c.quadraticCurveTo(x, y + 0.01 * t, x + 0.04 * t, y - 0.005 * t); c.stroke();
      c.lineWidth = t * 0.008; [-1, 1].forEach((s) => { [0, 1].forEach((k) => { c.beginPath(); c.moveTo(x + s * 0.06 * t, y + (0.0 + k * 0.025) * t); for (let i = 1; i <= 4; i++) c.lineTo(x + s * (0.06 + i * 0.035) * t, y + (0.0 + k * 0.03 + (i % 2 ? -0.008 : 0.008)) * t); c.stroke(); }); }); contorno(c, t);
    } },
  { valor: 'j-peao', nome: 'Peão de xadrez e sua sombra de rainha', legenda: 'Cada passo dado é a promessa de um destino inteiro.', cat: 'jogos', tom: 'determinado e poético',
    ind: 'Começo de um projeto, mudança de vida, motivação e primeiros passos.', contra: 'Assuntos de humor leve ou de festa.',
    descr: 'Um peão de xadrez de madeira escura, polida, com marcas de uso, olhando para frente com firmeza, cercado de estrelinhas douradas, sobre um fundo cor de pergaminho. Sua sombra comprida no chão vira a silhueta imponente de uma rainha.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f2e2bf', '#fbf1d9', 'liso'); contorno(c, t);
      c.fillStyle = 'rgba(70,45,30,0.35)'; c.beginPath(); c.moveTo(x + 0.04 * t, y + 0.3 * t); c.lineTo(x + 0.3 * t, y + 0.3 * t); c.lineTo(x + 0.28 * t, y + 0.22 * t); c.quadraticCurveTo(x + 0.22 * t, y + 0.2 * t, x + 0.25 * t, y + 0.12 * t); c.lineTo(x + 0.3 * t, y + 0.06 * t); c.lineTo(x + 0.26 * t, y + 0.03 * t); c.lineTo(x + 0.22 * t, y + 0.08 * t); c.lineTo(x + 0.2 * t, y + 0.02 * t); c.lineTo(x + 0.16 * t, y + 0.08 * t); c.lineTo(x + 0.14 * t, y + 0.14 * t); c.quadraticCurveTo(x + 0.1 * t, y + 0.2 * t, x + 0.1 * t, y + 0.3 * t); c.closePath(); c.fill();
      c.fillStyle = '#7a4a2a'; c.beginPath(); c.ellipse(x - 0.08 * t, y + 0.28 * t, 0.15 * t, 0.045 * t, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 0.17 * t, y + 0.26 * t); c.quadraticCurveTo(x - 0.15 * t, y + 0.08 * t, x - 0.12 * t, y - 0.02 * t); c.lineTo(x - 0.04 * t, y - 0.02 * t); c.quadraticCurveTo(x - 0.01 * t, y + 0.08 * t, x + 0.01 * t, y + 0.26 * t); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(x - 0.08 * t, y - 0.02 * t, 0.1 * t, 0.028 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(x - 0.08 * t, y - 0.1 * t, 0.07 * t, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,220,170,0.45)'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x - 0.11 * t, y + 0.23 * t); c.lineTo(x - 0.1 * t, y + 0.02 * t); c.stroke(); c.beginPath(); c.arc(x - 0.095 * t, y - 0.105 * t, 0.045 * t, 3.6, 4.7); c.stroke(); contorno(c, t);
      c.fillStyle = '#f2b705'; [[-0.28, -0.22, 0.04], [0.04, -0.28, 0.03], [0.26, -0.12, 0.045], [-0.3, 0.06, 0.03]].forEach(([a, b, r]) => { estrela(c, x + a * t, y + b * t, r * t, r * t * 0.42); c.fill(); });
    } },
  { valor: 'g-d20-critico', nome: 'Dado de vinte lados, vinte natural', legenda: 'Viciando em ampliar expectativas.', cat: 'rpg', tom: 'triunfante e empolgado',
    ind: 'Comemorar um acerto, uma conquista ou um golpe de sorte, e falar de ambição.', contra: 'Assuntos de perda ou de humildade.',
    descr: 'Um dado de vinte lados, azul e brilhante, mostrando o número vinte em dourado, com uma aura dourada e fogos de artifício coloridos em volta. Fundo de papel de carta azul noite, com estrelinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c9d6ff', '#27346b', 'liso'); contorno(c, t);
      const g = c.createRadialGradient(x, y, 0, x, y, t * 0.42); g.addColorStop(0, 'rgba(255,225,120,0.9)'); g.addColorStop(1, 'rgba(255,225,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, t * 0.42, 0, 7); c.fill();
      [['#ff5a8a', -0.26, -0.24], ['#5ad2ff', 0.27, -0.22], ['#7dff9a', -0.27, 0.23], ['#ffd23f', 0.26, 0.25]].forEach(([cor, a, b]) => { c.strokeStyle = cor; c.lineWidth = t * 0.012; for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + a * t + Math.cos(ang) * t * 0.025, y + b * t + Math.sin(ang) * t * 0.025); c.lineTo(x + a * t + Math.cos(ang) * t * 0.07, y + b * t + Math.sin(ang) * t * 0.07); c.stroke(); } });
      contorno(c, t);
      c.fillStyle = '#3d6bff'; linha(c, t, [[x, y - 0.22 * t], [x + 0.2 * t, y - 0.11 * t], [x + 0.2 * t, y + 0.11 * t], [x, y + 0.22 * t], [x - 0.2 * t, y + 0.11 * t], [x - 0.2 * t, y - 0.11 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#6f92ff'; linha(c, t, [[x, y - 0.14 * t], [x + 0.13 * t, y + 0.07 * t], [x - 0.13 * t, y + 0.07 * t]], true); c.fill();
      c.strokeStyle = '#a9bcff'; c.lineWidth = t * 0.008; [[0, -0.22, 0, -0.14], [0.2, -0.11, 0.13, 0.07], [-0.2, -0.11, -0.13, 0.07], [0.2, 0.11, 0.13, 0.07], [-0.2, 0.11, -0.13, 0.07], [0, 0.22, 0, 0.07]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); });
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#8a5a00'; c.lineWidth = t * 0.008; c.font = `800 ${t * 0.14}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('20', x, y - 0.0 * t); c.fillText('20', x, y - 0.0 * t);
    } },
  { valor: 'g-mimic', nome: 'Baú que é um monstro', legenda: 'Eu tenho... opiniões.', cat: 'rpg', tom: 'sarcástico e travesso',
    ind: 'Avisar, com humor, que por trás de uma cara tranquila há muito a dizer.', contra: 'Conversas delicadas em que a pessoa precisa de acolhimento.',
    descr: 'Um baú de tesouro de madeira com tiras de metal e fechadura dourada, que parece normal, mas está aberto revelando uma boca escura, sem dentes e sem língua, com só dois olhinhos amarelos. Fundo de papel de carta verde claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d9f5d0', '#eefbe8', 'xadrez'); contorno(c, t);
      c.fillStyle = '#a0683a'; retArredondado(c, x - 0.22 * t, y + 0.0 * t, 0.44 * t, 0.26 * t, 0.03 * t); c.fill(); c.stroke();
      c.fillStyle = '#8c8c94'; c.fillRect(x - 0.22 * t, y + 0.06 * t, 0.44 * t, 0.035 * t); c.strokeRect(x - 0.22 * t, y + 0.06 * t, 0.44 * t, 0.035 * t);
      c.fillStyle = '#f2b705'; retArredondado(c, x - 0.035 * t, y + 0.05 * t, 0.07 * t, 0.07 * t, 0.012 * t); c.fill(); c.stroke();
      c.fillStyle = '#7a4a2a'; c.beginPath(); c.moveTo(x - 0.22 * t, y + 0.0 * t); c.lineTo(x - 0.22 * t, y - 0.16 * t); c.quadraticCurveTo(x, y - 0.38 * t, x + 0.22 * t, y - 0.16 * t); c.lineTo(x + 0.22 * t, y + 0.0 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#2a1d17'; c.beginPath(); c.moveTo(x - 0.19 * t, y - 0.03 * t); c.lineTo(x - 0.19 * t, y - 0.14 * t); c.quadraticCurveTo(x, y - 0.33 * t, x + 0.19 * t, y - 0.14 * t); c.lineTo(x + 0.19 * t, y - 0.03 * t); c.closePath(); c.fill();
      [-1, 1].forEach((s) => { c.fillStyle = '#ffe14d'; c.beginPath(); c.ellipse(x + s * 0.06 * t, y - 0.19 * t, 0.026 * t, 0.032 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(x + s * 0.06 * t, y - 0.185 * t, 0.009 * t, 0, 7); c.fill(); });
      c.fillStyle = '#5ad2ff'; c.beginPath(); c.moveTo(x + 0.14 * t, y + 0.0 * t); c.quadraticCurveTo(x + 0.17 * t, y + 0.06 * t, x + 0.14 * t, y + 0.07 * t); c.quadraticCurveTo(x + 0.11 * t, y + 0.06 * t, x + 0.14 * t, y + 0.0 * t); c.fill();
    } },
  { valor: 'r-dino-frigideira', nome: 'Dinossauro bebê com frigideira', legenda: 'Não é a mamãe, e eu não me importo!', cat: 'retro', tom: 'abusado e levado',
    ind: 'Dar uma resposta atrevida com humor, brincando com teimosia e provocação.', contra: 'Conversas em que a provocação possa magoar de verdade.',
    descr: 'Um dinossauro bebê verde, de fralda branca volumosa, em pé com as pernas abertas, segurando uma frigideira no ar com as duas mãos e mostrando a língua numa careta de deboche. Fundo de papel de carta laranja claro, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffddc2', '#fff1e3', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x - 0.1 * t, y + 0.3 * t, 0.07 * t, 0.045 * t, 0.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.1 * t, y + 0.3 * t, 0.07 * t, 0.045 * t, -0.2, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#d4f2b8'; c.beginPath(); c.ellipse(x, y + 0.15 * t, 0.1 * t, 0.11 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y + 0.26 * t, 0.17 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#7dcf62'; c.beginPath(); c.ellipse(x, y - 0.08 * t, 0.2 * t, 0.18 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#ff9f4a'; [-0.1, 0, 0.1].forEach((a) => { linha(c, t, [[x + a * t - 0.035 * t, y - 0.24 * t], [x + a * t, y - 0.31 * t], [x + a * t + 0.035 * t, y - 0.24 * t]], true); c.fill(); c.stroke(); });
      c.strokeStyle = TINTA; c.lineWidth = t * 0.014; olho(c, x - 0.08 * t, y - 0.1 * t, t, 'ponto'); olho(c, x + 0.08 * t, y - 0.1 * t, t, 'ponto');
      c.beginPath(); c.moveTo(x - 0.12 * t, y - 0.15 * t); c.lineTo(x - 0.04 * t, y - 0.12 * t); c.moveTo(x + 0.12 * t, y - 0.15 * t); c.lineTo(x + 0.04 * t, y - 0.12 * t); c.stroke();
      bochechas(c, x, y - 0.045 * t, t, 0.14);
      c.fillStyle = '#7a2e3a'; c.beginPath(); c.ellipse(x, y - 0.03 * t, 0.06 * t, 0.035 * t, 0, 0, Math.PI); c.fill(); c.stroke(); c.fillStyle = '#ff7a98'; c.beginPath(); c.ellipse(x, y + 0.0 * t, 0.032 * t, 0.032 * t, 0, 0, Math.PI); c.fill(); c.stroke();
      c.fillStyle = '#7dcf62'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.16 * t, y - 0.12 * t, 0.045 * t, 0.1 * t, s * 0.6, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#3d3d44'; c.beginPath(); c.arc(x, y - 0.33 * t, 0.1 * t, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#5a5a63'; c.beginPath(); c.arc(x, y - 0.33 * t, 0.075 * t, 0, 7); c.fill();
      c.fillStyle = '#8a5a2b'; c.fillRect(x - 0.012 * t, y - 0.23 * t, 0.024 * t, 0.07 * t);
    } },
  { valor: 'r-gato-rede', nome: 'Gato laranja entediado na rede', legenda: 'Mais uma segunda-feira inútil. Que tédio.', cat: 'retro', tom: 'preguiçoso e entediado',
    ind: 'Falar de segunda-feira, de falta de vontade e de dias parados, com humor.', contra: 'Assuntos de motivação, de foco ou de trabalho sério.',
    descr: 'Um gato laranja, gordo e preguiçoso, deitado de barriga para cima numa rede invisível, com uma pata atrás da cabeça e os olhos semicerrados de tédio. Ao lado, flutua um prato de lasanha já vazio com um garfo. Fundo de papel de carta amarelo claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffe9bd', '#fff8e3', 'xadrez'); contorno(c, t);
      c.strokeStyle = 'rgba(160,104,58,0.55)'; c.lineWidth = t * 0.012; c.setLineDash([t * 0.025, t * 0.02]); c.beginPath(); c.moveTo(x - 0.3 * t, y - 0.12 * t); c.quadraticCurveTo(x, y + 0.34 * t, x + 0.3 * t, y - 0.12 * t); c.stroke(); c.setLineDash([]); contorno(c, t);
      // gato deitado: rabo, corpo, patas, orelhas encaixadas na cabeça redonda e cara de tédio
      const LAR = '#ffa84a', ESC = '#d97b1f';
      c.lineCap = 'round'; c.strokeStyle = TINTA; c.lineWidth = t * 0.058; c.beginPath(); c.moveTo(x + 0.26 * t, y + 0.13 * t); c.quadraticCurveTo(x + 0.4 * t, y + 0.14 * t, x + 0.36 * t, y + 0.0 * t); c.stroke();
      c.strokeStyle = LAR; c.lineWidth = t * 0.036; c.beginPath(); c.moveTo(x + 0.26 * t, y + 0.13 * t); c.quadraticCurveTo(x + 0.4 * t, y + 0.14 * t, x + 0.36 * t, y + 0.0 * t); c.stroke(); contorno(c, t);
      c.fillStyle = LAR; c.beginPath(); c.ellipse(x + 0.07 * t, y + 0.12 * t, 0.25 * t, 0.115 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#ffe2b3'; c.beginPath(); c.ellipse(x + 0.09 * t, y + 0.155 * t, 0.16 * t, 0.055 * t, 0, 0, 7); c.fill();
      c.strokeStyle = ESC; c.lineWidth = t * 0.018; [0.02, 0.08, 0.14].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y + 0.015 * t); c.lineTo(x + (a - 0.005) * t, y + 0.06 * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = LAR; [[-0.1, 0.205], [0.0, 0.215]].forEach(([a, b2]) => { c.beginPath(); c.ellipse(x + a * t, y + b2 * t, 0.055 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke(); });
      const cx = x - 0.2 * t, cy = y - 0.01 * t, rx = 0.15 * t, ry = 0.125 * t, pt = (g, k) => [cx + rx * k * Math.cos(g * Math.PI / 180), cy - ry * k * Math.sin(g * Math.PI / 180)];
      [[150, 105, 128], [75, 30, 52]].forEach(([g1, g2, g3]) => {
        c.fillStyle = LAR; linha(c, t, [pt(g1, 0.93), pt(g3, 1.55), pt(g2, 0.93)], true); c.fill(); c.stroke();
        c.fillStyle = '#ffb3c4'; linha(c, t, [pt(g1 - (g1 > g2 ? 6 : -6), 0.9), pt(g3, 1.3), pt(g2 + (g1 > g2 ? 6 : -6), 0.9)], true); c.fill();
      });
      c.fillStyle = LAR; contorno(c, t); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = ESC; c.lineWidth = t * 0.016; [-0.025, 0, 0.025].forEach((a) => { c.beginPath(); c.moveTo(cx + a * t, cy - ry + t * 0.005); c.lineTo(cx + a * t * 0.9, cy - ry + t * 0.045); c.stroke(); }); contorno(c, t);
      olho(c, cx - 0.06 * t, cy - 0.015 * t, t, 'meio', LAR); olho(c, cx + 0.06 * t, cy - 0.015 * t, t, 'meio', LAR);
      c.fillStyle = '#ff8fa3'; linha(c, t, [[cx - 0.014 * t, cy + 0.025 * t], [cx + 0.014 * t, cy + 0.025 * t], [cx, cy + 0.04 * t]], true); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(cx - 0.03 * t, cy + 0.06 * t); c.lineTo(cx + 0.03 * t, cy + 0.06 * t); c.stroke();
      c.lineWidth = t * 0.007; [-1, 1].forEach((sd) => [-0.012, 0.01].forEach((d) => { c.beginPath(); c.moveTo(cx + sd * 0.08 * t, cy + (0.035 + d) * t); c.lineTo(cx + sd * 0.17 * t, cy + (0.025 + d * 2.2) * t); c.stroke(); })); contorno(c, t);
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + 0.2 * t, y - 0.24 * t, 0.12 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#e8623a'; c.beginPath(); c.ellipse(x + 0.17 * t, y - 0.245 * t, 0.045 * t, 0.015 * t, 0, 0, 7); c.fill(); c.fillStyle = '#ffd166'; c.beginPath(); c.ellipse(x + 0.24 * t, y - 0.25 * t, 0.03 * t, 0.012 * t, 0, 0, 7); c.fill();
      c.strokeStyle = TINTA; c.beginPath(); c.moveTo(x + 0.11 * t, y - 0.3 * t); c.lineTo(x + 0.2 * t, y - 0.275 * t); c.stroke();
    } },
  { valor: 'r-ursinhos-abraco', nome: 'Dois ursinhos abraçados', legenda: 'Amizade verdadeira é um abraço que acalma a alma.', cat: 'retro', tom: 'doce e acolhedor',
    ind: 'Agradecer a um amigo, falar de acolhimento, de carinho e de apoio.', contra: 'Assuntos de crítica ou de afastamento.',
    descr: 'Dois ursinhos de pelúcia em cores pastel, um rosa e um azul, abraçados bem apertadinho, de olhos fechados de tanto afeto, com uma auréola de corações flutuando acima deles. Fundo de papel de carta lilás, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ead9ff', '#f6efff', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#ff8fb5'; [[-0.12, -0.27, 0.04], [0.0, -0.31, 0.05], [0.12, -0.27, 0.04], [-0.2, -0.2, 0.026], [0.2, -0.2, 0.026]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.fill(); });
      const urso = (cx, cor, claro) => { c.fillStyle = cor; [-1, 1].forEach((s) => { c.beginPath(); c.arc(cx + s * 0.11 * t, y - 0.12 * t, 0.045 * t, 0, 7); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(cx, y + 0.12 * t, 0.13 * t, 0.14 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = claro; c.beginPath(); c.ellipse(cx, y + 0.14 * t, 0.075 * t, 0.085 * t, 0, 0, 7); c.fill(); c.fillStyle = cor; c.beginPath(); c.ellipse(cx, y - 0.03 * t, 0.14 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = claro; c.beginPath(); c.ellipse(cx, y + 0.01 * t, 0.05 * t, 0.038 * t, 0, 0, 7); c.fill(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(cx, y - 0.003 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); };
      urso(x - 0.1 * t, '#ffb3d1', '#ffe3ee'); urso(x + 0.1 * t, '#a9d6ff', '#e3f2ff');
      c.fillStyle = '#ff7aa8'; coracao(c, x - 0.1 * t, y + 0.15 * t, 0.028 * t); c.fill(); c.fillStyle = '#ffd166'; estrela(c, x + 0.1 * t, y + 0.15 * t, 0.03 * t, 0.013 * t); c.fill();
      [[-0.15, -0.04], [-0.06, -0.04], [0.06, -0.04], [0.15, -0.04]].forEach(([a, b]) => olho(c, x + a * t, y + b * t, t, 'fechado')); bochechas(c, x - 0.105 * t, y + 0.0 * t, t, 0.1, 0.026); bochechas(c, x + 0.105 * t, y + 0.0 * t, t, 0.1, 0.026);
      c.beginPath(); c.arc(x - 0.1 * t, y + 0.03 * t, 0.02 * t, 0.2, Math.PI - 0.2); c.stroke(); c.beginPath(); c.arc(x + 0.1 * t, y + 0.03 * t, 0.02 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#ffb3d1'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.09 * t, 0.14 * t, 0.032 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#a9d6ff'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.115 * t, 0.14 * t, 0.026 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-gato-domingo', nome: 'Gato laranja sonhando acordado', legenda: 'Domingo bom é dia de preguicinha e carinho.', cat: 'retro', tom: 'preguiçoso e carinhoso',
    ind: 'Falar de descanso, de domingo, de autocuidado e de pequenos prazeres.', contra: 'Assuntos de trabalho, de pressa ou de cobrança.',
    descr: 'Um gato laranja, gordo, deitado de barriga para cima, sonhando acordado com corações flutuando ao redor da cabeça, segurando um ursinho de pelúcia com uma patinha e um pedaço de torta fumegante com a outra, com um sorriso tranquilo. Fundo de papel de carta rosa claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd9e5', '#fff0f5', 'xadrez'); contorno(c, t);
      c.fillStyle = '#ff7aa8'; [[-0.2, -0.25, 0.04], [0.02, -0.3, 0.05], [0.2, -0.22, 0.035], [-0.07, -0.19, 0.025]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.fill(); });
      c.fillStyle = '#ffa84a'; c.beginPath(); c.ellipse(x + 0.03 * t, y + 0.14 * t, 0.26 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe2b3'; c.beginPath(); c.ellipse(x + 0.05 * t, y + 0.16 * t, 0.18 * t, 0.07 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ffa84a'; c.beginPath(); c.ellipse(x - 0.17 * t, y + 0.28 * t, 0.07 * t, 0.035 * t, 0.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.24 * t, y + 0.28 * t, 0.07 * t, 0.035 * t, -0.2, 0, 7); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.17 * t, y - 0.08 * t], [x + s * 0.14 * t, y - 0.21 * t], [x + s * 0.05 * t, y - 0.14 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.03 * t, 0.2 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#d97b1f'; c.lineWidth = t * 0.02; [-0.05, 0.0, 0.05].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y - 0.17 * t); c.lineTo(x + a * t, y - 0.12 * t); c.stroke(); }); contorno(c, t);
      olho(c, x - 0.08 * t, y - 0.04 * t, t, 'fechado'); olho(c, x + 0.08 * t, y - 0.04 * t, t, 'fechado'); bochechas(c, x, y + 0.0 * t, t, 0.14);
      c.fillStyle = '#ffe2b3'; c.beginPath(); c.ellipse(x, y + 0.01 * t, 0.06 * t, 0.04 * t, 0, 0, 7); c.fill(); c.fillStyle = '#ff8fa3'; c.beginPath(); c.ellipse(x, y - 0.004 * t, 0.011 * t, 0.008 * t, 0, 0, 7); c.fill(); c.beginPath(); c.arc(x, y + 0.01 * t, 0.025 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#c98f5f'; c.beginPath(); c.arc(x - 0.2 * t, y + 0.1 * t, 0.06 * t, 0, 7); c.fill(); c.stroke(); [-1, 1].forEach((s) => { c.beginPath(); c.arc(x - 0.2 * t + s * 0.045 * t, y + 0.055 * t, 0.025 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffd9a0'; linha(c, t, [[x + 0.15 * t, y + 0.06 * t], [x + 0.3 * t, y + 0.1 * t], [x + 0.17 * t, y + 0.14 * t]], true); c.fill(); c.stroke(); c.strokeStyle = 'rgba(160,160,170,0.8)'; c.lineWidth = t * 0.012; [0.19, 0.24].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y + 0.04 * t); c.quadraticCurveTo(x + (a - 0.03) * t, y - 0.01 * t, x + a * t, y - 0.05 * t); c.stroke(); }); contorno(c, t);
    } },
  { valor: 'r-menina-margarida', nome: 'Menina arrancando as pétalas da margarida', legenda: 'Me ama, não me ama... vai catar coquinhos.', cat: 'retro', tom: 'romântico e bravo',
    ind: 'Falar de desilusão amorosa, de paciência esgotada e de virar a página, com humor.', contra: 'Assuntos de luto ou de relações em sofrimento real.',
    descr: 'Uma menininha de touca florida e vestido de camponesa num campo de flores silvestres, em cores suaves de aquarela. Em vez de colher flores com paz, ela arranca as pétalas de uma margarida com uma expressão de pura raiva e impaciência, e as pétalas voam. Fundo de papel de carta verde claro, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d8f1dc', '#f0faf1', 'bolinhas'); contorno(c, t);
      ['#ff9ab5', '#ffd166', '#c9a0ff', '#fff'].forEach((cor, k) => { for (let i = 0; i < 4; i++) { const fx = x + (-0.3 + i * 0.2 + k * 0.03) * t, fy = y + (0.3 + (k % 2) * 0.03) * t; c.strokeStyle = '#6fbf73'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(fx, fy + 0.04 * t); c.lineTo(fx, fy); c.stroke(); c.fillStyle = cor; c.beginPath(); c.arc(fx, fy, t * 0.022, 0, 7); c.fill(); c.fillStyle = '#ffd166'; c.beginPath(); c.arc(fx, fy, t * 0.008, 0, 7); c.fill(); } });
      contorno(c, t);
      c.fillStyle = '#fff5e0'; linha(c, t, [[x - 0.12 * t, y + 0.04 * t], [x + 0.12 * t, y + 0.04 * t], [x + 0.2 * t, y + 0.3 * t], [x - 0.2 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffc2d6'; linha(c, t, [[x - 0.09 * t, y + 0.1 * t], [x + 0.09 * t, y + 0.1 * t], [x + 0.13 * t, y + 0.3 * t], [x - 0.13 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffe0c8'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.15 * t, 0.14 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#8a5a3a'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.15 * t, y - 0.02 * t, 0.03 * t, 0.08 * t, s * 0.1, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffd1e0'; c.beginPath(); c.arc(x, y - 0.17 * t, 0.15 * t, Math.PI, 0); c.fill(); c.stroke(); c.fillStyle = '#ff7aa8'; [[-0.08, -0.22], [0.0, -0.25], [0.08, -0.22]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.02 * t, 0, 7); c.fill(); });
      c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.15 * t); c.lineTo(x - 0.03 * t, y - 0.12 * t); c.moveTo(x + 0.1 * t, y - 0.15 * t); c.lineTo(x + 0.03 * t, y - 0.12 * t); c.stroke();
      olho(c, x - 0.065 * t, y - 0.095 * t, t, 'ponto'); olho(c, x + 0.065 * t, y - 0.095 * t, t, 'ponto'); bochechas(c, x, y - 0.05 * t, t, 0.1, 0.028);
      c.beginPath(); c.moveTo(x - 0.04 * t, y - 0.03 * t); c.lineTo(x + 0.04 * t, y - 0.03 * t); c.stroke(); c.lineWidth = t * 0.008; [-0.02, 0.0, 0.02].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y - 0.035 * t); c.lineTo(x + a * t, y - 0.025 * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#ffe0c8'; c.beginPath(); c.ellipse(x + 0.14 * t, y + 0.06 * t, 0.04 * t, 0.025 * t, -0.5, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#6fbf73'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x + 0.15 * t, y + 0.05 * t); c.lineTo(x + 0.22 * t, y - 0.07 * t); c.stroke();
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(x + 0.22 * t, y - 0.09 * t, 0.02 * t, 0, 7); c.fill(); c.fillStyle = '#fff'; [[0.25, -0.15, 0.4], [0.18, -0.16, 1.2], [0.28, -0.07, 2.1], [0.3, -0.22, 0.2], [0.12, -0.2, 0.9]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.025 * t, 0.012 * t, g, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'r-menina-cesto', nome: 'Menina com cesto de flores', legenda: 'As melhores coisas da vida são simples e com amor.', cat: 'retro', tom: 'terno e simples',
    ind: 'Falar de gratidão, de simplicidade, de natureza e de pequenos prazeres.', contra: 'Assuntos urgentes, de tecnologia ou de negócios.',
    descr: 'A mesma menininha de touca florida, vestido rodado de camponesa e bochechas rosadas, caminhando alegre por um campo de margaridas, carregando um cesto de vime cheio de flores frescas e sorrindo de um jeito muito puro. Fundo de papel de carta verde claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d8f1dc', '#f0faf1', 'xadrez'); contorno(c, t);
      ['#fff', '#ffd166', '#ff9ab5'].forEach((cor, k) => { for (let i = 0; i < 5; i++) { const fx = x + (-0.32 + i * 0.16 + k * 0.03) * t, fy = y + (0.3 + (i % 2) * 0.025) * t; c.strokeStyle = '#6fbf73'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(fx, fy + 0.04 * t); c.lineTo(fx, fy); c.stroke(); c.fillStyle = cor; c.beginPath(); c.arc(fx, fy, t * 0.022, 0, 7); c.fill(); c.fillStyle = '#ffd166'; c.beginPath(); c.arc(fx, fy, t * 0.008, 0, 7); c.fill(); } });
      contorno(c, t);
      c.fillStyle = '#fff5e0'; linha(c, t, [[x - 0.12 * t, y + 0.04 * t], [x + 0.12 * t, y + 0.04 * t], [x + 0.22 * t, y + 0.3 * t], [x - 0.22 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffc2d6'; linha(c, t, [[x - 0.09 * t, y + 0.1 * t], [x + 0.09 * t, y + 0.1 * t], [x + 0.13 * t, y + 0.3 * t], [x - 0.13 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffe0c8'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.15 * t, 0.14 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#8a5a3a'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.15 * t, y - 0.02 * t, 0.03 * t, 0.08 * t, s * 0.1, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffd1e0'; c.beginPath(); c.arc(x, y - 0.17 * t, 0.15 * t, Math.PI, 0); c.fill(); c.stroke(); c.fillStyle = '#ff7aa8'; [[-0.08, -0.22], [0.0, -0.25], [0.08, -0.22]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.02 * t, 0, 7); c.fill(); });
      olho(c, x - 0.065 * t, y - 0.09 * t, t, 'grande'); olho(c, x + 0.065 * t, y - 0.09 * t, t, 'grande'); bochechas(c, x, y - 0.045 * t, t, 0.1, 0.028);
      c.beginPath(); c.arc(x, y - 0.045 * t, 0.03 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#c99a5f'; retArredondado(c, x + 0.12 * t, y + 0.1 * t, 0.17 * t, 0.12 * t, 0.025 * t); c.fill(); c.stroke(); c.strokeStyle = 'rgba(110,70,30,0.5)'; c.lineWidth = t * 0.008; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + 0.12 * t, y + (0.1 + i * 0.03) * t); c.lineTo(x + 0.29 * t, y + (0.1 + i * 0.03) * t); c.stroke(); } contorno(c, t);
      c.beginPath(); c.arc(x + 0.205 * t, y + 0.1 * t, 0.085 * t, Math.PI, 0); c.stroke();
      ['#ff9ab5', '#fff', '#ffd166', '#c9a0ff'].forEach((cor, i) => { c.fillStyle = cor; c.beginPath(); c.arc(x + (0.14 + i * 0.045) * t, y + (0.085 - (i % 2) * 0.02) * t, 0.022 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffe0c8'; c.beginPath(); c.ellipse(x + 0.12 * t, y + 0.05 * t, 0.04 * t, 0.025 * t, 0.4, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-golden', nome: 'Filhote de golden exausto com incenso', legenda: 'Vibrando na alta frequência do desespero.', cat: 'retro', tom: 'cansado e bem-humorado',
    ind: 'Falar de cansaço, de excesso de positividade, de autocuidado forçado e de dias exaustivos.', contra: 'Assuntos de saúde mental sérios, em que a pessoa precisa ser acolhida.',
    descr: 'Um filhotinho de golden retriever dourado e gordinho, de orelhas caídas macias, com um colar de contas de cristal no pescoço e um incenso fumegante em uma patinha. Ele tem olheiras fofas, olhos pesados e a língua para fora de cansaço, como quem tentou vibrar alto o dia todo e não aguentou. Margaridinhas em volta. Fundo de papel de carta amarelo claro, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#fff0b8', '#fffaea', 'bolinhas'); contorno(c, t);
      [[-0.3, 0.27], [0.3, 0.27], [-0.28, -0.25], [0.3, -0.27]].forEach(([a, b]) => { c.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2; c.beginPath(); c.ellipse(x + a * t + Math.cos(ang) * 0.025 * t, y + b * t + Math.sin(ang) * 0.025 * t, 0.018 * t, 0.012 * t, ang, 0, 7); c.fill(); } c.fillStyle = '#ffd166'; c.beginPath(); c.arc(x + a * t, y + b * t, 0.012 * t, 0, 7); c.fill(); });
      c.fillStyle = '#f2b45a'; c.beginPath(); c.ellipse(x, y + 0.17 * t, 0.2 * t, 0.16 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe3a8'; c.beginPath(); c.ellipse(x, y + 0.2 * t, 0.12 * t, 0.1 * t, 0, 0, 7); c.fill();
      [-1, 1].forEach((s) => { c.fillStyle = '#e29a3e'; c.beginPath(); c.ellipse(x + s * 0.19 * t, y - 0.1 * t, 0.07 * t, 0.12 * t, s * 0.25, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#f2b45a'; c.beginPath(); c.ellipse(x, y - 0.07 * t, 0.2 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe3a8'; c.beginPath(); c.ellipse(x, y - 0.01 * t, 0.1 * t, 0.08 * t, 0, 0, 7); c.fill();
      olho(c, x - 0.08 * t, y - 0.09 * t, t, 'meio', '#f2b45a'); olho(c, x + 0.08 * t, y - 0.09 * t, t, 'meio', '#f2b45a'); c.strokeStyle = 'rgba(120,80,110,0.55)'; c.lineWidth = t * 0.01; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + s * 0.08 * t, y - 0.06 * t, 0.035 * t, 0.3, Math.PI - 0.3); c.stroke(); }); contorno(c, t);
      c.fillStyle = TINTA; c.beginPath(); c.ellipse(x, y - 0.035 * t, 0.025 * t, 0.018 * t, 0, 0, 7); c.fill(); bochechas(c, x, y - 0.02 * t, t, 0.15);
      c.fillStyle = '#ff7a98'; c.beginPath(); c.ellipse(x, y + 0.03 * t, 0.025 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.0 * t); c.quadraticCurveTo(x, y + 0.03 * t, x + 0.05 * t, y + 0.0 * t); c.stroke();
      ['#bfe6ff', '#e2bfff', '#ffbfd8', '#bfffe0', '#fff2a8'].forEach((cor, i) => { c.fillStyle = cor; const ang = Math.PI * (0.15 + i * 0.175); c.beginPath(); c.arc(x + Math.cos(ang) * 0.16 * t, y + 0.12 * t + Math.sin(ang) * 0.06 * t, 0.017 * t, 0, 7); c.fill(); c.stroke(); });
      c.strokeStyle = '#8a5a2b'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x + 0.19 * t, y + 0.12 * t); c.lineTo(x + 0.25 * t, y - 0.12 * t); c.stroke(); c.strokeStyle = '#d85a3a'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x + 0.25 * t, y - 0.12 * t); c.lineTo(x + 0.255 * t, y - 0.15 * t); c.stroke(); c.strokeStyle = 'rgba(150,150,160,0.8)'; c.lineWidth = t * 0.012; [0, 0.025].forEach((o) => { c.beginPath(); c.moveTo(x + (0.255 + o) * t, y - 0.16 * t); c.quadraticCurveTo(x + (0.22 + o) * t, y - 0.21 * t, x + (0.26 + o) * t, y - 0.27 * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#f2b45a'; c.beginPath(); c.ellipse(x + 0.19 * t, y + 0.13 * t, 0.045 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-morango', nome: 'Morango sorridente com coração', legenda: 'Amigo é vida para você.', cat: 'retro', tom: 'doce e generoso',
    ind: 'Agradecer a um amigo, falar de amizade, de carinho e de generosidade.', contra: 'Assuntos sérios, formais ou de luto.',
    descr: 'Um morango vermelho, de sardinhas amarelas e chapéu de folhas verdes, com rostinho de bochechas rosadas, oferecendo para quem vê um morango gigante em forma de coração, com um sorriso acolhedor e olhos brilhantes de bondade. Fundo de papel de carta rosa, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd0d8', '#fff0f2', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#ff5a6e'; c.beginPath(); c.moveTo(x - 0.15 * t, y - 0.14 * t); c.quadraticCurveTo(x - 0.24 * t, y + 0.12 * t, x - 0.05 * t, y + 0.3 * t); c.quadraticCurveTo(x, y + 0.34 * t, x + 0.05 * t, y + 0.3 * t); c.quadraticCurveTo(x + 0.24 * t, y + 0.12 * t, x + 0.15 * t, y - 0.14 * t); c.quadraticCurveTo(x, y - 0.2 * t, x - 0.15 * t, y - 0.14 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffe27a'; [[-0.12, 0.0], [0.12, 0.0], [-0.09, 0.12], [0.09, 0.12], [0, 0.2], [-0.15, 0.08], [0.15, 0.08]].forEach(([a, b]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.009 * t, 0.014 * t, 0, 0, 7); c.fill(); });
      c.fillStyle = '#58b368'; [-0.09, -0.045, 0, 0.045, 0.09].forEach((a, i) => { linha(c, t, [[x + a * t - 0.035 * t, y - 0.15 * t], [x + a * t * 1.2, y - 0.235 * t + Math.abs(a) * 0.25 * t], [x + a * t + 0.035 * t, y - 0.15 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.155 * t, 0.12 * t, 0.033 * t, 0, 0, 7); c.fill(); c.stroke();
      olho(c, x - 0.065 * t, y - 0.04 * t, t, 'grande'); olho(c, x + 0.065 * t, y - 0.04 * t, t, 'grande'); bochechas(c, x, y + 0.0 * t, t, 0.1, 0.028);
      c.beginPath(); c.arc(x, y + 0.01 * t, 0.032 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#ff5a6e'; c.beginPath(); c.moveTo(x + 0.22 * t, y + 0.3 * t); c.bezierCurveTo(x + 0.08 * t, y + 0.2 * t, x + 0.14 * t, y + 0.06 * t, x + 0.22 * t, y + 0.12 * t); c.bezierCurveTo(x + 0.3 * t, y + 0.06 * t, x + 0.36 * t, y + 0.2 * t, x + 0.22 * t, y + 0.3 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#58b368'; c.beginPath(); c.ellipse(x + 0.22 * t, y + 0.125 * t, 0.06 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe27a'; [[0.165, 0.255], [0.275, 0.255], [0.22, 0.285]].forEach(([a, b]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.006 * t, 0.01 * t, 0, 0, 7); c.fill(); });
      olho(c, x + 0.185 * t, y + 0.19 * t, t, 'ponto'); olho(c, x + 0.255 * t, y + 0.19 * t, t, 'ponto'); bochechas(c, x + 0.22 * t, y + 0.215 * t, t, 0.06, 0.016); c.beginPath(); c.arc(x + 0.22 * t, y + 0.21 * t, 0.014 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#ff5a6e'; c.beginPath(); c.ellipse(x + 0.1 * t, y + 0.17 * t, 0.04 * t, 0.025 * t, -0.5, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'j-rei', nome: 'Rei de xadrez e a flor solitária', legenda: 'No tabuleiro da vida, o poder é a arte de saber perder o que não importa.', cat: 'jogos', tom: 'melancólico e sábio',
    ind: 'Falar de desapego, de liderança, de perdas necessárias e de maturidade.', contra: 'Assuntos de festa, de humor leve ou de autoafirmação.',
    descr: 'A peça do Rei de xadrez, em marfim claro, com a coroa e a cruz bem marcadas e um jeito artesanal de pecinha de biscuit, levemente inclinada para o lado, olhando para uma única florzinha que nasceu ao lado do tabuleiro. Bordas em aquarela suave sobre fundo cor de pergaminho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f2e2bf', '#fbf1d9', 'liso'); contorno(c, t);
      [['rgba(255,170,190,0.28)', -0.3, 0.3], ['rgba(170,200,255,0.28)', 0.3, 0.3], ['rgba(200,230,170,0.3)', 0.3, -0.3]].forEach(([cor, a, b]) => { c.fillStyle = cor; c.beginPath(); c.arc(x + a * t, y + b * t, t * 0.12, 0, 7); c.fill(); });
      contorno(c, t); c.save(); c.translate(x - 0.06 * t, y + 0.28 * t); c.rotate(-0.13);
      c.fillStyle = '#f3ead2'; c.beginPath(); c.ellipse(0, 0, 0.15 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-0.11 * t, -0.01 * t); c.quadraticCurveTo(-0.07 * t, -0.18 * t, -0.05 * t, -0.3 * t); c.lineTo(0.05 * t, -0.3 * t); c.quadraticCurveTo(0.07 * t, -0.18 * t, 0.11 * t, -0.01 * t); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -0.3 * t, 0.085 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
      linha(c, t, [[-0.07 * t, -0.31 * t], [-0.09 * t, -0.42 * t], [-0.04 * t, -0.37 * t], [0, -0.44 * t], [0.04 * t, -0.37 * t], [0.09 * t, -0.42 * t], [0.07 * t, -0.31 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#e8c15a'; c.fillRect(-0.007 * t, -0.54 * t, 0.014 * t, 0.1 * t); c.fillRect(-0.03 * t, -0.51 * t, 0.06 * t, 0.014 * t); c.strokeRect(-0.007 * t, -0.54 * t, 0.014 * t, 0.1 * t);
      c.strokeStyle = 'rgba(190,170,120,0.6)'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(-0.04 * t, -0.08 * t); c.lineTo(-0.03 * t, -0.26 * t); c.stroke(); c.restore(); contorno(c, t);
      c.strokeStyle = '#6fbf73'; c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x + 0.22 * t, y + 0.3 * t); c.quadraticCurveTo(x + 0.21 * t, y + 0.2 * t, x + 0.22 * t, y + 0.15 * t); c.stroke(); c.fillStyle = '#7ccf80'; c.beginPath(); c.ellipse(x + 0.245 * t, y + 0.24 * t, 0.03 * t, 0.014 * t, -0.5, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#ff9ab5'; for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2; c.beginPath(); c.arc(x + 0.22 * t + Math.cos(ang) * 0.028 * t, y + 0.14 * t + Math.sin(ang) * 0.028 * t, 0.02 * t, 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#ffd166'; c.beginPath(); c.arc(x + 0.22 * t, y + 0.14 * t, 0.014 * t, 0, 7); c.fill();
    } },
  { valor: 'j-cavalo', nome: 'Cavalo de xadrez em salto', legenda: 'Se meus caminhos são tortos, eu salto.', cat: 'jogos', tom: 'ágil e criativo',
    ind: 'Falar de driblar obstáculos, de caminhos diferentes e de criatividade para resolver problemas.', contra: 'Assuntos de rotina, de linha reta ou de protocolo.',
    descr: 'Um cavalo de xadrez esculpido em madeira de carvalho, capturado no meio de um salto, inclinado para cima, com riscos de movimento atrás dele e traços limpos de bloco de anotações antigo. Fundo quadriculado em tons pastéis de azul e bege.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cfe0f5', '#efe9da', 'xadrez'); contorno(c, t);
      c.strokeStyle = 'rgba(90,110,150,0.55)'; c.lineWidth = t * 0.014; [[-0.28, 0.12, -0.16], [-0.3, 0.2, -0.18], [-0.27, 0.28, -0.15]].forEach(([a, b, d]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t + 0.1 * t, y + b * t - 0.03 * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = 'rgba(150,140,120,0.45)'; [[-0.22, 0.31], [-0.15, 0.33], [-0.29, 0.33]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.025 * t, 0, 7); c.fill(); });
      contorno(c, t); c.save(); c.translate(x + 0.03 * t, y + 0.02 * t); c.rotate(-0.22);
      c.fillStyle = '#b57a45'; c.beginPath(); c.ellipse(0, 0.27 * t, 0.16 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke();
      linha(c, t, [[-0.12 * t, 0.26 * t], [-0.1 * t, 0.12 * t], [-0.04 * t, 0.0], [-0.22 * t, 0.02 * t], [-0.26 * t, -0.07 * t], [-0.17 * t, -0.19 * t], [-0.12 * t, -0.3 * t], [-0.07 * t, -0.21 * t], [-0.03 * t, -0.31 * t], [0.02 * t, -0.19 * t], [0.11 * t, -0.07 * t], [0.12 * t, 0.1 * t], [0.12 * t, 0.26 * t]], true); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(120,70,30,0.6)'; c.lineWidth = t * 0.01; [[-0.04, -0.15, 0.05, -0.02], [0.0, 0.0, 0.07, 0.15], [-0.08, 0.1, -0.02, 0.2]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(a * t, b * t); c.quadraticCurveTo((a + d) * t * 0.5 + 0.02 * t, (b + e) * t * 0.5, d * t, e * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = TINTA; c.beginPath(); c.ellipse(-0.13 * t, -0.11 * t, 0.012 * t, 0.016 * t, 0, 0, 7); c.fill(); c.beginPath(); c.arc(-0.235 * t, -0.04 * t, 0.007 * t, 0, 7); c.fill();
      c.fillStyle = '#7a4a2a'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0.03 * t + i * 0.012 * t, (-0.2 + i * 0.07) * t); c.lineTo(0.11 * t + i * 0.012 * t, (-0.12 + i * 0.07) * t); c.lineTo(0.03 * t + i * 0.012 * t, (-0.15 + i * 0.07) * t); c.closePath(); c.fill(); c.stroke(); }
      c.restore();
    } },
  { valor: 'j-rainha', nome: 'Rainha de xadrez com fita azul', legenda: 'O verdadeiro poder não precisa de barulho para ocupar espaço.', cat: 'jogos', tom: 'elegante e firme',
    ind: 'Falar de presença, de autoridade serena, de mulheres fortes e de discrição.', contra: 'Assuntos de humor, de festa ou de brincadeira.',
    descr: 'A Rainha de xadrez em posição de destaque, imponente e elegante, com a coroa de pontas e bolinhas bem detalhada no estilo retrô. Uma fita de cetim azul claro envolve a base da peça, que reflete uma luz branda e acolhedora. Fundo de papel de carta azul clarinho, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#dbe6ff', '#f2f6ff', 'bolinhas'); contorno(c, t);
      const g = c.createRadialGradient(x, y, 0, x, y, t * 0.36); g.addColorStop(0, 'rgba(255,250,220,0.85)'); g.addColorStop(1, 'rgba(255,250,220,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, t * 0.36, 0, 7); c.fill(); contorno(c, t);
      c.fillStyle = '#f3ead2'; c.beginPath(); c.ellipse(x, y + 0.29 * t, 0.15 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 0.11 * t, y + 0.27 * t); c.quadraticCurveTo(x - 0.07 * t, y + 0.08 * t, x - 0.05 * t, y - 0.06 * t); c.lineTo(x + 0.05 * t, y - 0.06 * t); c.quadraticCurveTo(x + 0.07 * t, y + 0.08 * t, x + 0.11 * t, y + 0.27 * t); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.085 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x, y - 0.14 * t, 0.06 * t, 0.075 * t, 0, 0, 7); c.fill(); c.stroke();
      linha(c, t, [[x - 0.085 * t, y - 0.17 * t], [x - 0.11 * t, y - 0.3 * t], [x - 0.055 * t, y - 0.23 * t], [x - 0.03 * t, y - 0.33 * t], [x, y - 0.24 * t], [x + 0.03 * t, y - 0.33 * t], [x + 0.055 * t, y - 0.23 * t], [x + 0.11 * t, y - 0.3 * t], [x + 0.085 * t, y - 0.17 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#e8c15a'; [[-0.11, -0.31], [-0.03, -0.34], [0.03, -0.34], [0.11, -0.31], [0, -0.29]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.018 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#9ccbff'; linha(c, t, [[x - 0.105 * t, y + 0.2 * t], [x + 0.105 * t, y + 0.2 * t], [x + 0.115 * t, y + 0.25 * t], [x - 0.115 * t, y + 0.25 * t]], true); c.fill(); c.stroke();
      linha(c, t, [[x + 0.0 * t, y + 0.225 * t], [x + 0.1 * t, y + 0.18 * t], [x + 0.12 * t, y + 0.27 * t]], true); c.fill(); c.stroke(); linha(c, t, [[x, y + 0.225 * t], [x - 0.08 * t, y + 0.16 * t], [x - 0.13 * t, y + 0.23 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#7bb6ff'; c.beginPath(); c.arc(x, y + 0.225 * t, 0.02 * t, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(190,170,120,0.6)'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x - 0.035 * t, y + 0.12 * t); c.lineTo(x - 0.03 * t, y - 0.03 * t); c.stroke();
    } },
  { valor: 'j-xeque-mate', nome: 'Rei caído e folha de outono', legenda: 'Uma partida que termina é só começo de um novo tabuleiro.', cat: 'jogos', tom: 'melancólico e acolhedor',
    ind: 'Falar de fim de ciclo, de recomeço, de aceitação e de virar a página.', contra: 'Assuntos de festa ou de empolgação.',
    descr: 'Um tabuleiro de xadrez antigo, visto de cima e de lado, com as casas em madeira envelhecida. O Rei está deitado de lado, derrotado, e uma folha de outono suave repousa ao lado dele, criando um clima melancólico, poético e acolhedor. Fundo cor de pergaminho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f2e2bf', '#fbf1d9', 'liso'); contorno(c, t);
      c.save(); c.translate(x, y + 0.1 * t); c.scale(1, 0.5); c.rotate(Math.PI / 4); const q = 0.075 * t;
      for (let a = -3; a < 3; a++) for (let b = -3; b < 3; b++) { c.fillStyle = (a + b) % 2 === 0 ? '#c79a62' : '#7b5230'; c.fillRect(a * q, b * q, q, q); }
      c.strokeStyle = TINTA; c.lineWidth = t * 0.02; c.strokeRect(-3 * q, -3 * q, 6 * q, 6 * q); c.restore(); contorno(c, t);
      c.save(); c.translate(x - 0.05 * t, y + 0.06 * t); c.rotate(-1.4);
      c.fillStyle = 'rgba(40,25,15,0.25)'; c.beginPath(); c.ellipse(0.02 * t, 0.02 * t, 0.2 * t, 0.05 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#f3ead2'; c.beginPath(); c.ellipse(0, 0.2 * t, 0.12 * t, 0.034 * t, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-0.09 * t, 0.19 * t); c.quadraticCurveTo(-0.055 * t, 0.06 * t, -0.04 * t, -0.03 * t); c.lineTo(0.04 * t, -0.03 * t); c.quadraticCurveTo(0.055 * t, 0.06 * t, 0.09 * t, 0.19 * t); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -0.03 * t, 0.07 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke(); linha(c, t, [[-0.055 * t, -0.04 * t], [-0.07 * t, -0.13 * t], [-0.03 * t, -0.09 * t], [0, -0.15 * t], [0.03 * t, -0.09 * t], [0.07 * t, -0.13 * t], [0.055 * t, -0.04 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#e8c15a'; c.fillRect(-0.005 * t, -0.23 * t, 0.01 * t, 0.08 * t); c.fillRect(-0.025 * t, -0.2 * t, 0.05 * t, 0.012 * t); c.restore(); contorno(c, t);
      folha(c, x + 0.1 * t, y + 0.22 * t, 0.15 * t, 0.06 * t, -0.5, '#d9822b', '#8a4a15'); folha(c, x + 0.2 * t, y + 0.13 * t, 0.09 * t, 0.04 * t, 0.7, '#b99a3a', '#6b551c');
    } },
  { valor: 'g-d20-neon', nome: 'Dado de vinte lados em neon', legenda: 'Quando seu melhor é suficiente.', cat: 'rpg', tom: 'confiante e vibrante',
    ind: 'Falar de autoestima, de dar o seu melhor e de se sentir suficiente.', contra: 'Assuntos de perda ou de insegurança.',
    descr: 'O coração do RPG: um dado de vinte lados todo brilhando em neon azul-turquesa e rosa, com o número vinte aceso no meio, sobre um fundo de papel de carta azul muito escuro, com estrelinhas e uma moldura roxa.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#6b4bd6', '#150f33', 'liso'); contorno(c, t);
      c.fillStyle = '#fff'; [[-0.2, -0.2], [0.22, -0.16], [-0.24, 0.2], [0.2, 0.24], [0.0, -0.28]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.022 * t, 0.009 * t, 4); c.fill(); });
      c.shadowColor = '#00f0ff'; c.shadowBlur = t * 0.06; c.lineJoin = 'round';
      const hex = [[x, y - 0.24 * t], [x + 0.21 * t, y - 0.12 * t], [x + 0.21 * t, y + 0.12 * t], [x, y + 0.24 * t], [x - 0.21 * t, y + 0.12 * t], [x - 0.21 * t, y - 0.12 * t]];
      c.strokeStyle = '#00f0ff'; c.lineWidth = t * 0.022; linha(c, t, hex, true); c.stroke();
      c.shadowColor = '#ff2fd0'; c.strokeStyle = '#ff2fd0'; c.lineWidth = t * 0.016; linha(c, t, [[x, y - 0.15 * t], [x + 0.14 * t, y + 0.08 * t], [x - 0.14 * t, y + 0.08 * t]], true); c.stroke();
      [[0, -0.24, 0, -0.15], [0.21, -0.12, 0.14, 0.08], [-0.21, -0.12, -0.14, 0.08], [0.21, 0.12, 0.14, 0.08], [-0.21, 0.12, -0.14, 0.08], [0, 0.24, 0, 0.08]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); });
      c.shadowColor = '#ffd23f'; c.fillStyle = '#fff4b0'; c.font = `800 ${t * 0.12}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('20', x, y + 0.0 * t); c.shadowBlur = 0;
    } },
  { valor: 'g-d20-falha', nome: 'Dado de vinte lados, falha crítica', legenda: 'Não devia ter sido comigo.', cat: 'rpg', tom: 'dramático e engraçado',
    ind: 'Falar de azar, de erro, de um dia em que nada deu certo, com humor.', contra: 'Assuntos de perdas reais, onde a pessoa precisa de acolhimento.',
    descr: 'Um dado de vinte lados vermelho mostrando o número um, rachado de ponta a ponta e pegando fogo por baixo, com uma lágrima enorme escorrendo pela lateral. Fundo de papel de carta cinza rosado, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e6d6d9', '#f6eef0', 'bolinhas'); contorno(c, t);
      chamas(c, x, y + 0.24 * t, t, 7); contorno(c, t);
      c.fillStyle = '#d6453d'; linha(c, t, [[x, y - 0.22 * t], [x + 0.2 * t, y - 0.11 * t], [x + 0.2 * t, y + 0.11 * t], [x, y + 0.22 * t], [x - 0.2 * t, y + 0.11 * t], [x - 0.2 * t, y - 0.11 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#e66a5f'; linha(c, t, [[x, y - 0.14 * t], [x + 0.13 * t, y + 0.07 * t], [x - 0.13 * t, y + 0.07 * t]], true); c.fill();
      c.strokeStyle = 'rgba(255,200,190,0.7)'; c.lineWidth = t * 0.008; [[0, -0.22, 0, -0.14], [0.2, -0.11, 0.13, 0.07], [-0.2, -0.11, -0.13, 0.07], [0.2, 0.11, 0.13, 0.07], [-0.2, 0.11, -0.13, 0.07], [0, 0.22, 0, 0.07]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); });
      c.fillStyle = '#fff'; c.strokeStyle = '#7a1e1e'; c.lineWidth = t * 0.01; c.font = `800 ${t * 0.15}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('1', x - 0.02 * t, y + 0.01 * t); c.fillText('1', x - 0.02 * t, y + 0.01 * t);
      contorno(c, t); c.lineWidth = t * 0.02; c.strokeStyle = TINTA; linha(c, t, [[x + 0.03 * t, y - 0.22 * t], [x - 0.02 * t, y - 0.12 * t], [x + 0.05 * t, y - 0.04 * t], [x - 0.04 * t, y + 0.06 * t], [x + 0.02 * t, y + 0.22 * t]]); c.stroke();
      c.fillStyle = '#7ec8ff'; c.beginPath(); c.moveTo(x + 0.17 * t, y - 0.05 * t); c.quadraticCurveTo(x + 0.27 * t, y + 0.1 * t, x + 0.17 * t, y + 0.16 * t); c.quadraticCurveTo(x + 0.08 * t, y + 0.1 * t, x + 0.17 * t, y - 0.05 * t); c.fill(); c.lineWidth = t * 0.012; c.stroke();
    } },
  { valor: 'g-torre-dados', nome: 'Torre de dados prestes a cair', legenda: 'Alguém dá uma mãozinha?', cat: 'rpg', tom: 'aflito e engraçado',
    ind: 'Pedir ajuda com humor, falar de equilíbrio difícil, de tarefas demais e de pressão.', contra: 'Assuntos sérios em que o pedido de ajuda precisa ser levado ao pé da letra.',
    descr: 'Uma pilha de dados coloridos, vermelho, azul, amarelo e verde, equilibrada de um jeito torto, balançando para um lado e prestes a cair, com riscos de movimento e gotinhas de suor. Fundo de papel de carta azul claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cfe6ff', '#eef6ff', 'xadrez'); contorno(c, t);
      const dado = (cx, cy, cor, ang, n) => { c.save(); c.translate(cx, cy); c.rotate(ang); c.fillStyle = cor; retArredondado(c, -0.09 * t, -0.09 * t, 0.18 * t, 0.18 * t, 0.03 * t); c.fill(); c.stroke(); c.fillStyle = '#fff'; const P = { 1: [[0, 0]], 2: [[-0.04, -0.04], [0.04, 0.04]], 3: [[-0.04, -0.04], [0, 0], [0.04, 0.04]], 4: [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]], 5: [[-0.04, -0.04], [0.04, -0.04], [0, 0], [-0.04, 0.04], [0.04, 0.04]], 6: [[-0.04, -0.045], [0.04, -0.045], [-0.04, 0], [0.04, 0], [-0.04, 0.045], [0.04, 0.045]] }[n]; P.forEach(([a, b]) => { c.beginPath(); c.arc(a * t, b * t, 0.014 * t, 0, 7); c.fill(); }); c.restore(); };
      dado(x - 0.06 * t, y + 0.24 * t, '#e0504a', -0.04, 6); dado(x + 0.05 * t, y + 0.07 * t, '#3d7bff', 0.1, 4); dado(x - 0.02 * t, y - 0.09 * t, '#ffd23f', -0.14, 5); dado(x + 0.07 * t, y - 0.25 * t, '#48c774', 0.22, 3);
      c.strokeStyle = 'rgba(80,100,150,0.6)'; c.lineWidth = t * 0.012; [[0.2, -0.3, 0.27, -0.26], [0.22, -0.22, 0.3, -0.17]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); });
      c.fillStyle = '#7ec8ff'; [[-0.14, -0.3], [-0.2, -0.22]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.quadraticCurveTo(x + (a + 0.025) * t, y + (b + 0.035) * t, x + a * t, y + (b + 0.045) * t); c.quadraticCurveTo(x + (a - 0.025) * t, y + (b + 0.035) * t, x + a * t, y + b * t); c.fill(); });
    } },
  { valor: 'g-escudo-mestre', nome: 'Mestre atrás do escudo', legenda: 'Tudo o que eu sei será revelado... ou talvez não.', cat: 'rpg', tom: 'misterioso e provocador',
    ind: 'Fazer suspense, falar de segredos, de histórias em andamento e de quem guarda o jogo.', contra: 'Assuntos em que a transparência é o mais importante.',
    descr: 'O mestre do jogo escondido atrás do escudo de três painéis, de couro vinho com símbolos dourados, mostrando só a parte de cima do rosto, com olhos semicerrados, sobrancelhas levantadas e um sorrisinho misterioso. Fundo de papel de carta roxo claro, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e0d4ff', '#f3edff', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#5b3a29'; c.beginPath(); c.ellipse(x, y - 0.16 * t, 0.17 * t, 0.15 * t, 0, Math.PI, 0); c.fill(); c.stroke();
      c.fillStyle = '#ffdcc2'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.15 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#5b3a29'; c.beginPath(); c.ellipse(x, y - 0.22 * t, 0.16 * t, 0.07 * t, 0, Math.PI, 0); c.fill();
      c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.11 * t, y - 0.17 * t); c.lineTo(x - 0.04 * t, y - 0.2 * t); c.moveTo(x + 0.11 * t, y - 0.17 * t); c.lineTo(x + 0.04 * t, y - 0.2 * t); c.stroke();
      olho(c, x - 0.07 * t, y - 0.12 * t, t, 'meio', '#ffdcc2'); olho(c, x + 0.07 * t, y - 0.12 * t, t, 'meio', '#ffdcc2'); bochechas(c, x, y - 0.07 * t, t, 0.11, 0.026);
      c.beginPath(); c.moveTo(x - 0.05 * t, y - 0.04 * t); c.quadraticCurveTo(x, y - 0.015 * t, x + 0.06 * t, y - 0.06 * t); c.stroke();
      const painel = (x0, y0, x1, y1, cor) => { c.fillStyle = cor; linha(c, t, [[x0 * t + x, y0 * t + y], [x1 * t + x, (y0 + 0.02) * t + y], [x1 * t + x, y1 * t + y], [x0 * t + x, (y1 + 0.02) * t + y]], true); c.fill(); c.stroke(); };
      painel(-0.31, 0.0, -0.1, 0.3, '#8c2f3f'); painel(-0.1, 0.0, 0.1, 0.3, '#a43a4b'); painel(0.1, 0.0, 0.31, 0.3, '#8c2f3f');
      c.fillStyle = '#e8c15a'; [[-0.2, 0.15], [0.0, 0.15], [0.2, 0.15]].forEach(([a, b], i) => { if (i === 1) { c.beginPath(); c.arc(x + a * t, y + b * t, 0.045 * t, 0, 7); c.fill(); c.stroke(); estrela(c, x + a * t, y + b * t, 0.03 * t, 0.012 * t, 5); c.fillStyle = '#8c2f3f'; c.fill(); c.fillStyle = '#e8c15a'; } else { linha(c, t, [[x + a * t, y + (b - 0.05) * t], [x + (a + 0.04) * t, y + b * t], [x + a * t, y + (b + 0.05) * t], [x + (a - 0.04) * t, y + b * t]], true); c.fill(); c.stroke(); } });
    } },
  { valor: 'g-taverna', nome: 'Canecas de hidromel brindando', legenda: 'Vocês se encontram em uma taverna...', cat: 'rpg', tom: 'aconchegante e aventureiro',
    ind: 'Começar uma história, convidar para a mesa, falar de encontro, de amizade e de aventura.', contra: 'Assuntos de abstinência ou em que bebida seja um problema.',
    descr: 'Duas canecas de madeira com aros de ferro, cheias de hidromel, batendo uma na outra num brinde, com espuma transbordando, gotas voando e faíscas douradas no ponto do encontro. Fundo de papel de carta bege, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f2dcb5', '#fbf0da', 'xadrez'); contorno(c, t);
      const caneca = (cx, cy, ang, esp) => { c.save(); c.translate(cx, cy); c.rotate(ang); c.fillStyle = '#c98f4a'; retArredondado(c, -0.09 * t, -0.07 * t, 0.18 * t, 0.2 * t, 0.025 * t); c.fill(); c.stroke(); c.fillStyle = '#8c8c94'; c.fillRect(-0.09 * t, -0.03 * t, 0.18 * t, 0.025 * t); c.strokeRect(-0.09 * t, -0.03 * t, 0.18 * t, 0.025 * t); c.fillRect(-0.09 * t, 0.07 * t, 0.18 * t, 0.025 * t); c.strokeRect(-0.09 * t, 0.07 * t, 0.18 * t, 0.025 * t); c.beginPath(); c.arc(esp * 0.1 * t, 0.03 * t, 0.06 * t, -1.2 * esp - 1.5, 1.2 * esp + 1.5, esp < 0); c.lineWidth = t * 0.03; c.stroke(); c.lineWidth = t * 0.014; c.fillStyle = '#fff6d6'; c.beginPath(); c.arc(-0.05 * t, -0.08 * t, 0.04 * t, 0, 7); c.arc(0.0 * t, -0.11 * t, 0.045 * t, 0, 7); c.arc(0.05 * t, -0.08 * t, 0.04 * t, 0, 7); c.fill(); c.stroke(); c.restore(); };
      caneca(x - 0.11 * t, y + 0.07 * t, 0.3, -1); caneca(x + 0.11 * t, y + 0.07 * t, -0.3, 1);
      c.fillStyle = '#ffe9a0'; [[0, -0.12, 0.05], [-0.07, -0.2, 0.03], [0.08, -0.19, 0.03], [0.0, -0.27, 0.025]].forEach(([a, b, r]) => { estrela(c, x + a * t, y + b * t, r * t, r * t * 0.4, 4); c.fill(); c.stroke(); });
      c.fillStyle = '#ffd166'; [[-0.2, -0.1], [0.2, -0.1], [-0.15, -0.22], [0.16, -0.22]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.quadraticCurveTo(x + (a + 0.02) * t, y + (b + 0.03) * t, x + a * t, y + (b + 0.04) * t); c.quadraticCurveTo(x + (a - 0.02) * t, y + (b + 0.03) * t, x + a * t, y + b * t); c.fill(); });
    } },
  { valor: 'g-iniciativa', nome: 'Pergaminho de iniciativa', legenda: 'Iniciativa!', cat: 'rpg', tom: 'urgente e empolgado',
    ind: 'Chamar à ação, começar algo, dizer que chegou a hora de agir.', contra: 'Assuntos calmos, de espera ou de descanso.',
    descr: 'Um pergaminho antigo sendo desenrolado depressa, com as pontas enroladas em cima e embaixo, e a palavra Iniciativa, com exclamação, em letras garrafais vermelhas no meio. Fundo de papel de carta bege, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#efdcb4', '#faf0d8', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#f4e3b8'; retArredondado(c, x - 0.24 * t, y - 0.19 * t, 0.48 * t, 0.38 * t, 0.01 * t); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { c.fillStyle = '#e8cf93'; retArredondado(c, x - 0.28 * t, y + s * 0.2 * t - 0.035 * t, 0.56 * t, 0.07 * t, 0.035 * t); c.fill(); c.stroke(); c.fillStyle = '#c0883f'; [-1, 1].forEach((d) => { c.beginPath(); c.ellipse(x + d * 0.28 * t, y + s * 0.2 * t, 0.025 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke(); }); });
      c.fillStyle = '#c0392b'; c.strokeStyle = '#6b1a12'; c.lineWidth = t * 0.008; c.font = `900 ${t * 0.1}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('INICIA-', x, y - 0.06 * t); c.fillText('INICIA-', x, y - 0.06 * t); c.strokeText('TIVA!', x, y + 0.06 * t); c.fillText('TIVA!', x, y + 0.06 * t);
      c.strokeStyle = 'rgba(120,80,40,0.45)'; c.lineWidth = t * 0.008; [[-0.18, -0.14, 0.18, -0.14], [-0.18, 0.14, 0.18, 0.14]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); });
      c.strokeStyle = 'rgba(100,80,60,0.5)'; [[0.26, -0.08], [0.28, 0.02], [0.26, 0.12]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a + 0.05) * t, y + (b - 0.01) * t); c.stroke(); });
    } },
  { valor: 'g-mago', nome: 'Mãos de mago com bola de fogo', legenda: 'Chama-se esperança, meus jovens.', cat: 'rpg', tom: 'inspirador e épico',
    ind: 'Falar de esperança, de recomeços, de ensinar e de manter a chama acesa.', contra: 'Assuntos de humor ácido ou de desânimo.',
    descr: 'Duas mãos de mago em concha, conjurando uma bola de fogo vibrante, em laranja, amarelo e vermelho, com faíscas subindo, sobre um fundo de papel de carta roxo escuro, com estrelas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cdbbff', '#241346', 'liso'); contorno(c, t);
      c.fillStyle = '#fff'; [[-0.24, -0.22], [0.25, -0.2], [-0.27, 0.12], [0.26, 0.1], [0.0, -0.3]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.02 * t, 0.008 * t, 4); c.fill(); });
      const g = c.createRadialGradient(x, y - 0.03 * t, 0, x, y - 0.03 * t, t * 0.24); g.addColorStop(0, 'rgba(255,240,150,1)'); g.addColorStop(0.5, 'rgba(255,150,40,0.95)'); g.addColorStop(1, 'rgba(230,60,30,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y - 0.03 * t, t * 0.24, 0, 7); c.fill();
      contorno(c, t); chamas(c, x, y - 0.0 * t, t * 1.5, 5);
      c.fillStyle = '#ffdcc2'; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * 0.03 * t, y + 0.2 * t); c.quadraticCurveTo(x + s * 0.2 * t, y + 0.2 * t, x + s * 0.2 * t, y + 0.07 * t); c.quadraticCurveTo(x + s * 0.19 * t, y + 0.04 * t, x + s * 0.16 * t, y + 0.07 * t); c.quadraticCurveTo(x + s * 0.12 * t, y + 0.12 * t, x + s * 0.03 * t, y + 0.11 * t); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = TINTA; c.lineWidth = t * 0.01; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + s * (0.19 - i * 0.02) * t, y + (0.07 + i * 0.012) * t); c.lineTo(x + s * (0.15 - i * 0.02) * t, y + (0.08 + i * 0.012) * t); c.stroke(); } c.lineWidth = t * 0.014; });
      c.fillStyle = '#ffd166'; [[-0.14, -0.16], [0.15, -0.14], [-0.08, -0.24], [0.1, -0.27]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.01 * t, 0, 7); c.fill(); });
    } },
  { valor: 'g-ladino', nome: 'Ladino encapuzado com adaga', legenda: 'Se eu roubar suas mentiras, alguém aguentará a verdade?', cat: 'rpg', tom: 'sombrio e astuto',
    ind: 'Falar de verdades difíceis, de honestidade, de segredos e de ironia afiada.', contra: 'Assuntos delicados, em que a verdade dita assim pode ferir.',
    descr: 'Olhos amarelos brilhando no escuro sob um capuz de tecido azul-marinho, e uma adaga de lâmina prateada e cabo vinho na mão, no canto. Fundo de papel de carta cinza azulado muito escuro, com um fio de luz da lua.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#aab3c9', '#10131f', 'liso'); contorno(c, t);
      const lua = c.createRadialGradient(x + 0.24 * t, y - 0.25 * t, 0, x + 0.24 * t, y - 0.25 * t, t * 0.14); lua.addColorStop(0, 'rgba(230,240,255,0.9)'); lua.addColorStop(1, 'rgba(230,240,255,0)'); c.fillStyle = lua; c.beginPath(); c.arc(x + 0.24 * t, y - 0.25 * t, t * 0.14, 0, 7); c.fill();
      contorno(c, t); c.fillStyle = '#1f2a4a'; c.beginPath(); c.moveTo(x - 0.24 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.22 * t, y - 0.05 * t, x - 0.1 * t, y - 0.17 * t); c.quadraticCurveTo(x, y - 0.3 * t, x + 0.1 * t, y - 0.17 * t); c.quadraticCurveTo(x + 0.22 * t, y - 0.05 * t, x + 0.24 * t, y + 0.3 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#0a0d18'; c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.12 * t, 0.12 * t, 0, 0, 7); c.fill();
      [-1, 1].forEach((s) => { c.shadowColor = '#ffe14d'; c.shadowBlur = t * 0.04; c.fillStyle = '#ffe14d'; c.beginPath(); c.ellipse(x + s * 0.05 * t, y - 0.08 * t, 0.03 * t, 0.018 * t, s * 0.2, 0, 7); c.fill(); c.shadowBlur = 0; });
      c.strokeStyle = '#0a0d18'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.15 * t); c.lineTo(x - 0.03 * t, y - 0.115 * t); c.moveTo(x + 0.1 * t, y - 0.15 * t); c.lineTo(x + 0.03 * t, y - 0.115 * t); c.stroke(); contorno(c, t);
      c.save(); c.translate(x + 0.15 * t, y + 0.2 * t); c.rotate(0.6); c.fillStyle = '#cfd6e6'; linha(c, t, [[-0.025 * t, 0], [0.025 * t, 0], [0, -0.22 * t]], true); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = t * 0.008; c.beginPath(); c.moveTo(0, -0.02 * t); c.lineTo(0, -0.17 * t); c.stroke(); contorno(c, t); c.fillStyle = '#b8862b'; c.fillRect(-0.05 * t, 0, 0.1 * t, 0.018 * t); c.strokeRect(-0.05 * t, 0, 0.1 * t, 0.018 * t); c.fillStyle = '#7a2e3a'; retArredondado(c, -0.015 * t, 0.018 * t, 0.03 * t, 0.07 * t, 0.01 * t); c.fill(); c.stroke(); c.restore();
    } },
  { valor: 'g-bardo', nome: 'Alaúde piscando', legenda: 'Desafinar faz parte do show.', cat: 'rpg', tom: 'brincalhão e charmoso',
    ind: 'Falar de errar com graça, de improviso, de música, de charme e de levar a vida de leve.', contra: 'Assuntos sérios, formais ou de luto.',
    descr: 'Um alaúde de madeira clara, com o pescoço quebrado e uma corda solta, com o buraco do meio em forma de rostinho dando uma piscadinha de charme, soltando notas musicais em forma de coração. Fundo de papel de carta rosa, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd6ea', '#fff0f7', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#ff6fa3'; [[0.16, -0.22, 0.04], [0.26, -0.1, 0.03], [0.06, -0.3, 0.03], [-0.2, -0.2, 0.025]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.fill(); c.strokeStyle = TINTA; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x + (a + r * 0.9) * t, y + (b + r * 0.2) * t); c.lineTo(x + (a + r * 0.9) * t, y + (b - r * 1.7) * t); c.stroke(); });
      contorno(c, t); c.save(); c.translate(x - 0.03 * t, y + 0.07 * t); c.rotate(-0.3); c.scale(1.25, 1.25);
      c.fillStyle = '#7a4a2a'; retArredondado(c, -0.016 * t, -0.3 * t, 0.062 * t, 0.24 * t, 0.008 * t); c.fill(); c.stroke();
      retArredondado(c, -0.03 * t, -0.37 * t, 0.09 * t, 0.075 * t, 0.015 * t); c.fill(); c.stroke();
      c.fillStyle = '#f2b705'; [[-0.036, -0.352], [-0.036, -0.322], [0.066, -0.352], [0.066, -0.322]].forEach(([a, d]) => { c.beginPath(); c.arc(a * t, d * t, 0.009 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#e0b078'; c.beginPath(); c.moveTo(0, 0.2 * t); c.bezierCurveTo(-0.2 * t, 0.2 * t, -0.2 * t, -0.08 * t, -0.03 * t, -0.08 * t); c.bezierCurveTo(0.05 * t, -0.12 * t, 0.2 * t, -0.04 * t, 0.2 * t, 0.08 * t); c.bezierCurveTo(0.2 * t, 0.2 * t, 0.1 * t, 0.22 * t, 0, 0.2 * t); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#8a8a96'; c.lineWidth = t * 0.007; [[-0.005, -0.012], [0.01, 0.0], [0.025, 0.014], [0.04, 0.028]].forEach(([a, b]) => { c.beginPath(); c.moveTo(a * t + 0.0 * t, -0.355 * t); c.lineTo((a + b) * t, 0.16 * t); c.stroke(); });
      c.fillStyle = '#3a2410'; c.beginPath(); c.arc(0.02 * t, 0.07 * t, 0.07 * t, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = t * 0.011; c.beginPath(); c.arc(-0.005 * t, 0.055 * t, 0.012 * t, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0.03 * t, 0.055 * t); c.lineTo(0.055 * t, 0.045 * t); c.stroke(); c.beginPath(); c.arc(0.025 * t, 0.095 * t, 0.025 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#5b3a1e'; retArredondado(c, -0.035 * t, 0.15 * t, 0.1 * t, 0.022 * t, 0.006 * t); c.fill(); c.stroke();
      c.restore(); contorno(c, t); bochechas(c, x - 0.05 * t, y + 0.15 * t, t, 0.07, 0.022);
    } },
  { valor: 'r-ursos-costas', nome: 'Dois ursinhos de costas um para o outro', legenda: 'Mais fácil discordar de um inimigo que de um amigo.', cat: 'retro', tom: 'sensível e honesto',
    ind: 'Falar de discordar de quem a gente ama, de conflito entre amigos e de cuidado na amizade.', contra: 'Assuntos de festa ou de humor leve.',
    descr: 'Um ursinho de pelúcia de bochechas rosadas e cachecol xadrez azul, sentado de costas e encostado em outro ursinho marrom. Os dois olham para direções levemente opostas, com pequenos corações flutuando ao redor, sob um fundo de estrelas cadentes em tons pastéis.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e0dcff', '#f1efff', 'liso'); contorno(c, t);
      [['#ffb3d1', -0.22, -0.22], ['#a9d6ff', 0.14, -0.28], ['#fff2a8', 0.26, -0.12], ['#c9f2d0', -0.28, -0.05]].forEach(([cor, a, b]) => { c.strokeStyle = cor; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a - 0.1) * t, y + (b - 0.05) * t); c.stroke(); c.fillStyle = cor; estrela(c, x + a * t, y + b * t, 0.026 * t, 0.011 * t, 5); c.fill(); }); contorno(c, t);
      c.fillStyle = '#b97a4a'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + 0.1 * t + s * 0.1 * t, y - 0.09 * t, 0.04 * t, 0, 7); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x + 0.12 * t, y + 0.16 * t, 0.15 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.1 * t, y - 0.02 * t, 0.13 * t, 0.11 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#e6c29a'; c.beginPath(); c.ellipse(x + 0.15 * t, y + 0.02 * t, 0.045 * t, 0.034 * t, 0, 0, 7); c.fill(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x + 0.16 * t, y + 0.005 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); olho(c, x + 0.06 * t, y - 0.04 * t, t, 'ponto'); olho(c, x + 0.15 * t, y - 0.045 * t, t, 'ponto'); bochechas(c, x + 0.105 * t, y - 0.005 * t, t, 0.07, 0.022);
      c.fillStyle = '#ffb3d1'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x - 0.14 * t + s * 0.1 * t, y - 0.06 * t, 0.042 * t, 0, 7); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x - 0.12 * t, y + 0.18 * t, 0.15 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x - 0.14 * t, y + 0.0 * t, 0.13 * t, 0.11 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#5b86d9'; c.beginPath(); c.ellipse(x - 0.14 * t, y + 0.1 * t, 0.15 * t, 0.045 * t, -0.05, 0, 7); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = t * 0.01; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x - 0.14 * t + i * 0.055 * t, y + 0.065 * t); c.lineTo(x - 0.14 * t + i * 0.055 * t, y + 0.135 * t); c.stroke(); } c.beginPath(); c.moveTo(x - 0.28 * t, y + 0.1 * t); c.lineTo(x - 0.0 * t, y + 0.1 * t); c.stroke(); contorno(c, t);
      c.fillStyle = '#5b86d9'; linha(c, t, [[x - 0.17 * t, y + 0.13 * t], [x - 0.12 * t, y + 0.13 * t], [x - 0.115 * t, y + 0.25 * t], [x - 0.17 * t, y + 0.25 * t]], true); c.fill(); c.stroke();
      bochechas(c, x - 0.14 * t, y + 0.0 * t, t, 0.13, 0.026); c.fillStyle = '#ff7aa8'; [[-0.02, -0.2, 0.026], [0.28, 0.02, 0.022], [-0.3, 0.22, 0.02]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.fill(); });
    } },
  { valor: 'r-siameses', nome: 'Dois gatinhos siameses sobre a nuvem', legenda: 'Afetos felizes só fazem bem.', cat: 'retro', tom: 'terno e luminoso',
    ind: 'Falar de afeto, de gratidão, de amor tranquilo e de felicidade compartilhada.', contra: 'Assuntos de perda ou de conflito.',
    descr: 'Dois gatinhos siameses abraçados sobre uma nuvem fofa de contorno dourado. O gatinho da frente segura uma margarida amarela, enquanto pequenos sóis sorridentes cercam a cena, com um brilho suave de holograma em tons de arco-íris.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffe9c6', '#fff8e8', 'bolinhas'); contorno(c, t);
      const g = c.createLinearGradient(x - 0.35 * t, y - 0.35 * t, x + 0.35 * t, y + 0.35 * t); g.addColorStop(0, 'rgba(255,170,200,0.28)'); g.addColorStop(0.35, 'rgba(255,230,140,0.25)'); g.addColorStop(0.65, 'rgba(150,230,200,0.25)'); g.addColorStop(1, 'rgba(160,190,255,0.3)'); c.fillStyle = g; c.fillRect(x - 0.4 * t, y - 0.4 * t, 0.8 * t, 0.8 * t); contorno(c, t);
      [[-0.25, -0.24], [0.26, -0.24], [0.29, 0.05]].forEach(([a, b]) => { c.fillStyle = '#ffd23f'; c.strokeStyle = '#f2a900'; c.lineWidth = t * 0.012; for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + a * t + Math.cos(ang) * 0.04 * t, y + b * t + Math.sin(ang) * 0.04 * t); c.lineTo(x + a * t + Math.cos(ang) * 0.06 * t, y + b * t + Math.sin(ang) * 0.06 * t); c.stroke(); } c.beginPath(); c.arc(x + a * t, y + b * t, 0.034 * t, 0, 7); c.fill(); c.strokeStyle = TINTA; c.stroke(); olho(c, x + a * t - 0.012 * t, y + b * t - 0.004 * t, t * 0.6, 'ponto'); olho(c, x + a * t + 0.012 * t, y + b * t - 0.004 * t, t * 0.6, 'ponto'); c.beginPath(); c.arc(x + a * t, y + b * t + 0.005 * t, 0.012 * t, 0.2, Math.PI - 0.2); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#fff'; c.strokeStyle = '#e8b730'; c.lineWidth = t * 0.016; [[-0.2, 0.26, 0.09], [-0.08, 0.22, 0.11], [0.06, 0.2, 0.12], [0.18, 0.25, 0.09], [0.0, 0.3, 0.1]].forEach(([a, b, r]) => { c.beginPath(); c.arc(x + a * t, y + b * t, r * t, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y + 0.27 * t, 0.2 * t, 0.07 * t, 0, 0, 7); c.fill(); contorno(c, t);
      const gato = (cx, cy, s, olhosEsq) => { c.fillStyle = '#f6ead6'; c.beginPath(); c.ellipse(cx, cy + 0.1 * t * s, 0.1 * t * s, 0.09 * t * s, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#6b4a3a'; [-1, 1].forEach((d) => { linha(c, t, [[cx + d * 0.09 * t * s, cy - 0.04 * t * s], [cx + d * 0.08 * t * s, cy - 0.15 * t * s], [cx + d * 0.025 * t * s, cy - 0.09 * t * s]], true); c.fill(); c.stroke(); }); c.fillStyle = '#f6ead6'; c.beginPath(); c.ellipse(cx, cy - 0.02 * t * s, 0.11 * t * s, 0.09 * t * s, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#7b5a48'; c.beginPath(); c.ellipse(cx, cy + 0.0 * t * s, 0.05 * t * s, 0.04 * t * s, 0, 0, 7); c.fill(); [-1, 1].forEach((d) => { c.fillStyle = '#8fd0ff'; c.beginPath(); c.ellipse(cx + d * 0.04 * t * s, cy - 0.04 * t * s, 0.018 * t * s, 0.022 * t * s, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(cx + d * 0.04 * t * s, cy - 0.04 * t * s, 0.008 * t * s, 0, 7); c.fill(); }); c.fillStyle = '#ff9fb0'; c.beginPath(); c.ellipse(cx, cy - 0.002 * t * s, 0.008 * t * s, 0.006 * t * s, 0, 0, 7); c.fill(); };
      gato(x + 0.07 * t, y + 0.03 * t, 0.9, 1); gato(x - 0.08 * t, y + 0.06 * t, 1.15, 0);
      bochechas(c, x - 0.08 * t, y + 0.07 * t, t, 0.1, 0.02);
      c.strokeStyle = '#4a9a4a'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x - 0.0 * t, y + 0.2 * t); c.lineTo(x + 0.02 * t, y + 0.08 * t); c.stroke(); c.fillStyle = '#fff48a'; for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; c.beginPath(); c.ellipse(x + 0.02 * t + Math.cos(ang) * 0.025 * t, y + 0.07 * t + Math.sin(ang) * 0.025 * t, 0.014 * t, 0.009 * t, ang, 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#f2a900'; c.beginPath(); c.arc(x + 0.02 * t, y + 0.07 * t, 0.012 * t, 0, 7); c.fill();
      c.fillStyle = '#f6ead6'; c.beginPath(); c.ellipse(x - 0.01 * t, y + 0.2 * t, 0.032 * t, 0.022 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#6b4a3a'; c.beginPath(); c.ellipse(x + 0.1 * t, y + 0.2 * t, 0.026 * t, 0.018 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-gnomo', nome: 'Gnomo rindo sobre o cogumelo', legenda: 'Dá pra viver intensamente sem se queimar no final.', cat: 'retro', tom: 'alegre e sábio',
    ind: 'Falar de equilíbrio, de viver com intensidade e cuidado, de festa saudável e de autocuidado.', contra: 'Assuntos de luto ou de seriedade.',
    descr: 'Um gnomo de gorro listrado de vermelho e branco, rindo de braços abertos em cima de um cogumelo vermelho de pintinhas brancas, enquanto pequenos fogos de artifício em forma de estrela explodem num céu cor-de-rosa. Fundo de papel de carta rosa.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffcfe0', '#ffe8f1', 'liso'); contorno(c, t);
      [['#ffd23f', -0.2, -0.22], ['#7ad7ff', 0.2, -0.26], ['#ff7aa8', 0.27, -0.06], ['#9aff9a', -0.27, -0.02]].forEach(([cor, a, b]) => { c.strokeStyle = cor; c.lineWidth = t * 0.012; for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + a * t + Math.cos(ang) * 0.02 * t, y + b * t + Math.sin(ang) * 0.02 * t); c.lineTo(x + a * t + Math.cos(ang) * 0.055 * t, y + b * t + Math.sin(ang) * 0.055 * t); c.stroke(); } c.fillStyle = cor; estrela(c, x + a * t, y + b * t, 0.022 * t, 0.009 * t, 5); c.fill(); }); contorno(c, t);
      c.fillStyle = '#f2e8d8'; retArredondado(c, x - 0.05 * t, y + 0.12 * t, 0.1 * t, 0.17 * t, 0.03 * t); c.fill(); c.stroke();
      c.fillStyle = '#e4403d'; c.beginPath(); c.moveTo(x - 0.26 * t, y + 0.14 * t); c.quadraticCurveTo(x - 0.24 * t, y - 0.0 * t, x, y - 0.0 * t); c.quadraticCurveTo(x + 0.24 * t, y - 0.0 * t, x + 0.26 * t, y + 0.14 * t); c.quadraticCurveTo(x, y + 0.19 * t, x - 0.26 * t, y + 0.14 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff'; [[-0.15, 0.08, 0.035], [0.05, 0.04, 0.04], [0.17, 0.1, 0.03], [-0.04, 0.13, 0.025]].forEach(([a, b, r]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, r * t, r * t * 0.7, 0, 0, 7); c.fill(); });
      c.fillStyle = '#4a7a4a'; c.fillRect(x - 0.1 * t, y - 0.02 * t, 0.2 * t, 0.0001); c.fillStyle = '#ffe0c8'; c.beginPath(); c.ellipse(x, y - 0.08 * t, 0.075 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#4a86d9'; linha(c, t, [[x - 0.085 * t, y - 0.01 * t], [x + 0.085 * t, y - 0.01 * t], [x + 0.06 * t, y + 0.11 * t], [x - 0.06 * t, y + 0.11 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffe0c8'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.15 * t, y + 0.02 * t, 0.06 * t, 0.025 * t, s * -0.5, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(x + s * 0.2 * t, y - 0.03 * t, 0.022 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x - 0.07 * t, y - 0.05 * t); c.quadraticCurveTo(x, y + 0.08 * t, x + 0.07 * t, y - 0.05 * t); c.quadraticCurveTo(x, y + 0.0 * t, x - 0.07 * t, y - 0.05 * t); c.fill(); c.stroke();
      olho(c, x - 0.03 * t, y - 0.1 * t, t, 'fechado'); olho(c, x + 0.03 * t, y - 0.1 * t, t, 'fechado'); c.fillStyle = '#ff8fa3'; c.beginPath(); c.arc(x, y - 0.075 * t, 0.012 * t, 0, 7); c.fill(); bochechas(c, x, y - 0.07 * t, t, 0.06, 0.016);
      linha(c, t, [[x - 0.075 * t, y - 0.12 * t], [x, y - 0.4 * t], [x + 0.075 * t, y - 0.12 * t]], true); c.fillStyle = '#fff'; c.fill(); c.stroke();
      c.save(); linha(c, t, [[x - 0.075 * t, y - 0.12 * t], [x, y - 0.4 * t], [x + 0.075 * t, y - 0.12 * t]], true); c.clip(); c.fillStyle = '#e4403d'; for (let i = 0; i < 5; i++) { c.fillRect(x - 0.1 * t, y - 0.38 * t + i * 0.06 * t, 0.2 * t, 0.03 * t); } c.restore(); c.strokeStyle = TINTA; linha(c, t, [[x - 0.075 * t, y - 0.12 * t], [x, y - 0.4 * t], [x + 0.075 * t, y - 0.12 * t]], true); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y - 0.41 * t, 0.02 * t, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-ratinhos', nome: 'Três ratinhos de mãos dadas', legenda: 'Se eu tenho amigos, tenho motivos.', cat: 'retro', tom: 'doce e esperançoso',
    ind: 'Falar de amizade, de gratidão e de esperança, e agradecer a quem caminha junto.', contra: 'Assuntos técnicos ou de crítica.',
    descr: 'Três ratinhos simpáticos de macacão colorido de veludo cotelê caminhando de mãos dadas por uma estradinha de terra cercada de flores do campo, sob um arco-íris de aquarela bem delicado. Fundo de papel de carta verde clarinho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d8f1dc', '#f2fbf4', 'bolinhas'); contorno(c, t);
      ['#ff9ab5', '#ffd166', '#a9d6ff', '#c9a0ff', '#ffb78a', '#9fe0a5', '#ff9ab5'].forEach((cor, i) => { c.strokeStyle = cor; c.globalAlpha = 0.55; c.lineWidth = t * 0.018; c.beginPath(); c.arc(x, y + 0.12 * t, (0.31 - i * 0.018) * t, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); }); c.globalAlpha = 1; contorno(c, t);
      c.fillStyle = '#d9b98a'; c.beginPath(); c.moveTo(x - 0.12 * t, y + 0.12 * t); c.lineTo(x + 0.12 * t, y + 0.12 * t); c.lineTo(x + 0.3 * t, y + 0.32 * t); c.lineTo(x - 0.3 * t, y + 0.32 * t); c.closePath(); c.fill(); c.stroke();
      [-0.3, -0.2, 0.2, 0.3, -0.12, 0.12].forEach((a, i) => { const fy = y + (0.2 + (i % 3) * 0.045) * t; c.strokeStyle = '#6fbf73'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x + a * t, fy + 0.03 * t); c.lineTo(x + a * t, fy); c.stroke(); c.fillStyle = ['#ff9ab5', '#ffd166', '#c9a0ff'][i % 3]; c.beginPath(); c.arc(x + a * t, fy, t * 0.018, 0, 7); c.fill(); });
      contorno(c, t);
      const rato = (cx, cy, cor, esc) => { c.fillStyle = '#d8d2dc'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(cx + s * 0.05 * t * esc, cy - 0.07 * t * esc, 0.035 * t * esc, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffc2d6'; c.beginPath(); c.arc(cx + s * 0.05 * t * esc, cy - 0.07 * t * esc, 0.02 * t * esc, 0, 7); c.fill(); c.fillStyle = '#d8d2dc'; }); c.beginPath(); c.ellipse(cx, cy + 0.07 * t * esc, 0.06 * t * esc, 0.075 * t * esc, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = cor; retArredondado(c, cx - 0.062 * t * esc, cy + 0.03 * t * esc, 0.124 * t * esc, 0.095 * t * esc, 0.02 * t * esc); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = t * 0.006; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx + i * 0.022 * t * esc, cy + 0.04 * t * esc); c.lineTo(cx + i * 0.022 * t * esc, cy + 0.12 * t * esc); c.stroke(); } contorno(c, t); c.fillStyle = '#d8d2dc'; c.beginPath(); c.ellipse(cx, cy - 0.02 * t * esc, 0.065 * t * esc, 0.058 * t * esc, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffc2d6'; c.beginPath(); c.arc(cx, cy + 0.0 * t * esc, 0.009 * t * esc, 0, 7); c.fill(); olho(c, cx - 0.03 * t * esc, cy - 0.03 * t * esc, t * esc * 0.9, 'ponto'); olho(c, cx + 0.03 * t * esc, cy - 0.03 * t * esc, t * esc * 0.9, 'ponto'); bochechas(c, cx, cy - 0.005 * t * esc, t * esc, 0.05, 0.014); c.beginPath(); c.arc(cx, cy + 0.008 * t * esc, 0.015 * t * esc, 0.2, Math.PI - 0.2); c.stroke(); };
      rato(x - 0.15 * t, y + 0.12 * t, '#ff8a8a', 1); rato(x, y + 0.14 * t, '#6fa8ff', 1.08); rato(x + 0.15 * t, y + 0.12 * t, '#ffd166', 1);
      c.strokeStyle = '#d8d2dc'; c.lineWidth = t * 0.022; c.beginPath(); c.moveTo(x - 0.09 * t, y + 0.17 * t); c.lineTo(x - 0.06 * t, y + 0.18 * t); c.moveTo(x + 0.06 * t, y + 0.18 * t); c.lineTo(x + 0.1 * t, y + 0.17 * t); c.stroke();
    } },
  { valor: 'r-concha', nome: 'Concha com pérola-galáxia', legenda: 'Um grão de areia que se tornou todo um universo.', cat: 'retro', tom: 'maravilhado e poético',
    ind: 'Valorizar o que é pequeno, falar de transformação, de superação e de pessoas especiais.', contra: 'Assuntos formais ou técnicos.',
    descr: 'Uma concha aberta em tons de madrepérola, mostrando uma pérola brilhante que solta estrelinhas e planetas em miniatura, formando uma galáxia inteira dentro da concha. Fundo de papel de carta azul noite, com brilho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#bfd0ff', '#1a2255', 'liso'); contorno(c, t);
      const g = c.createRadialGradient(x, y - 0.03 * t, 0, x, y - 0.03 * t, t * 0.32); g.addColorStop(0, 'rgba(210,190,255,0.7)'); g.addColorStop(1, 'rgba(210,190,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y - 0.03 * t, t * 0.32, 0, 7); c.fill();
      c.fillStyle = '#fff'; for (let i = 0; i < 18; i++) { const ang = i * 2.4, r = (0.08 + (i * 0.013)) * t; estrela(c, x + Math.cos(ang) * r * 1.2, y - 0.05 * t + Math.sin(ang) * r * 0.8, (0.008 + (i % 3) * 0.004) * t, 0.004 * t, 4); c.fill(); }
      [['#ff9ab5', -0.2, -0.17, 0.03], ['#7ad7ff', 0.2, -0.2, 0.04], ['#ffd166', 0.17, 0.0, 0.025]].forEach(([cor, a, b, r]) => { c.fillStyle = cor; c.beginPath(); c.arc(x + a * t, y + b * t, r * t, 0, 7); c.fill(); c.strokeStyle = TINTA; c.lineWidth = t * 0.01; c.stroke(); if (r > 0.035) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x + a * t, y + b * t, r * 1.7 * t, r * 0.5 * t, -0.4, 0, 7); c.stroke(); } }); contorno(c, t);
      c.fillStyle = '#f2e6f0'; c.beginPath(); c.moveTo(x - 0.28 * t, y + 0.06 * t); c.quadraticCurveTo(x - 0.3 * t, y + 0.3 * t, x, y + 0.3 * t); c.quadraticCurveTo(x + 0.3 * t, y + 0.3 * t, x + 0.28 * t, y + 0.06 * t); c.quadraticCurveTo(x, y + 0.14 * t, x - 0.28 * t, y + 0.06 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#e8d3ea'; c.beginPath(); c.moveTo(x - 0.27 * t, y + 0.02 * t); c.quadraticCurveTo(x - 0.3 * t, y - 0.2 * t, x, y - 0.22 * t); c.quadraticCurveTo(x + 0.3 * t, y - 0.2 * t, x + 0.27 * t, y + 0.02 * t); c.quadraticCurveTo(x, y + 0.08 * t, x - 0.27 * t, y + 0.02 * t); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(160,120,170,0.7)'; c.lineWidth = t * 0.01; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x + i * 0.012 * t, y + 0.06 * t); c.lineTo(x + i * 0.085 * t, y - 0.19 * t); c.stroke(); } for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x + i * 0.012 * t, y + 0.12 * t); c.lineTo(x + i * 0.08 * t, y + 0.28 * t); c.stroke(); } contorno(c, t);
      const p = c.createRadialGradient(x - 0.015 * t, y + 0.0 * t, 0, x, y + 0.03 * t, 0.07 * t); p.addColorStop(0, '#fff'); p.addColorStop(0.6, '#f6e8ff'); p.addColorStop(1, '#c9b0e8'); c.fillStyle = p; c.beginPath(); c.arc(x, y + 0.03 * t, 0.065 * t, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-coelho-urso', nome: 'Coelhinho dando presente ao urso', legenda: 'Gosto de você, e não é favor, nem fardo, nem algema.', cat: 'retro', tom: 'carinhoso e livre',
    ind: 'Declarar afeto sem cobrança, falar de amizade e de amor leve, em que ninguém prende ninguém.', contra: 'Assuntos de rompimento ou de relações difíceis.',
    descr: 'Um coelhinho branco de orelhas longas entregando uma caixinha de presente amarrada com fita de cetim azul a um urso pardo bochechudo, os dois cercados por corações contornados com tracejado feito à mão. Fundo de papel de carta rosa claro, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffdbe8', '#fff1f6', 'bolinhas'); contorno(c, t);
      c.strokeStyle = '#ff7aa8'; c.lineWidth = t * 0.012; c.setLineDash([t * 0.02, t * 0.014]); [[-0.24, -0.24, 0.05], [0.22, -0.28, 0.06], [0.28, 0.02, 0.04], [-0.3, 0.0, 0.035]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.stroke(); }); c.setLineDash([]); contorno(c, t);
      c.fillStyle = '#b97a4a'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + 0.14 * t + s * 0.095 * t, y - 0.08 * t, 0.04 * t, 0, 7); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x + 0.16 * t, y + 0.17 * t, 0.15 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.14 * t, y - 0.0 * t, 0.13 * t, 0.115 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#e6c29a'; c.beginPath(); c.ellipse(x + 0.14 * t, y + 0.03 * t, 0.045 * t, 0.034 * t, 0, 0, 7); c.fill(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x + 0.14 * t, y + 0.015 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); olho(c, x + 0.1 * t, y - 0.04 * t, t, 'grande'); olho(c, x + 0.18 * t, y - 0.04 * t, t, 'grande'); bochechas(c, x + 0.14 * t, y + 0.0 * t, t, 0.1, 0.026); c.beginPath(); c.arc(x + 0.14 * t, y + 0.04 * t, 0.02 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#fff'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x - 0.17 * t + s * 0.035 * t, y - 0.215 * t, 0.025 * t, 0.085 * t, s * 0.1, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffc2d6'; c.beginPath(); c.ellipse(x - 0.17 * t + s * 0.035 * t, y - 0.215 * t, 0.012 * t, 0.06 * t, s * 0.1, 0, 7); c.fill(); c.fillStyle = '#fff'; });
      retArredondado(c, x - 0.225 * t, y - 0.03 * t, 0.11 * t, 0.12 * t, 0.03 * t); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x - 0.18 * t, y + 0.2 * t, 0.105 * t, 0.13 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x - 0.17 * t, y - 0.055 * t, 0.095 * t, 0.085 * t, 0, 0, 7); c.fill(); c.stroke();
      olho(c, x - 0.2 * t, y - 0.075 * t, t, 'ponto'); olho(c, x - 0.14 * t, y - 0.075 * t, t, 'ponto'); c.fillStyle = '#ff8fa3'; c.beginPath(); c.ellipse(x - 0.17 * t, y - 0.055 * t, 0.01 * t, 0.007 * t, 0, 0, 7); c.fill(); bochechas(c, x - 0.17 * t, y - 0.045 * t, t, 0.08, 0.02); c.beginPath(); c.arc(x - 0.17 * t, y - 0.04 * t, 0.016 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#fff2a8'; retArredondado(c, x - 0.08 * t, y + 0.1 * t, 0.12 * t, 0.1 * t, 0.012 * t); c.fill(); c.stroke(); c.fillStyle = '#7bb6ff'; c.fillRect(x - 0.032 * t, y + 0.1 * t, 0.024 * t, 0.1 * t); c.strokeRect(x - 0.032 * t, y + 0.1 * t, 0.024 * t, 0.1 * t); c.fillRect(x - 0.08 * t, y + 0.137 * t, 0.12 * t, 0.024 * t); c.strokeRect(x - 0.08 * t, y + 0.137 * t, 0.12 * t, 0.024 * t); linha(c, t, [[x - 0.02 * t, y + 0.1 * t], [x - 0.07 * t, y + 0.06 * t], [x - 0.04 * t, y + 0.1 * t]], true); c.fill(); c.stroke(); linha(c, t, [[x - 0.02 * t, y + 0.1 * t], [x + 0.03 * t, y + 0.06 * t], [x + 0.0 * t, y + 0.1 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x - 0.085 * t, y + 0.17 * t, 0.025 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#b97a4a'; c.beginPath(); c.ellipse(x + 0.05 * t, y + 0.17 * t, 0.028 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'r-estrelas', nome: 'Duas estrelas, uma iluminando a outra', legenda: 'Bom é saber brilhar sem apagar a luz de ninguém.', cat: 'retro', tom: 'generoso e inspirador',
    ind: 'Falar de apoio, de mentoria, de brilhar junto, de reconhecer o outro e de generosidade.', contra: 'Assuntos de competição ou de humor ácido.',
    descr: 'Duas estrelas com carinha, de olhinhos brilhantes e bochechas rosadas: uma estrela maior sorri calorosamente enquanto ilumina a estrela menor ao lado dela, sem perder o próprio brilho. Fundo de papel de carta azul noite, com glitter prateado.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#b9c6ff', '#1d2a63', 'liso'); contorno(c, t);
      c.fillStyle = '#e8eefc'; for (let i = 0; i < 26; i++) { const a = (i * 53 % 100) / 100, b = (i * 37 % 100) / 100; c.beginPath(); c.arc(x + (a - 0.5) * 0.7 * t, y + (b - 0.5) * 0.7 * t, (0.003 + (i % 3) * 0.002) * t, 0, 7); c.fill(); }
      const g = c.createRadialGradient(x + 0.12 * t, y + 0.12 * t, 0, x + 0.12 * t, y + 0.12 * t, t * 0.22); g.addColorStop(0, 'rgba(255,240,150,0.8)'); g.addColorStop(1, 'rgba(255,240,150,0)'); c.fillStyle = g; c.beginPath(); c.arc(x + 0.12 * t, y + 0.12 * t, t * 0.22, 0, 7); c.fill(); contorno(c, t);
      c.strokeStyle = 'rgba(255,240,150,0.7)'; c.lineWidth = t * 0.012; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 0.05 * t, y - 0.02 * t + i * 0.025 * t); c.lineTo(x + 0.1 * t, y + 0.06 * t + i * 0.02 * t); c.stroke(); } contorno(c, t);
      c.fillStyle = '#ffd84a'; estrela(c, x - 0.1 * t, y - 0.06 * t, 0.25 * t, 0.12 * t, 5); c.fill(); c.stroke();
      olho(c, x - 0.15 * t, y - 0.06 * t, t, 'grande'); olho(c, x - 0.05 * t, y - 0.06 * t, t, 'grande'); bochechas(c, x - 0.1 * t, y - 0.01 * t, t, 0.09, 0.024); c.beginPath(); c.arc(x - 0.1 * t, y - 0.01 * t, 0.032 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#ffe98a'; estrela(c, x + 0.19 * t, y + 0.17 * t, 0.12 * t, 0.058 * t, 5); c.fill(); c.stroke(); olho(c, x + 0.165 * t, y + 0.165 * t, t * 0.7, 'grande'); olho(c, x + 0.215 * t, y + 0.165 * t, t * 0.7, 'grande'); bochechas(c, x + 0.19 * t, y + 0.19 * t, t * 0.7, 0.09, 0.025); c.beginPath(); c.arc(x + 0.19 * t, y + 0.19 * t, 0.015 * t, 0.2, Math.PI - 0.2); c.stroke();
    } },
  { valor: 'r-pandas', nome: 'Pandas na gangorra equilibrada', legenda: 'Posso discordar hoje e te amar hoje também.', cat: 'retro', tom: 'maduro e carinhoso',
    ind: 'Falar de diferenças em relações que dão certo, de casais, de amizades e de diálogo.', contra: 'Assuntos de ruptura definitiva.',
    descr: 'Dois ursinhos pandas sentados nas pontas opostas de uma gangorra perfeitamente equilibrada, com expressões carinhosas, segurando juntos um coração vermelho de pelúcia no meio. Fundo de papel de carta azul claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d6ecff', '#f0f8ff', 'xadrez'); contorno(c, t);
      c.fillStyle = '#d9a35f'; linha(c, t, [[x, y + 0.14 * t], [x + 0.06 * t, y + 0.3 * t], [x - 0.06 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#e9bd7a'; retArredondado(c, x - 0.3 * t, y + 0.11 * t, 0.6 * t, 0.035 * t, 0.012 * t); c.fill(); c.stroke();
      const panda = (cx, esq) => { c.fillStyle = '#2f2f36'; [-1, 1].forEach((s) => { c.beginPath(); c.arc(cx + s * 0.065 * t, y - 0.12 * t, 0.032 * t, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx, y + 0.0 * t, 0.075 * t, 0.085 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#2f2f36'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(cx + s * 0.075 * t, y + 0.0 * t, 0.025 * t, 0.045 * t, s * 0.3, 0, 7); c.fill(); }); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx, y - 0.075 * t, 0.085 * t, 0.075 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#2f2f36'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(cx + s * 0.035 * t, y - 0.075 * t, 0.02 * t, 0.026 * t, s * -0.3, 0, 7); c.fill(); }); olho(c, cx - 0.035 * t, y - 0.075 * t, t * 0.6, 'ponto'); c.fillStyle = '#fff'; olho(c, cx + 0.035 * t, y - 0.075 * t, t * 0.6, 'ponto'); c.fillStyle = '#2f2f36'; c.beginPath(); c.ellipse(cx, y - 0.05 * t, 0.012 * t, 0.008 * t, 0, 0, 7); c.fill(); bochechas(c, cx, y - 0.045 * t, t, 0.055, 0.016); c.beginPath(); c.arc(cx, y - 0.04 * t, 0.015 * t, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = '#2f2f36'; c.beginPath(); c.ellipse(cx + (esq ? 0.05 : -0.05) * t, y + 0.08 * t, 0.03 * t, 0.025 * t, 0, 0, 7); c.fill(); };
      panda(x - 0.22 * t, true); panda(x + 0.22 * t, false);
      c.fillStyle = '#e63956'; coracao(c, x, y - 0.04 * t, 0.07 * t); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.ellipse(x - 0.03 * t, y - 0.06 * t, 0.015 * t, 0.01 * t, -0.5, 0, 7); c.fill();
      c.fillStyle = '#2f2f36'; [[-0.09, 0.02], [0.09, 0.02]].forEach(([a, b]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.03 * t, 0.02 * t, a * 4, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'r-gatinho-relogio', nome: 'Gatinho de pijama e o relógio parado', legenda: 'A próxima vez já vai ser a última.', cat: 'retro', tom: 'nostálgico e agridoce',
    ind: 'Falar de saudade, de despedidas, de valorizar o tempo e de aproveitar quem a gente tem.', contra: 'Assuntos alegres, de festa ou de humor.',
    descr: 'Um gatinho listrado de pijama, olhando para um relógio de bolso antigo cujos ponteiros estão parados, sentado na beirada da janela, enquanto a lua minguante aparece no vidro, emoldurada por heras. Fundo de papel de carta azul noite.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c7d0ff', '#1e2958', 'liso'); contorno(c, t);
      c.fillStyle = '#2a3a78'; retArredondado(c, x - 0.26 * t, y - 0.3 * t, 0.52 * t, 0.46 * t, 0.03 * t); c.fill(); c.strokeStyle = '#f2e6d0'; c.lineWidth = t * 0.02; c.stroke(); c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x, y - 0.3 * t); c.lineTo(x, y + 0.16 * t); c.moveTo(x - 0.26 * t, y - 0.07 * t); c.lineTo(x + 0.26 * t, y - 0.07 * t); c.stroke(); contorno(c, t);
      c.fillStyle = '#f6efd0'; c.beginPath(); c.arc(x + 0.14 * t, y - 0.2 * t, 0.05 * t, 0, 7); c.fill(); c.fillStyle = '#2a3a78'; c.beginPath(); c.arc(x + 0.165 * t, y - 0.21 * t, 0.045 * t, 0, 7); c.fill();
      c.fillStyle = '#f2e6d0'; c.fillRect(x - 0.3 * t, y + 0.16 * t, 0.6 * t, 0.04 * t); c.strokeRect(x - 0.3 * t, y + 0.16 * t, 0.6 * t, 0.04 * t);
      c.fillStyle = '#3f9a5a'; [[-0.24, -0.22], [-0.22, -0.12], [-0.24, -0.0], [0.24, -0.25], [0.22, -0.1], [-0.2, 0.1], [0.2, 0.05]].forEach(([a, b], i) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.025 * t, 0.014 * t, i, 0, 7); c.fill(); });
      c.fillStyle = '#c9c9d6'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.1 * t, 0.12 * t, 0.075 * t, 0, 0, 7); c.fill(); c.stroke(); c.strokeStyle = '#7a86c0'; c.lineWidth = t * 0.01; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 0.04 * t, y + 0.04 * t); c.lineTo(x + i * 0.04 * t, y + 0.14 * t); c.stroke(); } contorno(c, t);
      c.fillStyle = '#c9c9d6'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.09 * t, y - 0.07 * t], [x + s * 0.075 * t, y - 0.16 * t], [x + s * 0.025 * t, y - 0.1 * t]], true); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x, y - 0.03 * t, 0.1 * t, 0.075 * t, 0, 0, 7); c.fill(); c.stroke(); c.strokeStyle = '#7a86c0'; c.lineWidth = t * 0.012; [-0.03, 0.0, 0.03].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y - 0.1 * t); c.lineTo(x + a * t, y - 0.07 * t); c.stroke(); }); contorno(c, t);
      olho(c, x - 0.04 * t, y - 0.03 * t, t * 0.9, 'grande'); olho(c, x + 0.04 * t, y - 0.03 * t, t * 0.9, 'grande'); c.fillStyle = '#ff9fb0'; c.beginPath(); c.ellipse(x, y - 0.005 * t, 0.008 * t, 0.006 * t, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(x - 0.02 * t, y + 0.015 * t); c.quadraticCurveTo(x, y + 0.005 * t, x + 0.02 * t, y + 0.015 * t); c.stroke(); bochechas(c, x, y - 0.005 * t, t, 0.065, 0.016);
      c.fillStyle = '#ffd1e0'; retArredondado(c, x - 0.07 * t, y + 0.02 * t, 0.14 * t, 0.07 * t, 0.015 * t); c.fill(); c.stroke(); c.fillStyle = '#fff'; [[-0.04, 0.05], [0.0, 0.04], [0.04, 0.055]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.008 * t, 0, 7); c.fill(); });
      c.fillStyle = '#f2e6d0'; c.beginPath(); c.arc(x + 0.12 * t, y + 0.08 * t, 0.055 * t, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(x + 0.12 * t, y + 0.08 * t, 0.042 * t, 0, 7); c.fill(); c.strokeStyle = TINTA; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x + 0.12 * t, y + 0.08 * t); c.lineTo(x + 0.12 * t, y + 0.052 * t); c.moveTo(x + 0.12 * t, y + 0.08 * t); c.lineTo(x + 0.14 * t, y + 0.09 * t); c.stroke(); c.fillStyle = '#e8c15a'; c.fillRect(x + 0.113 * t, y + 0.015 * t, 0.014 * t, 0.012 * t); c.strokeStyle = '#e8c15a'; c.beginPath(); c.moveTo(x + 0.12 * t, y + 0.015 * t); c.quadraticCurveTo(x + 0.2 * t, y - 0.02 * t, x + 0.18 * t, y + 0.06 * t); c.stroke(); contorno(c, t);
      c.strokeStyle = '#c9c9d6'; c.lineWidth = t * 0.035; c.beginPath(); c.moveTo(x + 0.06 * t, y + 0.0 * t); c.lineTo(x + 0.1 * t, y + 0.055 * t); c.stroke();
    } },
  { valor: 'r-margaridas-murchas', nome: 'Margaridas murchando no vaso', legenda: 'Eu não escolhi acabar. Só acabou.', cat: 'retro', tom: 'triste e honesto',
    ind: 'Falar de fim de relação, de perdas que a gente não escolheu e de luto leve.', contra: 'Divulgação, festa ou assuntos alegres.',
    descr: 'Um buquê de margaridas murchando devagar dentro de um vaso de vidro transparente, sobre uma mesinha de madeira, com pétalas soltas caindo lentamente e uma luz suave entrando pela janela. Fundo de papel de carta bege claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f2e4cc', '#fbf3e4', 'liso'); contorno(c, t);
      const luz = c.createLinearGradient(x - 0.3 * t, y - 0.35 * t, x + 0.05 * t, y + 0.2 * t); luz.addColorStop(0, 'rgba(255,245,200,0.7)'); luz.addColorStop(1, 'rgba(255,245,200,0)'); c.fillStyle = luz; linha(c, t, [[x - 0.34 * t, y - 0.34 * t], [x - 0.18 * t, y - 0.34 * t], [x + 0.12 * t, y + 0.25 * t], [x - 0.2 * t, y + 0.25 * t]], true); c.fill(); contorno(c, t);
      c.fillStyle = '#b57f4f'; retArredondado(c, x - 0.24 * t, y + 0.22 * t, 0.48 * t, 0.045 * t, 0.012 * t); c.fill(); c.stroke(); c.fillRect(x - 0.2 * t, y + 0.265 * t, 0.025 * t, 0.045 * t); c.fillRect(x + 0.175 * t, y + 0.265 * t, 0.025 * t, 0.045 * t); c.strokeRect(x - 0.2 * t, y + 0.265 * t, 0.025 * t, 0.045 * t); c.strokeRect(x + 0.175 * t, y + 0.265 * t, 0.025 * t, 0.045 * t);
      c.fillStyle = 'rgba(200,230,245,0.55)'; c.beginPath(); c.moveTo(x - 0.07 * t, y + 0.0 * t); c.lineTo(x - 0.09 * t, y + 0.1 * t); c.quadraticCurveTo(x - 0.12 * t, y + 0.22 * t, x, y + 0.22 * t); c.quadraticCurveTo(x + 0.12 * t, y + 0.22 * t, x + 0.09 * t, y + 0.1 * t); c.lineTo(x + 0.07 * t, y + 0.0 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(160,210,240,0.5)'; c.beginPath(); c.moveTo(x - 0.085 * t, y + 0.13 * t); c.quadraticCurveTo(x, y + 0.11 * t, x + 0.085 * t, y + 0.13 * t); c.quadraticCurveTo(x + 0.115 * t, y + 0.22 * t, x, y + 0.22 * t); c.quadraticCurveTo(x - 0.115 * t, y + 0.22 * t, x - 0.085 * t, y + 0.13 * t); c.fill();
      c.strokeStyle = '#5f9a55'; c.lineWidth = t * 0.012; [[-0.04, -0.12, -0.14], [0.0, -0.18, 0.0], [0.04, -0.1, 0.15]].forEach(([a, b, d]) => { c.beginPath(); c.moveTo(x + a * 0.5 * t, y + 0.18 * t); c.quadraticCurveTo(x + a * t, y - 0.02 * t, x + d * t, y + b * t); c.stroke(); });
      const flor = (fx, fy, caida, cor) => { c.save(); c.translate(fx, fy); c.rotate(caida); c.fillStyle = cor; for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2; c.beginPath(); c.ellipse(Math.cos(ang) * 0.03 * t, Math.sin(ang) * 0.03 * t + 0.01 * t * (Math.sin(ang) > 0 ? 1 : 0), 0.025 * t, 0.012 * t, ang + (Math.sin(ang) > 0.3 ? 0.4 : 0), 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#d9a52a'; c.beginPath(); c.arc(0, 0, 0.016 * t, 0, 7); c.fill(); c.stroke(); c.restore(); };
      flor(x - 0.14 * t, y - 0.14 * t, -0.5, '#f1ead8'); flor(x, y - 0.2 * t, 0.1, '#f6f0e0'); flor(x + 0.15 * t, y - 0.1 * t, 0.7, '#e9dfc6');
      c.fillStyle = '#f6f0e0'; [[0.2, 0.05, 0.8], [-0.2, 0.12, 2.1], [0.1, 0.17, 0.3], [-0.05, -0.02, 1.2]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.022 * t, 0.012 * t, g, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'a-bateria-social', nome: 'Criaturinha peluda de óculos e xícara', legenda: 'Minha bateria social já pediu arrego.', cat: 'anime', tom: 'exausto e engraçado',
    ind: 'Falar de cansaço social, de introversão e de precisar de um tempo só para si.', contra: 'Assuntos de convites, de eventos e de sociabilidade.',
    descr: 'Uma criaturinha redonda e peluda, rosa clarinha, de orelhinhas pontudas, com óculos de grau enormes escorregando pelo focinho. Ela segura uma xícara fumegante com as duas patinhas curtas e mostra desespero em cada traço, de olhos arregalados e boca ondulada. Fundo de papel de carta rosa, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd2ec', '#fff0f8', 'bolinhas'); contorno(c, t);
      const pelo = (cx, cy, rx, ry, n) => { c.beginPath(); for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, f = i % 2 ? 0.94 : 1.06; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f); } c.closePath(); };
      c.fillStyle = '#ffb8dc'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.2 * t, y - 0.12 * t], [x + s * 0.17 * t, y - 0.3 * t], [x + s * 0.07 * t, y - 0.2 * t]], true); c.fill(); c.stroke(); });
      pelo(x, y + 0.04 * t, 0.26 * t, 0.26 * t, 18); c.fill(); c.stroke(); c.fillStyle = '#ffd9ee'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.15 * t, 0.12 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ff8fc0'; c.beginPath(); c.moveTo(x - 0.03 * t, y - 0.24 * t); c.quadraticCurveTo(x, y - 0.33 * t, x + 0.05 * t, y - 0.24 * t); c.quadraticCurveTo(x + 0.01 * t, y - 0.27 * t, x - 0.03 * t, y - 0.24 * t); c.fill(); c.stroke();
      olho(c, x - 0.085 * t, y - 0.03 * t, t, 'vazio'); olho(c, x + 0.085 * t, y - 0.03 * t, t, 'vazio'); c.strokeStyle = 'rgba(120,70,120,0.55)'; c.lineWidth = t * 0.01; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + s * 0.085 * t, y - 0.0 * t, 0.045 * t, 0.3, Math.PI - 0.3); c.stroke(); }); contorno(c, t);
      c.lineWidth = t * 0.012; c.beginPath(); c.arc(x - 0.085 * t, y + 0.0 * t, 0.06 * t, 0, 7); c.stroke(); c.beginPath(); c.arc(x + 0.085 * t, y + 0.0 * t, 0.06 * t, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 0.025 * t, y - 0.0 * t); c.lineTo(x + 0.025 * t, y - 0.0 * t); c.stroke(); contorno(c, t);
      c.fillStyle = TINTA; c.beginPath(); c.ellipse(x, y + 0.045 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); bochechas(c, x, y + 0.06 * t, t, 0.16, 0.026);
      c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.1 * t); for (let i = 1; i <= 4; i++) c.lineTo(x - 0.05 * t + i * 0.025 * t, y + 0.1 * t + (i % 2 ? -0.012 : 0.012) * t); c.stroke();
      c.fillStyle = '#fff'; retArredondado(c, x - 0.07 * t, y + 0.15 * t, 0.14 * t, 0.12 * t, 0.025 * t); c.fill(); c.stroke(); c.fillStyle = '#a0683a'; c.fillRect(x - 0.06 * t, y + 0.16 * t, 0.12 * t, 0.025 * t); c.beginPath(); c.arc(x + 0.085 * t, y + 0.2 * t, 0.035 * t, -1.3, 1.3); c.stroke();
      c.strokeStyle = 'rgba(150,150,170,0.8)'; c.lineWidth = t * 0.012; [-0.03, 0.03].forEach((a) => { c.beginPath(); c.moveTo(x + a * t, y + 0.13 * t); c.quadraticCurveTo(x + (a - 0.03) * t, y + 0.08 * t, x + a * t, y + 0.04 * t); c.stroke(); });
      c.fillStyle = '#ffb8dc'; contorno(c, t); [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.075 * t, y + 0.22 * t, 0.032 * t, 0.026 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#7ec8ff'; c.beginPath(); c.moveTo(x + 0.19 * t, y - 0.1 * t); c.quadraticCurveTo(x + 0.22 * t, y - 0.04 * t, x + 0.19 * t, y - 0.03 * t); c.quadraticCurveTo(x + 0.16 * t, y - 0.04 * t, x + 0.19 * t, y - 0.1 * t); c.fill();
    } },
  { valor: 'a-dragao-bravo', nome: 'Dragãozinho verde emburrado', legenda: 'Bravo sim, mas continuo pitoresco.', cat: 'anime', tom: 'emburrado e fofo',
    ind: 'Mostrar irritação com humor, sem agressividade, e se declarar bravo com estilo.', contra: 'Conflitos reais em que a raiva precisa ser levada a sério.',
    descr: 'Um pequeno dragão verde de bochechas bem cheias e escamas brilhantes, sentado no chão de braços cruzados e cara emburrada, enquanto pequenas faíscas saem das narinas em forma de coração. Fundo de papel de carta verde clarinho, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d3f3d9', '#f0fbf2', 'xadrez'); contorno(c, t);
      c.fillStyle = '#4fbf6a'; c.beginPath(); c.moveTo(x + 0.17 * t, y + 0.22 * t); c.quadraticCurveTo(x + 0.33 * t, y + 0.2 * t, x + 0.3 * t, y + 0.06 * t); c.quadraticCurveTo(x + 0.27 * t, y + 0.15 * t, x + 0.15 * t, y + 0.15 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#7ee08f'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.17 * t, y + 0.03 * t], [x + s * 0.3 * t, y - 0.1 * t], [x + s * 0.22 * t, y + 0.12 * t]], true); c.fill(); c.stroke(); });
      c.fillStyle = '#4fbf6a'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#d6f5b8'; c.beginPath(); c.ellipse(x, y + 0.17 * t, 0.1 * t, 0.12 * t, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(80,150,90,0.6)'; c.lineWidth = t * 0.008; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 0.08 * t, y + (0.08 + i * 0.045) * t); c.lineTo(x + 0.08 * t, y + (0.08 + i * 0.045) * t); c.stroke(); } contorno(c, t);
      [-1, 1].forEach((s) => { c.fillStyle = '#4fbf6a'; c.beginPath(); c.ellipse(x + s * 0.13 * t, y + 0.3 * t, 0.07 * t, 0.04 * t, s * -0.2, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffe14d'; [[-0.06, -0.3], [0.0, -0.33], [0.06, -0.3]].forEach(([a, b]) => { linha(c, t, [[x + (a - 0.025) * t, y + (b + 0.04) * t], [x + a * t, y + b * t], [x + (a + 0.025) * t, y + (b + 0.04) * t]], true); c.fill(); c.stroke(); });
      c.fillStyle = '#4fbf6a'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.14 * t, y - 0.19 * t], [x + s * 0.19 * t, y - 0.32 * t], [x + s * 0.07 * t, y - 0.24 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.2 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#9af0a8'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.13 * t, y - 0.07 * t, 0.06 * t, 0.05 * t, 0, 0, 7); c.fill(); }); bochechas(c, x, y - 0.04 * t, t, 0.14, 0.03);
      c.lineWidth = t * 0.016; c.beginPath(); c.moveTo(x - 0.12 * t, y - 0.16 * t); c.lineTo(x - 0.04 * t, y - 0.13 * t); c.moveTo(x + 0.12 * t, y - 0.16 * t); c.lineTo(x + 0.04 * t, y - 0.13 * t); c.stroke(); contorno(c, t); olho(c, x - 0.075 * t, y - 0.1 * t, t, 'ponto'); olho(c, x + 0.075 * t, y - 0.1 * t, t, 'ponto');
      c.beginPath(); c.moveTo(x - 0.045 * t, y + 0.0 * t); c.quadraticCurveTo(x, y - 0.035 * t, x + 0.045 * t, y + 0.0 * t); c.stroke(); c.fillStyle = TINTA; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.015 * t, y - 0.045 * t, 0.006 * t, 0.009 * t, 0, 0, 7); c.fill(); });
      c.fillStyle = '#ff6f9a'; [[-0.13, 0.04, 0.025], [0.14, -0.0, 0.02], [-0.19, -0.04, 0.016]].forEach(([a, b, r]) => { coracao(c, x + a * t, y + b * t, r * t); c.fill(); });
      c.fillStyle = '#4fbf6a'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.0 * t, y + 0.12 * t, 0.15 * t, 0.045 * t, s * 0.05, 0, 7); }); c.beginPath(); c.ellipse(x - 0.03 * t, y + 0.12 * t, 0.14 * t, 0.045 * t, 0.15, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.03 * t, y + 0.15 * t, 0.14 * t, 0.045 * t, -0.15, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'a-derretido', nome: 'Filhote de cauda de raio derretido de preguiça', legenda: 'Minha meta de hoje era vencer na vida, mas a cama me ganhou.', cat: 'anime', tom: 'preguiçoso e engraçado',
    ind: 'Falar de dia de descanso, de preguiça e de metas que ficam para depois.', contra: 'Assuntos de produtividade, de foco e de cobrança.',
    descr: 'Um filhotinho de quatro patas, lilás acinzentado, com uma cauda em forma de raio amarelo e tufos de pelo despenteados na cabeça, deitado de barriga para cima com as quatro patinhas para o alto, completamente derretido de preguiça. Fundo de papel de carta lilás, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e4dbff', '#f5f1ff', 'bolinhas'); contorno(c, t);
      c.fillStyle = 'rgba(160,140,200,0.35)'; c.beginPath(); c.ellipse(x, y + 0.27 * t, 0.3 * t, 0.06 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ffe14d'; linha(c, t, [[x + 0.16 * t, y + 0.12 * t], [x + 0.27 * t, y + 0.06 * t], [x + 0.23 * t, y + 0.15 * t], [x + 0.32 * t, y + 0.1 * t], [x + 0.22 * t, y + 0.26 * t], [x + 0.22 * t, y + 0.18 * t], [x + 0.15 * t, y + 0.2 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#b8a5e0'; [[-0.14, -0.02, -0.15], [-0.04, -0.06, 0.0], [0.07, -0.05, 0.1], [0.16, -0.0, 0.2]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.03 * t, 0.075 * t, g, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffb3cc'; c.beginPath(); c.arc(x + (a + g * 0.1) * t, y + (b - 0.05) * t, 0.012 * t, 0, 7); c.fill(); c.fillStyle = '#b8a5e0'; });
      c.beginPath(); c.ellipse(x + 0.0 * t, y + 0.17 * t, 0.22 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#e8dcff'; c.beginPath(); c.ellipse(x + 0.0 * t, y + 0.17 * t, 0.15 * t, 0.07 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#b8a5e0'; [-1, 1].forEach((s) => { linha(c, t, [[x - 0.22 * t + s * 0.09 * t, y + 0.18 * t], [x - 0.22 * t + s * 0.07 * t, y + 0.05 * t], [x - 0.22 * t + s * 0.01 * t, y + 0.12 * t]], true); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x - 0.22 * t, y + 0.2 * t, 0.12 * t, 0.1 * t, 0.2, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#a590d4'; [[-0.3, 0.1], [-0.25, 0.08], [-0.2, 0.09]].forEach(([a, b]) => { linha(c, t, [[x + a * t, y + (b + 0.02) * t], [x + (a + 0.01) * t, y + (b - 0.06) * t], [x + (a + 0.025) * t, y + (b + 0.02) * t]], true); c.fill(); c.stroke(); });
      c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.27 * t, y + 0.2 * t); c.quadraticCurveTo(x - 0.24 * t, y + 0.22 * t, x - 0.21 * t, y + 0.2 * t); c.stroke(); olho(c, x - 0.26 * t, y + 0.18 * t, t * 0.9, 'fechado'); olho(c, x - 0.19 * t, y + 0.18 * t, t * 0.9, 'fechado'); bochechas(c, x - 0.225 * t, y + 0.2 * t, t, 0.06, 0.018); c.fillStyle = '#ff7a98'; c.beginPath(); c.ellipse(x - 0.225 * t, y + 0.235 * t, 0.014 * t, 0.02 * t, 0, 0, Math.PI); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = `700 ${t * 0.06}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.fillStyle = '#9a86c8'; c.fillText('z z z', x - 0.1 * t, y - 0.24 * t);
    } },
  { valor: 'a-fisiculturista', nome: 'Criaturinha aquática fisiculturista', legenda: 'Treino pesado: levanto suspeitas o dia todo.', cat: 'anime', tom: 'convencido e engraçado',
    ind: 'Brincar com academia, treino, autoestima e confiança exagerada.', contra: 'Assuntos de saúde e de corpo, que podem magoar.',
    descr: 'Uma criaturinha aquática redonda, azul clarinha, de bochechas rosadas, com uma boia de patinho amarela na cintura, fazendo pose de fisiculturista com os bracinhos finos dobrados e o rosto concentrado. Fundo de papel de carta azul claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cfeaff', '#eef8ff', 'xadrez'); contorno(c, t);
      c.fillStyle = '#8fd0ff'; linha(c, t, [[x + 0.0 * t, y - 0.3 * t], [x + 0.045 * t, y - 0.2 * t], [x - 0.045 * t, y - 0.2 * t]], true); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.17 * t, y - 0.12 * t], [x + s * 0.24 * t, y - 0.2 * t], [x + s * 0.2 * t, y - 0.07 * t]], true); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y + 0.04 * t, 0.2 * t, 0.26 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#d6efff'; c.beginPath(); c.ellipse(x, y + 0.1 * t, 0.12 * t, 0.15 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#8fd0ff'; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * 0.19 * t, y + 0.0 * t); c.quadraticCurveTo(x + s * 0.3 * t, y - 0.03 * t, x + s * 0.28 * t, y - 0.14 * t); c.lineTo(x + s * 0.25 * t, y - 0.13 * t); c.quadraticCurveTo(x + s * 0.26 * t, y - 0.06 * t, x + s * 0.18 * t, y - 0.04 * t); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(x + s * 0.275 * t, y - 0.09 * t, 0.028 * t, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(x + s * 0.28 * t, y - 0.16 * t, 0.022 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ffe14d'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.2 * t, 0.055 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff2a0'; c.beginPath(); c.ellipse(x, y + 0.13 * t, 0.15 * t, 0.025 * t, 0, 0, 7); c.fill(); c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(x + 0.17 * t, y + 0.09 * t, 0.045 * t, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ff9f1c'; linha(c, t, [[x + 0.21 * t, y + 0.085 * t], [x + 0.255 * t, y + 0.095 * t], [x + 0.21 * t, y + 0.105 * t]], true); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.arc(x + 0.175 * t, y + 0.08 * t, 0.006 * t, 0, 7); c.fill();
      [-1, 1].forEach((s) => { c.fillStyle = '#8fd0ff'; c.beginPath(); c.ellipse(x + s * 0.08 * t, y + 0.3 * t, 0.06 * t, 0.032 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.lineWidth = t * 0.018; c.beginPath(); c.moveTo(x - 0.11 * t, y - 0.12 * t); c.lineTo(x - 0.03 * t, y - 0.09 * t); c.moveTo(x + 0.11 * t, y - 0.12 * t); c.lineTo(x + 0.03 * t, y - 0.09 * t); c.stroke(); contorno(c, t); olho(c, x - 0.07 * t, y - 0.06 * t, t, 'ponto'); olho(c, x + 0.07 * t, y - 0.06 * t, t, 'ponto'); bochechas(c, x, y - 0.0 * t, t, 0.13, 0.03);
      c.beginPath(); c.moveTo(x - 0.04 * t, y + 0.03 * t); c.lineTo(x + 0.04 * t, y + 0.03 * t); c.stroke(); c.fillStyle = '#7ec8ff'; [[0.2, -0.22], [-0.2, -0.25]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.quadraticCurveTo(x + (a + 0.02) * t, y + (b + 0.03) * t, x + a * t, y + (b + 0.045) * t); c.quadraticCurveTo(x + (a - 0.02) * t, y + (b + 0.03) * t, x + a * t, y + b * t); c.fill(); });
    } },
  { valor: 'a-fantasminha', nome: 'Fantasminha roxo atrás da folha', legenda: 'Invisível para as obrigações, presente para a fofoca.', cat: 'anime', tom: 'travesso e fofoqueiro',
    ind: 'Brincar com fugir de responsabilidades e com a curiosidade sobre a vida dos outros.', contra: 'Assuntos sérios, de trabalho ou de confiança.',
    descr: 'Um pequeno fantasma roxo de olhos grandes e brilhantes, escondido atrás de uma folha gigante, espiando de lado com um sorriso sapeca no canto da boca e uma gotinha de suor na testa, no estilo clássico de mangá. Fundo de papel de carta lilás, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e7d9ff', '#f6f0ff', 'bolinhas'); contorno(c, t);
      const g = c.createRadialGradient(x, y, 0, x, y, t * 0.3); g.addColorStop(0, 'rgba(190,150,255,0.4)'); g.addColorStop(1, 'rgba(190,150,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, t * 0.3, 0, 7); c.fill(); contorno(c, t);
      c.fillStyle = '#a877e8'; c.beginPath(); c.moveTo(x - 0.2 * t, y + 0.28 * t); c.quadraticCurveTo(x - 0.26 * t, y - 0.3 * t, x, y - 0.3 * t); c.quadraticCurveTo(x + 0.26 * t, y - 0.3 * t, x + 0.2 * t, y + 0.28 * t); for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + (0.15 - i * 0.1) * t, y + 0.2 * t, x + (0.1 - i * 0.1) * t, y + 0.28 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#c4a0f5'; c.beginPath(); c.ellipse(x - 0.07 * t, y - 0.12 * t, 0.06 * t, 0.1 * t, 0.3, 0, 7); c.fill();
      [-1, 1].forEach((s) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + s * 0.075 * t, y - 0.12 * t, 0.045 * t, 0.06 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x + s * 0.08 * t, y - 0.115 * t, 0.026 * t, 0.04 * t, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + s * 0.07 * t, y - 0.13 * t, 0.01 * t, 0, 7); c.fill(); });
      c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.12 * t, y - 0.2 * t); c.lineTo(x - 0.04 * t, y - 0.18 * t); c.stroke(); c.fillStyle = '#7ec8ff'; c.beginPath(); c.moveTo(x + 0.13 * t, y - 0.22 * t); c.quadraticCurveTo(x + 0.17 * t, y - 0.16 * t, x + 0.13 * t, y - 0.14 * t); c.quadraticCurveTo(x + 0.09 * t, y - 0.16 * t, x + 0.13 * t, y - 0.22 * t); c.fill(); c.stroke(); bochechas(c, x, y - 0.06 * t, t, 0.13, 0.026);
      c.beginPath(); c.moveTo(x - 0.03 * t, y - 0.03 * t); c.quadraticCurveTo(x + 0.03 * t, y - 0.01 * t, x + 0.07 * t, y - 0.055 * t); c.stroke();
      c.fillStyle = '#4caf6a'; c.beginPath(); c.moveTo(x - 0.34 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.4 * t, y - 0.14 * t, x - 0.02 * t, y - 0.08 * t); c.quadraticCurveTo(x + 0.04 * t, y + 0.2 * t, x - 0.34 * t, y + 0.3 * t); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = '#2f7a46'; c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.33 * t, y + 0.28 * t); c.quadraticCurveTo(x - 0.2 * t, y + 0.1 * t, x - 0.04 * t, y - 0.06 * t); c.stroke(); c.lineWidth = t * 0.008; [[-0.26, 0.2, -0.28, 0.08], [-0.2, 0.13, -0.24, 0.0], [-0.15, 0.07, -0.16, -0.04], [-0.26, 0.2, -0.12, 0.2], [-0.2, 0.13, -0.06, 0.16]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#a877e8'; c.beginPath(); c.ellipse(x - 0.045 * t, y - 0.04 * t, 0.03 * t, 0.024 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'a-arrepiada', nome: 'Criaturinha amarela arrepiada', legenda: 'Isso que dá acordar cedo.', cat: 'anime', tom: 'elétrico e rabugento',
    ind: 'Falar de manhã difícil, de acordar cedo e de dias de energia demais ou de menos.', contra: 'Assuntos de calma, de meditação ou de sossego.',
    descr: 'Uma criaturinha amarela clarinha, de orelhas compridas com as pontas roxo escuro, de bochechas rosadas inchadas e faíscas de eletricidade estática por todo lado, deixando os pelos totalmente arrepiados para cima, com a cara de quem acordou cedo demais. Fundo de papel de carta amarelo, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#fff1a8', '#fffbe0', 'bolinhas'); contorno(c, t);
      c.strokeStyle = '#f2a900'; c.lineWidth = t * 0.014; [[-0.28, -0.1], [0.28, -0.12], [-0.25, 0.18], [0.27, 0.16], [0.0, -0.36]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a + 0.03) * t, y + (b + 0.04) * t); c.lineTo(x + (a - 0.01) * t, y + (b + 0.05) * t); c.lineTo(x + (a + 0.03) * t, y + (b + 0.1) * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#ffe66b'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.08 * t, y - 0.16 * t], [x + s * 0.19 * t, y - 0.42 * t], [x + s * 0.2 * t, y - 0.12 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#4b3a7a'; linha(c, t, [[x + s * 0.17 * t, y - 0.36 * t], [x + s * 0.19 * t, y - 0.42 * t], [x + s * 0.2 * t, y - 0.3 * t]], true); c.fill(); c.fillStyle = '#ffe66b'; });
      const pontas = (cx, cy, rx, ry, n) => { c.beginPath(); for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, f = i % 2 ? 0.9 : 1.15; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f); } c.closePath(); };
      pontas(x, y + 0.16 * t, 0.17 * t, 0.15 * t, 14); c.fill(); c.stroke(); c.fillStyle = '#fff1b0'; c.beginPath(); c.ellipse(x, y + 0.2 * t, 0.1 * t, 0.09 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ffe66b'; pontas(x, y - 0.04 * t, 0.2 * t, 0.17 * t, 16); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { c.fillStyle = '#ff8fa0'; c.beginPath(); c.ellipse(x + s * 0.14 * t, y + 0.0 * t, 0.045 * t, 0.04 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffe66b'; });
      olho(c, x - 0.08 * t, y - 0.06 * t, t, 'meio', '#ffe66b'); olho(c, x + 0.08 * t, y - 0.06 * t, t, 'meio', '#ffe66b'); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x, y - 0.015 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x - 0.03 * t, y + 0.03 * t); c.quadraticCurveTo(x, y + 0.01 * t, x + 0.03 * t, y + 0.03 * t); c.stroke();
      c.strokeStyle = '#f2a900'; c.lineWidth = t * 0.012; [[-0.2, 0.05], [0.2, 0.03]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a - 0.03 * Math.sign(a)) * t, y + (b + 0.03) * t); c.lineTo(x + (a + 0.01 * Math.sign(a)) * t, y + (b + 0.04) * t); c.lineTo(x + (a - 0.02 * Math.sign(a)) * t, y + (b + 0.08) * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#ffe66b'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.08 * t, y + 0.3 * t, 0.05 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'a-raposinha', nome: 'Filhote de raposa e o pote de biscoitos', legenda: 'Determinada a cometer erros deliciosos.', cat: 'anime', tom: 'travesso e esperançoso',
    ind: 'Falar de desejo, de doces, de tentar alcançar o que está alto demais e de pequenas travessuras.', contra: 'Assuntos de dieta e de disciplina rígida.',
    descr: 'Um filhote de raposa de pelagem alaranjada e fofa, com uma cauda enorme, esticando o corpinho ao máximo, na ponta dos pés, para alcançar um pote de biscoitos na ponta de uma prateleira alta, com olhinhos pidões. Fundo de papel de carta laranja claro, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffe2c4', '#fff4e6', 'xadrez'); contorno(c, t);
      c.fillStyle = '#b57a45'; retArredondado(c, x + 0.04 * t, y - 0.2 * t, 0.3 * t, 0.035 * t, 0.01 * t); c.fill(); c.stroke(); c.fillRect(x + 0.1 * t, y - 0.165 * t, 0.025 * t, 0.045 * t); c.fillRect(x + 0.27 * t, y - 0.165 * t, 0.025 * t, 0.045 * t);
      c.fillStyle = 'rgba(200,235,255,0.6)'; retArredondado(c, x + 0.15 * t, y - 0.36 * t, 0.12 * t, 0.16 * t, 0.025 * t); c.fill(); c.stroke(); c.fillStyle = '#c98f5f'; c.fillRect(x + 0.145 * t, y - 0.385 * t, 0.13 * t, 0.03 * t); c.strokeRect(x + 0.145 * t, y - 0.385 * t, 0.13 * t, 0.03 * t); c.fillStyle = '#d9a35f'; [[0.18, -0.26], [0.22, -0.28], [0.2, -0.23], [0.24, -0.24]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.016 * t, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#ff9a3c'; c.beginPath(); c.moveTo(x - 0.1 * t, y + 0.28 * t); c.quadraticCurveTo(x - 0.34 * t, y + 0.3 * t, x - 0.3 * t, y + 0.05 * t); c.quadraticCurveTo(x - 0.2 * t, y + 0.12 * t, x - 0.08 * t, y + 0.18 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x - 0.3 * t, y + 0.05 * t); c.quadraticCurveTo(x - 0.3 * t, y + 0.12 * t, x - 0.26 * t, y + 0.12 * t); c.quadraticCurveTo(x - 0.26 * t, y + 0.08 * t, x - 0.3 * t, y + 0.05 * t); c.fill();
      c.fillStyle = '#ff9a3c'; c.beginPath(); c.ellipse(x - 0.02 * t, y + 0.12 * t, 0.1 * t, 0.17 * t, 0.1, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff3e0'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.14 * t, 0.05 * t, 0.1 * t, 0.1, 0, 7); c.fill();
      c.fillStyle = '#4a3434'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x - 0.02 * t + s * 0.06 * t, y + 0.3 * t, 0.035 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = '#ff9a3c'; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + (s > 0 ? 0.06 : -0.06) * t - 0.02 * t, y + 0.0 * t); c.quadraticCurveTo(x + s * 0.12 * t, y - 0.12 * t, x + s * 0.09 * t - 0.0 * t, y - 0.2 * t); c.quadraticCurveTo(x + s * 0.05 * t, y - 0.12 * t, x + s * 0.03 * t - 0.0 * t, y - 0.07 * t); c.closePath(); c.fill(); c.stroke(); });
      [-1, 1].forEach((s) => { linha(c, t, [[x - 0.02 * t + s * 0.105 * t, y - 0.13 * t], [x - 0.02 * t + s * 0.1 * t, y - 0.29 * t], [x - 0.02 * t + s * 0.02 * t, y - 0.185 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#4a3434'; linha(c, t, [[x - 0.02 * t + s * 0.092 * t, y - 0.2 * t], [x - 0.02 * t + s * 0.097 * t, y - 0.265 * t], [x - 0.02 * t + s * 0.05 * t, y - 0.2 * t]], true); c.fill(); c.fillStyle = '#ff9a3c'; });
      c.beginPath(); c.ellipse(x - 0.02 * t, y - 0.1 * t, 0.12 * t, 0.1 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff3e0'; c.beginPath(); c.ellipse(x - 0.02 * t, y - 0.07 * t, 0.07 * t, 0.05 * t, 0, 0, 7); c.fill(); olho(c, x - 0.065 * t, y - 0.12 * t, t, 'grande'); olho(c, x + 0.025 * t, y - 0.12 * t, t, 'grande'); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x - 0.02 * t, y - 0.075 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); bochechas(c, x - 0.02 * t, y - 0.07 * t, t, 0.09, 0.02);
    } },
  { valor: 'a-lagartinho-sono', nome: 'Lagartinho de touca e leite quente', legenda: 'Fogo interno aceso, mas a mente já desligou.', cat: 'anime', tom: 'sonolento e carinhoso',
    ind: 'Falar de sono, de fim de dia, de cansaço bom e de aconchego.', contra: 'Assuntos de trabalho, de foco ou de urgência.',
    descr: 'Um pequeno lagarto laranja que anda sobre duas pernas, com a ponta da cauda em chama, sentado com uma touca de dormir listrada torta na cabeça e segurando uma mamadeira com leite quente, com uma expressão de sono profundo. Fundo de papel de carta rosa alaranjado, com bolinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd9cc', '#fff0ea', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#ff8a4c'; c.beginPath(); c.moveTo(x + 0.14 * t, y + 0.22 * t); c.quadraticCurveTo(x + 0.3 * t, y + 0.26 * t, x + 0.3 * t, y + 0.1 * t); c.quadraticCurveTo(x + 0.24 * t, y + 0.17 * t, x + 0.12 * t, y + 0.14 * t); c.closePath(); c.fill(); c.stroke(); chamas(c, x + 0.3 * t, y + 0.12 * t, t * 0.8, 3);
      c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.16 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffd9a8'; c.beginPath(); c.ellipse(x, y + 0.17 * t, 0.09 * t, 0.11 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ff8a4c'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.09 * t, y + 0.3 * t, 0.06 * t, 0.035 * t, s * -0.2, 0, 7); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.17 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); [-1, 1].forEach((s) => { c.fillStyle = '#ffb07a'; c.beginPath(); c.arc(x + s * 0.17 * t, y - 0.07 * t, 0.02 * t, 0, 7); c.fill(); c.stroke(); });
      olho(c, x - 0.06 * t, y - 0.05 * t, t, 'fechado'); olho(c, x + 0.06 * t, y - 0.05 * t, t, 'fechado'); c.fillStyle = '#ff8a4c'; bochechas(c, x, y + 0.0 * t, t, 0.11, 0.026); c.strokeStyle = TINTA; c.lineWidth = t * 0.012; c.beginPath(); c.arc(x, y + 0.02 * t, 0.018 * t, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = TINTA; [-1, 1].forEach((s) => { c.beginPath(); c.arc(x + s * 0.02 * t, y - 0.01 * t, 0.004 * t, 0, 7); c.fill(); });
      c.save(); c.translate(x + 0.02 * t, y - 0.16 * t); c.rotate(0.35); linha(c, t, [[-0.15 * t, 0.07 * t], [0.0, -0.17 * t], [0.15 * t, 0.07 * t]], true); c.fillStyle = '#fff'; c.fill(); c.save(); linha(c, t, [[-0.15 * t, 0.07 * t], [0.0, -0.17 * t], [0.15 * t, 0.07 * t]], true); c.clip(); c.fillStyle = '#6fa8ff'; for (let i = 0; i < 6; i++) c.fillRect(-0.2 * t, -0.15 * t + i * 0.055 * t, 0.4 * t, 0.025 * t); c.restore(); c.strokeStyle = TINTA; c.lineWidth = t * 0.014; linha(c, t, [[-0.15 * t, 0.07 * t], [0.0, -0.17 * t], [0.15 * t, 0.07 * t]], true); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0.0, -0.19 * t, 0.032 * t, 0, 7); c.fill(); c.stroke(); c.restore();
      c.fillStyle = '#ff8a4c'; c.fillStyle = '#fff'; retArredondado(c, x - 0.06 * t, y + 0.14 * t, 0.07 * t, 0.12 * t, 0.02 * t); c.fill(); c.stroke(); c.fillStyle = '#ffe9d0'; c.fillRect(x - 0.05 * t, y + 0.18 * t, 0.05 * t, 0.07 * t); c.fillStyle = '#ffd1a1'; c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.14 * t); c.lineTo(x - 0.03 * t, y + 0.09 * t); c.lineTo(x - 0.01 * t, y + 0.14 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff8a4c'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x - 0.02 * t + s * 0.025 * t, y + 0.17 * t, 0.025 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#9a86c8'; c.font = `700 ${t * 0.06}px "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.fillText('z z', x + 0.2 * t, y - 0.22 * t);
    } },
  { valor: 'a-tartaruguinha', nome: 'Tartaruguinha de óculos escuros na boia', legenda: 'Absorvendo oxigênio e zero estresse.', cat: 'anime', tom: 'tranquilo e estiloso',
    ind: 'Falar de férias, de relaxar, de ficar zen e de deixar a vida levar.', contra: 'Assuntos de urgência e de prazo.',
    descr: 'Uma criaturinha aquática parecida com uma tartaruga, de óculos de sol escuros e estilosos, relaxando deitada de bruços numa boia redonda, com uma patinha para fora balançando tranquilamente sobre a água. Fundo de papel de carta azul turquesa, com ondinhas.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c9f0f2', '#e6fafb', 'liso'); contorno(c, t);
      c.strokeStyle = 'rgba(80,170,200,0.5)'; c.lineWidth = t * 0.012; for (let r = 0; r < 4; r++) { c.beginPath(); for (let i = 0; i <= 10; i++) { const px = x - 0.3 * t + i * 0.06 * t; c[i ? 'quadraticCurveTo' : 'moveTo'](...(i ? [px - 0.03 * t, y + (0.2 + r * 0.045 + ((i % 2) ? -0.012 : 0.012)) * t, px, y + (0.2 + r * 0.045) * t] : [px, y + (0.2 + r * 0.045) * t])); } c.stroke(); } contorno(c, t);
      c.fillStyle = '#ff7aa8'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.3 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff'; [-0.2, -0.05, 0.1, 0.24].forEach((a) => { c.beginPath(); c.ellipse(x + a * t, y + 0.14 * t, 0.03 * t, 0.012 * t, 0, 0, 7); c.fill(); }); c.fillStyle = '#e0f7fb'; c.beginPath(); c.ellipse(x, y + 0.13 * t, 0.17 * t, 0.055 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#5bbf72'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.03 * t, 0.17 * t, 0.11 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#7ad98e'; [[-0.07, 0.0], [0.0, -0.02], [0.07, 0.0], [-0.035, 0.05], [0.035, 0.05]].forEach(([a, b]) => { linha(c, t, [[x + (a - 0.03) * t, y + (b + 0.0) * t], [x + a * t, y + (b - 0.03) * t], [x + (a + 0.03) * t, y + b * t], [x + (a + 0.03) * t, y + (b + 0.03) * t], [x + a * t, y + (b + 0.05) * t], [x + (a - 0.03) * t, y + (b + 0.03) * t]], true); c.fill(); c.stroke(); });
      c.fillStyle = '#a8e6b4'; c.beginPath(); c.ellipse(x - 0.19 * t, y + 0.0 * t, 0.075 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#c9f5d0'; c.beginPath(); c.ellipse(x - 0.2 * t, y + 0.02 * t, 0.045 * t, 0.035 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#2f2f3a'; c.strokeStyle = TINTA; retArredondado(c, x - 0.26 * t, y - 0.03 * t, 0.055 * t, 0.035 * t, 0.012 * t); c.fill(); c.stroke(); retArredondado(c, x - 0.2 * t, y - 0.03 * t, 0.055 * t, 0.035 * t, 0.012 * t); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - 0.205 * t, y - 0.018 * t); c.lineTo(x - 0.2 * t, y - 0.018 * t); c.stroke(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - 0.25 * t, y - 0.025 * t, 0.02 * t, 0.006 * t); c.fillRect(x - 0.19 * t, y - 0.025 * t, 0.02 * t, 0.006 * t);
      bochechas(c, x - 0.225 * t, y + 0.03 * t, t, 0.045, 0.014); c.lineWidth = t * 0.01; c.beginPath(); c.arc(x - 0.225 * t, y + 0.03 * t, 0.012 * t, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#a8e6b4'; c.beginPath(); c.ellipse(x + 0.17 * t, y + 0.15 * t, 0.035 * t, 0.055 * t, -0.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x - 0.12 * t, y + 0.18 * t, 0.03 * t, 0.05 * t, 0.2, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#a8e6b4'; c.beginPath(); c.ellipse(x + 0.2 * t, y + 0.24 * t, 0.03 * t, 0.05 * t, 0.1, 0, 7); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = t * 0.01; [-0.04, 0.04].forEach((d) => { c.beginPath(); c.ellipse(x + (0.2 + d) * t, y + 0.29 * t, 0.025 * t, 0.008 * t, 0, 0, 7); c.stroke(); });
    } },
  { valor: 'a-monstrinho-flor', nome: 'Monstrinho roxo com flor nas costas', legenda: 'Plena e fotossintética, mesmo sem entender nada.', cat: 'anime', tom: 'sereno e feliz',
    ind: 'Falar de bem-estar, de natureza, de contentamento simples e de dias bons.', contra: 'Assuntos de luto, de raiva ou de pressa.',
    descr: 'Um pequeno monstrinho roxo de quatro patas, com uma flor rosa desabrochando nas costas, de olhos fechados e um sorriso enorme e sonolento, enquanto borboletas voam em volta da cabeça. Fundo de papel de carta lilás, com xadrez.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ecd9ff', '#f8f0ff', 'xadrez'); contorno(c, t);
      c.fillStyle = '#9b6fe0'; [[-0.18, 0.29], [-0.06, 0.3], [0.08, 0.3], [0.2, 0.29]].forEach(([a, b]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.045 * t, 0.038 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.beginPath(); c.ellipse(x + 0.02 * t, y + 0.16 * t, 0.26 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#c9a8f5'; c.beginPath(); c.ellipse(x + 0.02 * t, y + 0.2 * t, 0.17 * t, 0.08 * t, 0, 0, 7); c.fill();
      c.strokeStyle = '#4caf6a'; c.lineWidth = t * 0.016; c.beginPath(); c.moveTo(x + 0.12 * t, y + 0.05 * t); c.quadraticCurveTo(x + 0.14 * t, y - 0.05 * t, x + 0.12 * t, y - 0.1 * t); c.stroke(); c.fillStyle = '#6fd08a'; [[0.14, -0.02, 0.5], [0.1, 0.0, 2.6]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.03 * t, 0.014 * t, g, 0, 7); c.fill(); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#ff8fc0'; for (let i = 0; i < 7; i++) { const ang = (i / 7) * Math.PI * 2; c.beginPath(); c.ellipse(x + 0.12 * t + Math.cos(ang) * 0.05 * t, y - 0.14 * t + Math.sin(ang) * 0.05 * t, 0.034 * t, 0.026 * t, ang, 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x + 0.12 * t, y - 0.14 * t, 0.025 * t, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#9b6fe0'; [-1, 1].forEach((s) => { linha(c, t, [[x - 0.14 * t + s * 0.12 * t, y + 0.0 * t], [x - 0.14 * t + s * 0.1 * t, y - 0.12 * t], [x - 0.14 * t + s * 0.03 * t, y - 0.04 * t]], true); c.fill(); c.stroke(); }); c.beginPath(); c.ellipse(x - 0.14 * t, y + 0.07 * t, 0.17 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#c9a8f5'; c.beginPath(); c.ellipse(x - 0.14 * t, y + 0.11 * t, 0.1 * t, 0.07 * t, 0, 0, 7); c.fill();
      olho(c, x - 0.2 * t, y + 0.05 * t, t, 'fechado'); olho(c, x - 0.09 * t, y + 0.05 * t, t, 'fechado'); bochechas(c, x - 0.145 * t, y + 0.09 * t, t, 0.1, 0.026); c.strokeStyle = TINTA; c.lineWidth = t * 0.014; c.beginPath(); c.arc(x - 0.145 * t, y + 0.09 * t, 0.045 * t, 0.15, Math.PI - 0.15); c.stroke(); c.fillStyle = '#ff7a98'; c.beginPath(); c.ellipse(x - 0.145 * t, y + 0.125 * t, 0.022 * t, 0.014 * t, 0, 0, Math.PI); c.fill();
      [['#ffb3d1', -0.28, -0.12, 0.5], ['#ffd166', -0.04, -0.26, -0.4], ['#a9d6ff', -0.24, -0.26, 0.2]].forEach(([cor, a, b, g]) => { c.save(); c.translate(x + a * t, y + b * t); c.rotate(g); c.fillStyle = cor; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(s * 0.02 * t, -0.01 * t, 0.026 * t, 0.034 * t, s * 0.4, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = TINTA; c.fillRect(-0.004 * t, -0.015 * t, 0.008 * t, 0.045 * t); c.restore(); });
    } },
  { valor: 'm-estrela-rosa', nome: 'Garota mágica de marias-chiquinhas rosadas', legenda: 'Mesmo que o mundo desabe, eu sigo no que acredito.', cat: 'magicas', tom: 'determinado e melancólico',
    ind: 'Falar de perseverança, de acreditar em algo apesar das dificuldades e de coragem.', contra: 'Assuntos leves ou de humor.',
    descr: 'Uma garota de cabelos rosados longos, presos em marias-chiquinhas volumosas, com um laço brilhante no peito. Ela flutua de braços abertos, enquanto plumas de luz e corações estilhaçados flutuam ao redor. Os olhos grandes têm um brilho determinado, mas com um fundo melancólico. Fundo de papel de carta rosa, com brilho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffd3e8', '#ffeef7', 'liso'); contorno(c, t); magia(c, x, y, t, 'rgba(255,200,230,0.7)');
      c.fillStyle = '#ff9ec7'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.2 * t, y - 0.04 * t, 0.075 * t, 0.2 * t, s * 0.25, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffc2dc'; c.beginPath(); c.ellipse(x + s * 0.21 * t, y - 0.07 * t, 0.025 * t, 0.12 * t, s * 0.25, 0, 7); c.fill(); c.fillStyle = '#ff9ec7'; });
      c.fillStyle = '#ffd9e8'; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * 0.05 * t, y + 0.06 * t); c.quadraticCurveTo(x + s * 0.2 * t, y + 0.02 * t, x + s * 0.3 * t, y - 0.06 * t); c.lineTo(x + s * 0.3 * t, y - 0.02 * t); c.quadraticCurveTo(x + s * 0.2 * t, y + 0.08 * t, x + s * 0.06 * t, y + 0.11 * t); c.closePath(); c.fill(); c.stroke(); });
      c.fillStyle = '#ff7fb5'; linha(c, t, [[x - 0.09 * t, y + 0.05 * t], [x + 0.09 * t, y + 0.05 * t], [x + 0.14 * t, y + 0.3 * t], [x - 0.14 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x - 0.045 * t, y + 0.12 * t, 0.05 * t, 0.03 * t, 0.4, 0, 7); c.ellipse(x + 0.045 * t, y + 0.12 * t, 0.05 * t, 0.03 * t, -0.4, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffd23f'; estrela(c, x, y + 0.12 * t, 0.032 * t, 0.014 * t, 5); c.fill(); c.stroke();
      [-1, 1].forEach((s) => { c.fillStyle = '#ffd9e8'; c.beginPath(); c.ellipse(x + s * 0.06 * t, y + 0.32 * t, 0.03 * t, 0.045 * t, 0, 0, 7); c.fill(); c.stroke(); });
      rostoManga(c, x, y - 0.1 * t, t, { pele: '#ffe8da', iris: '#d94f9a', olho: 'determinado', boca: 'firme', lagrima: true, cabelo: '#ff9ec7' });
      c.fillStyle = '#ff4f7b'; [[-0.28, 0.12, 0.5], [0.28, -0.22, -0.4], [-0.26, -0.26, 0.3]].forEach(([a, b, g]) => { c.save(); c.translate(x + a * t, y + b * t); c.rotate(g); coracao(c, 0, 0, 0.035 * t); c.fill(); c.stroke(); c.fillStyle = '#ffd1e0'; c.strokeStyle = TINTA; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(0, -0.03 * t); c.lineTo(0.012 * t, 0.0); c.lineTo(-0.012 * t, 0.02 * t); c.lineTo(0.004 * t, 0.045 * t); c.stroke(); c.restore(); c.fillStyle = '#ff4f7b'; });
      c.fillStyle = 'rgba(255,255,255,0.95)'; [[0.27, 0.05, 0.6], [-0.3, -0.05, -0.5], [0.22, 0.24, 0.9]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.04 * t, 0.012 * t, g, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'm-capa-escura', nome: 'Garota mágica de capa escura com a gema da alma', legenda: 'A pureza da alma pesa mais do que qualquer armadura.', cat: 'magicas', tom: 'frio e solene',
    ind: 'Falar de integridade, de princípios e de carregar um peso emocional.', contra: 'Assuntos alegres ou de festa.',
    descr: 'Uma jovem de cabelos prateados curtos e expressão fria, com uma capa escura de detalhes prateados. Ela segura entre as mãos uma gema brilhante em forma de alma, olhando fixamente para ela, com uma lágrima solitária prestes a cair. Fundo de papel de carta azul noite.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#aab6d8', '#141a33', 'liso'); contorno(c, t); magia(c, x, y + 0.1 * t, t, 'rgba(160,200,255,0.5)');
      c.fillStyle = '#e3e8f2'; c.beginPath(); c.ellipse(x, y - 0.12 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#1f2547'; c.beginPath(); c.moveTo(x - 0.28 * t, y + 0.32 * t); c.quadraticCurveTo(x - 0.26 * t, y - 0.02 * t, x - 0.1 * t, y - 0.02 * t); c.lineTo(x + 0.1 * t, y - 0.02 * t); c.quadraticCurveTo(x + 0.26 * t, y - 0.02 * t, x + 0.28 * t, y + 0.32 * t); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#c9d3ea'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x - 0.27 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.25 * t, y + 0.0 * t, x - 0.1 * t, y - 0.01 * t); c.moveTo(x + 0.27 * t, y + 0.3 * t); c.quadraticCurveTo(x + 0.25 * t, y + 0.0 * t, x + 0.1 * t, y - 0.01 * t); c.stroke(); c.fillStyle = '#c9d3ea'; [[-0.2, 0.2], [0.2, 0.2], [-0.17, 0.1], [0.17, 0.1]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.018 * t, 0.007 * t, 4); c.fill(); }); contorno(c, t);
      rostoManga(c, x, y - 0.1 * t, t, { pele: '#f1e2dc', iris: '#6d8ad9', olho: 'frio', boca: 'neutra', lagrima: true, olhar: 'baixo', cabelo: '#e3e8f2', bochechas: false });
      c.fillStyle = '#f1e2dc'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.06 * t, y + 0.17 * t, 0.045 * t, 0.03 * t, s * 0.4, 0, 7); c.fill(); c.stroke(); });
      const g = c.createRadialGradient(x, y + 0.15 * t, 0, x, y + 0.15 * t, t * 0.17); g.addColorStop(0, 'rgba(220,250,255,0.95)'); g.addColorStop(1, 'rgba(120,200,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y + 0.15 * t, t * 0.17, 0, 7); c.fill();
      c.fillStyle = '#bfe9ff'; c.beginPath(); c.moveTo(x, y + 0.09 * t); c.quadraticCurveTo(x + 0.05 * t, y + 0.15 * t, x, y + 0.22 * t); c.quadraticCurveTo(x - 0.05 * t, y + 0.15 * t, x, y + 0.09 * t); c.fill(); c.strokeStyle = '#4a6ea8'; c.lineWidth = t * 0.01; c.stroke();
    } },
  { valor: 'm-violinista', nome: 'Garota mágica violinista', legenda: 'Toda melodia bonita carrega um sacrifício silencioso.', cat: 'magicas', tom: 'poético e agridoce',
    ind: 'Falar de arte, de música, de dedicação e do preço silencioso das conquistas.', contra: 'Assuntos técnicos ou de humor ácido.',
    descr: 'Uma garota de cabelos azuis profundos presos por presilhas em forma de nota musical, flutuando graciosamente enquanto toca um violino mágico, cujas cordas soltam faíscas de luz em aquarela. Fundo de papel de carta azul claro, com brilho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cfdcff', '#eef3ff', 'liso'); contorno(c, t); magia(c, x, y, t, 'rgba(190,210,255,0.7)');
      c.fillStyle = '#2a4fb5'; c.beginPath(); c.ellipse(x - 0.02 * t, y - 0.08 * t, 0.19 * t, 0.2 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - 0.15 * t, y - 0.0 * t); c.quadraticCurveTo(x - 0.32 * t, y + 0.18 * t, x - 0.2 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.1 * t, y + 0.2 * t, x - 0.08 * t, y + 0.05 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#7fb6ff'; linha(c, t, [[x - 0.08 * t, y + 0.06 * t], [x + 0.06 * t, y + 0.06 * t], [x + 0.12 * t, y + 0.3 * t], [x - 0.14 * t, y + 0.3 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#fff'; linha(c, t, [[x - 0.06 * t, y + 0.06 * t], [x + 0.04 * t, y + 0.06 * t], [x + 0.0 * t, y + 0.12 * t]], true); c.fill(); c.stroke();
      rostoManga(c, x - 0.02 * t, y - 0.08 * t, t, { pele: '#ffe8da', iris: '#2f5fe0', olho: 'sereno', boca: 'sorriso', cabelo: '#2a4fb5', olhar: 'lado' });
      [-1, 1].forEach((s) => { c.fillStyle = '#ffd23f'; const px = x - 0.02 * t + s * 0.14 * t, py = y - 0.2 * t; c.beginPath(); c.ellipse(px, py + 0.02 * t, 0.022 * t, 0.016 * t, -0.4, 0, 7); c.fill(); c.stroke(); c.fillRect(px + 0.012 * t, py - 0.04 * t, 0.008 * t, 0.06 * t); c.beginPath(); c.moveTo(px + 0.02 * t, py - 0.04 * t); c.quadraticCurveTo(px + 0.05 * t, py - 0.03 * t, px + 0.04 * t, py - 0.0 * t); c.stroke(); });
      c.save(); c.translate(x + 0.15 * t, y + 0.08 * t); c.rotate(-0.9); c.fillStyle = '#b5652f'; c.beginPath(); c.ellipse(0, 0, 0.09 * t, 0.12 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(0, -0.09 * t, 0.06 * t, 0.07 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillRect(-0.012 * t, -0.28 * t, 0.024 * t, 0.12 * t); c.strokeRect(-0.012 * t, -0.28 * t, 0.024 * t, 0.12 * t); c.strokeStyle = '#2f1d10'; c.lineWidth = t * 0.01; [-0.03, 0.03].forEach((a) => { c.beginPath(); c.moveTo(a * t, 0.1 * t); c.quadraticCurveTo(a * t, 0.0, a * 0.4 * t, -0.27 * t); c.stroke(); }); c.beginPath(); c.moveTo(-0.025 * t, -0.03 * t); c.quadraticCurveTo(-0.02 * t, 0.02 * t, -0.03 * t, 0.06 * t); c.moveTo(0.025 * t, -0.03 * t); c.quadraticCurveTo(0.02 * t, 0.02 * t, 0.03 * t, 0.06 * t); c.stroke(); c.restore();
      c.strokeStyle = '#e8c15a'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.17 * t); c.lineTo(x + 0.27 * t, y - 0.02 * t); c.stroke(); contorno(c, t);
      ['#ff9ab5', '#9fd6ff', '#ffd166', '#c9a0ff', '#9fe3b0', '#ffb78a'].forEach((cor, i) => { c.globalAlpha = 0.75; c.fillStyle = cor; c.beginPath(); c.arc(x + (0.2 + (i % 3) * 0.045) * t, y + (-0.2 + i * 0.045) * t, (0.012 + (i % 2) * 0.01) * t, 0, 7); c.fill(); }); c.globalAlpha = 1;
    } },
  { valor: 'm-coragem', nome: 'Garota mágica de laços vermelhos e a luz do broche', legenda: 'Decidi ser a coragem que faltava no escuro.', cat: 'magicas', tom: 'corajoso e doce',
    ind: 'Falar de enfrentar medos, de coragem e de ser apoio para os outros.', contra: 'Assuntos de humor ácido ou de desistência.',
    descr: 'Uma personagem de cabelos loiros cacheados e grandes laços vermelhos, estendendo a mão para a frente com um sorriso doce e corajoso. Atrás dela, sombras escuras tentam puxá-la, mas a luz do seu broche afasta o breu. Fundo de papel de carta amarelo claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#ffeaa8', '#fff8e0', 'liso'); contorno(c, t);
      c.fillStyle = '#3b2a5a'; [[-0.24, -0.1, 1], [0.24, -0.05, -1], [-0.2, 0.22, 1], [0.22, 0.24, -1]].forEach(([a, b, s]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t - 0.1 * t); c.quadraticCurveTo(x + (a + s * 0.12) * t, y + b * t, x + (a + s * 0.02) * t, y + b * t + 0.12 * t); c.quadraticCurveTo(x + (a - s * 0.06) * t, y + b * t, x + a * t, y + b * t - 0.1 * t); c.fill(); c.stroke(); for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + (a + s * 0.07) * t, y + (b - 0.05 + i * 0.03) * t); c.lineTo(x + (a + s * 0.13) * t, y + (b - 0.04 + i * 0.035) * t); c.stroke(); } });
      const g = c.createRadialGradient(x, y + 0.08 * t, 0, x, y + 0.08 * t, t * 0.3); g.addColorStop(0, 'rgba(255,240,200,0.85)'); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y + 0.08 * t, t * 0.3, 0, 7); c.fill(); contorno(c, t);
      c.fillStyle = '#ffd45a'; for (let i = 0; i < 9; i++) { const ang = Math.PI * (0.05 + i * 0.112) + Math.PI * 0.95; c.beginPath(); c.arc(x + Math.cos(ang) * 0.17 * t, y - 0.11 * t + Math.sin(ang) * 0.18 * t, 0.05 * t, 0, 7); c.fill(); c.stroke(); } [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.16 * t, y + 0.0 * t, 0.045 * t, 0.12 * t, s * 0.2, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#e0343c'; [-1, 1].forEach((s) => { linha(c, t, [[x + s * 0.13 * t, y - 0.27 * t], [x + s * 0.24 * t, y - 0.33 * t], [x + s * 0.24 * t, y - 0.2 * t]], true); c.fill(); c.stroke(); linha(c, t, [[x + s * 0.13 * t, y - 0.27 * t], [x + s * 0.02 * t, y - 0.33 * t], [x + s * 0.02 * t, y - 0.2 * t]], true); c.fill(); c.stroke(); c.beginPath(); c.arc(x + s * 0.13 * t, y - 0.27 * t, 0.017 * t, 0, 7); c.fill(); });
      c.fillStyle = '#ffcfe0'; linha(c, t, [[x - 0.1 * t, y + 0.05 * t], [x + 0.1 * t, y + 0.05 * t], [x + 0.16 * t, y + 0.32 * t], [x - 0.16 * t, y + 0.32 * t]], true); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.1 * t, t, { pele: '#ffe8da', iris: '#3f8fe0', olho: 'determinado', boca: 'sorriso', cabelo: '#ffd45a' });
      c.fillStyle = '#ffe8da'; c.beginPath(); c.ellipse(x + 0.17 * t, y + 0.1 * t, 0.07 * t, 0.04 * t, -0.3, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.26 * t, y + 0.07 * t, 0.045 * t, 0.045 * t, 0, 0, 7); c.fill(); c.stroke(); for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + (0.3 - i * 0.0) * t, y + (0.03 + i * 0.022) * t, 0.022 * t, 0.012 * t, 0.2, 0, 7); c.fill(); c.stroke(); }
      c.fillStyle = '#ff4f7b'; estrela(c, x, y + 0.13 * t, 0.045 * t, 0.02 * t, 5); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y + 0.13 * t, 0.012 * t, 0, 7); c.fill();
    } },
  { valor: 'm-exausta', nome: 'Garota mágica exausta de tiara de lua', legenda: 'Até as estrelas mais brilhantes precisam descansar.', cat: 'magicas', tom: 'cansado e acolhedor',
    ind: 'Falar de descanso, de esgotamento, de pausas e de cuidar de si.', contra: 'Assuntos de produtividade, de meta e de cobrança.',
    descr: 'Uma jovem de cabelos castanhos curtos e tiara em forma de lua minguante, agachada no chão, abraçando os próprios joelhos com cara de exaustão, cercada de pequenas esferas de energia que começam a se apagar. Fundo de papel de carta azul noite.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#b6c0e8', '#1a2250', 'liso'); contorno(c, t);
      [[-0.25, -0.15, 1], [0.24, -0.2, 0], [-0.22, 0.12, 0], [0.25, 0.05, 1], [0.0, -0.32, 0], [-0.3, -0.03, 0]].forEach(([a, b, aceso]) => { if (aceso) { const g = c.createRadialGradient(x + a * t, y + b * t, 0, x + a * t, y + b * t, t * 0.07); g.addColorStop(0, 'rgba(200,245,255,0.95)'); g.addColorStop(1, 'rgba(120,200,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x + a * t, y + b * t, t * 0.07, 0, 7); c.fill(); } c.fillStyle = aceso ? '#d6f6ff' : '#5a6290'; c.beginPath(); c.arc(x + a * t, y + b * t, 0.02 * t, 0, 7); c.fill(); c.strokeStyle = TINTA; c.lineWidth = t * 0.008; c.stroke(); }); contorno(c, t);
      c.fillStyle = '#c7a2e8'; c.beginPath(); c.ellipse(x, y + 0.14 * t, 0.2 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#e4d0f5'; c.beginPath(); c.ellipse(x, y + 0.15 * t, 0.13 * t, 0.1 * t, 0, 0, 7); c.fill();
      c.fillStyle = '#ffe3d1'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.17 * t, y + 0.16 * t, 0.04 * t, 0.12 * t, s * 0.2, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = '#c7a2e8'; c.beginPath(); c.ellipse(x - 0.0 * t, y + 0.25 * t, 0.18 * t, 0.05 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#8a5a3a'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.07 * t, t, { pele: '#ffe3d1', iris: '#a05a2a', olho: 'cansado', boca: 'neutra', cabelo: '#8a5a3a', olheiras: true, bochechas: false });
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, y - 0.26 * t, 0.07 * t, Math.PI * 0.15, Math.PI * 1.85); c.arc(x + 0.03 * t, y - 0.26 * t, 0.055 * t, Math.PI * 1.7, Math.PI * 0.3, true); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffd9bf'; c.beginPath(); c.ellipse(x - 0.05 * t, y + 0.0 * t, 0.045 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'm-lanca', nome: 'Garota mágica da lança de cristal', legenda: 'Proteger o que amo é a única regra inviolável.', cat: 'magicas', tom: 'firme e protetor',
    ind: 'Falar de proteção, de lealdade, de limites e de cuidar de quem se ama.', contra: 'Assuntos de fragilidade, de dúvida ou de humor.',
    descr: 'Uma garota de cabelos verdes presos numa trança longa, empunhando uma lança de cristal que irradia energia esmeralda. Ela olha para o horizonte com um sorriso firme, e uma fita rasgada flutua ao vento. Fundo de papel de carta verde claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c9f2dd', '#eafaf2', 'liso'); contorno(c, t);
      c.strokeStyle = 'rgba(120,200,170,0.6)'; c.lineWidth = t * 0.012; [[-0.3, -0.18, -0.12, -0.2], [-0.32, -0.06, -0.14, -0.08], [-0.3, 0.06, -0.12, 0.04]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + d * t, y + e * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#3fbf7a'; c.beginPath(); c.ellipse(x - 0.0 * t, y - 0.1 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(x + 0.17 * t + i * 0.012 * t, y - 0.04 * t + i * 0.055 * t, 0.034 * t, 0.032 * t, 0.3, 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#ff5a6e'; c.beginPath(); c.ellipse(x + 0.2 * t, y + 0.3 * t, 0.035 * t, 0.02 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#9ad6b4'; linha(c, t, [[x - 0.09 * t, y + 0.04 * t], [x + 0.09 * t, y + 0.04 * t], [x + 0.15 * t, y + 0.32 * t], [x - 0.15 * t, y + 0.32 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#fff'; linha(c, t, [[x - 0.09 * t, y + 0.04 * t], [x + 0.0 * t, y + 0.1 * t], [x + 0.09 * t, y + 0.04 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ff5a6e'; c.beginPath(); c.moveTo(x - 0.07 * t, y + 0.07 * t); c.quadraticCurveTo(x - 0.2 * t, y - 0.0 * t, x - 0.3 * t, y + 0.06 * t); c.lineTo(x - 0.27 * t, y + 0.08 * t); c.lineTo(x - 0.3 * t, y + 0.1 * t); c.lineTo(x - 0.25 * t, y + 0.11 * t); c.quadraticCurveTo(x - 0.17 * t, y + 0.06 * t, x - 0.07 * t, y + 0.1 * t); c.closePath(); c.fill(); c.stroke();
      rostoManga(c, x + 0.01 * t, y - 0.09 * t, t, { pele: '#ffe3d1', iris: '#28b870', olho: 'determinado', boca: 'sorriso', cabelo: '#3fbf7a', olhar: 'lado' });
      const g = c.createRadialGradient(x + 0.24 * t, y - 0.26 * t, 0, x + 0.24 * t, y - 0.26 * t, t * 0.16); g.addColorStop(0, 'rgba(160,255,200,0.9)'); g.addColorStop(1, 'rgba(100,230,160,0)'); c.fillStyle = g; c.beginPath(); c.arc(x + 0.24 * t, y - 0.26 * t, t * 0.16, 0, 7); c.fill(); contorno(c, t);
      c.strokeStyle = '#7a5a3a'; c.lineWidth = t * 0.022; c.beginPath(); c.moveTo(x + 0.1 * t, y + 0.2 * t); c.lineTo(x + 0.22 * t, y - 0.18 * t); c.stroke(); c.lineWidth = t * 0.014; c.strokeStyle = TINTA; c.fillStyle = '#6ee8a8'; linha(c, t, [[x + 0.22 * t, y - 0.17 * t], [x + 0.26 * t, y - 0.22 * t], [x + 0.245 * t, y - 0.34 * t], [x + 0.22 * t, y - 0.4 * t], [x + 0.195 * t, y - 0.34 * t], [x + 0.18 * t, y - 0.22 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffe3d1'; c.beginPath(); c.ellipse(x + 0.13 * t, y + 0.1 * t, 0.04 * t, 0.03 * t, 0.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + 0.17 * t, y - 0.02 * t, 0.035 * t, 0.03 * t, 0.2, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'm-ampulheta', nome: 'Figura encapuzada com a ampulheta invertida', legenda: 'Às vezes o tempo não cura; apenas muda o formato da ferida.', cat: 'magicas', tom: 'misterioso e sombrio',
    ind: 'Falar de tempo, de dor, de luto, de cicatrizes e do que o tempo faz com a gente.', contra: 'Assuntos alegres ou de festa.',
    descr: 'Uma figura misteriosa de manto negro bordado com estrelas, da qual só se veem os olhos brilhantes sob o capuz, segurando uma ampulheta mágica em que a areia sobe em vez de descer. Fundo de papel de carta roxo escuro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#bfa8ff', '#1a1236', 'liso'); contorno(c, t);
      c.fillStyle = '#e8dcff'; [[-0.25, -0.22], [0.26, -0.18], [-0.28, 0.1], [0.28, 0.2]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.018 * t, 0.007 * t, 4); c.fill(); });
      c.fillStyle = '#0f0b20'; c.beginPath(); c.moveTo(x - 0.28 * t, y + 0.32 * t); c.quadraticCurveTo(x - 0.26 * t, y - 0.12 * t, x - 0.1 * t, y - 0.26 * t); c.quadraticCurveTo(x, y - 0.34 * t, x + 0.1 * t, y - 0.26 * t); c.quadraticCurveTo(x + 0.26 * t, y - 0.12 * t, x + 0.28 * t, y + 0.32 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#1d1640'; c.beginPath(); c.ellipse(x, y - 0.12 * t, 0.12 * t, 0.14 * t, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(180,150,255,0.5)'; c.stroke();
      [-1, 1].forEach((s) => { c.shadowColor = '#ffd23f'; c.shadowBlur = t * 0.04; c.fillStyle = '#ffe98a'; c.beginPath(); c.ellipse(x + s * 0.045 * t, y - 0.12 * t, 0.022 * t, 0.014 * t, s * 0.25, 0, 7); c.fill(); c.shadowBlur = 0; });
      c.fillStyle = '#ffd23f'; [[-0.18, 0.2], [0.17, 0.12], [-0.12, 0.05], [0.2, 0.26], [-0.2, -0.05], [0.12, -0.02], [-0.06, 0.28]].forEach(([a, b]) => { estrela(c, x + a * t, y + b * t, 0.016 * t, 0.006 * t, 5); c.fill(); }); contorno(c, t);
      c.fillStyle = '#e8c15a'; retArredondado(c, x - 0.065 * t, y + 0.0 * t, 0.13 * t, 0.014 * t, 0.006 * t); c.fill(); c.stroke(); retArredondado(c, x - 0.065 * t, y + 0.2 * t, 0.13 * t, 0.014 * t, 0.006 * t); c.fill(); c.stroke();
      c.fillStyle = 'rgba(210,230,255,0.45)'; c.beginPath(); c.moveTo(x - 0.055 * t, y + 0.014 * t); c.quadraticCurveTo(x - 0.055 * t, y + 0.09 * t, x - 0.006 * t, y + 0.108 * t); c.quadraticCurveTo(x - 0.055 * t, y + 0.125 * t, x - 0.055 * t, y + 0.2 * t); c.lineTo(x + 0.055 * t, y + 0.2 * t); c.quadraticCurveTo(x + 0.055 * t, y + 0.125 * t, x + 0.006 * t, y + 0.108 * t); c.quadraticCurveTo(x + 0.055 * t, y + 0.09 * t, x + 0.055 * t, y + 0.014 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffd966'; c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.2 * t); c.lineTo(x + 0.05 * t, y + 0.2 * t); c.lineTo(x + 0.04 * t, y + 0.165 * t); c.lineTo(x - 0.04 * t, y + 0.165 * t); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x - 0.012 * t, y + 0.06 * t); c.lineTo(x + 0.012 * t, y + 0.06 * t); c.lineTo(x + 0.01 * t, y + 0.04 * t); c.lineTo(x - 0.01 * t, y + 0.04 * t); c.closePath(); c.fill(); c.strokeStyle = '#ffd966'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x, y + 0.165 * t); c.lineTo(x, y + 0.11 * t); c.stroke(); c.fillStyle = '#ffe98a'; [[-0.015, 0.14], [0.012, 0.125], [0.0, 0.09], [-0.012, 0.075]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a * t, y + b * t, 0.005 * t, 0, 7); c.fill(); });
      c.fillStyle = '#0f0b20'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.075 * t, y + 0.12 * t, 0.032 * t, 0.045 * t, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(180,150,255,0.6)'; c.lineWidth = t * 0.01; c.stroke(); });
    } },
  { valor: 'm-petalas', nome: 'Garota mágica flutuando entre pétalas e engrenagens', legenda: 'A transformação perfeita exige que a lagarta desapareça.', cat: 'magicas', tom: 'sereno e transformador',
    ind: 'Falar de mudança, de recomeço, de crescer e de deixar partes de si para trás.', contra: 'Assuntos de pressa ou de urgência.',
    descr: 'Uma garota de cabelos lilás ondulados, flutuando de olhos fechados num mar de pétalas de rosa prateadas e engrenagens douradas que flutuam, com a varinha repousando calmamente sobre o peito. Fundo de papel de carta lilás.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#e6d4ff', '#f6eeff', 'liso'); contorno(c, t); magia(c, x, y, t, 'rgba(220,190,255,0.7)');
      const engrenagem = (cx, cy, r) => { c.fillStyle = '#e8c15a'; c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 1.2; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#f2e3b3'; c.beginPath(); c.arc(cx, cy, r * 0.4, 0, 7); c.fill(); c.stroke(); };
      [[-0.26, -0.24, 0.045], [0.27, 0.22, 0.055], [0.25, -0.26, 0.03], [-0.27, 0.2, 0.035]].forEach(([a, b, r]) => engrenagem(x + a * t, y + b * t, r * t));
      c.fillStyle = '#c9a0f0'; c.beginPath(); c.moveTo(x - 0.18 * t, y - 0.12 * t); c.quadraticCurveTo(x - 0.34 * t, y + 0.0 * t, x - 0.27 * t, y + 0.14 * t); c.quadraticCurveTo(x - 0.22 * t, y + 0.06 * t, x - 0.14 * t, y + 0.12 * t); c.quadraticCurveTo(x - 0.1 * t, y + 0.2 * t, x - 0.0 * t, y + 0.16 * t); c.quadraticCurveTo(x + 0.2 * t, y + 0.2 * t, x + 0.28 * t, y + 0.12 * t); c.quadraticCurveTo(x + 0.18 * t, y + 0.0 * t, x + 0.16 * t, y - 0.12 * t); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#d8b8ff'; linha(c, t, [[x - 0.14 * t, y + 0.05 * t], [x + 0.14 * t, y + 0.05 * t], [x + 0.2 * t, y + 0.26 * t], [x - 0.2 * t, y + 0.26 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#c9a0f0'; c.beginPath(); c.ellipse(x, y - 0.06 * t, 0.17 * t, 0.16 * t, 0, 0, 7); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.05 * t, t, { pele: '#ffe8da', iris: '#9a62e0', olho: 'fechado', boca: 'sereno', cabelo: '#c9a0f0' });
      c.save(); c.translate(x, y + 0.13 * t); c.rotate(-0.25); c.strokeStyle = '#e8c15a'; c.lineWidth = t * 0.02; c.beginPath(); c.moveTo(-0.2 * t, 0.02 * t); c.lineTo(0.2 * t, -0.02 * t); c.stroke(); c.fillStyle = '#ffd23f'; estrela(c, 0.22 * t, -0.025 * t, 0.04 * t, 0.017 * t, 5); c.fill(); c.strokeStyle = TINTA; c.lineWidth = t * 0.012; c.stroke(); c.restore();
      c.fillStyle = '#ffe8da'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.06 * t, y + 0.13 * t, 0.04 * t, 0.028 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = 'rgba(235,238,250,0.95)'; [[-0.24, 0.3, 0.4], [0.2, 0.31, -0.5], [-0.1, 0.3, 0.1], [0.05, 0.32, 0.9], [-0.3, -0.05, 1.2], [0.31, 0.0, 0.3], [0.1, -0.3, 0.7], [-0.12, -0.3, -0.4]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.034 * t, 0.017 * t, g, 0, 7); c.fill(); c.stroke(); });
    } },
  { valor: 'm-contrato', nome: 'Criaturinha dos contratos mágicos', legenda: 'Até os milagres têm custo.', cat: 'magicas', tom: 'enigmático e irônico',
    ind: 'Falar de escolhas, do preço dos desejos, de contratos e de consequências.', contra: 'Assuntos ingênuos, infantis ou de acolhimento.',
    descr: 'Uma criaturinha fofa e peluda, de pelo ameixa, olhos rubi expressivos e uma cauda elegante, sentada sobre uma pilha de livros antigos de feitiços, segurando um contrato brilhante com uma pata e piscando com um sorriso enigmático. Fundo de papel de carta lilás escuro, com brilho.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c9b0f5', '#2a1b4f', 'liso'); contorno(c, t); magia(c, x, y, t, 'rgba(200,160,255,0.45)');
      [['#a33a4a', 0.0, 0.3, 0.34], ['#2f6a8a', -0.01, 0.255, 0.3], ['#5a3a7a', 0.015, 0.21, 0.32]].forEach(([cor, a, b, w]) => { c.fillStyle = cor; retArredondado(c, x + (a - w / 2) * t, y + b * t, w * t, 0.04 * t, 0.008 * t); c.fill(); c.stroke(); c.fillStyle = '#f2e3b3'; c.fillRect(x + (a + w / 2 - 0.02) * t, y + (b + 0.007) * t, 0.015 * t, 0.026 * t); c.fillStyle = '#e8c15a'; c.fillRect(x + (a - w / 2 + 0.02) * t, y + (b + 0.014) * t, 0.07 * t, 0.012 * t); });
      c.strokeStyle = TINTA; c.fillStyle = '#8a5ab0'; c.beginPath(); c.moveTo(x + 0.08 * t, y + 0.2 * t); c.bezierCurveTo(x + 0.32 * t, y + 0.2 * t, x + 0.36 * t, y - 0.08 * t, x + 0.22 * t, y - 0.18 * t); c.bezierCurveTo(x + 0.3 * t, y - 0.04 * t, x + 0.22 * t, y + 0.1 * t, x + 0.08 * t, y + 0.12 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#b48ad6'; c.beginPath(); c.ellipse(x + 0.24 * t, y - 0.15 * t, 0.025 * t, 0.045 * t, 0.5, 0, 7); c.fill(); c.stroke();
      const pelo = (cx, cy, rx, ry, n) => { c.beginPath(); for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, f = i % 2 ? 0.95 : 1.05; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f); } c.closePath(); };
      c.fillStyle = '#8a5ab0'; pelo(x, y + 0.1 * t, 0.15 * t, 0.12 * t, 14); c.fill(); c.stroke(); c.fillStyle = '#c9a8e8'; c.beginPath(); c.ellipse(x, y + 0.13 * t, 0.08 * t, 0.07 * t, 0, 0, 7); c.fill();
      [-1, 1].forEach((s) => { c.fillStyle = '#8a5ab0'; linha(c, t, [[x + s * 0.12 * t, y - 0.07 * t], [x + s * 0.15 * t, y - 0.24 * t], [x + s * 0.045 * t, y - 0.14 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#ffd1e0'; linha(c, t, [[x + s * 0.115 * t, y - 0.09 * t], [x + s * 0.13 * t, y - 0.2 * t], [x + s * 0.065 * t, y - 0.13 * t]], true); c.fill(); });
      c.fillStyle = '#8a5ab0'; pelo(x, y - 0.05 * t, 0.15 * t, 0.12 * t, 14); c.fill(); c.stroke();
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, y + 0.03 * t, 0.014 * t, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x - 0.055 * t, y - 0.06 * t, 0.04 * t, 0.05 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#d6203a'; c.beginPath(); c.ellipse(x - 0.055 * t, y - 0.055 * t, 0.03 * t, 0.042 * t, 0, 0, 7); c.fill(); c.fillStyle = '#6b0f20'; c.beginPath(); c.ellipse(x - 0.055 * t, y - 0.05 * t, 0.014 * t, 0.024 * t, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.065 * t, y - 0.07 * t, 0.009 * t, 0, 7); c.fill();
      c.lineWidth = t * 0.016; c.strokeStyle = TINTA; c.beginPath(); c.arc(x + 0.055 * t, y - 0.05 * t, 0.032 * t, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.fillStyle = TINTA; c.beginPath(); c.ellipse(x, y - 0.015 * t, 0.012 * t, 0.009 * t, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(x - 0.035 * t, y + 0.0 * t); c.quadraticCurveTo(x, y + 0.025 * t, x + 0.05 * t, y - 0.005 * t); c.stroke(); bochechas(c, x, y - 0.0 * t, t, 0.1, 0.022);
      const g = c.createRadialGradient(x - 0.17 * t, y + 0.08 * t, 0, x - 0.17 * t, y + 0.08 * t, t * 0.13); g.addColorStop(0, 'rgba(255,235,150,0.9)'); g.addColorStop(1, 'rgba(255,220,100,0)'); c.fillStyle = g; c.beginPath(); c.arc(x - 0.17 * t, y + 0.08 * t, t * 0.13, 0, 7); c.fill(); contorno(c, t);
      c.fillStyle = '#fff3c9'; retArredondado(c, x - 0.25 * t, y + 0.03 * t, 0.15 * t, 0.12 * t, 0.012 * t); c.fill(); c.stroke(); c.strokeStyle = '#a08040'; c.lineWidth = t * 0.007; [0.06, 0.08, 0.1, 0.12].forEach((b) => { c.beginPath(); c.moveTo(x - 0.23 * t, y + b * t); c.lineTo(x - 0.12 * t, y + b * t); c.stroke(); }); c.fillStyle = '#d6203a'; c.beginPath(); c.arc(x - 0.13 * t, y + 0.14 * t, 0.014 * t, 0, 7); c.fill(); contorno(c, t);
      c.fillStyle = '#8a5ab0'; c.beginPath(); c.ellipse(x - 0.1 * t, y + 0.1 * t, 0.032 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'e-viajante', nome: 'Viajante de tranças douradas sobre o vento', legenda: 'Mesmo que o mundo seja vasto e desconhecido, voltarei para casa.', cat: 'elemental', tom: 'saudoso e determinado',
    ind: 'Falar de viagem, de recomeço longe de casa, de saudade e da vontade de voltar.', contra: 'Assuntos de pressa ou de humor ácido.',
    descr: 'Uma garota loira de tranças longas e detalhadas, com roupa de viajante em branco e dourado, segurando uma espada leve de cristal. Ela flutua levemente sobre um redemoinho de energia de vento, com o olhar determinado voltado para o horizonte. Fundo de papel de carta verde-água.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#cdf3e8', '#ecfbf6', 'liso'); contorno(c, t); vento(c, x, y + 0.24 * t, t, '#7fe0c6'); contorno(c, t);
      c.fillStyle = '#ffd45a'; [-1, 1].forEach((s) => { for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x + s * (0.15 + i * 0.012) * t, y - 0.12 * t + i * 0.055 * t, 0.034 * t, 0.034 * t, 0, 0, 7); c.fill(); c.stroke(); } c.fillStyle = '#fff'; c.beginPath(); c.arc(x + s * 0.17 * t, y + 0.14 * t, 0.014 * t, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffd45a'; });
      c.fillStyle = '#ffd45a'; c.beginPath(); c.ellipse(x, y - 0.14 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff6df'; c.beginPath(); c.moveTo(x - 0.11 * t, y - 0.01 * t); c.lineTo(x + 0.11 * t, y - 0.01 * t); c.lineTo(x + 0.15 * t, y + 0.26 * t); c.lineTo(x - 0.15 * t, y + 0.26 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#e8c15a'; c.fillRect(x - 0.13 * t, y + 0.14 * t, 0.26 * t, 0.025 * t); estrela(c, x, y + 0.07 * t, 0.025 * t, 0.01 * t, 5); c.fill();
      c.fillStyle = '#f2f7ff'; c.beginPath(); c.moveTo(x - 0.11 * t, y - 0.0 * t); c.quadraticCurveTo(x - 0.32 * t, y + 0.1 * t, x - 0.26 * t, y + 0.3 * t); c.lineTo(x - 0.12 * t, y + 0.18 * t); c.closePath(); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.12 * t, t, { pele: '#ffe8da', iris: '#e0a020', olho: 'determinado', boca: 'firme', cabelo: '#ffd45a', olhar: 'lado' });
      c.save(); c.translate(x + 0.2 * t, y + 0.06 * t); c.rotate(0.25); c.fillStyle = '#d9f4ff'; c.beginPath(); c.moveTo(0, -0.3 * t); c.lineTo(0.025 * t, -0.04 * t); c.lineTo(-0.025 * t, -0.04 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#e8c15a'; c.fillRect(-0.045 * t, -0.04 * t, 0.09 * t, 0.014 * t); c.strokeRect(-0.045 * t, -0.04 * t, 0.09 * t, 0.014 * t); c.fillRect(-0.01 * t, -0.026 * t, 0.02 * t, 0.06 * t); c.restore(); c.fillStyle = '#ffe8da'; c.beginPath(); c.ellipse(x + 0.2 * t, y + 0.07 * t, 0.03 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#a8f0dc'; [[-0.25, 0.08, 0.5], [0.3, -0.05, -0.3]].forEach(([a, b, g]) => { folha(c, x + a * t, y + b * t, 0.07 * t, 0.025 * t, g, '#7fe0c6', '#3a9a80'); });
    } },
  { valor: 'e-flautista', nome: 'Flautista no alto do pinheiro', legenda: 'Passado é vento que passou. Não adianta segurar.', cat: 'elemental', tom: 'sereno e desapegado',
    ind: 'Falar de desapego, de deixar o passado ir e de seguir leve.', contra: 'Assuntos de luto recente, em que a pessoa precisa de acolhimento.',
    descr: 'Um jovem de longos cabelos azul-turquesa e roupas tradicionais de estilo oriental, em preto e verde-água, sentado na ponta de um pinheiro alto, balançando os pés com calma e tocando uma flauta transversal de bambu, com uma borboleta de vento pousada na ponta da flauta. Fundo de papel de carta azul-turquesa claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#c9efee', '#e9fafa', 'liso'); contorno(c, t); vento(c, x + 0.1 * t, y - 0.2 * t, t * 0.8, '#7fd6d6');
      c.fillStyle = '#4a8a5a'; c.strokeStyle = TINTA; [[-0.2, 0.2], [-0.12, 0.12], [-0.03, 0.2]].forEach(([a, b]) => { linha(c, t, [[x + (a - 0.14) * t, y + (b + 0.08) * t], [x + a * t, y + (b - 0.08) * t], [x + (a + 0.14) * t, y + (b + 0.08) * t]], true); c.fill(); c.stroke(); }); c.fillStyle = '#6b4a2a'; c.fillRect(x - 0.012 * t, y + 0.2 * t, 0.024 * t, 0.12 * t);
      c.fillStyle = '#5fd6d0'; c.beginPath(); c.ellipse(x, y - 0.11 * t, 0.19 * t, 0.2 * t, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - 0.15 * t, y - 0.0 * t); c.quadraticCurveTo(x - 0.25 * t, y + 0.12 * t, x - 0.2 * t, y + 0.28 * t); c.quadraticCurveTo(x - 0.1 * t, y + 0.16 * t, x - 0.08 * t, y + 0.0 * t); c.fill(); c.stroke();
      c.fillStyle = '#26323a'; linha(c, t, [[x - 0.1 * t, y + 0.0 * t], [x + 0.1 * t, y + 0.0 * t], [x + 0.14 * t, y + 0.2 * t], [x - 0.14 * t, y + 0.2 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#6fd6c8'; linha(c, t, [[x - 0.04 * t, y + 0.0 * t], [x + 0.04 * t, y + 0.0 * t], [x + 0.0 * t, y + 0.12 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#e8c15a'; c.fillRect(x - 0.11 * t, y + 0.12 * t, 0.22 * t, 0.018 * t);
      [-1, 1].forEach((s) => { c.fillStyle = '#26323a'; c.beginPath(); c.ellipse(x + s * 0.06 * t, y + 0.25 * t, 0.045 * t, 0.025 * t, s * 0.3, 0, 7); c.fill(); c.stroke(); });
      rostoManga(c, x, y - 0.12 * t, t, { pele: '#f1e0d0', iris: '#1fb8b0', olho: 'sereno', boca: 'neutra', cabelo: '#5fd6d0', bochechas: false });
      c.strokeStyle = '#a8803a'; c.lineWidth = t * 0.022; c.beginPath(); c.moveTo(x - 0.05 * t, y + 0.02 * t); c.lineTo(x + 0.28 * t, y - 0.06 * t); c.stroke(); c.strokeStyle = '#e8d7a3'; c.lineWidth = t * 0.012; c.stroke(); [0.0, 0.06, 0.12, 0.18].forEach((a) => { c.fillStyle = TINTA; c.beginPath(); c.arc(x + (0.02 + a) * t, y + (0.015 - a * 0.28) * t, 0.005 * t, 0, 7); c.fill(); }); contorno(c, t);
      c.fillStyle = '#ffe3d0'; c.beginPath(); c.ellipse(x + 0.05 * t, y + 0.02 * t, 0.035 * t, 0.022 * t, -0.2, 0, 7); c.fill(); c.stroke();
      c.fillStyle = 'rgba(130,235,225,0.85)'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + 0.28 * t + s * 0.03 * t, y - 0.1 * t, 0.032 * t, 0.045 * t, s * 0.5, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = TINTA; c.fillRect(x + 0.275 * t, y - 0.09 * t, 0.006 * t, 0.04 * t);
    } },
  { valor: 'e-raio', nome: 'Guerreira de kimono roxo com espada de raios', legenda: 'Minha estabilidade se confirma com as mudanças.', cat: 'elemental', tom: 'majestoso e firme',
    ind: 'Falar de liderança, de mudança, de firmeza interior e de manter o rumo.', contra: 'Assuntos de insegurança ou de humor leve.',
    descr: 'Uma jovem de cabelos roxos vibrantes presos em tranças longas, de kimono tradicional roxo e preto, empunhando uma espada de lâmina brilhante cercada de raios elétricos intensos, com uma expressão de majestade e foco absolutos. Fundo de papel de carta lilás.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#dccbfa', '#2b1d55', 'liso'); contorno(c, t);
      c.strokeStyle = '#ffe14d'; c.lineWidth = t * 0.016; c.shadowColor = '#c9a0ff'; c.shadowBlur = t * 0.03; [[-0.28, -0.2], [0.28, -0.26], [-0.3, 0.12], [0.3, 0.14]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a * 0.8) * t, y + (b + 0.05) * t); c.lineTo(x + (a * 0.9) * t, y + (b + 0.07) * t); c.lineTo(x + (a * 0.7) * t, y + (b + 0.13) * t); c.stroke(); }); c.shadowBlur = 0; contorno(c, t);
      c.fillStyle = '#8f4fd8'; c.beginPath(); c.ellipse(x, y - 0.14 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); [-1, 1].forEach((s) => { for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x + s * (0.15 + i * 0.008) * t, y - 0.1 * t + i * 0.055 * t, 0.032 * t, 0.032 * t, 0, 0, 7); c.fill(); c.stroke(); } });
      c.fillStyle = '#2a1d3f'; linha(c, t, [[x - 0.11 * t, y - 0.0 * t], [x + 0.11 * t, y - 0.0 * t], [x + 0.17 * t, y + 0.3 * t], [x - 0.17 * t, y + 0.3 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#9a5fe0'; linha(c, t, [[x - 0.02 * t, y + 0.0 * t], [x + 0.02 * t, y + 0.0 * t], [x + 0.04 * t, y + 0.3 * t], [x - 0.04 * t, y + 0.3 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#c9a0ff'; [[-0.1, 0.1], [0.1, 0.18], [-0.08, 0.24]].forEach(([a, b]) => { for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2; c.beginPath(); c.arc(x + a * t + Math.cos(ang) * 0.016 * t, y + b * t + Math.sin(ang) * 0.016 * t, 0.009 * t, 0, 7); c.fill(); } });
      c.fillStyle = '#e8c15a'; retArredondado(c, x - 0.14 * t, y + 0.0 * t, 0.28 * t, 0.026 * t, 0.01 * t); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.14 * t, t, { pele: '#ffe8da', iris: '#c04fd8', olho: 'determinado', boca: 'firme', cabelo: '#8f4fd8', bochechas: false });
      c.save(); c.translate(x + 0.17 * t, y + 0.14 * t); c.rotate(0.12); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -0.38 * t); c.lineTo(0.022 * t, -0.04 * t); c.lineTo(-0.022 * t, -0.04 * t); c.closePath(); c.fill(); c.stroke(); const g = c.createLinearGradient(0, -0.38 * t, 0, -0.04 * t); g.addColorStop(0, 'rgba(255,240,120,0.9)'); g.addColorStop(1, 'rgba(200,160,255,0.6)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, -0.36 * t); c.lineTo(0.012 * t, -0.05 * t); c.lineTo(-0.012 * t, -0.05 * t); c.closePath(); c.fill(); c.fillStyle = '#2a1d3f'; c.fillRect(-0.04 * t, -0.04 * t, 0.08 * t, 0.016 * t); c.strokeRect(-0.04 * t, -0.04 * t, 0.08 * t, 0.016 * t); c.fillRect(-0.012 * t, -0.024 * t, 0.024 * t, 0.07 * t); c.restore(); c.fillStyle = '#ffe8da'; c.beginPath(); c.ellipse(x + 0.17 * t, y + 0.16 * t, 0.03 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#ffe14d'; c.lineWidth = t * 0.014; c.shadowColor = '#ffe14d'; c.shadowBlur = t * 0.02; [[0.21, -0.1], [0.14, -0.22], [0.23, -0.3]].forEach(([a, b]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.lineTo(x + (a + 0.04) * t, y + (b - 0.04) * t); c.lineTo(x + (a + 0.01) * t, y + (b - 0.06) * t); c.lineTo(x + (a + 0.05) * t, y + (b - 0.11) * t); c.stroke(); }); c.shadowBlur = 0;
    } },
  { valor: 'e-arqueira', nome: 'Arqueira travessa com pelúcia nas costas', legenda: 'Explosões fazem parte do aquecimento!', cat: 'elemental', tom: 'travesso e animado',
    ind: 'Falar de energia, de ousadia, de começar o dia com tudo e de brincadeira.', contra: 'Assuntos de calma, de silêncio e de cautela.',
    descr: 'Uma garota de cabelos castanhos longos e volumosos presos em tranças, de roupa de caça em verde, terra e laranja, segurando um arco de madeira entalhada com uma flecha de fogo pronta, sorrindo de forma travessa, com uma pelúcia de ursinho amarrada às costas. Fundo de papel de carta bege.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f4e2c2', '#fcf4e2', 'bolinhas'); contorno(c, t);
      c.fillStyle = '#c98f5f'; c.beginPath(); c.ellipse(x - 0.2 * t, y + 0.12 * t, 0.06 * t, 0.075 * t, 0.3, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(x - 0.2 * t, y + 0.03 * t, 0.04 * t, 0, 7); c.fill(); c.stroke(); [-1, 1].forEach((s) => { c.beginPath(); c.arc(x - 0.2 * t + s * 0.03 * t, y - 0.0 * t, 0.015 * t, 0, 7); c.fill(); c.stroke(); }); c.fillStyle = '#e63956'; linha(c, t, [[x - 0.2 * t, y + 0.055 * t], [x - 0.235 * t, y + 0.045 * t], [x - 0.235 * t, y + 0.07 * t]], true); c.fill(); linha(c, t, [[x - 0.2 * t, y + 0.055 * t], [x - 0.165 * t, y + 0.045 * t], [x - 0.165 * t, y + 0.07 * t]], true); c.fill();
      c.fillStyle = '#8a5a3a'; c.beginPath(); c.ellipse(x, y - 0.13 * t, 0.18 * t, 0.18 * t, 0, 0, 7); c.fill(); c.stroke(); [-1, 1].forEach((s) => { for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x + s * (0.16 + i * 0.006) * t, y - 0.1 * t + i * 0.055 * t, 0.034 * t, 0.034 * t, 0, 0, 7); c.fill(); c.stroke(); } });
      c.fillStyle = '#5fa860'; linha(c, t, [[x - 0.1 * t, y + 0.0 * t], [x + 0.1 * t, y + 0.0 * t], [x + 0.15 * t, y + 0.28 * t], [x - 0.15 * t, y + 0.28 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#e8923a'; c.fillRect(x - 0.13 * t, y + 0.1 * t, 0.26 * t, 0.03 * t); c.strokeRect(x - 0.13 * t, y + 0.1 * t, 0.26 * t, 0.03 * t); c.fillStyle = '#b57a45'; c.fillRect(x - 0.1 * t, y + 0.0 * t, 0.2 * t, 0.025 * t); c.fillStyle = '#e8c15a'; c.beginPath(); c.arc(x, y + 0.115 * t, 0.014 * t, 0, 7); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.12 * t, t, { pele: '#ffe3d1', iris: '#c06a1a', olho: 'determinado', boca: 'sorriso', cabelo: '#8a5a3a', olhar: 'lado' });
      c.strokeStyle = '#8a5a2b'; c.lineWidth = t * 0.025; c.beginPath(); c.arc(x + 0.22 * t, y + 0.06 * t, 0.2 * t, Math.PI * 1.3, Math.PI * 0.7, true); c.stroke(); c.strokeStyle = '#e8d7a3'; c.lineWidth = t * 0.007; c.beginPath(); c.moveTo(x + 0.11 * t, y - 0.12 * t); c.lineTo(x + 0.1 * t, y + 0.07 * t); c.lineTo(x + 0.11 * t, y + 0.24 * t); c.stroke(); contorno(c, t);
      c.strokeStyle = '#7a5a3a'; c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x + 0.28 * t, y + 0.12 * t); c.lineTo(x + 0.07 * t, y + 0.09 * t); c.stroke(); c.fillStyle = '#ff6a2a'; chamas(c, x + 0.3 * t, y + 0.12 * t, t * 0.9, 3); contorno(c, t);
      c.fillStyle = '#ffe3d1'; c.beginPath(); c.ellipse(x + 0.09 * t, y + 0.1 * t, 0.03 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'e-gelo', nome: 'Dançarina sobre o gelo', legenda: 'Pronta pro que der e vier.', cat: 'elemental', tom: 'elegante e confiante',
    ind: 'Falar de preparo, de confiança, de graça sob pressão e de enfrentar o que vier.', contra: 'Assuntos de insegurança ou de bagunça.',
    descr: 'Uma jovem de longos cabelos azul escuros com mechas prateadas, de roupas elegantes e esvoaçantes em azul e branco, dançando com graça sobre uma superfície de gelo cintilante, com flocos de neve mágicos rodopiando em volta das mãos erguidas. Fundo de papel de carta azul claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d3e6ff', '#f0f7ff', 'liso'); contorno(c, t);
      c.fillStyle = '#e6f6ff'; c.beginPath(); c.ellipse(x, y + 0.3 * t, 0.3 * t, 0.06 * t, 0, 0, 7); c.fill(); c.stroke(); c.strokeStyle = 'rgba(150,200,240,0.8)'; c.lineWidth = t * 0.008; [[-0.1, 0.0, 0.14, 0.02], [-0.18, 0.04, 0.0, 0.07]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + (0.29 + b) * t); c.lineTo(x + d * t, y + (0.3 + e * 0.2) * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#26356f'; c.beginPath(); c.ellipse(x, y - 0.14 * t, 0.17 * t, 0.17 * t, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#26356f'; c.beginPath(); c.moveTo(x - 0.14 * t, y - 0.06 * t); c.quadraticCurveTo(x - 0.3 * t, y + 0.1 * t, x - 0.2 * t, y + 0.26 * t); c.quadraticCurveTo(x - 0.1 * t, y + 0.12 * t, x - 0.08 * t, y - 0.02 * t); c.fill(); c.stroke(); c.strokeStyle = '#d6dff5'; c.lineWidth = t * 0.012; [[-0.12, -0.06, -0.22, 0.2], [-0.14, -0.1, -0.24, 0.1], [0.1, -0.2, 0.14, 0.0]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.quadraticCurveTo(x + (a - 0.06) * t, y + (b + e) * t * 0.5, x + d * t, y + e * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#f2f7ff'; c.beginPath(); c.moveTo(x - 0.1 * t, y + 0.0 * t); c.lineTo(x + 0.1 * t, y + 0.0 * t); c.quadraticCurveTo(x + 0.3 * t, y + 0.2 * t, x + 0.26 * t, y + 0.3 * t); c.lineTo(x - 0.22 * t, y + 0.3 * t); c.quadraticCurveTo(x - 0.24 * t, y + 0.14 * t, x - 0.1 * t, y + 0.0 * t); c.fill(); c.stroke(); c.fillStyle = '#6fa6ff'; linha(c, t, [[x - 0.1 * t, y + 0.0 * t], [x + 0.1 * t, y + 0.0 * t], [x + 0.06 * t, y + 0.1 * t], [x - 0.06 * t, y + 0.1 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#e8c15a'; c.beginPath(); c.arc(x, y + 0.05 * t, 0.015 * t, 0, 7); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.12 * t, t, { pele: '#ffe8f0', iris: '#4a7ae0', olho: 'determinado', boca: 'sorriso', cabelo: '#26356f' });
      c.strokeStyle = '#d6dff5'; c.lineWidth = t * 0.025; c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.07 * t); c.lineTo(x - 0.1 * t, y - 0.12 * t); c.stroke();
      contorno(c, t); c.fillStyle = '#f7d6c9'; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(x + s * 0.08 * t, y + 0.02 * t); c.quadraticCurveTo(x + s * 0.2 * t, y - 0.1 * t, x + s * 0.2 * t, y - 0.28 * t); c.lineTo(x + s * 0.17 * t, y - 0.28 * t); c.quadraticCurveTo(x + s * 0.14 * t, y - 0.1 * t, x + s * 0.06 * t, y + 0.04 * t); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x + s * 0.185 * t, y - 0.3 * t, 0.028 * t, 0.022 * t, 0, 0, 7); c.fill(); c.stroke(); });
      [[-0.2, -0.36, 0.045], [0.2, -0.38, 0.04], [-0.3, -0.18, 0.03], [0.3, -0.14, 0.035], [0.0, -0.38, 0.025]].forEach(([a, b, r]) => floco(c, x + a * t, y + b * t, r * t * 0.0 + t * r, '#7fb0f0'));
    } },
  { valor: 'e-erudito', nome: 'Erudito entre folhas flutuantes', legenda: 'Não tou julgando; só anotando...', cat: 'elemental', tom: 'irônico e observador',
    ind: 'Brincar com quem observa tudo em silêncio, com humor sobre julgar sem julgar.', contra: 'Assuntos de confiança, em que a pessoa precisa de acolhimento.',
    descr: 'Um rapaz de cabelos castanhos claros e olhos dourados, de túnica de estudioso, cercado de folhas verdes flutuantes e brotinhos brilhantes, escrevendo concentrado num livro grosso de capa dura. Fundo de papel de carta verde claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#d9f0cf', '#f1faeb', 'bolinhas'); contorno(c, t);
      [[-0.26, -0.2, 0.5], [0.26, -0.24, -0.6], [-0.28, 0.08, 1.2], [0.28, 0.0, -1.0], [0.0, -0.34, 0.2], [-0.2, 0.28, 0.7]].forEach(([a, b, g], i) => { folha(c, x + a * t, y + b * t, 0.08 * t, 0.028 * t, g, i % 2 ? '#7fd070' : '#4fb860', '#2f7a40'); });
      c.fillStyle = '#b8e8a0'; [[-0.14, 0.25], [0.2, 0.24]].forEach(([a, b]) => { c.strokeStyle = '#4a9a50'; c.lineWidth = t * 0.01; c.beginPath(); c.moveTo(x + a * t, y + b * t + 0.03 * t); c.lineTo(x + a * t, y + b * t); c.stroke(); c.beginPath(); c.ellipse(x + (a - 0.015) * t, y + b * t, 0.018 * t, 0.01 * t, -0.5, 0, 7); c.ellipse(x + (a + 0.015) * t, y + b * t, 0.018 * t, 0.01 * t, 0.5, 0, 7); c.fill(); c.stroke(); });
      contorno(c, t); c.fillStyle = '#c9a070'; c.beginPath(); c.ellipse(x, y - 0.13 * t, 0.16 * t, 0.16 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#f7f1e0'; linha(c, t, [[x - 0.11 * t, y - 0.01 * t], [x + 0.11 * t, y - 0.01 * t], [x + 0.17 * t, y + 0.3 * t], [x - 0.17 * t, y + 0.3 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#5fa860'; linha(c, t, [[x - 0.03 * t, y - 0.01 * t], [x + 0.03 * t, y - 0.01 * t], [x + 0.04 * t, y + 0.3 * t], [x - 0.04 * t, y + 0.3 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#e8c15a'; c.fillRect(x - 0.13 * t, y + 0.12 * t, 0.26 * t, 0.02 * t);
      rostoManga(c, x, y - 0.12 * t, t, { pele: '#ffe3d1', iris: '#e0a820', olho: 'frio', boca: 'neutra', cabelo: '#c9a070', olhar: 'baixo', bochechas: false });
      c.fillStyle = '#7a4a2a'; retArredondado(c, x - 0.15 * t, y + 0.16 * t, 0.3 * t, 0.1 * t, 0.012 * t); c.fill(); c.stroke(); c.fillStyle = '#f7f1e0'; c.fillRect(x - 0.13 * t, y + 0.17 * t, 0.26 * t, 0.075 * t); c.strokeStyle = '#a0a8b0'; c.lineWidth = t * 0.007; [0.19, 0.21, 0.23].forEach((b) => { c.beginPath(); c.moveTo(x - 0.11 * t, y + b * t); c.lineTo(x + 0.11 * t, y + b * t); c.stroke(); }); c.strokeStyle = '#8a5a2b'; c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x + 0.14 * t, y + 0.06 * t); c.lineTo(x + 0.04 * t, y + 0.18 * t); c.stroke(); contorno(c, t);
      c.fillStyle = '#ffe3d1'; c.beginPath(); c.ellipse(x + 0.12 * t, y + 0.08 * t, 0.028 * t, 0.022 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'e-samurai', nome: 'Samurai entre as pétalas', legenda: 'Honra não é o que os outros dizem, é o que o coração sustenta.', cat: 'elemental', tom: 'sereno e honrado',
    ind: 'Falar de honra, de integridade, de reputação e de ser fiel a si mesmo.', contra: 'Assuntos de humor ou de leviandade.',
    descr: 'Um jovem de cabelos curtos cor de lavanda, com uma mecha rosa, de quimono tradicional de samurai e armadura leve, ajoelhado no chão com a mão apoiada no cabo da espada, olhando as pétalas de cerejeira que caem devagar ao vento. Fundo de papel de carta rosa claro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#f8d9e6', '#fff1f6', 'liso'); contorno(c, t);
      c.fillStyle = '#ffb3cf'; [[-0.28, -0.2, 0.4], [0.26, -0.26, -0.5], [-0.24, 0.0, 1.1], [0.3, -0.04, 0.3], [-0.12, -0.3, -0.3], [0.2, 0.1, 0.8], [-0.3, 0.2, 0.6]].forEach(([a, b, g]) => { c.beginPath(); c.ellipse(x + a * t, y + b * t, 0.024 * t, 0.014 * t, g, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#c9b0f0'; c.beginPath(); c.ellipse(x, y - 0.1 * t, 0.15 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#4a4a66'; c.beginPath(); c.moveTo(x - 0.17 * t, y + 0.02 * t); c.lineTo(x + 0.17 * t, y + 0.02 * t); c.lineTo(x + 0.26 * t, y + 0.3 * t); c.lineTo(x - 0.26 * t, y + 0.3 * t); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#e8d7e8'; linha(c, t, [[x - 0.07 * t, y + 0.02 * t], [x + 0.07 * t, y + 0.02 * t], [x + 0.0 * t, y + 0.17 * t]], true); c.fill(); c.stroke(); c.fillStyle = '#7a4a8a'; c.fillRect(x - 0.17 * t, y + 0.17 * t, 0.34 * t, 0.025 * t); c.strokeRect(x - 0.17 * t, y + 0.17 * t, 0.34 * t, 0.025 * t); c.fillStyle = '#d8d0e8'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.17 * t, y + 0.03 * t, 0.05 * t, 0.035 * t, 0, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = '#26323a'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 0.12 * t, y + 0.3 * t, 0.07 * t, 0.03 * t, 0, 0, 7); c.fill(); c.stroke(); });
      rostoManga(c, x, y - 0.1 * t, t, { pele: '#f1e0d0', iris: '#b05ad8', olho: 'sereno', boca: 'neutra', cabelo: '#c9b0f0', olhar: 'baixo', bochechas: false });
      c.fillStyle = '#ff8fc0'; linha(c, t, [[x - 0.04 * t, y - 0.19 * t], [x - 0.02 * t, y - 0.07 * t], [x + 0.0 * t, y - 0.19 * t]], true); c.fill(); c.stroke();
      c.save(); c.translate(x + 0.2 * t, y + 0.2 * t); c.rotate(-0.15); c.fillStyle = '#2a2a3a'; c.fillRect(-0.34 * t, -0.015 * t, 0.46 * t, 0.03 * t); c.strokeRect(-0.34 * t, -0.015 * t, 0.46 * t, 0.03 * t); c.fillStyle = '#e8c15a'; c.fillRect(-0.04 * t, -0.022 * t, 0.014 * t, 0.044 * t); c.fillStyle = '#7a4a8a'; c.fillRect(0.0, -0.016 * t, 0.12 * t, 0.032 * t); c.strokeRect(0.0, -0.016 * t, 0.12 * t, 0.032 * t); c.restore(); c.fillStyle = '#f1e0d0'; c.beginPath(); c.ellipse(x + 0.17 * t, y + 0.19 * t, 0.03 * t, 0.025 * t, 0, 0, 7); c.fill(); c.stroke();
    } },
  { valor: 'e-guardiao', nome: 'Guardião de capa branca e máscara', legenda: 'Não escolhi, mas assumi.', cat: 'elemental', tom: 'solene e carregado',
    ind: 'Falar de responsabilidade herdada, de assumir um papel que não se escolheu e de dever.', contra: 'Assuntos alegres, de festa ou de humor.',
    descr: 'Um homem alto de cabelos loiros dourados e olhos azuis frios, com uma capa branca imaculada de detalhes dourados e uma máscara preta cobrindo parte do rosto. Ele caminha com calma por um portal escuro que se abre no ar, deixando rastros de energia sombria. Fundo de papel de carta azul-marinho escuro.',
    desenhar: (c, x, y, t) => {
      cartaoRetro(c, x, y, t, '#a8b0d8', '#12122a', 'liso'); contorno(c, t);
      const g = c.createRadialGradient(x, y + 0.04 * t, 0, x, y + 0.04 * t, t * 0.34); g.addColorStop(0, 'rgba(10,0,20,0.95)'); g.addColorStop(0.7, 'rgba(110,40,170,0.55)'); g.addColorStop(1, 'rgba(160,80,230,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(x, y + 0.04 * t, 0.3 * t, 0.36 * t, 0, 0, 7); c.fill();
      c.strokeStyle = '#b86cff'; c.lineWidth = t * 0.014; c.shadowColor = '#b86cff'; c.shadowBlur = t * 0.025; c.beginPath(); c.ellipse(x, y + 0.04 * t, 0.3 * t, 0.36 * t, 0, 0.2, Math.PI * 2 - 0.4); c.stroke(); c.shadowBlur = 0; contorno(c, t);
      c.strokeStyle = 'rgba(170,90,240,0.8)'; c.lineWidth = t * 0.012; [[0.1, 0.3, 0.3, 0.22], [0.0, 0.34, 0.24, 0.3], [-0.1, 0.32, -0.3, 0.26]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + a * t, y + b * t); c.quadraticCurveTo(x + (a + d) * t * 0.55, y + (b - 0.06) * t, x + d * t, y + e * t); c.stroke(); }); contorno(c, t);
      c.fillStyle = '#f7f7fb'; c.beginPath(); c.moveTo(x - 0.14 * t, y - 0.02 * t); c.quadraticCurveTo(x - 0.3 * t, y + 0.14 * t, x - 0.24 * t, y + 0.34 * t); c.lineTo(x + 0.24 * t, y + 0.34 * t); c.quadraticCurveTo(x + 0.3 * t, y + 0.14 * t, x + 0.14 * t, y - 0.02 * t); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = '#e8c15a'; c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x - 0.24 * t, y + 0.33 * t); c.lineTo(x + 0.24 * t, y + 0.33 * t); c.moveTo(x - 0.13 * t, y + 0.0 * t); c.lineTo(x - 0.08 * t, y + 0.33 * t); c.moveTo(x + 0.13 * t, y + 0.0 * t); c.lineTo(x + 0.08 * t, y + 0.33 * t); c.stroke(); contorno(c, t); c.fillStyle = '#e8c15a'; c.beginPath(); c.arc(x, y + 0.02 * t, 0.018 * t, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#26323a'; linha(c, t, [[x - 0.07 * t, y + 0.0 * t], [x + 0.07 * t, y + 0.0 * t], [x + 0.06 * t, y + 0.3 * t], [x - 0.06 * t, y + 0.3 * t]], true); c.fill(); c.stroke();
      c.fillStyle = '#ffd45a'; c.beginPath(); c.ellipse(x, y - 0.12 * t, 0.14 * t, 0.15 * t, 0, 0, 7); c.fill(); c.stroke();
      rostoManga(c, x, y - 0.1 * t, t, { pele: '#f5e4d6', iris: '#4a8ae0', olho: 'frio', boca: 'neutra', cabelo: '#ffd45a', bochechas: false });
      c.fillStyle = '#111018'; c.beginPath(); c.moveTo(x - 0.115 * t, y - 0.09 * t); c.quadraticCurveTo(x, y - 0.14 * t, x + 0.115 * t, y - 0.09 * t); c.lineTo(x + 0.1 * t, y - 0.045 * t); c.quadraticCurveTo(x, y - 0.075 * t, x - 0.1 * t, y - 0.045 * t); c.closePath(); c.fill(); c.stroke(); [-1, 1].forEach((s) => { c.fillStyle = '#7ac0ff'; c.beginPath(); c.ellipse(x + s * 0.045 * t, y - 0.075 * t, 0.018 * t, 0.011 * t, 0, 0, 7); c.fill(); });
    } },
  { valor: 'n-corredor', nome: 'Corredor em salto cortado pela linha de chegada', legenda: 'A linha de chegada é só onde o descanso começa a cobrar juros.', cat: 'mini', tom: 'reflexivo e irônico',
    ind: 'Falar de metas alcançadas, de descanso merecido e do preço de chegar lá.', contra: 'Assuntos de comemoração sem ressalvas.',
    descr: 'A silhueta preta de um corredor em pleno salto, de braços erguidos e pernas abertas, cortada ao meio por uma linha vermelha fina e reta que simboliza a linha de chegada. Cartão liso cor de creme, só preto e vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.05);
      c.beginPath(); c.moveTo(x - 0.02 * t, y - 0.06 * t); c.lineTo(x + 0.04 * t, y + 0.08 * t); c.stroke();
      c.beginPath(); c.moveTo(x - 0.01 * t, y - 0.04 * t); c.lineTo(x - 0.14 * t, y - 0.16 * t); c.moveTo(x - 0.01 * t, y - 0.04 * t); c.lineTo(x + 0.12 * t, y - 0.19 * t); c.stroke();
      c.beginPath(); c.moveTo(x + 0.04 * t, y + 0.08 * t); c.lineTo(x + 0.17 * t, y + 0.06 * t); c.lineTo(x + 0.2 * t, y + 0.17 * t); c.moveTo(x + 0.04 * t, y + 0.08 * t); c.lineTo(x - 0.12 * t, y + 0.12 * t); c.lineTo(x - 0.2 * t, y + 0.07 * t); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(x - 0.045 * t, y - 0.115 * t, 0.045 * t, 0, 7); c.fill();
      c.strokeStyle = VERMELHO; c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x + 0.005 * t, y - 0.38 * t); c.lineTo(x + 0.005 * t, y + 0.38 * t); c.stroke();
    } },
  { valor: 'n-raquetes', nome: 'Raquetes cruzadas e a bolinha amarela', legenda: 'Não é sorte, é geometria e marra.', cat: 'mini', tom: 'confiante e provocador',
    ind: 'Falar de esporte, de competição e de talento, com humor.', contra: 'Assuntos de humildade ou de modéstia.',
    descr: 'Duas raquetes de tênis minimalistas cruzadas em forma de X, com uma bolinha amarela perfeitamente redonda flutuando logo acima, cercada por um traço pontilhado em arco. Cartão liso cor de creme, preto e amarelo.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      [-1, 1].forEach((s) => { c.save(); c.translate(x, y + 0.1 * t); c.rotate(s * 0.7); c.beginPath(); c.ellipse(0, -0.14 * t, 0.07 * t, 0.095 * t, 0, 0, 7); c.stroke(); c.lineWidth = t * 0.012; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 0.04 * t, -0.225 * t); c.lineTo(i * 0.04 * t, -0.055 * t); c.stroke(); c.beginPath(); c.moveTo(-0.065 * t, -0.14 * t + i * 0.04 * t); c.lineTo(0.065 * t, -0.14 * t + i * 0.04 * t); c.stroke(); } c.lineWidth = t * 0.03; c.beginPath(); c.moveTo(0, -0.045 * t); c.lineTo(0, 0.2 * t); c.stroke(); c.restore(); tinta(c, t, 0.022); });
      c.fillStyle = AMARELO; c.beginPath(); c.arc(x, y - 0.25 * t, 0.045 * t, 0, 7); c.fill(); c.lineWidth = t * 0.014; c.stroke();
      c.setLineDash([t * 0.015, t * 0.02]); c.beginPath(); c.arc(x, y - 0.2 * t, 0.15 * t, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.setLineDash([]);
    } },
  { valor: 'n-bicicleta', nome: 'Bicicleta com roda-relógio', legenda: 'Pedalar é a forma mais honesta de brigar com o relógio.', cat: 'mini', tom: 'sereno e atento ao tempo',
    ind: 'Falar de pedalar, de rotina, de tempo e de ritmo próprio.', contra: 'Assuntos de pressa e de prazo.',
    descr: 'O contorno simples de uma bicicleta vista de perfil, em que a roda de trás se transforma num relógio de ponteiros minimalistas. Cartão liso cor de creme, só preto e um toque de vermelho no ponteiro.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      c.beginPath(); c.arc(x + 0.2 * t, y + 0.12 * t, 0.14 * t, 0, 7); c.stroke();
      c.beginPath(); c.arc(x - 0.2 * t, y + 0.12 * t, 0.14 * t, 0, 7); c.stroke(); c.lineWidth = t * 0.012; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(x - 0.2 * t + Math.cos(a) * 0.115 * t, y + 0.12 * t + Math.sin(a) * 0.115 * t); c.lineTo(x - 0.2 * t + Math.cos(a) * 0.135 * t, y + 0.12 * t + Math.sin(a) * 0.135 * t); c.stroke(); }
      c.lineWidth = t * 0.018; c.beginPath(); c.moveTo(x - 0.2 * t, y + 0.12 * t); c.lineTo(x - 0.2 * t, y + 0.04 * t); c.stroke(); c.strokeStyle = VERMELHO; c.beginPath(); c.moveTo(x - 0.2 * t, y + 0.12 * t); c.lineTo(x - 0.14 * t, y + 0.16 * t); c.stroke(); tinta(c, t, 0.022);
      c.beginPath(); c.moveTo(x - 0.2 * t, y + 0.12 * t); c.lineTo(x - 0.03 * t, y - 0.08 * t); c.lineTo(x + 0.14 * t, y - 0.08 * t); c.lineTo(x + 0.2 * t, y + 0.12 * t); c.moveTo(x - 0.03 * t, y - 0.08 * t); c.lineTo(x + 0.0 * t, y + 0.12 * t); c.lineTo(x - 0.2 * t, y + 0.12 * t); c.moveTo(x + 0.0 * t, y + 0.12 * t); c.lineTo(x + 0.14 * t, y - 0.08 * t); c.moveTo(x + 0.14 * t, y - 0.08 * t); c.lineTo(x + 0.12 * t, y - 0.17 * t); c.lineTo(x + 0.19 * t, y - 0.17 * t); c.moveTo(x - 0.06 * t, y - 0.13 * t); c.lineTo(x + 0.01 * t, y - 0.13 * t); c.moveTo(x - 0.03 * t, y - 0.13 * t); c.lineTo(x - 0.03 * t, y - 0.08 * t); c.stroke();
    } },
  { valor: 'n-cesta', nome: 'Trajetória da bola até a cesta', legenda: 'A gravidade aceita suborno se a mira for boa.', cat: 'mini', tom: 'bem-humorado e certeiro',
    ind: 'Falar de basquete, de pontaria, de acertar em cheio e de sorte com mérito.', contra: 'Assuntos de fracasso ou de erro.',
    descr: 'Um tracejado geométrico em zigue-zague cortando o cartão de ponta a ponta, que simula o caminho de uma bola de basquete indo direto para a cesta, desenhada como um simples círculo vazado. Cartão liso cor de creme, preto e laranja.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.02);
      c.setLineDash([t * 0.03, t * 0.022]); c.beginPath(); c.moveTo(x - 0.4 * t, y + 0.3 * t); c.lineTo(x - 0.22 * t, y - 0.05 * t); c.lineTo(x - 0.06 * t, y + 0.2 * t); c.lineTo(x + 0.1 * t, y - 0.12 * t); c.lineTo(x + 0.2 * t, y - 0.02 * t); c.lineTo(x + 0.28 * t, y - 0.2 * t); c.stroke(); c.setLineDash([]);
      c.fillStyle = LARANJA; c.beginPath(); c.arc(x - 0.3 * t, y + 0.28 * t, 0.035 * t, 0, 7); c.fill(); c.lineWidth = t * 0.012; c.stroke();
      c.lineWidth = t * 0.026; c.beginPath(); c.arc(x + 0.3 * t, y - 0.25 * t, 0.06 * t, 0, 7); c.stroke(); c.lineWidth = t * 0.012; c.beginPath(); c.moveTo(x + 0.25 * t, y - 0.2 * t); c.lineTo(x + 0.26 * t, y - 0.12 * t); c.moveTo(x + 0.35 * t, y - 0.2 * t); c.lineTo(x + 0.34 * t, y - 0.12 * t); c.moveTo(x + 0.3 * t, y - 0.19 * t); c.lineTo(x + 0.3 * t, y - 0.1 * t); c.stroke();
    } },
  { valor: 'n-escalador', nome: 'Escalador pendurado na linha', legenda: 'Para quem quer fugir do chão, qualquer parede vira escada.', cat: 'mini', tom: 'ousado e livre',
    ind: 'Falar de escalada, de superar limites e de buscar altura.', contra: 'Assuntos de cautela ou de medo de altura.',
    descr: 'Uma silhueta minimalista de escalador pendurado por uma linha preta fina que cruza o cartão na vertical até sumir lá em cima, com os braços esticados e as pernas dobradas. Cartão liso cor de creme, só preto.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.012); c.beginPath(); c.moveTo(x, y - 0.5 * t); c.lineTo(x, y - 0.08 * t); c.stroke();
      tinta(c, t, 0.045); c.beginPath(); c.moveTo(x - 0.03 * t, y - 0.1 * t); c.lineTo(x - 0.04 * t, y + 0.07 * t); c.moveTo(x - 0.03 * t, y - 0.1 * t); c.lineTo(x - 0.0 * t, y - 0.2 * t); c.moveTo(x - 0.03 * t, y - 0.09 * t); c.lineTo(x + 0.05 * t, y - 0.18 * t); c.stroke();
      c.beginPath(); c.moveTo(x - 0.04 * t, y + 0.07 * t); c.lineTo(x + 0.06 * t, y + 0.14 * t); c.lineTo(x + 0.04 * t, y + 0.26 * t); c.moveTo(x - 0.04 * t, y + 0.07 * t); c.lineTo(x - 0.14 * t, y + 0.16 * t); c.lineTo(x - 0.1 * t, y + 0.27 * t); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(x - 0.045 * t, y - 0.14 * t, 0.04 * t, 0, 7); c.fill();
    } },
  { valor: 'n-luvas', nome: 'Luvas de boxe cruzadas com faísca', legenda: 'Discutir com fatos cansa menos do que luva, mas machuca mais.', cat: 'mini', tom: 'combativo e irônico',
    ind: 'Falar de discussões, de boxe e de preferir argumentos a golpes.', contra: 'Conflitos reais, em que a ironia possa ferir.',
    descr: 'Um par de luvas de boxe desenhadas em traços grossos pretos, sem preenchimento, cruzadas uma contra a outra, com uma faísca geométrica simples no centro. Cartão liso cor de creme, preto e amarelo.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.034);
      [-1, 1].forEach((s) => { c.save(); c.translate(x + s * 0.08 * t, y + 0.02 * t); c.rotate(s * 0.9); retArredondado(c, -0.09 * t, -0.15 * t, 0.18 * t, 0.2 * t, 0.07 * t); c.stroke(); c.beginPath(); c.moveTo(-0.06 * t, 0.05 * t); c.lineTo(-0.06 * t, 0.15 * t); c.lineTo(0.06 * t, 0.15 * t); c.lineTo(0.06 * t, 0.05 * t); c.stroke(); c.beginPath(); c.arc(s * 0.09 * t, -0.04 * t, 0.04 * t, -1.4, 1.4); c.stroke(); c.restore(); tinta(c, t, 0.034); });
      c.fillStyle = AMARELO; c.strokeStyle = INK; c.lineWidth = t * 0.012; estrela(c, x, y - 0.12 * t, 0.07 * t, 0.025 * t, 4); c.fill(); c.stroke();
    } },
  { valor: 'n-chute', nome: 'Jogador de futebol e a bola veloz', legenda: 'A bola é redonda, mas a culpa do tropeço é do vento.', cat: 'mini', tom: 'rápido e brincalhão',
    ind: 'Falar de futebol, de desculpas e de velocidade.', contra: 'Assuntos sérios ou de crítica.',
    descr: 'A silhueta de um jogador de futebol chutando uma bola que se desmancha em três pequenos traços paralelos, indicando velocidade pura. Cartão liso cor de creme, preto e verde.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.045);
      c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.07 * t); c.lineTo(x - 0.06 * t, y + 0.07 * t); c.stroke();
      c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.05 * t); c.lineTo(x - 0.22 * t, y - 0.0 * t); c.moveTo(x - 0.1 * t, y - 0.05 * t); c.lineTo(x + 0.02 * t, y - 0.12 * t); c.stroke();
      c.beginPath(); c.moveTo(x - 0.06 * t, y + 0.07 * t); c.lineTo(x - 0.1 * t, y + 0.19 * t); c.lineTo(x - 0.17 * t, y + 0.28 * t); c.moveTo(x - 0.06 * t, y + 0.07 * t); c.lineTo(x + 0.08 * t, y + 0.12 * t); c.lineTo(x + 0.17 * t, y + 0.08 * t); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(x - 0.11 * t, y - 0.12 * t, 0.04 * t, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.lineWidth = t * 0.016; c.beginPath(); c.arc(x + 0.25 * t, y + 0.06 * t, 0.05 * t, 0, 7); c.fill(); c.stroke(); c.strokeStyle = VERDE; c.lineWidth = t * 0.016; [-0.03, 0.01, 0.05].forEach((d) => { c.beginPath(); c.moveTo(x + 0.19 * t, y + (0.06 + d) * t); c.lineTo(x + 0.12 * t, y + (0.07 + d) * t); c.stroke(); }); c.strokeStyle = INK; c.setLineDash([]);
    } },
  { valor: 'n-rosto', nome: 'Rosto focado em um traço só', legenda: 'Suor é só o corpo chorando de rir do seu esforço.', cat: 'mini', tom: 'concentrado e bem-humorado',
    ind: 'Falar de esforço, de treino, de suor e de foco.', contra: 'Assuntos de descanso ou de desistência.',
    descr: 'Um traço único e contínuo que desenha o perfil de um rosto concentrado, com uma faixa de suor na testa, sobre um fundo totalmente liso. Cartão cor de creme, preto, com a faixa em vermelho e uma gota azul.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.3 * t); c.bezierCurveTo(x + 0.08 * t, y - 0.32 * t, x + 0.16 * t, y - 0.2 * t, x + 0.14 * t, y - 0.08 * t); c.lineTo(x + 0.2 * t, y + 0.02 * t); c.lineTo(x + 0.14 * t, y + 0.04 * t); c.bezierCurveTo(x + 0.15 * t, y + 0.1 * t, x + 0.12 * t, y + 0.12 * t, x + 0.1 * t, y + 0.12 * t); c.bezierCurveTo(x + 0.12 * t, y + 0.18 * t, x + 0.08 * t, y + 0.24 * t, x + 0.0 * t, y + 0.25 * t); c.lineTo(x - 0.06 * t, y + 0.34 * t); c.stroke();
      c.lineWidth = t * 0.014; c.beginPath(); c.moveTo(x + 0.04 * t, y - 0.06 * t); c.lineTo(x + 0.1 * t, y - 0.08 * t); c.stroke();
      c.strokeStyle = VERMELHO; c.lineWidth = t * 0.03; c.beginPath(); c.moveTo(x - 0.06 * t, y - 0.2 * t); c.quadraticCurveTo(x + 0.06 * t, y - 0.19 * t, x + 0.15 * t, y - 0.15 * t); c.stroke();
      c.fillStyle = '#4aa8ff'; c.beginPath(); c.moveTo(x + 0.17 * t, y - 0.06 * t); c.quadraticCurveTo(x + 0.2 * t, y - 0.0 * t, x + 0.17 * t, y + 0.01 * t); c.quadraticCurveTo(x + 0.14 * t, y - 0.0 * t, x + 0.17 * t, y - 0.06 * t); c.fill();
    } },
  { valor: 'n-clave', nome: 'Clave de sol de um traço só', legenda: 'Silêncio também é nota, só que mais bem-educada.', cat: 'mini', tom: 'elegante e delicado',
    ind: 'Falar de música, de pausas, de silêncio e de sutileza.', contra: 'Assuntos barulhentos ou de festa.',
    descr: 'O desenho linear de uma clave de sol elegante, feita com um único traço preto contínuo, que termina num pequeno ponto vermelho. Cartão liso cor de creme.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.024);
      c.beginPath(); c.moveTo(x - 0.07 * t, y + 0.3 * t); c.bezierCurveTo(x - 0.08 * t, y + 0.37 * t, x + 0.03 * t, y + 0.37 * t, x + 0.03 * t, y + 0.29 * t); c.lineTo(x + 0.02 * t, y - 0.26 * t); c.bezierCurveTo(x + 0.02 * t, y - 0.4 * t, x + 0.13 * t, y - 0.33 * t, x + 0.1 * t, y - 0.22 * t); c.bezierCurveTo(x + 0.07 * t, y - 0.12 * t, x - 0.07 * t, y - 0.06 * t, x - 0.1 * t, y + 0.04 * t); c.bezierCurveTo(x - 0.15 * t, y + 0.16 * t, x - 0.03 * t, y + 0.26 * t, x + 0.07 * t, y + 0.2 * t); c.bezierCurveTo(x + 0.13 * t, y + 0.14 * t, x + 0.09 * t, y + 0.05 * t, x + 0.0 * t, y + 0.06 * t); c.bezierCurveTo(x - 0.05 * t, y + 0.07 * t, x - 0.05 * t, y + 0.14 * t, x - 0.01 * t, y + 0.14 * t); c.stroke();
      c.fillStyle = VERMELHO; c.beginPath(); c.arc(x - 0.01 * t, y + 0.14 * t, 0.022 * t, 0, 7); c.fill();
    } },
  { valor: 'n-pauta', nome: 'Pauta com a colcheia que escapa', legenda: 'Quem desafina por impulso, ao menos avisa que chegou.', cat: 'mini', tom: 'irônico e honesto',
    ind: 'Falar de impulsividade, de agir sem pensar e de chegar avisando.', contra: 'Assuntos formais ou de cautela.',
    descr: 'Três linhas paralelas horizontais, uma pauta simples, cortadas por uma colcheia preta isolada que parece flutuar para fora da margem. Cartão liso cor de creme, preto e um toque de vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.014);
      [-0.07, 0.0, 0.07].forEach((d) => { c.beginPath(); c.moveTo(x - 0.4 * t, y + d * t); c.lineTo(x + 0.4 * t, y + d * t); c.stroke(); });
      c.fillStyle = INK; c.save(); c.translate(x + 0.2 * t, y - 0.12 * t); c.rotate(-0.15); c.beginPath(); c.ellipse(0, 0.0, 0.04 * t, 0.03 * t, -0.4, 0, 7); c.fill(); c.lineWidth = t * 0.018; c.beginPath(); c.moveTo(0.035 * t, -0.005 * t); c.lineTo(0.035 * t, -0.17 * t); c.quadraticCurveTo(0.1 * t, -0.15 * t, 0.085 * t, -0.07 * t); c.stroke(); c.restore();
      c.fillStyle = VERMELHO; c.beginPath(); c.arc(x - 0.3 * t, y + 0.0 * t, 0.012 * t, 0, 7); c.fill();
    } },
  { valor: 'n-violao', nome: 'Violão em forma de oito', legenda: 'Madeira que chora bonito ganha o nome de instrumento.', cat: 'mini', tom: 'poético e emotivo',
    ind: 'Falar de violão, de músicas tristes e de sentimentos que viram canção.', contra: 'Assuntos técnicos ou de humor leve.',
    descr: 'A silhueta geométrica de um violão reduzida a um corpo em forma de oito, com um círculo vazado no centro e três cordas verticais finíssimas. Cartão liso cor de creme, preto e um ponto vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      c.beginPath(); c.arc(x, y + 0.2 * t, 0.12 * t, 0, 7); c.stroke(); c.beginPath(); c.arc(x, y + 0.02 * t, 0.085 * t, 0, 7); c.stroke(); c.lineWidth = t * 0.016; c.beginPath(); c.arc(x, y + 0.2 * t, 0.04 * t, 0, 7); c.stroke();
      c.lineWidth = t * 0.03; c.beginPath(); c.moveTo(x, y - 0.06 * t); c.lineTo(x, y - 0.3 * t); c.stroke(); retArredondado(c, x - 0.03 * t, y - 0.4 * t, 0.06 * t, 0.1 * t, 0.012 * t); c.lineWidth = t * 0.018; c.stroke();
      c.lineWidth = t * 0.007; [-0.012, 0, 0.012].forEach((d) => { c.beginPath(); c.moveTo(x + d * t, y - 0.3 * t); c.lineTo(x + d * t, y + 0.26 * t); c.stroke(); });
      c.fillStyle = VERMELHO; c.beginPath(); c.arc(x, y + 0.26 * t, 0.012 * t, 0, 7); c.fill();
    } },
  { valor: 'n-fones', nome: 'Fones de ouvido com coração', legenda: 'O mundo lá fora faz barulho, mas quem manda no volume sou eu.', cat: 'mini', tom: 'íntimo e protetor',
    ind: 'Falar de ouvir música, de privacidade, de se proteger do barulho e de autocuidado.', contra: 'Assuntos de convivência e de sociabilidade.',
    descr: 'O contorno minimalista de fones de ouvido arqueados, com um pequeno coração vazado desenhado exatamente no centro da haste de cima. Cartão liso cor de creme, preto e vermelho no coração.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.03);
      c.beginPath(); c.arc(x, y + 0.04 * t, 0.2 * t, Math.PI, 0); c.stroke(); c.lineWidth = t * 0.026; [-1, 1].forEach((s) => { retArredondado(c, x + s * 0.2 * t - 0.05 * t, y + 0.04 * t, 0.1 * t, 0.17 * t, 0.045 * t); c.stroke(); });
      c.strokeStyle = VERMELHO; c.lineWidth = t * 0.016; coracao(c, x, y - 0.14 * t, 0.03 * t); c.stroke();
    } },
  { valor: 'n-teclas', nome: 'Tecla preta e tecla branca', legenda: 'Até nas teclas pretas a gente aprende a tirar som bonito.', cat: 'mini', tom: 'sábio e animador',
    ind: 'Falar de piano, de aprendizado, de dificuldades e de superar.', contra: 'Assuntos de pressa.',
    descr: 'Uma tecla de piano preta e uma branca lado a lado, formando um bloco geométrico limpo e contrastante. Cartão liso cor de creme, preto e branco.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      c.fillStyle = '#fff'; retArredondado(c, x - 0.13 * t, y - 0.24 * t, 0.15 * t, 0.46 * t, 0.014 * t); c.fill(); c.stroke();
      c.fillStyle = INK; retArredondado(c, x + 0.02 * t, y - 0.24 * t, 0.11 * t, 0.46 * t, 0.014 * t); c.fill(); c.stroke();
    } },
  { valor: 'n-onda', nome: 'Onda sonora em barras', legenda: 'Palavra gasta, som ecoa, silêncio resolve.', cat: 'mini', tom: 'contido e sábio',
    ind: 'Falar de áudio, de podcast, de palavras e de silêncio.', contra: 'Assuntos de volume e de festa.',
    descr: 'Uma onda sonora minimalista desenhada com barras verticais de alturas variadas, parecida com um código de barras estético. Cartão liso cor de creme, preto, com uma barra vermelha.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); const h = [0.04, 0.09, 0.16, 0.26, 0.13, 0.3, 0.2, 0.08, 0.22, 0.12, 0.05, 0.14, 0.07];
      h.forEach((v, i) => { c.fillStyle = i === 5 ? VERMELHO : INK; retArredondado(c, x + (-0.31 + i * 0.05) * t, y - v * t, 0.03 * t, v * 2 * t, 0.012 * t); c.fill(); });
    } },
  { valor: 'n-microfone', nome: 'Microfone antigo de pedestal', legenda: 'Microfone aberto: o perigo mora na sinceridade.', cat: 'mini', tom: 'sincero e perigoso',
    ind: 'Falar de podcast, de palco, de dizer o que se sente e de sinceridade.', contra: 'Assuntos de discrição.',
    descr: 'O perfil de um microfone antigo de pedestal, desenhado com traços retos e uma redoma quadriculada simples. Cartão liso cor de creme, preto, com um ponto vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      retArredondado(c, x - 0.09 * t, y - 0.3 * t, 0.18 * t, 0.26 * t, 0.07 * t); c.stroke(); c.lineWidth = t * 0.01; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - 0.09 * t + i * 0.045 * t, y - 0.3 * t); c.lineTo(x - 0.09 * t + i * 0.045 * t, y - 0.04 * t); c.stroke(); } for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(x - 0.09 * t, y - 0.3 * t + i * 0.052 * t); c.lineTo(x + 0.09 * t, y - 0.3 * t + i * 0.052 * t); c.stroke(); }
      c.lineWidth = t * 0.022; c.beginPath(); c.moveTo(x - 0.1 * t, y - 0.04 * t); c.lineTo(x + 0.1 * t, y - 0.04 * t); c.moveTo(x, y - 0.04 * t); c.lineTo(x, y + 0.24 * t); c.moveTo(x - 0.15 * t, y + 0.32 * t); c.lineTo(x, y + 0.24 * t); c.lineTo(x + 0.15 * t, y + 0.32 * t); c.stroke();
      c.fillStyle = VERMELHO; c.beginPath(); c.arc(x + 0.14 * t, y - 0.16 * t, 0.014 * t, 0, 7); c.fill();
    } },
  { valor: 'n-vinil', nome: 'Vinil com ponto vermelho', legenda: 'Riscos no passado dão o melhor chiado na agulha.', cat: 'mini', tom: 'nostálgico e cheio de memória',
    ind: 'Falar de passado, de cicatrizes, de música antiga e de aceitar as marcas.', contra: 'Assuntos de novidade e de futuro.',
    descr: 'O desenho esquemático de um vinil girando, feito de três círculos concêntricos perfeitos e um ponto central vermelho. Cartão liso cor de creme, preto e vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.022);
      [0.3, 0.2, 0.11].forEach((r, i) => { c.lineWidth = t * (i === 0 ? 0.026 : 0.014); c.beginPath(); c.arc(x, y, r * t, 0, 7); c.stroke(); }); c.fillStyle = VERMELHO; c.beginPath(); c.arc(x, y, 0.04 * t, 0, 7); c.fill();
    } },
  { valor: 'n-colcheias', nome: 'Duas colcheias e a estrela', legenda: 'Ritmo é a pressa que aprendeu a dançar.', cat: 'mini', tom: 'alegre e dançante',
    ind: 'Falar de ritmo, de dança e de pressa que vira alegria.', contra: 'Assuntos de calma e de silêncio.',
    descr: 'Duas colcheias unidas por uma barra horizontal em cima, com uma pequena estrela de quatro pontas flutuando logo abaixo delas. Cartão liso cor de creme, preto e amarelo.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); c.fillStyle = INK; tinta(c, t, 0.022);
      [-0.1, 0.12].forEach((a) => { c.beginPath(); c.ellipse(x + a * t, y + 0.05 * t, 0.055 * t, 0.04 * t, -0.4, 0, 7); c.fill(); c.beginPath(); c.moveTo(x + (a + 0.05) * t, y + 0.035 * t); c.lineTo(x + (a + 0.05) * t, y - 0.24 * t); c.stroke(); });
      c.lineWidth = t * 0.045; c.beginPath(); c.moveTo(x - 0.05 * t, y - 0.22 * t); c.lineTo(x + 0.17 * t, y - 0.22 * t); c.stroke();
      c.fillStyle = AMARELO; c.strokeStyle = INK; c.lineWidth = t * 0.012; estrela(c, x + 0.02 * t, y + 0.2 * t, 0.06 * t, 0.02 * t, 4); c.fill(); c.stroke();
    } },
  { valor: 'n-caixa', nome: 'Caixa de som minimalista', legenda: 'O grave bate forte para lembrar que a gente ainda está aqui.', cat: 'mini', tom: 'forte e presente',
    ind: 'Falar de música alta, de presença e de lembrar que a gente existe.', contra: 'Assuntos de silêncio e de discrição.',
    descr: 'Uma caixa de som minimalista, feita de dois círculos concêntricos pretos dentro de um retângulo de cantos levemente arredondados. Cartão liso cor de creme, preto e um ponto vermelho.',
    desenhar: (c, x, y, t) => {
      cartaoMini(c, x, y, t, '#faf7f0'); tinta(c, t, 0.028);
      retArredondado(c, x - 0.16 * t, y - 0.3 * t, 0.32 * t, 0.6 * t, 0.03 * t); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(x, y - 0.14 * t, 0.045 * t, 0, 7); c.fill(); c.lineWidth = t * 0.018; c.beginPath(); c.arc(x, y - 0.14 * t, 0.085 * t, 0, 7); c.stroke(); c.lineWidth = t * 0.026; c.beginPath(); c.arc(x, y + 0.12 * t, 0.12 * t, 0, 7); c.stroke(); c.lineWidth = t * 0.016; c.beginPath(); c.arc(x, y + 0.12 * t, 0.06 * t, 0, 7); c.stroke(); c.fillStyle = VERMELHO; c.beginPath(); c.arc(x + 0.115 * t, y - 0.25 * t, 0.014 * t, 0, 7); c.fill();
    } }
];
RETRO.forEach((e) => {
  FIGURINHAS.push({ valor: e.valor, nome: e.nome, legenda: e.legenda, escala: 1.75, desenhar: e.desenhar,
    texto: `${e.nome}. Tom: ${e.tom}. ` + descricaoPadrao({ indicacao: e.ind, contraindicacao: e.contra, descricao: e.descr }),
    detalhes: detalhesDaFigurinha(e.tom, e.ind, e.descr, e.contra) });
});
// O nome na lista: a frase entre aspas e depois o que a figurinha mostra, como em “que vida difícil!” gato em cima de uma casa.
FIGURINHAS.forEach((f) => { f.rotulo = f.legenda ? `\u201c${f.legenda}\u201d ${f.nome}.` : f.nome; });
const acharFigurinha = (v) => FIGURINHAS.find((f) => f.valor === v) || null;

// --- Figurinha combinando com a moldura (Criar post) --------------------------------------------------------
// Cada moldura do post está num grupo, e cada grupo combina com certos estilos de figurinha.
const GRUPOS_DE_MOLDURA_POST = {
  sobria: ['grafite-fio', 'marinho-dourado', 'branco-gelo', 'madeira-quadro', 'revista', 'preto-vermelho'],
  lisa: ['azul-calmo', 'rosa-quartzo', 'verde-sage', 'manteiga'],
  afetiva: ['aquarela', 'areia-dobrada', 'musgo-redondo', 'polaroide', 'filme', 'coracoes', 'flores', 'confete', 'casamento'],
  datas: ['natal', 'pascoa', 'serpentinas', 'estrelas', 'tropical', 'sao-joao', 'ano-novo'],
  semFigurinha: ['medalha']
};
const CLASSICAS_DE_ESCRITA = ['livro', 'caneta', 'maquina', 'papeis', 'xicara', 'balao'];
const grupoDaMolduraPost = (v) => Object.keys(GRUPOS_DE_MOLDURA_POST).find((g) => GRUPOS_DE_MOLDURA_POST[g].includes(v)) || 'semFigurinha';
/** Valores das figurinhas que combinam com a moldura. */
function figurinhasParaMoldura(valorMoldura, { kit = false } = {}) {
  const g = kit ? 'kit' : grupoDaMolduraPost(valorMoldura);
  const estiloDe = (v) => { for (const c of CATEGORIAS_FIGURINHA) { if (c.itens && c.itens.includes(v)) return [c.valor]; for (const sub of c.subs || []) if (sub.itens.includes(v)) return [c.valor, sub.valor]; } return []; };
  const tem = (v, ...estilos) => estiloDe(v).some((x) => estilos.includes(x));
  return FIGURINHAS.map((f) => f.valor).filter((v) => {
    if (g === 'sobria') return tem(v, 'minimalista') || (tem(v, 'classicas') && CLASSICAS_DE_ESCRITA.includes(v)) || (valorMoldura === 'preto-vermelho' && tem(v, 'anime', 'jogos', 'rpg'));
    if (g === 'lisa') return tem(v, 'minimalista', 'classicas', 'retro', 'anime', 'jogos', 'rpg');
    if (g === 'afetiva') return tem(v, 'retro', 'vida-real', 'classicas', 'mini-musica');
    if (g === 'kit' || g === 'datas') return tem(v, 'classicas', 'retro');
    return false;
  });
}
/** A árvore de categorias só com as figurinhas que combinam com a moldura. */
function categoriasDeFigurinhasPara(valorMoldura, opcoes) {
  const ok = new Set(figurinhasParaMoldura(valorMoldura, opcoes));
  const filtra = (c) => (c.subs ? { ...c, subs: c.subs.map((x) => ({ ...x, itens: x.itens.filter((v) => ok.has(v)) })).filter((x) => x.itens.length) } : { ...c, itens: c.itens.filter((v) => ok.has(v)) });
  return CATEGORIAS_FIGURINHA.map(filtra).filter((c) => (c.subs ? c.subs.length : c.itens.length));
}

const LOCAIS_FIGURINHA = [
  { valor: 'sup-dir', nome: 'Canto de cima, à direita' }, { valor: 'sup-esq', nome: 'Canto de cima, à esquerda' },
  { valor: 'inf-dir', nome: 'Canto de baixo, à direita' }, { valor: 'inf-esq', nome: 'Canto de baixo, à esquerda' }
];
const LOCAIS_TEXTO = [{ valor: 'embaixo', nome: 'Embaixo' }, { valor: 'cima', nome: 'Em cima' }, { valor: 'meio', nome: 'No meio' }];
const LIMITE_TEXTO = 40;
const LIMITE_CAPA_TITULO = 28, LIMITE_CAPA_AUTOR = 30;
const TIPOS_ESCRITO = [
  { valor: 'legenda', nome: 'Legenda', texto: 'Tom: discreto e informativo. Indicação: Dizer um nome, uma frase curta ou uma data sem tomar conta da imagem. Contraindicação: Imagem que precisa ser lida de longe ou numa tela pequena. Descrição: Uma faixa escura arredondada com letras brancas, em uma linha, de tamanho médio, com até 34 caracteres. Fica por cima da imagem pronta, com qualquer fundo completo, moldura, fundo borrado ou foto sem mudança, no lugar mais livre, longe do seu rosto.' },
  { valor: 'frase', nome: 'Frase', texto: 'Tom: de recado e de confidência. Indicação: Frases das figurinhas retrô e textos mais longos, com até 80 caracteres. Contraindicação: Imagem que precisa ser lida de longe, onde o Título serve melhor. Descrição: Letras menores, em até três linhas, sobre a faixa escura, no lugar mais livre, longe do seu rosto. Funciona com qualquer fundo completo, moldura, fundo borrado ou foto sem mudança.' },
  { valor: 'titulo', nome: 'Título', texto: 'Tom: forte e chamativo. Indicação: Capa de podcast, de álbum ou de vídeo, e qualquer foto que precise ser lida de longe ou numa tela pequena. Contraindicação: Frases longas, porque cabem só 28 caracteres, em até duas linhas. Descrição: Letras bem grandes e grossas, com a faixa escura atrás, em até duas linhas, no lugar mais livre, longe do seu rosto. Funciona com qualquer fundo completo, moldura, fundo borrado ou foto sem mudança. Nas molduras Capa de revista e Escritório profissional, as faixas livres costumam receber o texto.' },
  { valor: 'capa', nome: 'Capa', soEm: 'capa-ebook', texto: 'Tom: de livro, com título forte e nome discreto. Indicação: Capa para ebook, com o título em cima e o nome da autora ou do autor embaixo. Contraindicação: Foto que não é capa de livro, onde o Título ou a Legenda servem melhor. Descrição: Dois campos, o Título, em até duas linhas de letras grandes, com até 28 caracteres, e o nome da autora ou do autor, em uma linha, com até 30. Os dois saem sobre uma faixa escura, o título no alto e o nome embaixo, longe do rosto.' },
];

function limparTexto(t, max = LIMITE_TEXTO) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, max); }
/** Quantos caracteres cabem em uma linha, em letra legível, na proporção dada (no máximo 40). */
function limiteTexto(proporcao, modo = false) {
  const p = acharProporcao(proporcao);
  if (modo === 'frase') return 80;
  if (modo === 'autor') return LIMITE_CAPA_AUTOR;
  if (modo === true || modo === 'titulo' || modo === 'capa') return LIMITE_CAPA_TITULO;
  const larguraU = p ? (100 * p.w) / Math.min(p.w, p.h) : 100;
  return Math.max(8, Math.min(LIMITE_TEXTO, Math.floor((0.86 * larguraU / 4.2 - 1.1) / 0.56)));
}

// --- Composição -------------------------------------------------------------------------------------

function criarTela(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** A pessoa recortada: o pedaço da foto (rec) com a máscara (mesma proporção da foto), numa tela do tamanho pedido. */
function recortarPessoa(foto, fw, fh, mascara, rec, w, h) {
  const t = criarTela(w, h), c = t.getContext('2d');
  c.drawImage(foto, rec.sx, rec.sy, rec.sw, rec.sh, 0, 0, w, h);
  const m = criarTela(w, h), mc = m.getContext('2d');
  const kx = mascara.width / fw, ky = mascara.height / fh;
  mc.filter = `blur(${Math.max(0.6, w / 900)}px)`;
  mc.drawImage(mascara, rec.sx * kx, rec.sy * ky, rec.sw * kx, rec.sh * ky, 0, 0, w, h);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(m, 0, 0);
  return t;
}

function cobrir(ctx, img, iw, ih, x, y, w, h) {
  const k = Math.max(w / iw, h / ih), sw = w / k, sh = h / k;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** Quebra em até duas linhas pelas palavras; devolve null se não couber. */
function quebrarEmDuas(ctx, t, maxW) {
  if (ctx.measureText(t).width <= maxW) return [t];
  const pal = t.split(' ');
  for (let i = 1; i < pal.length; i++) {
    const a = pal.slice(0, i).join(' '), b = pal.slice(i).join(' ');
    if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) return [a, b];
  }
  return null;
}
function quebrarEmN(ctx, t, maxW, n) {
  const pal = t.split(' '), linhas = [];
  let atual = '';
  for (const p of pal) {
    const tentativa = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tentativa).width <= maxW || !atual) atual = tentativa; else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas.length <= n && linhas.every((l) => ctx.measureText(l).width <= maxW) ? linhas : null;
}
function geometriaTexto(ctx, W, H, u, texto, local, grande) {
  const t = limparTexto(texto, grande === 'frase' ? 80 : LIMITE_TEXTO);
  if (grande === 'frase') {
    let tam = 5.6 * u, linhas = null;
    for (; tam >= 3.6 * u; tam *= 0.94) {
      ctx.font = `700 ${tam}px "Segoe UI", Arial, sans-serif`;
      linhas = quebrarEmN(ctx, t, W * 0.88 - tam * 1.1, 3);
      if (linhas) break;
    }
    if (!linhas) linhas = [t];
    const w = Math.min(W * 0.96, Math.max(...linhas.map((l) => ctx.measureText(l).width)) + tam * 1.1), h = tam * 1.35 * linhas.length + tam * 0.45;
    const y = local === 'cima' ? 5 * u : local === 'meio' ? (H - h) / 2 : H - h - 5 * u;
    return { t, tam, x: (W - w) / 2, y, w, h, linhas };
  }
  if (grande) {
    let tam = 10 * u, linhas = null;
    for (; tam >= 5 * u; tam *= 0.93) {
      ctx.font = `800 ${tam}px "Segoe UI", Arial, sans-serif`;
      linhas = quebrarEmDuas(ctx, t, W * 0.88 - tam * 1.1);
      if (linhas) break;
    }
    if (!linhas) linhas = [t];
    const w = Math.min(W * 0.96, Math.max(...linhas.map((l) => ctx.measureText(l).width)) + tam * 1.1), h = tam * 1.35 * linhas.length + tam * 0.45;
    const y = local === 'cima' ? 5 * u : local === 'meio' ? (H - h) / 2 : H - h - 5 * u;
    return { t, tam, x: (W - w) / 2, y, w, h, linhas };
  }
  let tam = 6.2 * u;
  ctx.font = `700 ${tam}px "Segoe UI", Arial, sans-serif`;
  const maxW = W * 0.86;
  const larg = ctx.measureText(t).width;
  if (larg > maxW) { tam = Math.max(4.2 * u, tam * (maxW / larg)); ctx.font = `700 ${tam}px "Segoe UI", Arial, sans-serif`; }
  const w = ctx.measureText(t).width + tam * 1.1, h = tam * 1.7;
  const x = (W - w) / 2;
  const y = local === 'cima' ? 5 * u : local === 'meio' ? (H - h) / 2 : H - h - 5 * u;
  return { t, tam, x, y, w, h, linhas: [t] };
}
function desenharTexto(ctx, W, H, u, texto, local, grande) {
  if (!limparTexto(texto, grande === 'frase' ? 80 : LIMITE_TEXTO)) return;
  const { tam, x, y, w, h, linhas } = geometriaTexto(ctx, W, H, u, texto, local, grande);
  ctx.fillStyle = 'rgba(0,0,0,0.58)'; retArredondado(ctx, x, y, w, h, h * 0.3); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, tam / 14); ctx.strokeStyle = '#000';
  const passo = grande ? tam * 1.35 : tam * 1.7, topo = y + (h - passo * linhas.length) / 2;
  linhas.forEach((l, i) => { const yy = topo + passo * (i + 0.5) + tam * 0.04; ctx.strokeText(l, W / 2, yy); ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, yy); });
}
/** 3.0.4: capa de ebook. O título no alto, em até duas linhas grandes, e o nome embaixo, os dois na faixa escura do Título. */
function bandasDaCapa(ctx, W, H, u, capa) {
  const r = [];
  const t = limparTexto(capa && capa.titulo, LIMITE_CAPA_TITULO), a = limparTexto(capa && capa.autor, LIMITE_CAPA_AUTOR);
  if (t) { const g = geometriaTexto(ctx, W, H, u, t, 'cima', true); r.push({ x: g.x, y: g.y, w: g.w, h: g.h }); }
  if (a) { const g = geometriaTexto(ctx, W, H, u, a, 'embaixo', false); r.push({ x: g.x, y: g.y, w: g.w, h: g.h }); }
  return r;
}
function desenharCapaEbook(ctx, W, H, u, capa) {
  desenharTexto(ctx, W, H, u, limparTexto(capa.titulo, LIMITE_CAPA_TITULO), 'cima', true);
  desenharTexto(ctx, W, H, u, limparTexto(capa.autor, LIMITE_CAPA_AUTOR), 'embaixo', false);
}
function retFigurinha(W, H, u, local, esc = 1) {
  const t = 16 * u * esc, m = 3.5 * u + t / 2;
  const x = local && local.endsWith('esq') ? m : W - m, y = local && local.startsWith('sup') ? m : H - m;
  return { cx: x, cy: y, t, x: x - t / 2, y: y - t / 2, w: t, h: t };
}
function desenharFigurinha(ctx, W, H, u, valor, local) {
  const f = acharFigurinha(valor);
  if (!f) return;
  const r = retFigurinha(W, H, u, local, f.escala || 1);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = u; ctx.shadowOffsetY = 0.4 * u;
  f.desenhar(ctx, r.cx, r.cy, r.t);
  ctx.restore();
}

// --- O programa escolhe onde ficam o escrito e a figurinha --------------------------------------------------

/** Quanto detalhe há numa região já desenhada (0 = lisa, mais alto = cheia de bordas). */
function detalheDe(ctx, x, y, w, h) {
  const sw = 48, sh = Math.max(6, Math.round((48 * h) / Math.max(1, w)));
  const t = criarTela(sw, sh), tc = t.getContext('2d', { willReadFrequently: true });
  tc.drawImage(ctx.canvas, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, sw, sh);
  const d = tc.getImageData(0, 0, sw, sh).data;
  const lum = (i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  let soma = 0, n = 0;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const k = (j * sw + i) * 4;
    if (i + 1 < sw) { soma += Math.abs(lum(k) - lum(k + 4)); n++; }
    if (j + 1 < sh) { soma += Math.abs(lum(k) - lum(k + sw * 4)); n++; }
  }
  return n ? soma / n / 255 : 0;
}
const sobrepoe = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** O rosto com folga (cabelo e pescoço), em pontos da foto pronta. */
function rostoComFolga(r) { return r ? { x: r.x - r.w * 0.35, y: r.y - r.h * 0.45, w: r.w * 1.7, h: r.h * 1.75 } : null; }
function areaComum(a, b) { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }

function escolherLocais(ctx, W, H, u, { texto, figurinha, rosto, grande, localTexto, ocupados = [] }) {
  const rf = rostoComFolga(rosto), saida = { localTexto: 'embaixo', localFigurinha: 'inf-dir' };
  const pontua = (r, tendencia) => detalheDe(ctx, r.x, r.y, r.w, r.h) * 4 + (rf ? (sobrepoe(r, rf) ? 3 : 0) + 12 * (areaComum(r, rf) / (rf.w * rf.h)) : 0) + tendencia;
  let rTexto = null;
  if (limparTexto(texto, grande === 'frase' ? 80 : LIMITE_TEXTO) && (localTexto === 'cima' || localTexto === 'embaixo')) {
    const g = geometriaTexto(ctx, W, H, u, texto, localTexto, grande);
    saida.localTexto = localTexto; rTexto = { x: 0, y: g.y, w: W, h: g.h };
  } else if (limparTexto(texto, grande === 'frase' ? 80 : LIMITE_TEXTO)) {
    const cand = [['embaixo', 0], ['cima', 0.03]].map(([l, b]) => { const g = geometriaTexto(ctx, W, H, u, texto, l, grande); const r = { x: 0, y: g.y, w: W, h: g.h }; return { l, r, p: pontua(r, b) }; });
    cand.sort((a, b) => a.p - b.p);
    saida.localTexto = cand[0].l; rTexto = cand[0].r;
  }
  if (figurinha) {
    let cand = ['inf-dir', 'inf-esq', 'sup-dir', 'sup-esq'].map((l) => ({ l, r: retFigurinha(W, H, u, l, (acharFigurinha(figurinha) || {}).escala || 1) }));
    const livres = cand.filter((c) => !(rTexto && sobrepoe(c.r, rTexto)) && !ocupados.some((o) => sobrepoe(c.r, o)));
    if (livres.length) cand = livres;
    cand.forEach((c, i) => { c.p = pontua(c.r, i * 0.01); });
    cand.sort((a, b) => a.p - b.p);
    saida.localFigurinha = cand[0].l;
  }
  return saida;
}

// Molduras que não combinam com certas proporções somem da lista, e o programa avisa quais.
const EVITAR_MOLDURA = { polaroide: ['capa', 'capa-quadrada'], revista: ['capa', 'capa-quadrada'], filme: ['capa-quadrada'], medalha: ['capa', 'stories', 'cartao', 'capa-ebook'] };
MOLDURAS.forEach((m) => { m.evitar = EVITAR_MOLDURA[m.valor] || []; });
function moldurasPara(proporcao, { post = false } = {}) {
  const todas = post ? MOLDURAS : MOLDURAS.filter((m) => !m.soPost);
  return { disponiveis: todas.filter((m) => !m.evitar.includes(proporcao)), escondidas: todas.filter((m) => m.evitar.includes(proporcao)) };
}
function avisoMolduras(proporcao) {
  const { escondidas } = moldurasPara(proporcao);
  const p = acharProporcao(proporcao);
  if (!escondidas.length) return '';
  const nomes = escondidas.map((m) => m.nome);
  const lista = nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  return `Para a proporção ${p ? p.nome : proporcao}, ${escondidas.length === 1 ? 'uma moldura não aparece' : escondidas.length + ' molduras não aparecem'} porque a pessoa ficaria pequena demais: ${lista}.`;
}

/**
 * Monta a foto. entrada: { foto, fw, fh, mascara (ou null), cx, rosto ({x,y,w,h} de 0 a 1 na foto, ou null), efeito: 'original'|'borrar'|'fundo'|'moldura',
 * fundoImg ({img,w,h}), moldura (valor), texto, figurinha }. Devolve onde o programa pôs o escrito e a figurinha, e onde ficou o rosto.
 */
function compor(ctx, W, H, e) {
  const u = Math.min(W, H) / 100;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const mascara = e.mascara || null;
  const cx = Number.isFinite(e.cx) ? e.cx : 0.5;
  let rostoSaida = null;
  const levaRosto = (rec, x0, y0, w0, h0) => {
    if (!e.rosto) return null;
    return { x: x0 + ((e.rosto.x * e.fw - rec.sx) / rec.sw) * w0, y: y0 + ((e.rosto.y * e.fh - rec.sy) / rec.sh) * h0, w: (e.rosto.w * e.fw / rec.sw) * w0, h: (e.rosto.h * e.fh / rec.sh) * h0 };
  };
  if (e.efeito === 'moldura' && acharMoldura(e.moldura)) {
    const m = acharMoldura(e.moldura);
    const j = m.janela(W, H, u);
    if (m.fundo) m.fundo(ctx, W, H, j, u);
    ctx.save();
    contornoJanela(ctx, j); ctx.clip();
    if (m.janelaFundo) m.janelaFundo(ctx, j, u);
    const rec = recorteRazao(e.fw, e.fh, j.w / j.h, cx);
    const jw = Math.max(2, Math.round(j.w)), jh = Math.max(2, Math.round(j.h));
    if (m.modo === 'foto' || !mascara) ctx.drawImage(e.foto, rec.sx, rec.sy, rec.sw, rec.sh, j.x, j.y, j.w, j.h);
    else ctx.drawImage(recortarPessoa(e.foto, e.fw, e.fh, mascara, rec, jw, jh), j.x, j.y, j.w, j.h);
    ctx.restore();
    if (m.moldura) m.moldura(ctx, W, H, j, u);
    rostoSaida = levaRosto(rec, j.x, j.y, j.w, j.h);
  } else {
    const rec = recorteRazao(e.fw, e.fh, W / H, cx);
    if ((e.efeito === 'borrar' || e.efeito === 'fundo') && mascara) {
      if (e.efeito === 'borrar') {
        ctx.filter = `blur(${Math.max(4, W / 60)}px)`;
        ctx.drawImage(e.foto, rec.sx, rec.sy, rec.sw, rec.sh, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04);
        ctx.filter = 'none';
      } else if (e.fundoImg) cobrir(ctx, e.fundoImg.img, e.fundoImg.w, e.fundoImg.h, 0, 0, W, H);
      ctx.drawImage(recortarPessoa(e.foto, e.fw, e.fh, mascara, rec, W, H), 0, 0, W, H);
    } else ctx.drawImage(e.foto, rec.sx, rec.sy, rec.sw, rec.sh, 0, 0, W, H);
    rostoSaida = levaRosto(rec, 0, 0, W, H);
  }
  const capa = e.capa && (limparTexto(e.capa.titulo, LIMITE_CAPA_TITULO) || limparTexto(e.capa.autor, LIMITE_CAPA_AUTOR)) ? e.capa : null;
  const locais = (e.figurinha || (!capa && limparTexto(e.texto, e.grande === 'frase' ? 80 : LIMITE_TEXTO))) ? escolherLocais(ctx, W, H, u, { texto: capa ? '' : e.texto, figurinha: e.figurinha, rosto: rostoSaida, grande: e.grande || false, localTexto: e.localTexto, ocupados: capa ? bandasDaCapa(ctx, W, H, u, capa) : [] }) : { localTexto: 'embaixo', localFigurinha: 'inf-dir' };
  if (e.figurinha) desenharFigurinha(ctx, W, H, u, e.figurinha, locais.localFigurinha);
  if (capa) desenharCapaEbook(ctx, W, H, u, capa); else desenharTexto(ctx, W, H, u, e.texto, locais.localTexto, e.grande || false);
  ctx.restore();
  return { ...locais, rostoSaida };
}


// --- Cores da pessoa e contraste com o fundo (para quem não vê como está vestida) ---------------------------

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
/** Nome aproximado da cor de uma roupa, com "clara" ou "escura". genero 'f' para roupa, 'm' para o que for masculino. */
function nomeDaCor(r, g, b, genero = 'f') {
  const { h, s, l } = hsl(r, g, b);
  const f = genero === 'f';
  const fl = (m, fem) => (f ? fem : m);
  const q = l < 0.3 ? fl(' escuro', ' escura') : l > 0.68 ? fl(' claro', ' clara') : '';
  if (l < 0.12) return fl('preto', 'preta');
  if (l > 0.9 && s < 0.35) return fl('branco', 'branca');
  if (s < 0.14) return 'cinza' + q;
  if (h < 14 || h >= 346) return (l < 0.4 && s < 0.6 ? 'marrom' : fl('vermelho', 'vermelha')) + q;
  if (h < 42) return (l < 0.5 ? 'marrom' : 'laranja') + q;
  if (h < 68) return fl('amarelo', 'amarela') + q;
  if (h < 165) return 'verde' + q;
  if (h < 200) return 'azul turquesa' + q;
  if (h < 255) return 'azul' + q;
  if (h < 295) return fl('roxo', 'roxa') + q;
  return 'rosa' + q;
}
function nomeDoCabelo(r, g, b) {
  const { h, s, l } = hsl(r, g, b);
  if (l < 0.14) return 'preto';
  if (s < 0.14 && l > 0.5) return l > 0.78 ? 'branco' : 'grisalho';
  if (l < 0.3) return 'castanho escuro';
  if (h >= 8 && h < 25 && s > 0.45 && l > 0.3) return 'ruivo';
  if (l > 0.55 && h >= 25 && h < 60) return 'loiro';
  return 'castanho';
}
const mediana = (v) => { v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
/** Cor típica do cabelo e da roupa, vistas na foto com a máscara da pessoa. rosto: {x,y,w,h} de 0 a 1. */
function coresDaPessoa(foto, fw, fh, mascara, rosto) {
  if (!mascara || !rosto) return null;
  const sw = 160, sh = Math.max(8, Math.round((160 * fh) / fw));
  const a = criarTela(sw, sh), ac = a.getContext('2d', { willReadFrequently: true }); ac.drawImage(foto, 0, 0, sw, sh);
  const b = criarTela(sw, sh), bc = b.getContext('2d', { willReadFrequently: true }); bc.drawImage(mascara, 0, 0, sw, sh);
  const px = ac.getImageData(0, 0, sw, sh).data, mk = bc.getImageData(0, 0, sw, sh).data;
  const pega = (x0, y0, x1, y1) => {
    const R = [], G = [], B = [];
    for (let y = Math.max(0, Math.floor(y0 * sh)); y < Math.min(sh, Math.ceil(y1 * sh)); y++) for (let x = Math.max(0, Math.floor(x0 * sw)); x < Math.min(sw, Math.ceil(x1 * sw)); x++) {
      const i = (y * sw + x) * 4;
      if (mk[i + 3] > 200) { R.push(px[i]); G.push(px[i + 1]); B.push(px[i + 2]); }
    }
    return R.length >= 25 ? [mediana(R), mediana(G), mediana(B)] : null;
  };
  const r = rosto;
  const cab = pega(r.x - 0.15 * r.w, r.y - 0.5 * r.h, r.x + 1.15 * r.w, r.y + 0.1 * r.h);
  const rou = pega(r.x - 1.0 * r.w, r.y + 1.5 * r.h, r.x + 2.0 * r.w, Math.min(1, r.y + 3.2 * r.h));
  const mk2 = (c, nome) => c ? { rgb: c, l: luma(...c), nome: nome(...c) } : null;
  return { cabelo: mk2(cab, nomeDoCabelo), roupa: mk2(rou, (r1, g1, b1) => nomeDaCor(r1, g1, b1, 'f')) };
}
/** "Seu cabelo parece preto, e a sua roupa parece azul escura." */
function falaDasCores(c) {
  if (!c || (!c.cabelo && !c.roupa)) return '';
  const p = [];
  if (c.cabelo) p.push(`o seu cabelo parece ${c.cabelo.nome}`);
  if (c.roupa) p.push(`a sua roupa parece ${c.roupa.nome}`);
  const t = p.join(', e ');
  return t.charAt(0).toUpperCase() + t.slice(1) + '. É uma estimativa.';
}
/** Compara a cor da pessoa com a luminosidade do fundo (0 a 1) e diz se ela se destaca. */
function falaDoContraste(c, lFundo) {
  if (!c || lFundo == null) return '';
  const fraco = [];
  if (c.cabelo && Math.abs(c.cabelo.l - lFundo) < 0.22) fraco.push('o cabelo');
  if (c.roupa && Math.abs(c.roupa.l - lFundo) < 0.22) fraco.push('a roupa');
  const tomFundo = lFundo < 0.35 ? 'escuro' : lFundo > 0.65 ? 'claro' : 'de tom médio';
  if (!fraco.length) return `Contraste bom: você se destaca do fundo, que é ${tomFundo}.`;
  const oposto = lFundo < 0.5 ? 'mais claro' : 'mais escuro';
  return `Atenção, contraste baixo: ${fraco.join(' e ')} se confunde${fraco.length > 1 ? 'm' : ''} com o fundo, que é ${tomFundo}, e o seu contorno pode se perder. Um fundo ${oposto} destaca melhor.`;
}
/** Luminosidade média (0 a 1) das laterais da imagem, onde o fundo encosta no cabelo e nos ombros. */
function luminosidadeDasLaterais(ctx, W, H) {
  const t = criarTela(24, 24), tc = t.getContext('2d', { willReadFrequently: true });
  let soma = 0, n = 0;
  [[0, 0.04], [0.76, 0.96]].forEach(([a, b]) => {
    tc.clearRect(0, 0, 24, 24); tc.drawImage(ctx.canvas, W * a, H * 0.1, W * (b - a) + (a ? 0 : 0), H * 0.8, 0, 0, 24, 24);
    const d = tc.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < d.length; i += 4) { soma += luma(d[i], d[i + 1], d[i + 2]); n++; }
  });
  return n ? soma / n : null;
}

/** Fundo pronto mais parecido com a proporção da foto (os fundos existem em horizontal, vertical e quadrado). */
function formatoDoFundo(razao) { return razao > 1.2 ? 'horizontal' : razao < 0.85 ? 'vertical' : 'quadrado'; }

/** Nome do arquivo: "Foto - <fundo> - <proporção>.jpg" (o programa acrescenta o número se já existir). */
/** O nome do arquivo da capa de ebook: "Capa - título.jpg". */
function nomeDaCapa(titulo) {
  const limpo = String(titulo || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpo ? `Capa - ${limpo}.jpg` : 'Capa.jpg';
}
function nomeDaFoto({ efeitoNome, proporcao }) {
  const limpo = String(efeitoNome || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return ['Foto', limpo, proporcao].filter(Boolean).join(' - ') + '.jpg';
}

// --- 3.0: Criar post ------------------------------------------------------------------------------
// Fase 1: post único e story único, com a moldura preenchida por texto no lugar da foto.
// Margens do story (a mais cautelosa entre as fontes): cerca de 250 pontos livres em cima e embaixo, e folga dos lados.

const PROPORCOES_POST = [
  { valor: 'retrato-45', nome: 'Retrato, 4 por 5', w: 4, h: 5, largura: 1080, altura: 1350, propFoto: 'feed',
    indicacao: 'Post do feed do Instagram e do Threads, o que mais ocupa a tela do celular sem cortar nada.',
    contra: 'Stories e capa de vídeo.',
    descricao: 'Um retângulo em pé, um pouco mais alto que largo, de 1080 por 1350 pontos. Cabe bastante texto. Na grade do perfil do Instagram as bordas de cima e de baixo aparecem cortadas, então o programa deixa o texto no centro. Combina com molduras de quase todos os tipos.' },
  { valor: 'quadrada', nome: 'Quadrada, 1 por 1', w: 1, h: 1, largura: 1080, altura: 1080, propFoto: 'quadrada',
    indicacao: 'Post do feed do Instagram e do Threads com frase curta, citação ou aviso, e que fica inteiro na grade do perfil.',
    contra: 'Texto longo, que precisaria de letra pequena.',
    descricao: 'Um quadrado de 1080 por 1080 pontos, com os quatro lados iguais. Cabe menos texto que o retrato. Combina com frase curta e moldura simples.' },
  { valor: 'story', nome: 'Tela cheia, 9 por 16', w: 9, h: 16, largura: 1080, altura: 1920, propFoto: 'stories', story: true,
    indicacao: 'Stories do Instagram, que preenchem a tela do celular em pé.',
    contra: 'Posts do feed e do Threads.',
    descricao: 'O retângulo mais alto e estreito, de 1080 por 1920 pontos. O Instagram cobre o topo e a parte de baixo com botões, então o programa deixa cerca de 250 pontos livres em cima e embaixo e uma folga dos lados. Por isso cabe menos texto do que parece.' }
].map((p) => ({ ...p, texto: descricaoPadrao({ indicacao: p.indicacao, contraindicacao: p.contra, descricao: p.descricao }) }));
const acharProporcaoPost = (v) => PROPORCOES_POST.find((p) => p.valor === v) || null;

const textoDoFormato = (o) => `Tom: ${o.tom}. Indicação: ${o.indicacao} Contraindicação: ${o.contra} Descrição: ${o.descricao} Você vai precisar de: ${o.precisa} Capa: ${o.capa} Onde serve: ${o.redes}`;
const FORMATOS_POST = [
  { valor: 'post-unico', nome: 'Post único', proporcoes: ['retrato-45', 'quadrada'], disponivel: true, max: 1,
    tom: 'direto e completo', indicacao: 'Dizer uma coisa só: uma frase, um aviso, uma citação ou uma novidade.',
    contra: 'Assuntos que precisam de várias partes para serem entendidos.',
    descricao: 'Uma imagem só, com moldura e texto.', precisa: 'Um texto curto e a escolha de uma moldura.', capa: 'Não tem capa, a imagem já é o post.',
    redes: 'Instagram e Threads. Serve também no Facebook.' },
  { valor: 'story-unico', nome: 'Story único', proporcoes: ['story'], disponivel: true, max: 1,
    tom: 'rápido e do momento', indicacao: 'Postar só uma coisinha, que some em 24 horas, como um aviso, um bom dia ou uma frase.',
    contra: 'Conteúdo que precisa ficar no perfil para sempre.',
    descricao: 'Uma imagem em tela cheia vertical, com o texto longe do topo e da base, onde o Instagram põe os botões.', precisa: 'Um texto curto e a escolha de uma moldura.', capa: 'Não tem capa.',
    redes: 'Só o Instagram, e também stories do Facebook e status do WhatsApp, que usam a mesma tela vertical. Não serve no Threads.' },
  { valor: 'carrossel', nome: 'Carrossel', proporcoes: ['retrato-45', 'quadrada'], disponivel: true, capaOpcional: true, multi: true, min: 2, max: 20,
    tom: 'explicativo, em partes', indicacao: 'Explicar algo em passos, contar uma história ou mostrar uma lista, com a pessoa passando os slides deslizando.',
    contra: 'Uma ideia só, que cabe num post único.',
    descricao: 'Vários slides no mesmo estilo, de 2 até 20. O Instagram aceita 20, mas poucos leitores chegam ao fim, então o ideal é de 3 a 8.', precisa: 'Um texto para cada slide, ou um texto longo que o programa divide.', capa: 'Capa opcional, com uma foto sua no primeiro slide.',
    redes: 'Instagram e Threads, que aceitam de 2 a 20 itens.' },
  { valor: 'stories-sequencia', nome: 'Stories em sequência', proporcoes: ['story'], disponivel: true, capaOpcional: true, multi: true, min: 2, max: 20,
    tom: 'conversado, como contar o dia', indicacao: 'Contar algo em partes durante o dia, com uma tela atrás da outra.',
    contra: 'Conteúdo que precisa ficar no perfil.',
    descricao: 'Várias telas verticais no mesmo estilo, para postar em ordem.', precisa: 'Um texto para cada tela.', capa: 'Capa opcional, com uma foto sua na primeira tela.',
    redes: 'Só o Instagram, e também Facebook e WhatsApp. Não serve no Threads.' },
  // 3.0.2: o kit saiu da lista a pedido da Joy (as molduras de data viraram uma categoria comum). A definição fica, desligada.
  { valor: 'kit-data', nome: 'Kit de data comemorativa', proporcoes: ['retrato-45', 'story', 'quadrada'], disponivel: false, kit: true, max: 1,
    tom: 'festivo e pronto para postar', indicacao: 'Natal, Páscoa, aniversário, conquista, Dia dos Namorados e Dia das Mães: um texto só vira três imagens no mesmo estilo.',
    contra: 'Texto longo e assunto sem relação com a data.',
    descricao: 'Três imagens saem juntas, do mesmo texto, da mesma moldura e da mesma figurinha: um post em 4 por 5, um story em 9 por 16 e uma imagem quadrada.', precisa: 'Escolher a data, escrever um texto curto e, se quiser, uma figurinha.', capa: 'Não tem capa.',
    redes: 'Instagram, e o post e a quadrada servem também no Threads. O story é só do Instagram.' }
].map((f) => ({ ...f, texto: textoDoFormato(f) }));
const acharFormatoPost = (v) => FORMATOS_POST.find((f) => f.valor === v) || null;

// Molduras de data têm enfeites perto das bordas: o texto fica mais para dentro, e acima do coelho ou abaixo das serpentinas.
const POST_EXTRA = { 'sao-joao': { pad: 8, topo: 17, baixo: 22 }, casamento: { pad: 9, baixo: 46 }, 'ano-novo': { pad: 13, topo: 21, baixo: 21 }, natal: { pad: 10 }, estrelas: { pad: 10 }, serpentinas: { pad: 9, topo: 27 }, tropical: { pad: 11 }, pascoa: { pad: 8, baixo: 20 }, confete: { pad: 8 }, flores: { pad: 9 }, coracoes: { pad: 7.5 } };
const MOLDURAS_DO_KIT = ['natal', 'pascoa', 'serpentinas', 'confete', 'estrelas', 'tropical', 'coracoes', 'flores'];
const TAM_MIN_POST = 0.055, TAM_MAX_POST = 0.12, ENTRELINHA_POST = 1.3;
const POST_AMOSTRA = 'Respirar fundo antes de responder é o melhor jeito de não se arrepender depois, e a gente aprende isso com o tempo, devagarinho, sem pressa nenhuma.';

/** A área onde o texto pode ficar: dentro da janela da moldura, longe das bordas, e dentro das margens do story. */
/** O espaço que a figurinha ocupa no post: um selo pequeno no meio, embaixo, e o texto fica acima dele. */
function reservaDaFigurinha(W, H, valor) {
  const f = acharFigurinha(valor);
  if (!f) return null;
  const u = Math.min(W, H) / 100, t = 12 * u * (f.escala || 1);
  return { t, h: t + 3 * u };
}
function caixaDoPost(W, H, m, prop, figurinha) {
  const u = Math.min(W, H) / 100;
  const j = m.janela(W, H, u);
  const ex = POST_EXTRA[m.valor] || {};
  const pad = (ex.pad || 6.5) * u;
  let x, y, w, h;
  if (j.forma === 'circulo') { const lado = j.w * 0.68; x = j.x + (j.w - lado) / 2; y = j.y + (j.h - lado) / 2; w = lado; h = lado; }
  else { x = j.x + pad; y = j.y + pad + (ex.topo || 0) * u; w = j.w - 2 * pad; h = j.h - 2 * pad - ((ex.topo || 0) + (ex.baixo || 0)) * u; }
  if (prop && prop.story) {
    const cima = H * (250 / 1920), lado = W * (110 / 1080);
    const x2 = Math.min(x + w, W - lado), y2 = Math.min(y + h, H - cima);
    x = Math.max(x, lado); y = Math.max(y, cima); w = Math.max(0, x2 - x); h = Math.max(0, y2 - y);
  }
  let fig = null;
  const r = figurinha ? reservaDaFigurinha(W, H, figurinha) : null;
  if (r) { fig = { cx: x + w / 2, cy: y + h - r.t / 2, t: r.t, valor: figurinha }; h = Math.max(0, h - r.h); }
  return { x, y, w, h, j, u, fig };
}
function quebrarPost(ctx, texto, maxW) {
  const linhas = [];
  for (const par of String(texto).split('\n')) {
    let atual = '';
    for (const pal of par.split(/\s+/).filter(Boolean)) {
      let p = pal;
      while (ctx.measureText(p).width > maxW && p.length > 1) {
        let n = p.length - 1; while (n > 1 && ctx.measureText(p.slice(0, n)).width > maxW) n--;
        if (atual) { linhas.push(atual); atual = ''; }
        linhas.push(p.slice(0, n)); p = p.slice(n);
      }
      const t = atual ? atual + ' ' + p : p;
      if (atual && ctx.measureText(t).width > maxW) { linhas.push(atual); atual = p; } else atual = t;
    }
    linhas.push(atual);
  }
  while (linhas.length > 1 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}
/** Quantos caracteres do texto-amostra cabem inteiros na caixa, com letra de tamanho t (medido de verdade, não estimado). */
function cabemPost(ctx, caixa, t) {
  ctx.font = fonteDoPost(t);
  const caber = (n) => { const txt = (POST_AMOSTRA + ' ').repeat(Math.ceil(n / (POST_AMOSTRA.length + 1)) + 1).slice(0, n).trim(); return quebrarPost(ctx, txt, caixa.w).length * t * ENTRELINHA_POST <= caixa.h; };
  let lo = 0, hi = 6000;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (caber(mid)) lo = mid; else hi = mid - 1; }
  return Math.floor(lo * 0.9);
}
/** Quanto cabe. O menor tamanho de letra é o que ainda se lê bem no celular, que é o limite de tudo: mais texto que isso vai para mais slides. */
function capacidadePost(ctx, W, H, m, prop, figurinha) {
  const caixa = caixaDoPost(W, H, m, prop, figurinha);
  const t = Math.round(W * TAM_MIN_POST);
  return { maxLinhas: Math.max(0, Math.floor(caixa.h / (t * ENTRELINHA_POST))), maxCaracteres: cabemPost(ctx, caixa, t), tamMin: t };
}
// --- Texto do post com marcações simples -------------------------------------------------------------------
// # título, ## subtítulo, *destaque* ou **destaque** em negrito, listas com 1. ou - ou * no começo da linha.
// Linha em branco separa parágrafos: no carrossel e nos stories em sequência, cada parágrafo vira um slide.

function parseTextoPost(texto) {
  const blocos = []; let atual = null;
  const fechar = () => { if (atual) { blocos.push(atual); atual = null; } };
  for (const bruta of String(texto || '').replace(/\r/g, '').split('\n')) {
    const l = bruta.replace(/\s+$/, '');
    if (!l.trim()) { fechar(); continue; }
    let m;
    if ((m = /^\s{0,3}(#{1,6})\s+(.+)$/.exec(l))) { fechar(); blocos.push({ tipo: m[1].length === 1 ? 'h1' : 'h2', linhas: [m[2].trim()], fonte: l.trim() }); continue; }
    if ((m = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(l))) {
      if (!atual || atual.tipo !== 'lista') { fechar(); atual = { tipo: 'lista', itens: [] }; }
      atual.itens.push({ marca: m[2] ? m[2] + '.' : '•', texto: m[3].trim(), fonte: l.trim() });
      continue;
    }
    if (!atual || atual.tipo !== 'p') { fechar(); atual = { tipo: 'p', linhas: [] }; }
    atual.linhas.push(l.trim());
  }
  fechar();
  blocos.forEach((b) => { if (b.tipo === 'lista') b.fonte = b.itens.map((i) => i.fonte).join('\n'); else if (b.tipo === 'p') b.fonte = b.linhas.join('\n'); });
  return blocos;
}
function runsDoPost(texto) {
  const r = []; const re = /\*\*(.+?)\*\*|\*(.+?)\*/g; let i = 0, m;
  while ((m = re.exec(texto))) { if (m.index > i) r.push({ t: texto.slice(i, m.index), b: false }); r.push({ t: m[1] || m[2], b: true }); i = m.index + m[0].length; }
  if (i < texto.length) r.push({ t: texto.slice(i), b: false });
  return r;
}
/** O texto sem as marcações, como se lê em voz alta. */
const semMarcasPost = (t) => String(t || '').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '').replace(/\*+/g, '').replace(/[ \t]+/g, ' ');
const ESCALA_POST = { h1: 1.45, h2: 1.2, p: 1, lista: 1 };
const PESO_POST = { h1: 800, h2: 700, p: 500, lista: 500 };
const fontePostPeso = (t, peso) => `${peso} ${t}px "Segoe UI", Arial, sans-serif`;
const fonteDoPost = (t) => fontePostPeso(t, 600);

/** Quebra um texto com negrito em linhas que cabem em maxW. Cada linha: { segs: [{ t, b }], w }. */
function quebrarRunsPost(ctx, runs, maxW, tam, peso) {
  const palavras = [];
  for (const r of runs) for (const t of r.t.split(/\s+/).filter(Boolean)) palavras.push({ t, b: r.b });
  const larg = (p) => { ctx.font = fontePostPeso(tam, p.b ? 800 : peso); return ctx.measureText(p.t).width; };
  ctx.font = fontePostPeso(tam, peso); const esp = ctx.measureText(' ').width;
  const linhas = []; let atual = { segs: [], w: 0 };
  const fecha = () => { if (atual.segs.length) linhas.push(atual); atual = { segs: [], w: 0 }; };
  for (let p of palavras) {
    let w = larg(p);
    while (w > maxW && p.t.length > 1) {
      let n = p.t.length - 1; while (n > 1 && larg({ t: p.t.slice(0, n), b: p.b }) > maxW) n--;
      fecha(); linhas.push({ segs: [{ t: p.t.slice(0, n), b: p.b }], w: larg({ t: p.t.slice(0, n), b: p.b }) });
      p = { t: p.t.slice(n), b: p.b }; w = larg(p);
    }
    const extra = atual.segs.length ? esp : 0;
    if (atual.segs.length && atual.w + extra + w > maxW) fecha();
    atual.w += (atual.segs.length ? esp : 0) + w; atual.segs.push(p);
  }
  fecha();
  return linhas;
}
/** Dispõe os blocos na largura dada, com a letra do corpo em S. Devolve as linhas com a posição vertical e a altura total. */
function montarTextoPost(ctx, blocos, larguraCaixa, S) {
  const linhas = []; let y = 0;
  blocos.forEach((b, i) => {
    if (i) y += S * (blocos[i - 1].tipo.startsWith('h') ? 0.45 : 0.6);
    const tam = S * ESCALA_POST[b.tipo], peso = PESO_POST[b.tipo], lh = tam * ENTRELINHA_POST;
    if (b.tipo === 'lista') {
      const recuo = S * 1.7;
      for (const it of b.itens) {
        const ls = quebrarRunsPost(ctx, runsDoPost(it.texto), larguraCaixa - recuo, tam, peso);
        ls.forEach((l, k) => { linhas.push({ ...l, y, tam, peso, lh, alinha: 'esq', recuo, marca: k === 0 ? it.marca : '' }); y += lh; });
      }
    } else {
      for (const ln of b.linhas) {
        const ls = quebrarRunsPost(ctx, runsDoPost(ln), larguraCaixa, tam, peso);
        ls.forEach((l) => { linhas.push({ ...l, y, tam, peso, lh, alinha: 'centro', recuo: 0, marca: '' }); y += lh; });
      }
    }
  });
  return { linhas, altura: y };
}
/** O maior tamanho de letra do corpo em que o texto cabe na caixa. ok: false quando nem no menor tamanho legível no celular cabe. */
function ajustarTextoPost(ctx, texto, caixa, W) {
  const blocos = parseTextoPost(texto);
  const min = Math.round(W * TAM_MIN_POST), max = Math.round(W * TAM_MAX_POST);
  if (!blocos.length) return { ok: true, tam: max, linhas: [], altura: 0 };
  let ultimo = null;
  for (let t = max; t >= min; t = t === min ? min - 1 : Math.max(min, t - 2)) {
    const r = montarTextoPost(ctx, blocos, caixa.w, t);
    ultimo = { ok: r.altura <= caixa.h, tam: t, linhas: r.linhas, altura: r.altura };
    if (ultimo.ok) return ultimo;
  }
  return ultimo;
}
/** O texto cabe na caixa, no menor tamanho de letra que se lê bem no celular? */
function cabeNoMinimoPost(ctx, texto, caixa, W) {
  const blocos = parseTextoPost(texto);
  if (!blocos.length) return true;
  return montarTextoPost(ctx, blocos, caixa.w, Math.round(W * TAM_MIN_POST)).altura <= caixa.h;
}
function desenharTextoPost(ctx, aj, caixa, cor) {
  const topo = caixa.y + Math.max(0, (caixa.h - aj.altura) / 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = cor;
  for (const l of aj.linhas) {
    const yc = topo + l.y + l.lh / 2;
    let x = l.alinha === 'centro' ? caixa.x + (caixa.w - l.w) / 2 : caixa.x + l.recuo;
    if (l.marca) { ctx.font = fontePostPeso(l.tam, l.peso); ctx.fillText(l.marca, caixa.x + l.recuo * 0.1, yc); }
    ctx.font = fontePostPeso(l.tam, l.peso); const esp = ctx.measureText(' ').width;
    l.segs.forEach((s, i) => { ctx.font = fontePostPeso(l.tam, s.b ? 800 : l.peso); ctx.fillText(s.t, x, yc); x += ctx.measureText(s.t).width + (i < l.segs.length - 1 ? esp : 0); });
  }
}
/**
 * Divide o texto em slides, cada um dentro do limite de leitura no celular. A estrutura do texto manda:
 * cada parágrafo, lista ou item solto vira um slide; um título (# ou ##) vai junto do bloco que vem depois dele;
 * o que não cabe num slide é dividido nas frases, os itens de lista ou, sem pontuação, nas palavras.
 */
function dividirEmSlides(ctx, texto, caixa, W) {
  const t = String(texto || '').replace(/\r/g, '').trim();
  if (!t) return { slides: [], modo: 'vazio' };
  const cabe = (x) => cabeNoMinimoPost(ctx, x, caixa, W);
  if (cabe(t) && !/\n\s*\n/.test(t)) return { slides: [t], modo: 'um' };
  const blocos = parseTextoPost(t);
  const juntar = (bs) => bs.map((b) => b.fonte).join('\n\n');
  const slides = []; let titulos = [];
  const partir = (b, prefixo) => {
    const unidades = b.tipo === 'lista' ? b.itens.map((i) => i.fonte) : b.linhas.flatMap((l) => l.split(/(?<=[.!?…])\s+/).filter(Boolean));
    const sep = b.tipo === 'lista' ? '\n' : ' ';
    let pre = prefixo, atual = '';
    const com = (x) => (pre ? pre + '\n\n' + x : x);
    const solta = () => { slides.push(com(atual)); pre = ''; atual = ''; };
    for (const u of unidades) {
      if (!cabe(com(u))) {
        if (atual) solta();
        let parte = '';
        for (const pal of u.split(/\s+/).filter(Boolean)) {
          const cand = parte ? parte + ' ' + pal : pal;
          if (parte && !cabe(com(cand))) { slides.push(com(parte)); pre = ''; parte = pal; } else parte = cand;
        }
        atual = parte; continue;
      }
      const cand = atual ? atual + sep + u : u;
      if (atual && !cabe(com(cand))) { solta(); atual = u; } else atual = cand;
    }
    if (atual) solta();
  };
  for (const b of blocos) {
    if (b.tipo === 'h1' || b.tipo === 'h2') { titulos.push(b); continue; }
    const completo = juntar([...titulos, b]);
    if (cabe(completo)) { slides.push(completo); titulos = []; continue; }
    if (titulos.length && cabe(b.fonte)) { slides.push(juntar(titulos)); slides.push(b.fonte); titulos = []; continue; }
    partir(b, titulos.length ? juntar(titulos) : ''); titulos = [];
  }
  if (titulos.length) slides.push(juntar(titulos));
  return { slides, modo: slides.length === 1 ? 'um' : blocos.length > 1 ? 'blocos' : 'enchendo' };
}

const MIN_CARACTERES_POST = 60;
// Molduras com cenário ou enfeites soltos no meio: o texto brigaria com o desenho. Servem para foto, não para post de texto. As de data comemorativa servem aos dois.
const CENARIOS_FORA_DO_POST = ['por-do-sol', 'lua', 'nuvens', 'futurista', 'parque', 'toalete', 'praia-lua-cheia', 'outono', 'floresta-vagalumes', 'escritorio'];
/** As molduras que servem para texto nesta proporção, em seções, e as que ficam de fora, com o motivo. */
function moldurasDoPost(ctx, prop) {
  const { disponiveis, escondidas } = moldurasPara(prop.propFoto, { post: true });
  const capa = new Map(), ficam = [], fora = [];
  for (const m of escondidas) fora.push({ moldura: m, motivo: 'a moldura não combina com esta proporção' });
  for (const m of disponiveis) {
    if (CENARIOS_FORA_DO_POST.includes(m.valor)) { fora.push({ moldura: m, motivo: 'têm desenhos no fundo que atrapalham a leitura do texto' }); continue; }
    const c = capacidadePost(ctx, prop.largura, prop.altura, m, prop);
    if (c.maxCaracteres < MIN_CARACTERES_POST) fora.push({ moldura: m, motivo: `só caberiam cerca de ${c.maxCaracteres} caracteres` });
    else { ficam.push(m); capa.set(m.valor, c); }
  }
  const ok = new Set(ficam.map((m) => m.valor));
  const categorias = filtrarCategoriasVisual(CATEGORIAS_VISUAL, (i) => i.startsWith('m:') && ok.has(i.slice(2)), (i) => i.slice(2));
  return { categorias, disponiveis: ficam, escondidas: fora, capacidades: capa };
}
/** As molduras do kit de datas, e quanto cabe de texto: o menor valor entre as três imagens do kit. */
function moldurasDoKit(ctx, comFigurinha) {
  const props = ['retrato-45', 'story', 'quadrada'].map(acharProporcaoPost);
  const ficam = MOLDURAS_DO_KIT.map(acharMoldura).filter(Boolean), capa = new Map();
  for (const m of ficam) {
    const cs = props.map((p) => capacidadePost(ctx, p.largura, p.altura, m, p, comFigurinha));
    capa.set(m.valor, { maxCaracteres: Math.min(...cs.map((c) => c.maxCaracteres)), maxLinhas: Math.min(...cs.map((c) => c.maxLinhas)), tamMin: cs[0].tamMin });
  }
  return { categorias: [{ valor: 'datas', nome: 'Datas comemorativas', itens: ficam.map((m) => m.valor) }], disponiveis: ficam, escondidas: [], capacidades: capa };
}
function avisoMoldurasPost(r) {
  if (!r.escondidas.length) return '';
  const nomes = r.escondidas.map((x) => x.moldura.nome);
  const motivos = [...new Set(r.escondidas.map((x) => x.motivo))];
  return `${r.disponiveis.length} molduras compatíveis com este formato. ${r.escondidas.length === 1 ? 'Uma ficou de fora' : r.escondidas.length + ' ficaram de fora'}, porque ${motivos.join(' ou ')}: ${nomes.join(', ')}.`;
}
function falaDaCapacidade(prop, cap, m) {
  return `Nesta moldura, em ${prop.nome}, cabem cerca de ${cap.maxCaracteres} caracteres, em até ${cap.maxLinhas} linhas. É o limite para ler bem no celular. Texto maior fica melhor em mais de um slide.`;
}
/** A cor do texto acompanha a moldura: letra escura sobre fundo claro, letra branca sobre fundo escuro. */
function corDoTextoPost(ctx, caixa) {
  try {
    const x = Math.max(0, Math.floor(caixa.x)), y = Math.max(0, Math.floor(caixa.y)), w = Math.max(1, Math.floor(caixa.w)), h = Math.max(1, Math.floor(caixa.h));
    const d = ctx.getImageData(x, y, w, h).data; let soma = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { soma += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
    const lum = n ? soma / n : 1;
    return { cor: lum > 0.55 ? '#1c1c22' : '#ffffff', escura: lum <= 0.55, lum };
  } catch (_) { return { cor: '#1c1c22', escura: false, lum: 1 }; }
}
/** Desenha o post: o fundo e a borda da moldura, com o texto no lugar da foto. Devolve como o texto ficou. */
function comporPost(ctx, W, H, { moldura, texto, prop, figurinha }) {
  const m = acharMoldura(moldura);
  if (!m) return { ok: false, tam: 0, linhas: [], cor: '#000', escura: false };
  const u = Math.min(W, H) / 100;
  const j = m.janela(W, H, u);
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  if (m.fundo) m.fundo(ctx, W, H, j, u);
  ctx.save();
  contornoJanela(ctx, j); ctx.clip();
  if (m.janelaFundo) m.janelaFundo(ctx, j, u);
  else if (m.modo === 'foto') { ctx.fillStyle = '#fbf9f4'; ctx.fillRect(j.x, j.y, j.w, j.h); }
  ctx.restore();
  const caixa = caixaDoPost(W, H, m, prop, figurinha);
  const aj = ajustarTextoPost(ctx, texto || '', caixa, W);
  const cor = corDoTextoPost(ctx, caixa);
  if ((texto || '').trim()) desenharTextoPost(ctx, aj, caixa, cor.cor);
  if (caixa.fig) { const f = acharFigurinha(caixa.fig.valor); if (f) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = u * 0.8; f.desenhar(ctx, caixa.fig.cx, caixa.fig.cy, caixa.fig.t); ctx.restore(); } }
  if (m.moldura) m.moldura(ctx, W, H, j, u);
  ctx.restore();
  return { ok: aj.ok, tam: aj.tam, linhas: aj.linhas.length, cor: cor.cor, escura: cor.escura };
}
/** A descrição automática de como o post ficou, para quem não vê. */
function descricaoDoPost({ moldura, texto, prop, resultado, figurinha }) {
  const m = acharMoldura(moldura);
  if (!m) return '';
  const letra = resultado && resultado.escura ? 'claras' : 'escuras';
  const fundo = resultado && resultado.escura ? 'escuro' : 'claro';
  const t = resultado ? resultado.tam / prop.largura : 0.08;
  const tamanho = t > 0.085 ? 'grandes' : t > 0.055 ? 'médias' : 'pequenas';
  const n = resultado ? resultado.linhas : 0;
  const bl = parseTextoPost(texto), temH1 = bl.some((b) => b.tipo === 'h1'), temH2 = bl.some((b) => b.tipo === 'h2'), temLista = bl.some((b) => b.tipo === 'lista'), temNeg = /\*[^*\s][^*]*\*/.test(String(texto || ''));
  const partes = [temH1 && 'um título maior', temH2 && 'um subtítulo', temLista && 'uma lista', temNeg && 'palavras em destaque, em negrito'].filter(Boolean);
  const extras = partes.length ? ', com ' + partes.join(', ') : ', centralizado';
  return `Imagem na proporção ${prop.nome.toLowerCase()}, de ${prop.largura} por ${prop.altura} pontos. Moldura ${m.nome}: ${m.descricao || ''} O texto ocupa ${n === 1 ? 'uma linha' : n + ' linhas'}${extras}, em letras ${letra} ${tamanho} sobre fundo ${fundo}. Texto: ${semMarcasPost(texto).trim()}${figurinha && acharFigurinha(figurinha) ? ` Figurinha embaixo, no centro: ${acharFigurinha(figurinha).rotulo}` : ''}`.replace(/\s+/g, ' ').trim();
}
/**
 * A visão panorâmica do conjunto de imagens do post: a sensação, a organização e o alinhamento, sem o descritor.
 * itens: [{ texto, linhas, tam }] na ordem de postar; temCapa: se há uma capa com foto antes deles.
 */
/** Em quais slides a figurinha entra. onde: 'todos', 'extremos' (primeiro e último) ou 'ultimo'. */
const figurinhaDoSlide = (onde, i, n, figurinha) => (!figurinha ? '' : onde === 'extremos' ? (i === 0 || i === n - 1 ? figurinha : '') : onde === 'ultimo' ? (i === n - 1 ? figurinha : '') : figurinha);
/** A figurinha entra em todos os slides com até 5; com mais, o jeito sugerido é só no primeiro e no último. */
const ondeSugerido = (n) => (n > 5 ? 'extremos' : 'todos');
const NOMES_ONDE_FIGURINHA = { todos: 'em todos os slides', extremos: 'só no primeiro e no último slide', ultimo: 'só no último slide' };
function panoramaDoPost({ moldura, figurinha, prop, itens, temCapa, kit, onde }) {
  const m = acharMoldura(moldura), f = figurinha ? acharFigurinha(figurinha) : null;
  const n = itens.length, total = n + (temCapa ? 1 : 0);
  const partes = [];
  partes.push(kit ? `Kit de três imagens, do mesmo texto: post em 4 por 5, story em 9 por 16 e quadrada.` : `${total === 1 ? 'Uma imagem' : total + ' imagens'}${temCapa ? `, a primeira é a capa com a sua foto` : ''}, na proporção ${prop ? prop.nome.toLowerCase() : ''}.`);
  if (m) partes.push(`Sensação: ${m.tom}. A moldura é a mesma em todas: ${m.nome}.${f ? ` A figurinha, ${onde && onde !== 'todos' && itens.length > 2 ? NOMES_ONDE_FIGURINHA[onde] + ', ' : 'também igual em todas, '}é de tom ${(f.detalhes[0].t || '').replace(/\.$/, '').toLowerCase()}.` : ' Sem figurinha.'}`);
  const linhas = itens.map((i) => i.linhas), tams = itens.map((i) => i.tam);
  if (n > 1) {
    const dif = Math.max(...tams) - Math.min(...tams);
    partes.push(`Organização: ${n} imagens de texto, na ordem de postar. Os textos ocupam de ${Math.min(...linhas)} a ${Math.max(...linhas)} linhas${dif > 8 ? ', e a letra varia um pouco de uma imagem para outra, porque cada texto tem um tamanho' : ', com a letra do mesmo tamanho'}.`);
  } else if (n === 1) partes.push(`Organização: o texto ocupa ${linhas[0] === 1 ? 'uma linha' : linhas[0] + ' linhas'}.`);
  const marcas = itens.map((i) => parseTextoPost(i.texto));
  const comLista = marcas.some((b) => b.some((x) => x.tipo === 'lista')), comTitulo = marcas.some((b) => b.some((x) => x.tipo === 'h1' || x.tipo === 'h2'));
  partes.push(`Alinhamento: ${comLista ? 'textos e títulos centralizados, e as listas alinhadas à esquerda, com marcadores' : 'tudo centralizado'}, dentro das margens seguras${prop && prop.story ? ' dos stories, longe do topo e da base onde ficam os botões' : ''}.${comTitulo ? ' Os títulos são maiores e em negrito.' : ''}`);
  return partes.join(' ');
}
/**
 * Como os slides são ditos. Resumido: os de até 8 palavras inteiros, e os mais longos com as 6 primeiras palavras, "até" e as 2 últimas,
 * para dar para conferir o começo e o fim sem ouvir tudo.
 * Completo: o texto de cada slide por inteiro, na ordem.
 */
function falaDosSlides(slides, completo = false) {
  const n = slides.length;
  const limpa = (t) => semMarcasPost(t).replace(/\s+/g, ' ').trim();
  const ponto = (x) => (/[.!?…:]$/.test(x) ? x : x + '.');
  return slides.map((t, i) => {
    const x = limpa(t), palavras = x.split(' ').filter(Boolean);
    if (completo) return `Slide ${i + 1} de ${n}: ${ponto(x)}`;
    if (palavras.length <= 8) return `Slide ${i + 1}: ${ponto(x)}`;
    return `Slide ${i + 1}: ${palavras.slice(0, 6).join(' ')} até ${ponto(palavras.slice(-2).join(' '))}`;
  }).join(' ');
}
const resumoDoTexto = (t, n = 6) => semMarcasPost(t).replace(/[\\/:*?"<>|\n\r]/g, ' ').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
/** "01-texto-grafite com fio branco-primeiras palavras.jpg": o número é a ordem de postar. */
function nomeDoArquivoPost({ numero, moldura, texto, rotulo = 'texto' }) {
  const m = acharMoldura(moldura);
  const lim = (s) => String(s || '').replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/ /g, '-');
  const n = String(numero).padStart(2, '0');
  const partes = [n, lim(rotulo), m ? lim(m.nome) : '', lim(resumoDoTexto(texto))].filter(Boolean);
  return partes.join('-').slice(0, 100).replace(/[-. ]+$/, '') + '.jpg';
}
/** O nome da pasta do post: sem caracteres que o Windows recusa. */
function nomeDaPastaPost(nome) {
  let s = String(nome || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) s += ' post';
  return s;
}
/** O próximo número da pasta: um depois do maior número que já abre o nome de algum arquivo. */
function proximoNumeroPost(nomes) {
  let maior = 0;
  for (const n of nomes) { const r = /^(\d{1,3})\b/.exec(n); if (r) maior = Math.max(maior, Number(r[1])); }
  return maior + 1;
}

const api = { MOLDURAS_CARTAO, filtrarCategoriasVisual, falaDosSlides, figurinhaDoSlide, ondeSugerido, NOMES_ONDE_FIGURINHA, panoramaDoPost, moldurasDoKit, MOLDURAS_DO_KIT, POST_EXTRA, GRUPOS_DE_MOLDURA_POST, grupoDaMolduraPost, figurinhasParaMoldura, categoriasDeFigurinhasPara, reservaDaFigurinha, parseTextoPost, semMarcasPost, resumoDoTexto, dividirEmSlides, cabeNoMinimoPost, PROPORCOES_POST, acharProporcaoPost, FORMATOS_POST, acharFormatoPost, caixaDoPost, ajustarTextoPost, capacidadePost, moldurasDoPost, avisoMoldurasPost, falaDaCapacidade, comporPost, descricaoDoPost, nomeDoArquivoPost, nomeDaPastaPost, proximoNumeroPost, itensDasCategorias, TIPOS_ESCRITO, CATEGORIAS_VISUAL, textoDoFundo, nomeDaCor, nomeDoCabelo, coresDaPessoa, falaDasCores, falaDoContraste, luminosidadeDasLaterais, limiteTexto, moldurasPara, avisoMolduras, CATEGORIAS_FIGURINHA, PROPORCOES_FOTO, acharProporcao, recorteRazao, MOLDURAS, acharMoldura, FIGURINHAS, acharFigurinha, LOCAIS_FIGURINHA, LOCAIS_TEXTO,
  LIMITE_TEXTO, limparTexto, compor, formatoDoFundo, nomeDaFoto, nomeDaCapa, LIMITE_CAPA_TITULO, LIMITE_CAPA_AUTOR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else raiz.Fotos = api;
})(typeof window !== 'undefined' ? window : globalThis);
