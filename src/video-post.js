'use strict';
// 3.0.2: posts em vídeo (Reel, vídeo de feed e stories em vídeo). Aqui ficam as regras e os comandos do FFmpeg, sem tocar em arquivo nenhum,
// para dar para testar. Os limites do Instagram divergem entre as fontes e mudam com o tempo: são valores fáceis de ajustar aqui.
const DIV = require('./divisao');

const CARTAO_SEGUNDOS = 2.5;
const FORMATOS_VIDEO = {
  reel: { nome: 'Reel', larguras: { story: [1080, 1920] }, padrao: 'story', estilo: 'shorts', ideal: 90, aviso: 180, maximo: 1200, parte: 0 },
  'video-feed': { nome: 'Vídeo de feed', larguras: { 'retrato-45': [1080, 1350], quadrada: [1080, 1080] }, padrao: 'retrato-45', estilo: 'youtube', ideal: 90, aviso: 600, maximo: 3600, parte: 0 },
  'story-video': { nome: 'Stories em vídeo', larguras: { story: [1080, 1920] }, padrao: 'story', estilo: 'shorts', ideal: 0, aviso: 0, maximo: 0, parte: 60 }
};
const ehFormatoVideo = (f) => !!FORMATOS_VIDEO[f];
/** Largura e altura finais do vídeo, para o formato e a proporção escolhida. */
function tamanhoDoPost(formato, proporcao) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return null;
  return f.larguras[proporcao] || f.larguras[f.padrao];
}
/** As partes do vídeo: nos stories, pedaços de até 60 segundos; nos outros, o vídeo inteiro. */
function partesDoVideo(duracao, formato) {
  const f = FORMATOS_VIDEO[formato];
  return DIV.planejarPartes(duracao, f ? f.parte : 0);
}
const mesmaProporcao = (w, h, W, H) => Math.abs(w / h - W / H) < 0.02;
/** O jeito de caber na tela que o programa sugere: se a proporção já é a certa, nenhum; senão, manter inteiro com fundo borrado. */
function ajusteSugerido(w, h, W, H) { return mesmaProporcao(w, h, W, H) ? 'nenhum' : 'borrado'; }
/** Filtro do FFmpeg, de [0:v] para [vq], com a imagem no tamanho final. */
function filtroDoPost(w, h, W, H, ajuste) {
  if (mesmaProporcao(w, h, W, H) || ajuste === 'nenhum') return `[0:v]scale=${W}:${H},setsar=1[vq]`;
  if (ajuste === 'cortar') return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[vq]`;
  return `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,eq=brightness=-0.08[fundo];` +
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[meio];[fundo][meio]overlay=(W-w)/2:(H-h)/2,setsar=1[vq]`;
}
const caminhoFiltro = (c) => String(c).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
/**
 * Os argumentos do FFmpeg para uma parte do vídeo, com cartão de abertura e de fecho (imagens), legenda queimada (arquivo .ass) e áudio nivelado.
 * dados: { entrada, ini, fim, temAudio, w, h, W, H, ajuste, ass, abertura, fecho, saida, cartao }
 */
function argumentosDoPost(d) {
  const dur = Math.max(0.1, d.fim - d.ini), cartao = d.cartao || CARTAO_SEGUNDOS;
  const args = ['-y', '-v', 'error', '-ss', d.ini.toFixed(3), '-to', d.fim.toFixed(3), '-i', d.entrada];
  let i = 1;
  const idx = {};
  const cartaoEntrada = (nome, png) => {
    args.push('-loop', '1', '-framerate', '30', '-t', String(cartao), '-i', png); idx[nome + 'V'] = i++;
    args.push('-f', 'lavfi', '-t', String(cartao), '-i', 'anullsrc=r=48000:cl=stereo'); idx[nome + 'A'] = i++;
  };
  if (d.abertura) cartaoEntrada('ab', d.abertura);
  if (d.fecho) cartaoEntrada('fe', d.fecho);
  if (!d.temAudio) { args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); idx.mA = i++; }
  const f = [filtroDoPost(d.w, d.h, d.W, d.H, d.ajuste)];
  f.push(d.ass ? `[vq]subtitles='${caminhoFiltro(d.ass)}',fps=30,format=yuv420p[vm]` : '[vq]fps=30,format=yuv420p[vm]');
  const origemA = d.temAudio ? '[0:a]' : `[${idx.mA}:a]`;
  f.push(`${origemA}aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[am]`);
  const ordem = [];
  if (d.abertura) {
    f.push(`[${idx.abV}:v]scale=${d.W}:${d.H},setsar=1,fps=30,format=yuv420p[vab]`, `[${idx.abA}:a]aformat=sample_rates=48000:channel_layouts=stereo[aab]`);
    ordem.push('[vab][aab]');
  }
  ordem.push('[vm][am]');
  if (d.fecho) {
    f.push(`[${idx.feV}:v]scale=${d.W}:${d.H},setsar=1,fps=30,format=yuv420p[vfe]`, `[${idx.feA}:a]aformat=sample_rates=48000:channel_layouts=stereo[afe]`);
    ordem.push('[vfe][afe]');
  }
  if (ordem.length > 1) { f.push(`${ordem.join('')}concat=n=${ordem.length}:v=1:a=1[v][a]`); }
  else { f.push('[vm]null[v]', '[am]anull[a]'); }
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', d.saida);
  return args;
}
/** Avisos antes de preparar, em frases para ouvir. */
function avisosDoVideo({ formato, duracao, largura, altura, temAudio, proporcao }) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return [];
  const av = [];
  const [W, H] = tamanhoDoPost(formato, proporcao);
  const falado = (s) => { const m = Math.floor(s / 60), x = Math.round(s % 60); return m ? `${m} minuto${m > 1 ? 's' : ''}${x ? ` e ${x} segundos` : ''}` : `${x} segundos`; };
  if (!temAudio) av.push('Este vídeo não tem som. Ele sai mudo, e a legenda não pode ser escrita.');
  if (formato === 'story-video') {
    const n = partesDoVideo(duracao, formato).length;
    av.push(n > 1 ? `O vídeo tem ${falado(duracao)} e vai ser dividido em ${n} stories, de até 60 segundos cada.` : `O vídeo tem ${falado(duracao)} e cabe num story só.`);
  } else {
    if (f.maximo && duracao > f.maximo) av.push(`O vídeo tem ${falado(duracao)}, mais do que o ${f.nome} aceita, que é até ${falado(f.maximo)}. Corte o vídeo no Editar vídeo antes.`);
    else if (f.aviso && duracao > f.aviso) av.push(`O vídeo tem ${falado(duracao)}. Os guias mais recentes dizem que o ${f.nome} pode ter bastante duração, mas as fontes divergem e o limite muda. Se a postagem for recusada, corte o vídeo.`);
    else if (f.ideal && duracao > f.ideal) av.push(`O vídeo tem ${falado(duracao)}. ${f.nome} mais curto costuma ir melhor.`);
  }
  if (Math.min(largura, altura) < 700) av.push('A imagem original é pequena: no tamanho final ela pode ficar sem nitidez.');
  const ajuste = ajusteSugerido(largura, altura, W, H);
  if (ajuste === 'borrado') av.push(`O vídeo é ${largura > altura * 1.1 ? 'horizontal' : altura > largura * 1.1 ? 'vertical' : 'quadrado'} e o ${f.nome} é ${H > W ? 'vertical' : H === W ? 'quadrado' : 'horizontal'}: o programa sugere manter o vídeo inteiro, com o fundo borrado, para não cortar nada.`);
  else av.push('O vídeo já está na proporção certa: só o tamanho é ajustado.');
  return av;
}
const orientacaoDe = (w, h) => (w > h * 1.1 ? 'horizontal' : h > w * 1.1 ? 'vertical' : 'quadrado');
const falarSeg = (s) => { const m = Math.floor(s / 60), x = Math.round(s % 60); return m ? `${m} min${x ? ` e ${x} s` : ''}` : `${x} s`; };
/** O que serve para cada formato, em palavras, para a pessoa saber que vídeo escolher antes de escolher. */
function explicacaoDoFormato(formato, proporcao) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return '';
  const [W, H] = tamanhoDoPost(formato, proporcao);
  const forma = H > W ? 'vertical, em pé, como o celular' : H === W ? 'quadrado' : 'horizontal';
  if (formato === 'story-video') return `Serve um vídeo ${forma}, de qualquer duração, sem limite: quanto mais longo, mais stories. Ele é dividido em partes de até 60 segundos, uma para cada story, numeradas na ordem de postar. Um vídeo horizontal também serve, com o fundo borrado em cima e embaixo.`;
  const duracao = formato === 'reel'
    ? 'O ideal é até 90 segundos. Não é dividido: sai um arquivo só. Se passar de 3 minutos, o programa avisa que pode ser recusado, e acima de 20 minutos ele não prepara: corte antes no Editar vídeo.'
    : 'O ideal é até 90 segundos, e serve até 10 minutos. Não é dividido: sai um arquivo só. Se passar de 10 minutos, o programa avisa, e acima de 60 minutos ele não prepara: corte antes no Editar vídeo.';
  const peso = formato === 'video-feed' && W === H ? 'Um vídeo quadrado serve sem ajuste, e um em pé ou deitado também serve, com o fundo borrado.' : 'Um vídeo na mesma forma serve sem ajuste. Se for de outra forma, ele serve com o fundo borrado.';
  return `Serve um vídeo ${forma}. ${duracao} ${peso}`;
}
/** Este vídeo serve para este formato? nivel: 'bem' (sem ajuste), 'ajuste' (com fundo borrado) ou 'nao' (passa do limite). */
function avaliarVideo({ formato, proporcao, duracao, largura, altura, temAudio }) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return { nivel: 'nao', motivo: 'Formato desconhecido.' };
  const [W, H] = tamanhoDoPost(formato, proporcao);
  const ori = orientacaoDe(largura, altura);
  const partes = [`${ori}`, falarSeg(duracao), temAudio ? 'com som' : 'sem som'];
  if (f.maximo && duracao > f.maximo) return { nivel: 'nao', orientacao: ori, motivo: `${partes.join(', ')}. Longo demais, o ${f.nome} aceita até ${falarSeg(f.maximo)}.` };
  if (Math.min(largura, altura) < 480) return { nivel: 'nao', orientacao: ori, motivo: `${partes.join(', ')}. A imagem é pequena demais.` };
  const igual = mesmaProporcao(largura, altura, W, H);
  const aviso = formato === 'story-video' && duracao > f.parte ? `Vira ${partesDoVideo(duracao, formato).length} stories.` : f.aviso && duracao > f.aviso ? 'É longo para este formato.' : '';
  return { nivel: igual ? 'bem' : 'ajuste', orientacao: ori, motivo: `${partes.join(', ')}. ${igual ? 'Serve sem ajuste.' : 'Serve com o fundo borrado.'}${aviso ? ' ' + aviso : ''}` };
}
/** Uma frase só, para quem vai gravar: o que serve ao formato escolhido naquele momento. */
function orientacaoDeGravacao(formato, proporcao) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return '';
  const [W, H] = tamanhoDoPost(formato, proporcao);
  if (formato === 'reel') return 'Para o Reel, grave com o celular em pé. O ideal é até 90 segundos. Vai sair um vídeo só.';
  if (formato === 'video-feed') return `Para o vídeo de feed, grave ${W === H ? 'quadrado' : 'em pé'}. O ideal é até 90 segundos, e serve até 10 minutos. Vai sair um vídeo só.`;
  return 'Para os stories, grave em pé. Não há limite: a cada 60 segundos vira um story.';
}
/** Depois do áudio, olha o tempo do vídeo contra o formato do post. nivel: ok, limite, passou, dividir ou excede. Junto, os formatos em que este vídeo caberia. */
function analisarTempo({ formato, proporcao, duracao, largura, altura, temAudio }) {
  const f = FORMATOS_VIDEO[formato];
  if (!f) return { nivel: 'ok', texto: '', alternativas: [] };
  const alternativas = Object.keys(FORMATOS_VIDEO).filter((k) => k !== formato).map((k) => {
    const g = FORMATOS_VIDEO[k];
    const av = avaliarVideo({ formato: k, proporcao: g.padrao, duracao, largura, altura, temAudio });
    return { formato: k, nome: g.nome, nivel: av.nivel, motivo: av.motivo };
  }).filter((x) => x.nivel !== 'nao');
  const t = `O vídeo tem ${falarSeg(duracao)}.`;
  let nivel, texto;
  if (f.maximo && duracao > f.maximo) { nivel = 'excede'; texto = `${t} É mais do que o ${f.nome} aceita, que é até ${falarSeg(f.maximo)}. Grave de novo, mais curto, ou mude o tipo de post.`; }
  else if (formato === 'story-video') {
    const n = partesDoVideo(duracao, formato).length;
    nivel = n > 1 ? 'dividir' : 'ok';
    texto = n > 1 ? `${t} Vai ser dividido em ${n} stories, de até 60 segundos cada, numerados na ordem de postar.` : `${t} Cabe num story só.`;
  } else if (f.aviso && duracao > f.aviso) { nivel = 'passou'; texto = `${t} Passou de ${falarSeg(f.aviso)}. O ${f.nome} aceita, mas o Instagram pode recusar ou mostrar só o começo. Se quiser, volte e corte mais.`; }
  else if (f.ideal && duracao > f.ideal) { nivel = 'limite'; texto = `${t} Está acima do ideal de ${falarSeg(f.ideal)} para o ${f.nome}, mas dentro do limite.`; }
  else { nivel = 'ok'; texto = `${t} Está dentro do ideal para o ${f.nome}.`; }
  return { nivel, texto, alternativas };
}
module.exports = { orientacaoDeGravacao, analisarTempo, orientacaoDe, explicacaoDoFormato, avaliarVideo, CARTAO_SEGUNDOS, FORMATOS_VIDEO, ehFormatoVideo, tamanhoDoPost, partesDoVideo, mesmaProporcao, ajusteSugerido, filtroDoPost, argumentosDoPost, avisosDoVideo };
