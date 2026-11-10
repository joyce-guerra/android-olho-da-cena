'use strict';

const estado = {
  titulos: [],
  logos: [],
  logoEscolhido: null,
  manualImagens: [],
  camadas: [],
  trilhaEscolhida: null,
  dimsImagens: {}, // caminho -> { largura, altura }
  avisosImagens: {}, // caminho -> { motivo, mensagem, ignorado }
  legenda: null,
  limites: null,
  audio: null,
  audios: [], // [{ caminho, url, duracao, nome, velocidade }]
  audioPendente: false,
  audioCortado: false,
  duracaoAudio: null,
  imagens: [],
  presets: [],
  rodando: false,
  ultimaSaida: null
};

const $ = (id) => document.getElementById(id);

/**
 * Troca de tela. O foco vai para o primeiro título da tela nova, senão o leitor
 * de tela continua lendo o lugar onde estava e a pessoa não percebe que mudou.
 */
const TELAS = ['inicial', 'extras', 'lote', 'foto', 'editfoto', 'post', 'gaudio', 'edicao', 'legenda', 'gravar', 'melhorar', 'gerar', 'juntar', 'cortar', 'dividir', 'audio', 'config', 'sobre'];
function telaAtual() {
  return TELAS.find((n) => !$('tela-' + n).hidden) || 'inicial';
}

// --- Painel de ajuda (Alt H) ---------------------------------------------

function abrirAjuda() {
  const tela = $('tela-' + telaAtual());
  const itens = [...tela.querySelectorAll('[data-atalho]')]
    .filter((el) => !el.disabled && el.offsetParent !== null)
    .map((el) => {
      const rotulo = el.getAttribute('aria-label') || el.textContent.trim();
      return `Alt ${el.dataset.atalho.toUpperCase()}: ${rotulo}`;
    });
  if (telaAtual() === 'cortar') {
    const d = descricaoSalto(corte.salto);
    itens.unshift(
      'Control com seta para a direita ou para a esquerda: aumenta ou diminui o volume do vídeo todo (fora de campo de texto e de controle deslizante)',
      'Control com seta para cima ou para baixo: aumenta ou diminui a velocidade do vídeo todo; imagem e som continuam juntos',
      'Alt I: marca o início de um trecho onde o vídeo está',
      'Alt F: marca o fim do trecho. Repita Alt I e Alt F para marcar vários trechos',
      'Delete ou Backspace: descarta todos os trechos marcados de uma vez (fora de campo de texto)',
      'Alt Z: desfaz o último descarte (um lote conta como um)',
      'Alt S: salva todos os trechos marcados, cada um num arquivo, na horizontal, na vertical para short ou só o áudio',
      `F2: muda o tamanho do salto (agora ${d}), em minutos e segundos`,
      'Barra de espaço: tocar ou pausar',
      'Setas para a direita e para a esquerda: avança e volta meio segundo',
      `Page Up: avança ${d}, Page Down: volta ${d}. O ou Alt O: diz onde você está e quantos trechos estão marcados`,
      'Alt V: volta para a Edição de vídeo e áudio',
      'Home: vai para o começo do vídeo, End: vai para o final',
      '— essas últimas funcionam sem Alt, desde que o foco não esteja num campo de texto.'
    );
  }
  if (telaAtual() === 'audio') {
    // 1.6: cortar à mão (Alt I, Alt F, Del, Alt S, Alt D) só na tela Cortes.
    const naCortes = !$('au-cortes').hidden;
    itens.unshift(
      ...(naCortes ? ['Alt I: início da seleção. Alt F: fim da seleção. Pode marcar em qualquer ordem',
        `Del: descarta todas as seleções. Alt S: salva todas as seleções, em ${modoAltS()}`,
        'Alt D: lista dos descartes. Alt G: prévia de 10 segundos'] : [`Alt S: salva o trabalho como está agora, em ${modoAltS()}, na pasta Olho da Cena`, 'Alt G: prévia de 10 segundos']),
      'Alt Z: volta para a última versão salva, perguntando antes',
      'Barra de espaço: tocar ou pausar. Setas para a esquerda e para a direita: volta ou avança meio segundo',
      'F2: salto programado. Page Up: próximo salto. Page Down: salto anterior',
      'Home: começo do áudio. End: final do áudio',
      'Control com seta para cima ou para baixo: velocidade. Control com seta para a direita ou para a esquerda: volume',
      '— fora de campo de texto.'
    );
    // 1.5: na tela Efeitos e trilhas, o Alt G toca a prévia da mistura aqui mesmo, sem tela própria.
    if (!$('au-trilhas').hidden) {
      const i = itens.findIndex((t) => t.startsWith('Alt G: prévia de 10 segundos'));
      if (i >= 0) itens[i] = 'Alt G: prévia da mistura de 6 segundos, com as trilhas adicionadas e a que está sendo preparada';
    }
    // 1.6: na tela Equalização e ajustes.
    if (!$('au-eq').hidden) itens.unshift('Alt P: toca e pausa a prévia de 6 segundos, a partir de onde o áudio está, com a equalização, o mono ou estéreo e o limitador escolhidos');
    // 1.4: na tela Silêncios e crossfade.
    if (!$('au-silencios').hidden) itens.unshift('Em Verificar silêncios: Alt P toca e pausa a prévia; a barra de espaço no botão Ouvir prévia também');
  }
  if (telaAtual() === 'gerar' && !$('g-etapa-3').hidden) {
    itens.unshift('Na lista de imagens: Alt D descreve a imagem em foco, Alt L pergunta a nova posição dela, Delete remove. Alt I adiciona mais imagens');
  }
  if (telaAtual() === 'gerar' && !$('g-etapa-3').hidden && modoManualAtivo()) {
    itens.unshift(
      'Barra de espaço: tocar ou pausar',
      'T: adiciona a imagem aqui',
      'A: avança 5 segundos, V: volta 5 segundos, O: diz onde você está',
      '— essas funcionam sem Alt, desde que o foco não esteja num campo de texto.'
    );
  }
  if (telaAtual() === 'gerar' && !$('g-etapa-5').hidden) {
    itens.unshift('Fora dos campos de texto: barra de espaço toca e pausa, setas andam meio segundo, Page Up e Page Down andam um salto, Home e End vão ao começo e ao fim, O diz onde você está, Control com setas muda velocidade e volume, Alt M marca o tempo do título aqui');
  }
  if (telaAtual() === 'gerar') {
    itens.unshift(
      'Control com um número de 1 a 8: vai direto para aquela etapa. 1 Áudio, 2 Orientação e título, 3 Imagens, 4 Legenda, 5 Títulos em outros momentos, 6 Logo, 7 Encerramento, 8 Atmosfera e qualidade.',
      'Alt A: Salvar e continuar. Alt V: Voltar. Alt S: salva o áudio pronto, no formato das Configurações.'
    );
  }
  // 2.0.2: com um vídeo na tela, três atalhos olham o quadro em que ele está.
  if (['audio', 'cortar'].includes(telaAtual())) {
    itens.push('Alt E: o enquadramento do quadro em que o vídeo está, com a luz e o fundo. Alt C: só a luz e o fundo desse quadro. Alt Q: a descrição completa do quadro com o descritor de imagens, se estiver instalado em Extras');
  }
  if (telaAtual() === 'inicial') {
    itens.unshift('Setas para cima e para baixo andam pelo menu. Seta para a direita abre um grupo e seta para a esquerda fecha. Enter escolhe. Uma letra salta para o item que começa com ela',
      ...[...document.querySelectorAll('#menu-inicial [data-tecla]')].map((el) => `Alt ${el.dataset.tecla.toUpperCase()}: ${el.dataset.nome}`));
  }
  itens.push('Alt H: fecha esta lista. Escape também fecha.');

  const ul = $('ajuda-lista');
  ul.innerHTML = '';
  itens.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
  $('ajuda').hidden = false;
  $('ajuda-titulo').focus();
}

function fecharAjuda() {
  $('ajuda').hidden = true;
}

function modoManualAtivo() {
  const r = document.querySelector('input[name="modo"]:checked');
  return !!r && r.value === 'manual';
}

document.addEventListener('keydown', (e) => {
  const emCampoDeTexto = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
    (document.activeElement || {}).tagName
  );

  if (e.key === 'Escape' && !$('ajuda').hidden) {
    e.preventDefault();
    fecharAjuda();
    return;
  }

  // Alt H em todas as telas, menos na Gravar (lá a pessoa está gravando e as teclas são outras).
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'h' && telaAtual() !== 'gravar') {
    e.preventDefault();
    // 1.6: nas telas de áudio, o Alt H confirma como o Alt E: bipe curto e a fala.
    if (telaAtual() === 'audio' && window.gravarTela && window.gravarTela.bipe && (window.__olhoConfig || {}).confirmacao !== 'som') window.gravarTela.bipe('atalho');
    if ($('ajuda').hidden) abrirAjuda();
    else fecharAjuda();
    return;
  }

  // Ctrl + 1 a 8 na tela de gerar: pula direto para a etapa. Funciona até
  // dentro de campo de texto, porque Ctrl + número não digita nada.
  if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && /^[1-8]$/.test(e.key) &&
      telaAtual() === 'gerar') {
    e.preventDefault();
    if (!estado.rodando) pedirEtapa(Number(e.key));
    return;
  }

  // Alt T: pausa o que estiver tocando na tela à vista (na Gravar, quem cuida é o gravar.js).
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyT' && telaAtual() !== 'gravar' &&
      !document.querySelector('dialog[open]')) {
    // Se a tela tem um botão com Alt T (Tocar ou pausar), o próprio atalho dele cuida.
    const botaoT = [...$('tela-' + telaAtual()).querySelectorAll('[accesskey="t"]')].find((b) => b.offsetParent !== null);
    if (!botaoT) {
      e.preventDefault();
      if (!e.repeat) pausarTelaAtual();
      return;
    }
  }

  // Editar vídeo: Control com setas muda o volume e a velocidade do vídeo todo.
  if (telaAtual() === 'cortar' && !document.querySelector('dialog[open]') && tratarCtrlAjuste(e)) {
    e.preventDefault();
    return;
  }

  // Editar vídeo: Alt I, Alt F, Alt S, Alt Z, F2 e Delete. Com uma janela
  // aberta (F2 ou Alt S), as teclas ficam com ela.
  if (telaAtual() === 'cortar' && !document.querySelector('dialog[open]')) {
    if (tratarTeclaCortar(e, emCampoDeTexto)) {
      e.preventDefault();
      return;
    }
  }
  if (document.querySelector('dialog[open]')) return;

  // Teclas nuas, sem Alt: só fora de campo de texto, e só nas telas com
  // tocador. Existem para quem digitar Alt junto de outra tecla é trabalhoso —
  // aqui basta ouvir o ponto certo e apertar uma letra.
  // 1.6: Montar manual: Control com setas mudam velocidade e volume do tocador, como nas telas de áudio.
  if (telaAtual() === 'gerar' && !$('g-etapa-3').hidden && modoManualAtivo() && !emCampoDeTexto &&
      e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
    e.preventDefault();
    const el = $('m-audio');
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const antes = el.playbackRate || 1;
      const nova = AJU.mudarVelocidade(antes, e.key === 'ArrowUp' ? 1 : -1);
      if (nova === antes) return falar(`Velocidade já está em ${Math.round(nova * 100)}%, o ${e.key === 'ArrowUp' ? 'máximo' : 'mínimo'}.`);
      el.playbackRate = nova; el.preservesPitch = true;
      return falar(`Velocidade ${Math.round(nova * 100)}%.`);
    }
    const antes = el.volume;
    const novo = Math.min(1, AJU.mudarVolume(antes, e.key === 'ArrowRight' ? 1 : -1));
    if (novo === antes) return falar(`Volume já está em ${Math.round(novo * 100)}%, o ${e.key === 'ArrowRight' ? 'máximo' : 'mínimo'}.`);
    el.volume = novo;
    return falar(`Volume ${Math.round(novo * 100)}%.`);
  }

  if (e.altKey || e.ctrlKey || e.metaKey || emCampoDeTexto) return;

  const tela = telaAtual();

  if (tela === 'cortar') {
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); $('c-tocar').click(); }
    // 1.9.1: as mesmas teclas universais das etapas de áudio para andar no tempo.
    else if (e.key === 'ArrowRight') { e.preventDefault(); pular(0.5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pular(-0.5); }
    else if (e.key === 'PageUp') { e.preventDefault(); $('c-avancar').click(); }
    else if (e.key === 'PageDown') { e.preventDefault(); $('c-voltar').click(); }
    else if (k === 'o') { e.preventDefault(); ondeEstou(); }
    else if (e.key === 'Home' && corte.video) { e.preventDefault(); pararEmenda(); player().currentTime = 0; falar('Começo do vídeo.'); }
    else if (e.key === 'End' && corte.video) { e.preventDefault(); pararEmenda(); player().currentTime = Math.max(0, (player().duration || corte.video.duracao) - 0.1); falar(`Final do vídeo, ${tempoPreciso(player().currentTime)}.`); }
  }

  if (tela === 'gerar' && !$('g-etapa-3').hidden && modoManualAtivo()) {
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); $('m-tocar').click(); }
    else if (k === 't') { e.preventDefault(); $('m-adicionar').click(); }
    else if (k === 'a') { e.preventDefault(); $('m-avancar').click(); }
    else if (k === 'v') { e.preventDefault(); $('m-voltar').click(); }
    else if (k === 'o') { e.preventDefault(); $('m-onde').click(); }
  }
});

/**
 * Só a tela à vista tem atalhos ativos, e nela só a etapa à vista. Algumas
 * letras se repetem (Alt A é áudio numa e avançar noutra), e depender do
 * navegador para ignorar o que está escondido é arriscar um atalho
 * disparando no lugar errado.
 */
function aplicarAtalhos(qual) {
  TELAS.forEach((nome) => {
    const tela = $('tela-' + nome);
    tela.querySelectorAll('[accesskey], [data-atalho]').forEach((el) => {
      if (el.hasAttribute('accesskey')) {
        el.dataset.atalho = el.getAttribute('accesskey');
      }
      const visivel = nome === qual && !el.closest('.etapa[hidden]');
      // 1.9: Alt A (Salvar e continuar) e Alt V (Voltar) ficam só com o gravar.js, que aperta o botão
      // da parte à vista. Como tecla de acesso do navegador, o Windows podia apertar o mesmo botão de
      // uma etapa escondida (a tela de áudio tem as quatro etapas na mesma página), e o Alt A não ia.
      const soDoPrograma = el.dataset.atalho === 'A' || el.dataset.atalho === 'V';
      if (visivel && !soDoPrograma) el.setAttribute('accesskey', el.dataset.atalho);
      else el.removeAttribute('accesskey');
    });
  });
}

function mostrarTela(qual) {
  const antes = telaAtual();
  if (window.PlayerSimples) window.PlayerSimples.pararTodos(); // 3.0.1: o player de antes de decidir não fica tocando em outra tela
  TELAS.forEach((n) => { $('tela-' + n).hidden = qual !== n; });
  // 3.0.3: a pasta onde os arquivos são salvos depende da função em que a pessoa está.
  try { if (window.api && window.api.pastasOrigem) window.api.pastasOrigem({ tela: qual }); } catch (_) { /* */ }
  // Sair da tela de corte para o que estiver tocando: som fantasma vindo de
  // uma tela que não está mais à vista é desorientador.
  if (qual !== 'cortar' && typeof pararTudoNoPlayer === 'function') pararTudoNoPlayer();
  if (qual !== 'cortar' && typeof pararOuvirAjuste === 'function') pararOuvirAjuste();
  // Câmera e microfone só ficam ligados com a tela Gravar à vista.
  if (window.gravarTela) {
    if (antes === 'gravar' && qual !== 'gravar') window.gravarTela.sair();
    if (qual === 'gravar' && (antes !== 'gravar' || !window.gravarTela.estado.aberto)) window.gravarTela.entrar();
  }
  // 2.0.7: a câmera da tela Tirar fotos também só fica ligada com ela à vista.
  if (window.fotoTela) {
    if (antes === 'foto' && qual !== 'foto') window.fotoTela.sair();
    if (qual === 'foto' && antes !== 'foto') window.fotoTela.entrar();
  }
  if (window.fotoEditarTela) {
    if (antes === 'editfoto' && qual !== 'editfoto') window.fotoEditarTela.sair();
    if (qual === 'editfoto' && antes !== 'editfoto') window.fotoEditarTela.entrar();
  }
  if (window.gaudioTela) {
    if (antes === 'gaudio' && qual !== 'gaudio') window.gaudioTela.sair();
    if (qual === 'gaudio' && antes !== 'gaudio') window.gaudioTela.entrar();
  }
  if (window.postTela) {
    if (antes === 'post' && qual !== 'post') window.postTela.sair();
    if (qual === 'post' && antes !== 'post') window.postTela.entrar();
  }
  if (!$('ajuda').hidden) fecharAjuda();
  aplicarAtalhos(qual);

  const alvo = $('tela-' + qual);
  const titulo = alvo.querySelector('h1');
  if (titulo) {
    titulo.tabIndex = -1;
    titulo.focus();
  }
  // 3.0: ao voltar à tela inicial, o foco volta ao item do menu que foi aberto, com o grupo ainda aberto.
  if (qual === 'inicial' && antes !== 'inicial' && window.menuInicial) setTimeout(() => window.menuInicial.restaurarFoco(), 60);
}

/** Única porta de saída de mensagem. Some texto duplicado não reanuncia. */
// 1.9.2: fala atrasada (depois de o foco mudar), que uma fala mais nova cancela.
let falaPendente = null;
function falarDepois(texto, ms = 200) {
  clearTimeout(falaPendente);
  falaPendente = setTimeout(() => { falaPendente = null; falar(texto); }, ms);
}
function falar(texto) {
  clearTimeout(falaPendente);
  const alvo = $('status');
  if (alvo.textContent === texto) alvo.textContent = texto + ' ';
  else alvo.textContent = texto;
}

/** Alt T fora da tela Gravar, numa tela sem botão Tocar ou pausar: pausa o que estiver tocando. */
function pausarTelaAtual() {
  const tela = telaAtual();
  const tocando = [...$('tela-' + tela).querySelectorAll('audio, video')].filter((m) => !m.paused);
  if (!tocando.length) return falar('Nada tocando agora.');
  tocando.forEach((m) => m.pause());
  falar('Pausado.');
}

function nomeDoArquivo(caminho) {
  return caminho.split(/[\\/]/).pop();
}

function formatarTempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(seg)}` : `${m}:${pad(seg)}`;
}

// --- Proporção das imagens ---------------------------------------------------

const PROPORCOES_COMUNS = [[16, 9], [9, 16], [4, 3], [3, 4], [1, 1], [3, 2], [2, 3], [21, 9], [9, 21], [5, 4], [4, 5]];

/** { orientacao, proporcao } de uma imagem, em palavras que se leem bem. */
function descreverProporcao(largura, altura) {
  const r = largura / altura;
  const orientacao = Math.abs(r - 1) < 0.01 ? 'quadrada' : (r > 1 ? 'horizontal' : 'vertical');
  const achada = PROPORCOES_COMUNS.find(([a, b]) => Math.abs(r - a / b) / (a / b) < 0.02);
  const dec = (n) => n.toFixed(2).replace('.', ',');
  const proporcao = achada
    ? `${achada[0]} por ${achada[1]}`
    : (r >= 1 ? `${dec(r)} por 1` : `1 por ${dec(1 / r)}`);
  return { orientacao, proporcao };
}

/** ", horizontal, proporção 16 por 9" — ou nada, se o tamanho ainda não é conhecido. */
/** 1.9.3: o que o programa viu na imagem (luz, nitidez, cores, rostos e objetos), guardado por arquivo. */
estado.descImagens = {};
estado.descModelo = {}; // a frase do descritor com o Gemma, por arquivo
async function descreverNovas(novas) {
  for (const c of novas) {
    if (estado.descImagens[c]) continue;
    try {
      const m = await window.api.imagemMedir({ caminho: c });
      if (!m.ok) continue;
      let t = m.valor.texto;
      try { const d = await window.gravarTela.descreverImagem(m.valor.url); t += ' ' + d.texto; } catch (er) { t += ` Não consegui ver rostos e objetos: ${(er && er.message) || 'erro desconhecido'}.`; }
      estado.descImagens[c] = t;
    } catch (_) { /* segue sem descrição */ }
  }
}
function infoImagem(caminho) {
  const d = estado.dimsImagens[caminho];
  if (!d) return '';
  const { orientacao, proporcao } = descreverProporcao(d.largura, d.altura);
  return `, ${orientacao}, proporção ${proporcao}`;
}

// --- Lista de imagens --------------------------------------------------------

function desenharLista() {
  const ul = $('lista-imagens');
  ul.innerHTML = '';

  estado.imagens.forEach((caminho, i) => {
    const li = document.createElement('li');

    const nome = document.createElement('span');
    // A posição vai no texto porque leitor de tela não mostra o número visual
    // da lista de forma confiável em todo navegador.
    nome.textContent = `${nomeDoArquivo(caminho)}${infoImagem(caminho)}, posição ${i + 1} de ${estado.imagens.length}.${estado.descImagens[caminho] ? ' ' + estado.descImagens[caminho] : ''}${estado.descModelo[caminho] ? ' ' + estado.descModelo[caminho] : ''}`;
    li.dataset.caminho = caminho;
    li.appendChild(nome);

    const aviso = estado.avisosImagens[caminho];
    const temAvisoAtivo = aviso && !aviso.ignorado;
    if (temAvisoAtivo) {
      const p = document.createElement('p');
      p.setAttribute('role', 'alert');
      p.textContent = aviso.mensagem;
      li.appendChild(p);
    }

    // 1.9.6: sem Subir, Descer e Remover. Cada imagem é um item da lista: Delete remove, Alt L muda a
    // posição, Alt D descreve e Alt I adiciona outras. Só o aviso de formato ainda tem botão.
    li.tabIndex = 0;
    const acoes = document.createElement('span');
    acoes.className = 'acoes';
    if (temAvisoAtivo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Manter assim mesmo';
      b.setAttribute('aria-label', `Manter assim mesmo ${nomeDoArquivo(caminho)}, posição ${i + 1}`);
      b.addEventListener('click', () => {
        estado.avisosImagens[caminho].ignorado = true;
        desenharLista();
        falar(`Mantida como está: ${nomeDoArquivo(caminho)}.`);
      });
      acoes.appendChild(b);
    }
    if (acoes.children.length) li.appendChild(acoes);
    ul.appendChild(li);
  });

  $('info-imagens').textContent = estado.imagens.length
    ? `${estado.imagens.length} imagem(ns) na lista. Na lista: Delete remove, Alt L muda a posição, Alt D descreve, Alt I adiciona mais.`
    : 'Nenhuma imagem adicionada.';

  atualizarPrevia();
}

/**
 * Confere cada imagem da lista contra o formato de saída escolhido (orientação
 * e resolução) e atualiza os avisos. Chamada ao adicionar imagens e sempre
 * que o formato muda — o mesmo conjunto de imagens pode ficar incompatível ao
 * trocar de horizontal pra vertical, ou o contrário.
 *
 * Um aviso já dispensado ("Manter assim mesmo") só volta se a mensagem for
 * diferente da que a pessoa dispensou — por exemplo, se o motivo mudou de
 * resolução pra orientação depois de trocar o formato.
 */
async function revalidarImagens(caminhos) {
  if (!caminhos.length) return;
  const formatoId = $('formato').value || 'horizontal';
  const r = await window.api.analisarImagens({ caminhos, formatoId });
  if (!r.ok) return; // falha silenciosa: não é crítico, a pessoa ainda pode gerar

  r.resultados.forEach((item) => {
    if (item.largura && item.altura) {
      estado.dimsImagens[item.caminho] = { largura: item.largura, altura: item.altura };
    }
    if (!item.aviso) {
      delete estado.avisosImagens[item.caminho];
      return;
    }
    const existente = estado.avisosImagens[item.caminho];
    const mesmaMensagem = existente && existente.mensagem === item.aviso.mensagem;
    estado.avisosImagens[item.caminho] = {
      ...item.aviso,
      ignorado: mesmaMensagem ? existente.ignorado : false
    };
  });
}

/** Leva a imagem da posição i (0 a n-1) para a posição j e deixa o foco nela. */
function moverPara(i, j) {
  const n = estado.imagens.length;
  if (i < 0 || i >= n || j < 0 || j >= n) return false;
  if (i === j) { falar(`${nomeDoArquivo(estado.imagens[i])} já está na posição ${i + 1}.`); return true; }
  const [c] = estado.imagens.splice(i, 1);
  estado.imagens.splice(j, 0, c);
  desenharLista();
  falarDepois(`${nomeDoArquivo(c)} agora é a imagem ${j + 1} de ${n}.`, 150);
  const li = $('lista-imagens').children[j];
  if (li) li.focus();
  return true;
}

// Uma mesma imagem pode estar na lista normal E marcada no modo manual ao
// mesmo tempo (são duas entradas independentes, podem repetir arquivo). Por
// isso, antes de apagar o aviso de um caminho, confere se ele não está em
// uso em nenhuma das duas listas.
function imagemEstaEmUso(caminho) {
  return estado.imagens.includes(caminho) || estado.manualImagens.some((m) => m.caminho === caminho);
}

function remover(i) {
  const caminho = estado.imagens[i];
  const nome = nomeDoArquivo(caminho);
  estado.imagens.splice(i, 1);
  if (!imagemEstaEmUso(caminho)) delete estado.avisosImagens[caminho];
  desenharLista();
  falar(`${nome} removida. Restam ${estado.imagens.length}.`);
  const lista = $('lista-imagens');
  if (lista.children.length) {
    lista.children[Math.min(i, lista.children.length - 1)].focus();
  } else {
    $('btn-imagens').focus();
  }
}

// --- Títulos -----------------------------------------------------------------

function limiteAtual(tipo) {
  const formato = $('formato').value || 'horizontal';
  const lim = estado.limites && estado.limites[formato];
  if (!lim) return tipo === 'fim' ? 30 : 50;
  return tipo === 'fim' ? lim.fim : lim.titulo;
}

/**
 * Contador de caracteres. Fica no texto descritivo do campo, não numa região
 * que fala sozinha: anunciar a cada tecla digitada seria insuportável. Só o
 * estouro do limite vira alerta, porque aí a pessoa precisa saber na hora.
 */
function atualizarContador(idCampo, idContador, tipo) {
  const campo = $(idCampo);
  const alvo = $(idContador);
  const limite = limiteAtual(tipo);
  const usado = campo.value.trim().length;

  if (usado > limite) {
    alvo.textContent = `${usado} de ${limite} caracteres. Passou ${usado - limite}.`;
    alvo.setAttribute('role', 'alert');
  } else {
    alvo.textContent = `${usado} de ${limite} caracteres.`;
    alvo.removeAttribute('role');
  }
}

/**
 * Os campos dizem qual título você está escrevendo agora. Como a lista é
 * ordenada por tempo, o número aqui é "o próximo que você vai marcar" — em que
 * posição ele de fato caiu é dito na hora de adicionar.
 */
function atualizarRotuloTitulo() {
  const n = estado.titulos.length + 1;
  $('rotulo-titulo').textContent = `Texto do título ${n}`;
  $('rotulo-tempo').textContent = `Título ${n} aparece em (hora:minuto:segundo)`;
}

function desenharTitulos() {
  atualizarRotuloTitulo();

  const ul = $('lista-titulos');
  ul.innerHTML = '';

  if (!estado.titulos.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum título marcado.';
    ul.appendChild(li);
    return;
  }

  estado.titulos.forEach((t, i) => {
    const li = document.createElement('li');

    const nomePreset = t.trocarPreset
      ? estado.presets.find((p) => p.id === t.trocarPreset)?.nome
      : null;

    const desc = document.createElement('span');
    desc.textContent =
      `Título ${i + 1} de ${estado.titulos.length}, em ${t.tempo}: ${t.texto}` +
      (nomePreset ? ` — a partir daqui, preset ${nomePreset}` : '');
    li.appendChild(desc);

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Remover';
    b.setAttribute('aria-label', `Remover título ${i + 1}, ${t.texto}`);
    b.addEventListener('click', () => {
      estado.titulos.splice(i, 1);
      desenharTitulos();
      falar(`Título removido. Restam ${estado.titulos.length}.`);
      $('titulo-texto').focus();
    });
    li.appendChild(b);

    ul.appendChild(li);
  });
}

$('btn-add-titulo').addEventListener('click', async () => {
  const texto = $('titulo-texto').value.trim();
  const tempoBruto = $('titulo-tempo').value.trim();

  if (!texto) return falar('Escreva o texto do título antes de adicionar.');

  const limite = limiteAtual('titulo');
  if (texto.length > limite) {
    return falar(`O título tem ${texto.length} caracteres e cabem ${limite}. Encurte antes de adicionar.`);
  }

  const segundos = await window.api.lerTempo(tempoBruto);
  if (segundos === null) {
    return falar('Não entendi o tempo. Use hora, minuto e segundo, como 00:03:20.');
  }

  if (estado.duracaoAudio && segundos >= estado.duracaoAudio) {
    return falar('Esse tempo é depois do fim do áudio. O título não apareceria.');
  }

  const tempo = await window.api.escreverTempo(segundos);
  const selTroca = $('titulo-trocar-preset');
  const trocarPreset = selTroca.value || null;
  const novo = { texto, tempo, segundos, trocarPreset };
  estado.titulos.push(novo);
  estado.titulos.sort((a, b) => a.segundos - b.segundos);
  desenharTitulos();

  // A posição real depois da ordenação, que pode não ser a última.
  const posicao = estado.titulos.indexOf(novo) + 1;
  const nomePreset = trocarPreset
    ? estado.presets.find((p) => p.id === trocarPreset)?.nome
    : null;
  falar(
    `Adicionado em ${tempo}, como título ${posicao} de ${estado.titulos.length}.` +
    (nomePreset ? ` A partir daqui, preset ${nomePreset}.` : '')
  );
  $('titulo-texto').value = '';
  $('titulo-tempo').value = '00:00:00';
  selTroca.value = '';
  atualizarContador('titulo-texto', 'titulo-contador', 'titulo');
  $('titulo-texto').focus();
});

$('titulo-texto').addEventListener('input', () =>
  atualizarContador('titulo-texto', 'titulo-contador', 'titulo'));
$('titulo-simples').addEventListener('input', () =>
  atualizarContador('titulo-simples', 'titulo-simples-contador', 'titulo'));
$('texto-fim').addEventListener('input', () =>
  atualizarContador('texto-fim', 'fim-contador', 'fim'));

// Sair do campo de tempo completa o formato, pra pessoa conferir ouvindo.
$('titulo-tempo').addEventListener('blur', async () => {
  const seg = await window.api.lerTempo($('titulo-tempo').value);
  if (seg !== null) $('titulo-tempo').value = await window.api.escreverTempo(seg);
});

// --- Logo (etapa Logo) -----------------------------------------------------

const MAXIMO_LOGOS = 6;

function lAudio() { return $('l-audio'); }

function descreverLogo(l, i, total) {
  if (l.modo === 'titulo') {
    return `Logo ${i + 1} de ${total}: ${l.nome}, aparece junto de cada título.`;
  }
  const trecho = l.fim != null
    ? `de ${formatarTempo(l.inicio || 0)} até ${formatarTempo(l.fim)}`
    : (l.inicio ? `de ${formatarTempo(l.inicio)} até o fim` : 'o vídeo inteiro');
  return `Logo ${i + 1} de ${total}: ${l.nome}, na faixa do topo, ${trecho}.`;
}

$('l-modo').addEventListener('change', () => {
  const faixa = $('l-modo').value === 'faixa';
  $('l-bloco-faixa').hidden = !faixa;
  falar(faixa
    ? 'Na faixa do topo. Marque o trecho, ou deixe do começo ao fim. As imagens serão encaixadas abaixo da faixa.'
    : 'Junto de cada título. O logo aparece acima do texto, a cada título.');
});

// A faixa tem lugar para um logo por vez.
function conflitoFaixa(novo) {
  const fimDe = (l) => (l.fim != null ? l.fim : (estado.duracaoAudio || Infinity));
  const outro = estado.logos.findIndex((l) =>
    l.modo === 'faixa' &&
    (novo.inicio || 0) < fimDe(l) - 0.01 &&
    (l.inicio || 0) < fimDe(novo) - 0.01);
  return outro;
}

function desenharLogos() {
  const ul = $('lista-logos');
  ul.innerHTML = '';
  if (!estado.logos.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum logo adicionado.';
    ul.appendChild(li);
    return;
  }
  estado.logos.forEach((l, i) => {
    const li = document.createElement('li');
    const desc = document.createElement('span');
    desc.textContent = descreverLogo(l, i, estado.logos.length);
    li.appendChild(desc);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Remover';
    b.setAttribute('aria-label', `Remover logo ${i + 1}, ${l.nome}`);
    b.addEventListener('click', () => {
      estado.logos.splice(i, 1);
      desenharLogos();
      falar(`Logo removido. Restam ${estado.logos.length}.`);
      $('l-btn-arquivo').focus();
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

$('l-btn-arquivo').addEventListener('click', async () => {
  const r = await window.api.escolherLogo();
  if (!r) return;
  if (!r.ok) {
    return falar(`Não consegui abrir essa imagem: ${r.erro}`);
  }
  estado.logoEscolhido = r;
  $('l-arquivo-info').textContent = `Logo escolhido: ${nomeDoArquivo(r.caminho)}.`;
  falar(`Logo escolhido: ${nomeDoArquivo(r.caminho)}. Escolha onde ele aparece, ou deixe como está, e use Adicionar logo.`);
});

function exigirAudioLogo() {
  if (!estado.audio) { falar(mensagemSemAudio()); return false; }
  if (lAudio().getAttribute('src') !== (estado.audioUrl || '')) lAudio().src = estado.audioUrl || '';
  return true;
}

$('l-tocar').addEventListener('click', () => {
  if (!exigirAudioLogo()) return;
  const a = lAudio();
  if (a.paused) a.play().then(() => falar('Tocando.')).catch(() => falar('Não consegui tocar.'));
  else { a.pause(); falar(`Pausado em ${tempoPreciso(a.currentTime)}.`); }
});

function logoPular(delta) {
  if (!exigirAudioLogo()) return;
  const a = lAudio();
  a.currentTime = Math.min(Math.max(0, a.currentTime + delta), a.duration || estado.duracaoAudio || 0);
  falar(tempoPreciso(a.currentTime));
}
$('l-voltar').addEventListener('click', () => logoPular(-5));
$('l-avancar').addEventListener('click', () => logoPular(5));

$('l-marcar-inicio').addEventListener('click', async () => {
  if (!exigirAudioLogo()) return;
  const texto = await window.api.escreverTempo(lAudio().currentTime);
  $('l-inicio').value = texto;
  falar(`Início do logo marcado em ${texto}.`);
});
$('l-marcar-fim').addEventListener('click', async () => {
  if (!exigirAudioLogo()) return;
  const texto = await window.api.escreverTempo(lAudio().currentTime);
  $('l-fim').value = texto;
  falar(`Fim do logo marcado em ${texto}.`);
});

$('l-btn-add').addEventListener('click', async () => {
  const esc = estado.logoEscolhido;
  if (!esc) return falar('Escolha a imagem do logo antes de adicionar.');
  if (estado.logos.length >= MAXIMO_LOGOS) return falar(`No máximo ${MAXIMO_LOGOS} logos por vídeo.`);

  const modo = $('l-modo').value;
  let inicio = 0;
  let fim = null;
  if (modo === 'faixa') {
    inicio = await window.api.lerTempo($('l-inicio').value.trim() || '00:00:00');
    if (inicio === null) return falar('Não entendi o tempo de início. Use hora, minuto e segundo, como 00:03:20.');
    const brutoFim = $('l-fim').value.trim();
    if (brutoFim) {
      fim = await window.api.lerTempo(brutoFim);
      if (fim === null) return falar('Não entendi o tempo de fim. Use hora, minuto e segundo, ou deixe vazio para ir até o fim.');
      if (fim <= inicio) return falar('O fim do logo precisa ser depois do início.');
    }
    if (estado.duracaoAudio && inicio >= estado.duracaoAudio) {
      return falar('Esse início é depois do fim do áudio. O logo não apareceria.');
    }
    const choque = conflitoFaixa({ inicio, fim });
    if (choque >= 0) {
      return falar(`A faixa já tem o logo ${choque + 1} nesse trecho. A faixa comporta um logo por vez: mude o início ou o fim.`);
    }
  }

  // Fundo, sombra e tamanho são decididos na hora de montar, pela forma da
  // imagem e pelo preset escolhido. A pessoa não precisa julgar nada.
  // (tamanho fica sempre 'medio': é só o ponto de partida do cálculo.)
  const l = {
    caminho: esc.caminho,
    nome: nomeDoArquivo(esc.caminho).replace(/\.[^.]+$/, ''),
    largura: esc.largura,
    altura: esc.altura,
    modo,
    luminancia: esc.luminancia,
    tamanho: 'medio',
    removerFundo: esc.fundoLiso === true,
    corFundo: esc.fundoLiso ? esc.corCanto : null,
    sombra: true,
    inicio,
    fim
  };
  estado.logos.push(l);
  estado.logos.sort((a, b) => (a.inicio || 0) - (b.inicio || 0));
  desenharLogos();
  falar('Adicionado. ' + descreverLogo(l, estado.logos.indexOf(l), estado.logos.length));

  estado.logoEscolhido = null;
  $('l-arquivo-info').textContent = 'Nenhum logo escolhido.';
  $('l-inicio').value = '00:00:00';
  $('l-fim').value = '';
  $('l-btn-arquivo').focus();
});

['l-inicio', 'l-fim'].forEach((id) => {
  $(id).addEventListener('blur', async () => {
    if (!$(id).value.trim()) return;
    const seg = await window.api.lerTempo($(id).value);
    if (seg !== null) $(id).value = await window.api.escreverTempo(seg);
  });
});

desenharLogos();

// --- Prévia do cálculo -------------------------------------------------------

/** Diz, antes de gerar, quanto tempo cada imagem vai ficar na tela. */
function atualizarPrevia() {
  const alvo = $('info-modo');
  if (!estado.duracaoAudio || !estado.imagens.length) {
    alvo.textContent = '';
    return;
  }

  const modo = document.querySelector('input[name="modo"]:checked').value;
  const preset = estado.presets.find((p) => p.id === $('preset').value);

  if (modo === 'distribuir') {
    const porImagem = estado.duracaoAudio / estado.imagens.length;
    alvo.textContent =
      `Cada imagem vai ficar cerca de ${porImagem.toFixed(1)} segundos na tela.`;
  } else {
    const base = preset?.baseDuration || 10;
    const total = Math.ceil(estado.duracaoAudio / base);
    const ciclos = total / estado.imagens.length;
    alvo.textContent =
      `Cada imagem vai ficar cerca de ${base} segundos na tela, ` +
      `em ${total} trocas, com o ciclo repetindo ${ciclos.toFixed(1)} vezes.`;
  }
}

// --- Modo manual (marcar imagens ouvindo o áudio) -----------------------

function mAudio() { return $('m-audio'); }

document.querySelectorAll('input[name="modo"]').forEach((r) => {
  r.addEventListener('change', () => {
    const manual = modoManualAtivo();
    $('bloco-manual').hidden = !manual;

    // As duas formas de organizar imagens são mutuamente exclusivas: no modo
    // manual, a lista comum (com Subir/Descer) não se aplica, porque a ordem
    // vem do tempo marcado, não da posição na lista.
    $('btn-imagens').disabled = manual;
    $('btn-limpar-imagens').disabled = manual;
    $('lista-imagens').querySelectorAll('button').forEach((b) => (b.disabled = manual));

    if (manual && estado.audio) {
      mAudio().src = estado.audioUrl || '';
    } else {
      try { mAudio().pause(); } catch (_) {}
    }

    atualizarPrevia();
  });
});

function exigirAudioManual() {
  if (!estado.audio) {
    falar(mensagemSemAudio());
    return false;
  }
  return true;
}

$('m-tocar').addEventListener('click', () => {
  if (!exigirAudioManual()) return;
  const a = mAudio();
  if (a.paused) {
    a.play().then(() => falar('Tocando.')).catch(() => falar('Não consegui tocar.'));
  } else {
    a.pause();
    falar(`Pausado em ${tempoPreciso(a.currentTime)}.`);
  }
});

function mPular(delta) {
  if (!exigirAudioManual()) return;
  const a = mAudio();
  a.currentTime = Math.min(Math.max(0, a.currentTime + delta), a.duration || estado.duracaoAudio || 0);
  falar(tempoPreciso(a.currentTime));
}
$('m-voltar').addEventListener('click', () => mPular(-5));
$('m-avancar').addEventListener('click', () => mPular(5));

$('m-onde').addEventListener('click', () => {
  if (!exigirAudioManual()) return;
  falar(`${tempoPreciso(mAudio().currentTime)}, de ${tempoPreciso(estado.duracaoAudio || 0)}.`);
});

$('m-adicionar').addEventListener('click', async () => {
  if (!exigirAudioManual()) return;
  const a = mAudio();
  const tempoAtual = a.currentTime;
  const tocando = !a.paused;
  a.pause();

  falar('Escolha a imagem para este ponto.');
  const caminho = await window.api.escolherImagemUnica();
  if (!caminho) {
    falar('Nenhuma imagem escolhida.');
    if (tocando) a.play().catch(() => {});
    return;
  }

  estado.manualImagens.push({ caminho, tempo: tempoAtual });
  estado.manualImagens.sort((x, y) => x.tempo - y.tempo);
  desenharManual();

  const pos = estado.manualImagens.findIndex((m) => m.caminho === caminho && m.tempo === tempoAtual) + 1;
  falar(
    `${nomeDoArquivo(caminho)} marcada em ${tempoPreciso(tempoAtual)}, ` +
    `como imagem ${pos} de ${estado.manualImagens.length}.`
  );

  // Mesmo aviso de orientação/resolução da lista normal: a pessoa pode
  // escolher uma imagem incompatível com o formato por aqui também.
  await revalidarImagens([caminho]);
  desenharManual();
  if (estado.avisosImagens[caminho] && !estado.avisosImagens[caminho].ignorado) {
    falar(estado.avisosImagens[caminho].mensagem);
  }
});

function desenharManual() {
  const ul = $('m-lista');
  ul.innerHTML = '';

  if (!estado.manualImagens.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma imagem marcada ainda.';
    ul.appendChild(li);
    return;
  }

  if (estado.manualImagens[0].tempo > 0.05) {
    const aviso = document.createElement('li');
    aviso.setAttribute('role', 'alert');
    aviso.textContent =
      'A primeira imagem precisa estar em 00:00:00, senão o vídeo começaria ' +
      'sem nenhuma imagem na tela.';
    ul.appendChild(aviso);
  }

  estado.manualImagens.forEach((m, i) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.textContent =
      nomeDoArquivo(m.caminho) + infoImagem(m.caminho) +
      `, em ${tempoPreciso(m.tempo)}, posição ${i + 1} de ${estado.manualImagens.length}`;
    li.appendChild(txt);

    const aviso = estado.avisosImagens[m.caminho];
    const temAvisoAtivo = aviso && !aviso.ignorado;
    if (temAvisoAtivo) {
      const p = document.createElement('p');
      p.setAttribute('role', 'alert');
      p.textContent = aviso.mensagem;
      li.appendChild(p);
    }

    if (temAvisoAtivo) {
      const manter = document.createElement('button');
      manter.type = 'button';
      manter.textContent = 'Manter assim mesmo';
      manter.setAttribute('aria-label', `Manter assim mesmo ${nomeDoArquivo(m.caminho)}, em ${tempoPreciso(m.tempo)}`);
      manter.addEventListener('click', () => {
        estado.avisosImagens[m.caminho].ignorado = true;
        desenharManual();
        falar(`Mantida como está: ${nomeDoArquivo(m.caminho)}.`);
      });
      li.appendChild(manter);
    }

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Remover';
    b.setAttribute('aria-label', `Remover ${nomeDoArquivo(m.caminho)}, em ${tempoPreciso(m.tempo)}`);
    b.addEventListener('click', () => {
      estado.manualImagens.splice(i, 1);
      if (!imagemEstaEmUso(m.caminho)) delete estado.avisosImagens[m.caminho];
      desenharManual();
      falar(`Removida. Restam ${estado.manualImagens.length}.`);
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

// --- Ações -------------------------------------------------------------------

// --- Áudios em sequência -------------------------------------------------
//
// O resto do programa trabalha com UM áudio (estado.audio). A lista abaixo
// existe para montar esse áudio: com um áudio só e velocidade normal ele é o
// próprio arquivo; com mais de um, ou com velocidade mudada, é um arquivo
// novo montado a pedido (ou ao salvar e continuar).

const VELOCIDADES_AUDIO = [1, 1.25, 1.5, 2];

function nomeVelocidade(v) {
  return !v || v === 1 ? '1x (normal)' : `${String(v).replace('.', ',')}x`;
}

/** O que dizer quando falta o áudio de trabalho: escolher, ou só montar. */
function mensagemSemAudio() {
  return estado.audioPendente
    ? 'Use Salvar e continuar na etapa Áudio.'
    : 'Escolha o áudio primeiro.';
}

function precisaMontarAudio() {
  // 1.8: com "Áudios importados em mono" nas Configurações, o áudio sempre passa pela montagem.
  const mono = !!(window.__olhoConfig && window.__olhoConfig.importados === 'mono');
  return mono || estado.audios.length > 1 || estado.audios.some((a) => (a.velocidade || 1) !== 1);
}

function duracaoTotalAudios() {
  return estado.audios.reduce((soma, a) => soma + a.duracao / (a.velocidade || 1), 0);
}

function temMarcasFeitas() {
  return !!(estado.titulos.length || estado.manualImagens.length || estado.camadas.length || estado.logos.length);
}

// --- 3.0.3: Títulos em outros momentos: player com as teclas universais e Marcar aqui (Alt M) -------------------
const AAT = window.AtalhosAudio;
function tAudio() {
  const a = $('t5-audio');
  if (estado.audioUrl && a.dataset.url !== estado.audioUrl) { a.src = estado.audioUrl; a.dataset.url = estado.audioUrl; }
  return a;
}
function tPodeOuvir() {
  if (!estado.audio) { falar(mensagemSemAudio()); return false; }
  return true;
}
function tIrPara(seg) {
  const a = tAudio();
  a.currentTime = Math.min(Math.max(0, seg), a.duration || estado.duracaoAudio || 0);
  return a.currentTime;
}
function tTocar() {
  if (!tPodeOuvir()) return;
  const a = tAudio();
  if (a.paused) a.play().then(() => falar(`Tocando, em ${tempoPreciso(a.currentTime)}.`)).catch(() => falar('Não consegui tocar.'));
  else { a.pause(); falar(`Pausado em ${tempoPreciso(a.currentTime)}.`); }
}
function tPular(delta, aviso) {
  if (!tPodeOuvir()) return;
  const t = tIrPara(tAudio().currentTime + delta);
  falar(aviso ? `${aviso} ${tempoPreciso(t)}.` : `${tempoPreciso(t)}.`);
}
function tOnde() {
  if (!tPodeOuvir()) return;
  falar(`${tempoPreciso(tAudio().currentTime)}, de ${tempoPreciso(estado.duracaoAudio || 0)}.`);
}
async function tMarcar() {
  if (!tPodeOuvir()) return;
  const a = tAudio();
  const seg = a.currentTime;
  a.pause();
  $('titulo-tempo').value = await window.api.escreverTempo(seg);
  falar(`Tempo do título marcado em ${tempoPreciso(seg)}. Digite o texto do título e use Adicionar título.`);
}
function tVelocidadeOuVolume(acao) {
  const a = tAudio();
  if (acao === 'maisVelocidade' || acao === 'menosVelocidade') {
    const antes = a.playbackRate || 1;
    const nova = AJU.mudarVelocidade(antes, acao === 'maisVelocidade' ? 1 : -1);
    if (nova === antes) return falar(`Velocidade já está em ${Math.round(nova * 100)}%, o ${acao === 'maisVelocidade' ? 'máximo' : 'mínimo'}.`);
    a.playbackRate = nova; a.preservesPitch = true;
    return falar(`Velocidade ${Math.round(nova * 100)}%.`);
  }
  const antes = a.volume;
  const novo = Math.min(1, AJU.mudarVolume(antes, acao === 'maisVolume' ? 1 : -1));
  if (novo === antes) return falar(`Volume já está em ${Math.round(novo * 100)}%, o ${acao === 'maisVolume' ? 'máximo' : 'mínimo'}.`);
  a.volume = novo;
  falar(`Volume ${Math.round(novo * 100)}%.`);
}
$('t5-tocar').addEventListener('click', tTocar);
$('t5-voltar').addEventListener('click', () => tPular(-5));
$('t5-avancar').addEventListener('click', () => tPular(5));
$('t5-onde').addEventListener('click', tOnde);
$('t5-marcar').addEventListener('click', tMarcar);
document.addEventListener('keydown', (e) => {
  if (telaAtual() !== 'gerar' || $('g-etapa-5').hidden) return;
  if (document.querySelector('dialog[open]') || !$('ajuda').hidden) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) tMarcar(); return; }
  if (e.altKey || e.metaKey || e.shiftKey) return;
  const alvo = document.activeElement;
  const emCampo = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT');
  if (emCampo) return;
  if (!e.ctrlKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); e.stopPropagation(); tOnde(); return; }
  const acao = AAT.acaoDaTecla(e, alvo);
  if (!acao) return;
  const uso = ['tocar', 'voltar1', 'avancar1', 'proximoSalto', 'saltoAnterior', 'comeco', 'final', 'maisVelocidade', 'menosVelocidade', 'maisVolume', 'menosVolume'];
  if (!uso.includes(acao)) return;
  e.preventDefault(); e.stopPropagation();
  if (e.repeat && acao === 'tocar') return;
  switch (acao) {
    case 'tocar': return tTocar();
    case 'voltar1': return tPular(-AAT.PASSO_SETA);
    case 'avancar1': return tPular(AAT.PASSO_SETA);
    case 'proximoSalto': return tPular(AAT.SALTO_PADRAO, `Avançou ${AAT.SALTO_PADRAO} segundos.`);
    case 'saltoAnterior': return tPular(-AAT.SALTO_PADRAO, `Voltou ${AAT.SALTO_PADRAO} segundos.`);
    case 'comeco': if (tPodeOuvir()) { tIrPara(0); falar('Começo do áudio.'); } return;
    case 'final': if (tPodeOuvir()) { const t = tIrPara((estado.duracaoAudio || 0) - 0.1); falar(`Final do áudio, ${tempoPreciso(t)}.`); } return;
    default: if (tPodeOuvir()) tVelocidadeOuVolume(acao);
  }
}, true);

/** Zera o que dependia do áudio antigo (silêncios achados, player manual). */
function aplicarAudioAtual(caminho, url, duracao) {
  estado.audio = caminho;
  estado.audioUrl = url;
  estado.duracaoAudio = duracao;
  if (modoManualAtivo()) mAudio().src = url || '';
  atualizarPrevia();
}

function atualizarResumoAudios() {
  const n = estado.audios.length;
  if (!n) {
    $('info-audio').textContent = 'Nenhum áudio escolhido.';
    return;
  }
  const total = formatarTempo(duracaoTotalAudios());
  $('info-audio').textContent = estado.audioPendente
    ? `${n} áudios na lista, ${total} no total depois das velocidades.`
    : (n === 1
        ? `${estado.audios[0].nome}, duração ${total}.`
        : `${n} áudios montados, ${total} no total.`);
}

/**
 * Chamada sempre que a lista muda. Decide se o áudio de trabalho é o próprio
 * arquivo (um só, velocidade normal) ou se precisa ser montado.
 */
function aoMudarListaAudios() {
  // Montar de novo desfaz o corte de silêncio já feito e embaralha o tempo
  // das marcas; avisa antes que a pessoa descubra só no fim.
  const avisos = [];
  if (estado.audioCortado) {
    avisos.push('O corte de silêncios já feito será desfeito; refaça depois de montar.');
    estado.audioCortado = false;
  }
  if (temMarcasFeitas()) {
    avisos.push('Você já fez marcas de título, trilha ou imagem. Mudar os áudios muda os tempos; confira essas marcas depois.');
  }
  // 1.9: áudio novo passa de novo pelas etapas de áudio.
  if (estado.audioPronto) avisos.push('Use Salvar e continuar para passar o áudio novo pelas etapas de áudio.');
  if (estado.legenda) { avisos.push('A legenda foi tirada, porque era do áudio anterior.'); estado.legenda = null; estado.legendaEstilo = null; estado.legendaInfo = null; mostrarLegendaMontar(); }
  estado.audioPronto = false;
  estado.audioDaLista = null;

  if (!estado.audios.length) {
    estado.audioPendente = false;
    aplicarAudioAtual(null, null, null);
  } else if (!precisaMontarAudio()) {
    estado.audioPendente = false;
    const a = estado.audios[0];
    aplicarAudioAtual(a.caminho, a.url, a.duracao);
  } else {
    estado.audioPendente = true;
    aplicarAudioAtual(null, null, null);
  }

  $('audio-status').textContent = '';
  desenharAudios();
  atualizarResumoAudios();
  return avisos;
}

function desenharAudios() {
  const ul = $('lista-audios');
  ul.innerHTML = '';
  const n = estado.audios.length;

  if (!n) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum áudio na lista.';
    ul.appendChild(li);
    return;
  }

  estado.audios.forEach((a, i) => {
    const li = document.createElement('li');
    const v = a.velocidade || 1;

    const desc = document.createElement('span');
    desc.textContent =
      `Áudio ${i + 1} de ${n}: ${a.nome}, ${formatarTempo(a.duracao)}` +
      (v !== 1 ? `, em ${nomeVelocidade(v)}, fica com ${formatarTempo(a.duracao / v)}` : '') + '.';
    li.appendChild(desc);

    const rotulo = document.createElement('label');
    rotulo.textContent = 'Velocidade ';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Velocidade do áudio ${i + 1}, ${a.nome}`);
    VELOCIDADES_AUDIO.forEach((vel) => {
      const o = document.createElement('option');
      o.value = String(vel);
      o.textContent = nomeVelocidade(vel);
      if (vel === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = estado.rodando;
    sel.addEventListener('change', () => {
      a.velocidade = Number(sel.value);
      const avisos = aoMudarListaAudios();
      const nova = a.duracao / a.velocidade;
      falar(
        `Áudio ${i + 1} em ${nomeVelocidade(a.velocidade)}: de ${formatarTempo(a.duracao)} para ${formatarTempo(nova)}. ` +
        `Total: ${formatarTempo(duracaoTotalAudios())}. ` + avisos.join(' ')
      );
      const novo = $('lista-audios').children[i];
      if (novo) novo.querySelector('select').focus();
    });
    rotulo.appendChild(sel);
    li.appendChild(rotulo);

    const acoes = document.createElement('span');
    acoes.className = 'acoes';
    const botao = (texto, desativado, aoClicar) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      b.setAttribute('aria-label', `${texto} áudio ${i + 1}, ${a.nome}`);
      b.disabled = desativado || estado.rodando;
      b.addEventListener('click', aoClicar);
      acoes.appendChild(b);
    };
    botao('Ouvir prévia', false, () => ouvirPreviaVelocidade(a));
    botao('Subir', i === 0, () => moverAudio(i, -1));
    botao('Descer', i === n - 1, () => moverAudio(i, 1));
    botao('Remover', false, () => removerAudio(i));
    li.appendChild(acoes);

    ul.appendChild(li);
  });
}

async function ouvirPreviaVelocidade(a) {
  const v = a.velocidade || 1;
  falar(`Preparando a prévia de 6 segundos em ${nomeVelocidade(v)}...`);
  const r = await window.api.previaVelocidade({ entrada: a.caminho, velocidade: v });
  if (!r.ok) return falar(`Não consegui fazer a prévia: ${r.erro}`);
  const player = $('audio-previa-velocidade');
  try { player.pause(); } catch (_) {}
  player.src = r.url;
  player.play().catch(() => {});
  falar(`Tocando a prévia em ${nomeVelocidade(v)}.`);
}

function moverAudio(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= estado.audios.length) return;
  [estado.audios[i], estado.audios[j]] = [estado.audios[j], estado.audios[i]];
  const avisos = aoMudarListaAudios();
  falar(`${estado.audios[j].nome} agora é o áudio ${j + 1}. ${avisos.join(' ')}`);
  const botoes = $('lista-audios').children[j].querySelectorAll('.acoes button');
  const alvo = delta < 0 ? botoes[1] : botoes[2];
  if (alvo && !alvo.disabled) alvo.focus();
}

function removerAudio(i) {
  const [tirado] = estado.audios.splice(i, 1);
  const avisos = aoMudarListaAudios();
  falar(`${tirado.nome} removido. Restam ${estado.audios.length}. ${avisos.join(' ')}`);
  const lista = $('lista-audios');
  if (estado.audios.length) {
    const alvo = lista.children[Math.min(i, lista.children.length - 1)];
    alvo.querySelector('select').focus();
  } else {
    $('btn-audio').focus();
  }
}

/** Monta o áudio final a partir da lista. Devolve true se deu certo. */
async function montarAudioFinal() {
  if (!estado.audios.length) {
    falar('Escolha o áudio primeiro.');
    return false;
  }
  $('audio-status').textContent = 'Montando o áudio final...';
  falar('Montando o áudio final. Pode levar um instante.');
  const r = await window.api.montarAudio({
    itens: estado.audios.map((a) => ({ caminho: a.caminho, velocidade: a.velocidade || 1 }))
  });
  if (!r.ok) {
    $('audio-status').textContent = `Não consegui montar: ${r.erro}`;
    falar(`Não consegui montar o áudio: ${r.erro}`);
    return false;
  }
  estado.audioPendente = false;
  aplicarAudioAtual(r.caminho, r.url, r.duracao);
  atualizarResumoAudios();
  const msg = `Áudio final montado: ${formatarTempo(r.duracao)}.`;
  $('audio-status').textContent = msg;
  falar(msg);
  return true;
}


async function escolherUmAudio() {
  const r = await window.api.escolherAudio();
  if (!r) return null;
  if (!r.duracao) {
    falar(`Não consegui ler a duração de ${nomeDoArquivo(r.caminho)}. Escolha outro arquivo.`);
    return null;
  }
  return { caminho: r.caminho, url: r.url, duracao: r.duracao, nome: nomeDoArquivo(r.caminho), velocidade: 1 };
}

$('btn-audio').addEventListener('click', async () => {
  const item = await escolherUmAudio();
  if (!item) return;
  // O primeiro botão troca o áudio principal, sem mexer nos outros da lista.
  const trocou = estado.audios.length > 0;
  if (trocou) estado.audios[0] = item;
  else estado.audios.push(item);
  const avisos = aoMudarListaAudios();
  falar(
    `Áudio escolhido: ${item.nome}, ${formatarTempo(item.duracao)}. ` +
    avisos.join(' ')
  );
});

$('btn-add-audio').addEventListener('click', async () => {
  if (!estado.audios.length) return falar('Escolha o áudio principal primeiro.');
  const item = await escolherUmAudio();
  if (!item) return;
  estado.audios.push(item);
  const avisos = aoMudarListaAudios();
  falar(
    `Áudio ${estado.audios.length} adicionado: ${item.nome}, ${formatarTempo(item.duracao)}. ` +
    `Total: ${formatarTempo(duracaoTotalAudios())}. ` + avisos.join(' ')
  );
});

// --- Legenda (Montar vídeo) -----------------------------------------------

// 1.9: a legenda vem da tela de legenda (inserir SRT ou gerar com o modelo), com o estilo escolhido.
function mostrarLegendaMontar() {
  const l = estado.legenda ? estado.legendaInfo : null;
  $('g-info-legenda').textContent = l ? `Legenda: ${l.nome}, ${l.quantas === 1 ? '1 legenda' : l.quantas + ' legendas'}, estilo ${Legendas.estilo(l.estilo).nome}.` : 'Sem legenda.';
  $('g-btn-tirar-legenda').hidden = !l;
}
function abrirLegendaMontar() {
  if (!estado.audioPronto) return falar('Primeiro o áudio: na Etapa 1, use Salvar e continuar para passar pelas etapas de áudio.');
  window.gravarTela.abrirLegenda({
    audio: estado.audio,
    nome: nomeDoArquivo(estado.audios.length ? estado.audios[0].caminho : estado.audio).replace(/\.[^.]+$/, ''),
    vertical: /vertical|short|9x16|retrato/i.test($('formato').value || ''),
    aoTerminar: (r) => {
      if (r) { estado.legenda = r.srt; estado.legendaEstilo = r.estilo; estado.legendaInfo = r; }
      mostrarTela('gerar');
      mostrarLegendaMontar();
      irParaEtapa(5);
      setTimeout(() => falar((r ? `Legenda feita, ${r.quantas === 1 ? '1 legenda' : r.quantas + ' legendas'}. ` : 'Sem legenda. ') + 'Etapa 5 de 8: Títulos em outros momentos.'), 250);
    },
    aoVoltar: () => { mostrarTela('gerar'); irParaEtapa(3); }
  });
}
$('g-abrir-legenda').addEventListener('click', abrirLegendaMontar);
$('g-btn-tirar-legenda').addEventListener('click', () => {
  if (!estado.legenda) return falar('Não há legenda escolhida.');
  estado.legenda = null; estado.legendaEstilo = null; estado.legendaInfo = null;
  mostrarLegendaMontar();
  falar('Legenda tirada. O vídeo fica sem legenda.');
  $('g-abrir-legenda').focus();
});
mostrarLegendaMontar();

// --- Trilhas de fundo (Montar vídeo) --------------------------------------
//
// Lista igual a de títulos: cada trilha é escolhida, ajustada (tipo, tempo
// se for estática, volume) e adicionada. A duração e o tempo válido só são
// conferidos de verdade na hora de gerar, contra a duração real do áudio;
// aqui é só coletar o que a pessoa quer.

// 2.0.3: duas escolhas independentes. Tipo: em loop (repete até o fim) ou estática (toca uma vez só).
// Começo: desde o começo do vídeo ou a partir de um tempo determinado. Para o gerador, só o loop desde o
// começo continua sendo "loop"; as outras três combinações são trilhas "estáticas" com tempo (0 ou o marcado),
// e só a que é loop a partir de um tempo repete até o fim.
const trilhaEstatica = (p) => $(`${p}-trilha-tipo-estatico`).checked;
const trilhaComTempo = (p) => $(`${p}-trilha-inicio-tempo`).checked;
const trilhaTipoReal = (p) => (!trilhaEstatica(p) && !trilhaComTempo(p) ? 'loop' : 'estatico');
const trilhaRepete = (p) => !trilhaEstatica(p) && trilhaComTempo(p);
/** O tempo do campo, em segundos; 0 quando a trilha começa do começo; null se não entendeu. */
async function trilhaTempoLido(p) {
  return trilhaComTempo(p) ? window.api.lerTempo($(`${p}-trilha-tempo`).value) : 0;
}
const trilhaQuando = (p, tempoTexto) => (trilhaComTempo(p) ? `começando em ${tempoTexto}` : 'desde o começo do vídeo');

/** Fade de entrada e saída só faz sentido na trilha estática, que toca uma vez só. */
function atualizarBlocoFadeTrilha(prefixo) {
  $(`${prefixo}-trilha-bloco-fade`).hidden = !trilhaEstatica(prefixo);
}

function atualizarBlocoTempoTrilha(prefixo) {
  $(`${prefixo}-trilha-bloco-tempo`).hidden = !trilhaComTempo(prefixo);
  atualizarBlocoFadeTrilha(prefixo);
}
['j', 'c', 'e'].forEach((pf) => {
  ['tipo-loop', 'tipo-estatico', 'inicio-comeco', 'inicio-tempo'].forEach((v) => {
    $(`${pf}-trilha-${v}`).addEventListener('change', () => atualizarBlocoTempoTrilha(pf));
  });
  atualizarBlocoTempoTrilha(pf);
});

// Uma trilha "contínua" é a que toca até o fim do vídeo por conta própria —
// em loop, ou estática marcada pra repetir. Uma trilha pontual (toca uma vez
// só) nunca entra nessa conta, porque ela é rápida e já funciona sobreposta.
function isContinua(c) {
  return c.tipo === 'loop' || (c.tipo === 'estatico' && c.repetir);
}

// Guarda a trilha nova em espera enquanto a pessoa decide o que fazer com a
// trilha contínua anterior, uma por tela (g ou j).
const pendenteTrilha = { g: null, j: null, c: null, e: null };

/**
 * Tenta adicionar a trilha. Se ela é contínua e já existe outra trilha
 * contínua na lista, não adiciona ainda — guarda a trilha em espera, mostra
 * a pergunta, e devolve false. Quem decide o que fazer é
 * resolverConflitoTrilha, chamada pelos dois botões da pergunta.
 */
function finalizarAdicaoTrilha(prefixo, lista, nova) {
  if (isContinua(nova)) {
    let indiceAnterior = -1;
    for (let k = lista.length - 1; k >= 0; k--) {
      if (isContinua(lista[k])) { indiceAnterior = k; break; }
    }

    if (indiceAnterior !== -1) {
      const anterior = lista[indiceAnterior];
      pendenteTrilha[prefixo] = { nova, indiceAnterior };

      const pergunta =
        `"${nova.nome}" entra enquanto "${anterior.nome}" ainda estaria tocando. ` +
        `Encerrar "${anterior.nome}" bem nesse ponto, ou deixar as duas tocando até o ` +
        `fim, terminando juntas?`;
      $(`${prefixo}-trilha-conflito-texto`).textContent = pergunta;
      $(`${prefixo}-trilha-conflito`).hidden = false;
      falar(pergunta);
      $(`${prefixo}-trilha-conflito-encerrar`).focus();
      return false;
    }
  }

  lista.push(nova);
  return true;
}

function resolverConflitoTrilha(prefixo, lista, encerrarAnterior) {
  const pendente = pendenteTrilha[prefixo];
  if (!pendente) return;
  const { nova, indiceAnterior } = pendente;
  const anterior = lista[indiceAnterior];

  if (encerrarAnterior) {
    anterior.encerraEm = nova.tipo === 'estatico' ? nova.tempo : 0;
  }

  lista.push(nova);
  pendenteTrilha[prefixo] = null;
  $(`${prefixo}-trilha-conflito`).hidden = true;
  desenharTrilhas(prefixo, lista);

  falar(
    encerrarAnterior
      ? `"${anterior.nome}" vai encerrar quando "${nova.nome}" entrar. Trilha adicionada. Total: ${lista.length}.`
      : `As duas trilhas vão tocar juntas, terminando ao mesmo tempo. Trilha adicionada. Total: ${lista.length}.`
  );
}

function descreverFades(c) {
  if (c.fadeEntrada && c.fadeSaida) return 'com fade na entrada e na saída';
  if (c.fadeEntrada) return 'com fade só na entrada';
  if (c.fadeSaida) return 'com fade só na saída';
  return 'sem fade';
}

function desenharTrilhas(prefixo, lista) {
  const ul = $(`${prefixo}-lista-trilhas`);
  ul.innerHTML = '';

  if (!lista.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma trilha adicionada.';
    ul.appendChild(li);
    if (prefixo === 'c') atualizarRotuloBotaoCortar();
    return;
  }

  lista.forEach((c, i) => {
    const li = document.createElement('li');

    const desc = document.createElement('span');
    const volumeNome = (VOLUMES_TRILHA.find((v) => v.valor === c.volume) || {}).nome || `${Math.round(c.volume * 100)} por cento`;
    const fimContinua = c.encerraEm != null ? ' (encerra quando a próxima trilha contínua entrar)' : '';
    desc.textContent = c.tipo === 'loop'
      ? `Trilha ${i + 1} de ${lista.length}: ${c.nome}, em loop${fimContinua}, volume ${volumeNome}.`
      : c.repetir
        ? `Trilha ${i + 1} de ${lista.length}: ${c.nome}, começa em ${c.tempoTexto} e repete em loop até o fim do vídeo${fimContinua}, volume ${volumeNome}.`
        : `Trilha ${i + 1} de ${lista.length}: ${c.nome}, estática, começa em ${c.tempoTexto}, toca uma vez só, ${descreverFades(c)}, volume ${volumeNome}.`;
    li.appendChild(desc);

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Remover';
    b.setAttribute('aria-label', `Remover trilha ${i + 1}, ${c.nome}`);
    b.addEventListener('click', () => {
      lista.splice(i, 1);
      desenharTrilhas(prefixo, lista);
      falar(`Trilha removida. Restam ${lista.length}.`);
    });
    li.appendChild(b);

    ul.appendChild(li);
  });

  if (prefixo === 'c') atualizarRotuloBotaoCortar();
}

// 1.5: a tela Efeitos e trilhas, depois da gravação (ui/audio-cortes.js), usa estas mesmas
// funções do Montar vídeo, sem cópia nem mudança.
window.__trilhasMontar = { trilhaEstatica, trilhaComTempo, trilhaTipoReal, trilhaRepete, trilhaTempoLido, trilhaQuando, atualizarBlocoTempoTrilha, finalizarAdicaoTrilha, resolverConflitoTrilha, desenharTrilhas, atualizarBlocoFadeTrilha, isContinua, descreverFades, volumes: () => VOLUMES_TRILHA };

// --- Selecionar todos (descartes do Editar) ---

/** "3 de 5 silêncios selecionados." */
function resumoSelecao(lista, singular, plural) {
  const n = Selecao.selecionados(lista).length;
  if (n === lista.length) return lista.length === 1 ? `O ${singular} está selecionado.` : `Todos os ${lista.length} ${plural} selecionados.`;
  if (n === 0) return `Nenhum ${singular} selecionado.`;
  return `${n} de ${lista.length} ${plural} selecionados.`;
}

/** Mostra a caixa Selecionar todos só com lista, e reflete o estado dela. */
function atualizarCaixaTodos(id, lista) {
  const caixa = $(id);
  const est = Selecao.estadoTodos(lista);
  caixa.closest('.opcao').hidden = est === 'vazio';
  caixa.checked = est === 'todos';
  caixa.indeterminate = est === 'alguns';
}

function ligarSelecionarTodos({ idCaixa, idLista, lista, singular, plural, redesenhar }) {
  const alternar = async () => {
    const l = lista();
    if (!l.length) return falar(`Nenhum ${singular} na lista.`);
    // A lista é redesenhada: guarda onde o foco estava para devolvê-lo.
    const ul = $(idLista);
    const focaveis = () => [...ul.querySelectorAll('input, button')];
    const idx = focaveis().indexOf(document.activeElement);
    Selecao.alternarTodos(l);
    await redesenhar();
    if (idx >= 0) (focaveis()[idx] || $(idCaixa)).focus();
    falar(resumoSelecao(l, singular, plural));
  };
  $(idCaixa).addEventListener('change', alternar);
  // Ctrl A dentro da lista (ou na própria caixa): marca ou desmarca todos.
  [idLista, idCaixa].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyA' || (e.key || '').toLowerCase() === 'a')) {
        e.preventDefault();
        e.stopPropagation();
        alternar();
      }
    });
  });
}

$('btn-imagens').addEventListener('click', async () => {
  const novas = await window.api.escolherImagens();
  if (!novas.length) return;
  estado.imagens.push(...novas);
  desenharLista();
  falar(`${novas.length} imagem(ns) adicionada(s). Total: ${estado.imagens.length}. Conferindo o tamanho...`);

  await revalidarImagens(novas);
  const comAviso = novas.filter((c) => estado.avisosImagens[c] && !estado.avisosImagens[c].ignorado);
  desenharLista();

  // Poucas imagens: diz uma a uma, com a posição. Muitas: resume, senão o
  // leitor passaria um minuto lendo. A lista tem o detalhe de cada uma.
  const primeira = estado.imagens.length - novas.length;
  let fala;
  if (novas.length <= 3) {
    fala = novas
      .map((c, k) => `${nomeDoArquivo(c)}${infoImagem(c)}, posição ${primeira + k + 1}.`)
      .join(' ');
  } else {
    const conta = { horizontal: 0, vertical: 0, quadrada: 0 };
    novas.forEach((c) => {
      const d = estado.dimsImagens[c];
      if (d) conta[descreverProporcao(d.largura, d.altura).orientacao]++;
    });
    const partes = [];
    if (conta.horizontal) partes.push(`${conta.horizontal} horizontal(is)`);
    if (conta.vertical) partes.push(`${conta.vertical} vertical(is)`);
    if (conta.quadrada) partes.push(`${conta.quadrada} quadrada(s)`);
    fala = `${novas.length} imagens adicionadas: ${partes.join(', ')}. Total: ${estado.imagens.length}.`;
  }
  if (comAviso.length) {
    fala += comAviso.length === 1
      ? ' 1 imagem recém-adicionada tem um aviso — confira a lista.'
      : ` ${comAviso.length} imagens recém-adicionadas têm avisos — confira a lista.`;
  }
  falar(fala);
  // 1.9.3: depois do nome e da proporção, o que o programa viu em cada imagem. Com poucas imagens,
  // fala uma a uma; com muitas, deixa a descrição na lista, para não encher o ouvido.
  await descreverNovas(novas);
  desenharLista();
  if (novas.length <= 3) {
    const partes = novas.map((c, k) => estado.descImagens[c] ? `${nomeDoArquivo(c)}: ${estado.descImagens[c]}` : '').filter(Boolean);
    if (partes.length) falarDepois(partes.join(' '), 300);
  } else falarDepois('A descrição de cada imagem está na lista: luz, nitidez, cores, rostos e objetos.', 300);
});

// --- 1.9.3: descritor de imagens com o Gemma, experimental ---------------------------------------
const descritor = { instalado: false, ocupado: false, bipes: null, avisado: -1 };
const bipeDescritor = (tipo) => { if ((window.__olhoConfig || {}).confirmacao !== 'som' && window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(tipo); };
function comecarBipesDescritor() { pararBipesDescritor(); descritor.bipes = setInterval(() => bipeDescritor('andamento'), 4000); }
function pararBipesDescritor(fim) { if (descritor.bipes) { clearInterval(descritor.bipes); descritor.bipes = null; } if (fim) bipeDescritor('concluido'); }
function falarLimpo(msg) { $('status').textContent = ''; falarDepois(msg, 150); }
async function atualizarDescritor() {
  const r = await window.api.descritorEstado();
  descritor.instalado = !!(r && r.ok && r.valor.instalado);
  $('descritor-info').textContent = descritor.instalado
    ? 'Descritor de imagens instalado. Com o foco numa imagem da lista, Alt D descreve aquela imagem.'
    : 'Para descrever imagens com Alt D, instale o descritor em Extras, na tela inicial.';
  if (typeof atualizarExtras === 'function') atualizarExtras();
}
/** Baixa o descritor, com bipes e o andamento de 10 em 10 por cento. ui: { baixar, cancelar, barra }. */
async function baixarDescritor(ui) {
  if (descritor.ocupado || descritor.instalado) return;
  descritor.ocupado = true; descritor.avisado = -1;
  ui.baixar.disabled = true;
  ui.cancelar.hidden = false; ui.barra.hidden = false; ui.barra.value = 0;
  falar('Baixando o descritor de imagens.');
  comecarBipesDescritor();
  const solta = window.api.aoProgressoDescritor((p) => {
    ui.barra.value = p.pct;
    const degrau = Math.floor(p.pct / 10);
    if (degrau <= descritor.avisado || p.pct >= 100 || degrau < 1) return;
    descritor.avisado = degrau;
    falarLimpo(`Descritor: ${degrau * 10} por cento.`);
  });
  const r = await window.api.descritorBaixar();
  solta(); pararBipesDescritor(r.ok);
  descritor.ocupado = false;
  ui.cancelar.hidden = true; ui.barra.hidden = true;
  await atualizarDescritor();
  if (r.ok) falarLimpo('Descritor de imagens instalado.');
  else if (/CANCELADO/.test(r.erro || '')) falar('Download cancelado.');
  else falar('Não consegui baixar o descritor. ' + r.erro + ' Confira a internet e tente de novo.');
}
/** 3.0.3: sem o Gemma instalado, oferece baixar na hora. Devolve true se o download foi feito e o Gemma está pronto. */
function oferecerGemma() {
  return new Promise((resolve) => {
    if (descritor.ocupado) { falar('Aguarde, o descritor está trabalhando.'); return resolve(false); }
    const dlg = $('gemma-dlg');
    let quer = false;
    const antes = document.activeElement;
    $('gemma-dlg-baixar').onclick = () => { quer = true; dlg.close(); };
    $('gemma-dlg-nao').onclick = () => dlg.close();
    dlg.onclose = async () => {
      if (antes && document.contains(antes)) antes.focus();
      if (!quer) { falar('Certo, sem baixar.'); return resolve(false); }
      await baixarDescritor({ baixar: $('ex-ds-baixar'), cancelar: $('ex-ds-cancelar-baixar'), barra: $('ex-ds-barra') });
      resolve(descritor.instalado);
    };
    dlg.showModal();
    $('gemma-dlg-baixar').focus();
    falar('O Gemma, que descreve imagens, não está instalado. Baixar agora?');
  });
}
/** Pede a descrição ao Gemma, com bipes. Devolve { ok, texto } ou { ok: false, erro, cancelado }. */
async function pedirDescricao(caminho, modo, contexto) {
  descritor.ocupado = true;
  comecarBipesDescritor();
  const r = await window.api.descritorDescrever({ caminho, idioma: (window.__olhoConfig || {}).idiomaDescricao || 'pt', modo, contexto });
  pararBipesDescritor(r.ok);
  descritor.ocupado = false;
  if (!r.ok) return { ok: false, erro: r.erro, cancelado: /CANCELADO/.test(r.erro || '') };
  estado.descModelo[caminho] = r.valor.texto;
  return { ok: true, texto: r.valor.texto };
}
/** Descreve com o Gemma a imagem em foco. A frase sai direto, sem aviso na frente. */
async function descreverComModelo(caminho) {
  if (!caminho) return;
  if (descritor.ocupado) return falar('Aguarde, o descritor está trabalhando.');
  if (!descritor.instalado) { if (await oferecerGemma()) falar('Gemma instalado. Aperte de novo para descrever.'); return; }
  falar(`Descrevendo ${nomeDoArquivo(caminho)}.`);
  const r = await pedirDescricao(caminho);
  if (!r.ok) return falar(r.cancelado ? 'Descrição cancelada.' : 'Não consegui descrever a imagem. ' + r.erro);
  desenharLista();
  falarLimpo(r.texto);
  return r.texto;
}
// 1.9.6: na etapa Imagens. Alt I adiciona (como sempre), Alt D descreve a imagem, Alt L muda a posição
// dela e Delete remove. A imagem é a que está em foco; no modo de leitura do NVDA o foco do teclado não
// anda junto, então vale também o cursor de leitura (seleção) e, fora do modo manual, a última em foco.
let ultimaImagemFocada = null;
document.addEventListener('focusin', (e) => {
  const li = e.target && e.target.closest ? e.target.closest('#lista-imagens li') : null;
  if (li) ultimaImagemFocada = li.dataset.caminho;
});
function imagemDaLista(comUltima) {
  const ate = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest('#lista-imagens li') : null; };
  const li = ate(document.activeElement) || ate((window.getSelection() || {}).anchorNode);
  if (li) return li.dataset.caminho;
  if (comUltima && ultimaImagemFocada && estado.imagens.includes(ultimaImagemFocada)) return ultimaImagemFocada;
  if (comUltima && estado.imagens.length === 1) return estado.imagens[0];
  return null;
}
function perguntarPosicao(i) {
  const n = estado.imagens.length;
  const dlg = $('pos-dlg'), campo = $('pos-dlg-num');
  if (dlg.open) return;
  $('pos-dlg-info').textContent = `${nomeDoArquivo(estado.imagens[i])}, agora na posição ${i + 1} de ${n}.`;
  $('pos-dlg-rotulo').textContent = `Qual o número da posição desta imagem, de 1 a ${n}?`;
  campo.min = 1; campo.max = n; campo.value = String(i + 1);
  let resposta = null;
  const antes = document.activeElement;
  const confirmar = () => {
    const v = Number(campo.value);
    if (!Number.isInteger(v) || v < 1 || v > n) { falar(`Digite um número de 1 a ${n}.`); campo.focus(); return; }
    resposta = v; dlg.close();
  };
  $('pos-dlg-ok').onclick = confirmar;
  $('pos-dlg-cancelar').onclick = () => dlg.close();
  campo.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); confirmar(); } };
  dlg.onclose = () => {
    if (resposta) { moverPara(i, resposta - 1); return; }
    falar('A posição não mudou.');
    if (antes && document.contains(antes)) antes.focus();
  };
  dlg.showModal();
  campo.focus(); campo.select();
  falar(`Qual o número da posição desta imagem, de 1 a ${n}? Agora é a ${i + 1}.`);
}
document.addEventListener('keydown', (e) => {
  if (telaAtual() !== 'gerar') return;
  const etapa = $('g-etapa-3');
  if (!etapa || etapa.hidden || $('pos-dlg').open) return;
  const soAlt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const manual = modoManualAtivo();
  if (soAlt && e.code === 'KeyD') {
    const caminho = imagemDaLista(!manual);
    if (!caminho) {
      if (estado.imagens.length) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) falar('Para descrever, ponha o foco numa imagem da lista, com Tab, e aperte Alt D.'); }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) descreverComModelo(caminho);
  } else if (soAlt && e.code === 'KeyL') {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (!estado.imagens.length) return falar('Não há imagens na lista.');
    const caminho = imagemDaLista(true);
    if (!caminho) return falar('Ponha o foco numa imagem da lista, com Tab, e aperte Alt L.');
    perguntarPosicao(estado.imagens.indexOf(caminho));
  } else if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'Delete') {
    const caminho = imagemDaLista(false);
    if (!caminho) return;
    e.preventDefault(); e.stopImmediatePropagation();
    remover(estado.imagens.indexOf(caminho));
  }
}, true);
atualizarDescritor();

$('btn-limpar-imagens').addEventListener('click', () => {
  if (!estado.imagens.length) return falar('A lista já está vazia.');
  const antigas = estado.imagens;
  estado.imagens = [];
  // Só apaga o aviso de quem não está também marcada no modo manual.
  antigas.forEach((caminho) => {
    if (!imagemEstaEmUso(caminho)) delete estado.avisosImagens[caminho];
  });
  desenharLista();
  falar('Todas as imagens foram removidas.');
});

$('preset').addEventListener('change', () => {
  const p = estado.presets.find((x) => x.id === $('preset').value);
  $('descricao-preset').textContent = p ? p.descricao : '';
  atualizarPrevia();
});

document.querySelectorAll('input[name="modo"]').forEach((r) => {
  r.addEventListener('change', atualizarPrevia);
});

$('btn-gerar').addEventListener('click', async () => {
  if (estado.rodando) return;
  if (!estado.audio) return falar(mensagemSemAudio());
  if (!estado.audioPronto) return falar('Primeiro o áudio: na Etapa 1, use Salvar e continuar para passar pelas etapas de áudio.');

  const semImagens = semImagensAtivo();
  const manual = !semImagens && modoManualAtivo();
  const imagensParaGerar = semImagens ? [] : manual
    ? estado.manualImagens.map((m) => m.caminho)
    : estado.imagens;

  if (semImagens && !$('titulo-simples').value.trim()) {
    return falar('Sem imagens, o título do vídeo é obrigatório. Escreva o título na etapa Orientação e título.');
  }

  if (!semImagens && !imagensParaGerar.length) {
    return falar(manual ? 'Marque pelo menos uma imagem ouvindo o áudio.' : 'Adicione pelo menos uma imagem.');
  }
  if (!semImagens && manual && estado.manualImagens[0].tempo > 0.05) {
    return falar('A primeira imagem marcada precisa estar em 00:00:00.');
  }

  // Confere os textos antes de pedir o arquivo de saída: é chato escolher onde
  // salvar e só então descobrir que um título estava grande demais.
  const simples = $('titulo-simples').value.trim();
  // Sem imagens, o título do vídeo é a própria tela; não entra de novo como
  // texto por cima dela.
  const titulosParaGerar = (simples && !semImagens
    ? [{ texto: simples, tempo: 0 }]
    : []
  ).concat(estado.titulos.map((t) => ({
    texto: t.texto,
    tempo: t.segundos,
    trocarPreset: t.trocarPreset || undefined
  })));

  const checagem = await window.api.conferirTitulos({
    titulos: titulosParaGerar,
    fim: $('texto-fim').value,
    duracaoAudio: estado.duracaoAudio,
    formatoId: $('formato').value,
    presetId: $('preset').value
  });

  if (checagem.erros.length) {
    return falar('Não dá pra montar ainda. ' + checagem.erros.join(' '));
  }
  if (checagem.avisos.length) {
    falar(checagem.avisos.join(' '));
  }

  const sugestao = nomeDoArquivo(estado.audios.length ? estado.audios[0].caminho : estado.audio).replace(/\.[^.]+$/, '') + '.mp4';
  const saida = await window.api.escolherSaida(sugestao);
  if (!saida) return falar('Montagem cancelada: nenhum arquivo de saída escolhido.');

  const config = {
    audio: estado.audio,
    imagens: imagensParaGerar.slice(),
    marcas: manual ? estado.manualImagens.map((m) => m.tempo) : undefined,
    modo: semImagens ? 'distribuir' : document.querySelector('input[name="modo"]:checked').value,
    presetId: $('preset').value,
    formatoId: $('formato').value,
    qualidadeId: $('qualidade').value,
    titulos: titulosParaGerar,
    fim: $('texto-fim').value.trim(),
    camadas: estado.camadas.map((c) => ({ arquivo: c.arquivo, tipo: c.tipo, tempo: c.tempo, repetir: c.repetir || undefined, encerraEm: c.encerraEm, fadeEntrada: c.fadeEntrada, fadeSaida: c.fadeSaida, volume: c.volume })),
    legenda: estado.legenda,
    legendaEstilo: estado.legenda ? estado.legendaEstilo : undefined,
    logos: estado.logos.length ? estado.logos.map((l) => ({ ...l })) : undefined,
    semImagens: semImagens || undefined,
    tituloFixo: semImagens ? simples : undefined,
    saida
  };

  travar(true);
  falar('Começando a montar. Isso pode demorar bastante em áudio longo.');

  const r = await window.api.iniciarRender(config);
  travar(false);

  if (r.ok) {
    estado.ultimaSaida = r.saida;
    $('progresso').value = 100;
    $('btn-abrir').hidden = false;
    falar(`Pronto. Vídeo salvo em ${nomeDoArquivo(r.saida)}, ${formatarTempo(r.duracao)}.`);
    $('btn-abrir').focus();
  } else if (r.cancelado) {
    falar('Montagem cancelada.');
    $('btn-gerar').focus();
  } else {
    falar('Deu erro: ' + r.erro);
    $('btn-gerar').focus();
  }
});

$('btn-cancelar').addEventListener('click', async () => {
  await window.api.cancelarRender();
  falar('Cancelando...');
});

$('btn-abrir').addEventListener('click', () => {
  if (estado.ultimaSaida) window.api.abrirPasta(estado.ultimaSaida);
});

function travar(rodando) {
  estado.rodando = rodando;
  $('btn-gerar').disabled = rodando;
  $('btn-cancelar').disabled = !rodando;
  $('btn-audio').disabled = rodando;
  $('btn-add-audio').disabled = rodando;
  desenharAudios();
  $('g-abrir-legenda').disabled = rodando;
  $('g-btn-tirar-legenda').disabled = rodando;
  $('btn-imagens').disabled = rodando;
  $('btn-limpar-imagens').disabled = rodando;
  $('preset').disabled = rodando;
  document.querySelectorAll('input[name="preset-escolha"]').forEach((r) => { r.disabled = rodando; });
  $('formato').disabled = rodando;
  $('qualidade').disabled = rodando;
  $('btn-add-titulo').disabled = rodando;
  $('titulo-texto').disabled = rodando;
  $('titulo-tempo').disabled = rodando;
  $('texto-fim').disabled = rodando;
  $('titulo-simples').disabled = rodando;
  $('g-sem-imagens').disabled = rodando;
  ['l-btn-arquivo', 'l-modo', 'l-inicio', 'l-fim', 'l-btn-add'].forEach((id) => { $(id).disabled = rodando; });
  document.querySelectorAll('#g-etapas button, .etapa-botoes button').forEach((b) => { b.disabled = rodando; });
  if (rodando) {
    $('btn-abrir').hidden = true;
    $('progresso').value = 0;
  }
}

// --- Progresso ---------------------------------------------------------------

let ultimoAnuncio = 0;

window.api.aoProgresso((p) => {
  if (p.etapa === 'cortando') {
    $('c-progresso').value = p.feito;
    if (p.texto) falar(p.texto);
    return;
  }
  if (p.etapa === 'legenda') {
    // Gravar a legenda é sempre a etapa mais lenta quando existe — por isso
    // ganha uma fatia generosa (os últimos 30%) em vez de entrar na conta
    // genérica de pesos: sem isso, a barra ficava presa em 0 por todo esse
    // tempo, dando a impressão de que o programa tinha travado.
    const barra = corte.rodando ? $('c-progresso') : $('progresso');
    barra.value = Math.min(100, Math.round(70 + (p.feito / 100) * 30));
    if (p.texto) falar(comPorcento(p.texto, barra.value));
    return;
  }
  const pesos = { preparando: 2, normalizando: 8, segmentos: 80, medindo: 25, trechos: 60, juntando: 5, trilha: 8, logo: 4 };
  let base = 0;
  if (p.etapa === 'normalizando') base = pesos.preparando;
  else if (p.etapa === 'segmentos') base = pesos.preparando + pesos.normalizando;
  else if (p.etapa === 'medindo') base = pesos.preparando;
  else if (p.etapa === 'trechos') base = pesos.preparando + pesos.medindo;
  else if (p.etapa === 'juntando') base = 88;
  else if (p.etapa === 'trilha') base = 92;
  else if (p.etapa === 'logo') base = 96;
  else if (p.etapa === 'pronto') base = 100;

  const fatia = pesos[p.etapa] || 0;
  const pct = p.etapa === 'pronto' ? 100 : base + (p.total ? (p.feito / p.total) * fatia : 0);
  const barra = corte.rodando ? $('c-progresso') : juntar.rodando ? $('j-progresso') : $('progresso');
  barra.value = Math.min(100, Math.round(pct));

  // Fala no máximo uma vez a cada 4 segundos, senão o NVDA vira uma metralhadora
  // durante um render de meia hora. Etapas curtas sempre falam.
  const agora = Date.now();
  const importante = p.etapa !== 'segmentos';
  if (importante || agora - ultimoAnuncio > 4000) {
    ultimoAnuncio = agora;
    falar(comPorcento(p.texto, barra.value));
  }
});

/** Toda operação longa diz em que ponto está, em por cento. */
function comPorcento(texto, pct) {
  const t = String(texto || '').trim();
  if (!t || /por cento|%/.test(t)) return t;
  // Frase de aviso já completa (por exemplo, "nada a ajustar"): fica como está.
  if (/[.!]$/.test(t) && !/\.\.\.$/.test(t)) return t;
  return `${t.replace(/[.…]+$/, '')}: ${Math.max(0, Math.min(100, Math.round(pct || 0)))} por cento.`;
}

// --- Juntar vídeos -----------------------------------------------------------

const juntar = { videos: [], camadas: [], trilhaEscolhida: null, rodando: false, ultimaSaida: null };

function desenharVideos() {
  const ul = $('j-lista');
  ul.innerHTML = '';

  $('j-info').textContent = juntar.videos.length
    ? `${juntar.videos.length} vídeo(s) na lista.`
    : 'Nenhum vídeo adicionado.';

  juntar.videos.forEach((v, i) => {
    const li = document.createElement('li');

    const nome = document.createElement('span');
    nome.textContent = `Vídeo ${i + 1} de ${juntar.videos.length}: ${nomeDoArquivo(v.caminho)}`;
    li.appendChild(nome);

    // Título de cada trecho vive dentro do próprio item da lista: assim o
    // campo e o vídeo a que ele pertence ficam juntos na navegação por Tab.
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.value = v.titulo || '';
    campo.setAttribute('aria-label',
      `Título do vídeo ${i + 1}, ${nomeDoArquivo(v.caminho)}, opcional`);
    campo.placeholder = 'Título (opcional)';
    campo.addEventListener('input', () => { v.titulo = campo.value; });
    li.appendChild(campo);

    const acoes = document.createElement('span');
    acoes.className = 'acoes';

    const botao = (rotulo, desativado, aoClicar) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = rotulo;
      b.setAttribute('aria-label', `${rotulo} vídeo ${i + 1}, ${nomeDoArquivo(v.caminho)}`);
      b.disabled = desativado;
      b.addEventListener('click', aoClicar);
      acoes.appendChild(b);
    };

    botao('Subir', i === 0, () => {
      [juntar.videos[i - 1], juntar.videos[i]] = [juntar.videos[i], juntar.videos[i - 1]];
      desenharVideos();
      falar(`${nomeDoArquivo(v.caminho)} agora é o vídeo ${i}.`);
    });
    botao('Descer', i === juntar.videos.length - 1, () => {
      [juntar.videos[i + 1], juntar.videos[i]] = [juntar.videos[i], juntar.videos[i + 1]];
      desenharVideos();
      falar(`${nomeDoArquivo(v.caminho)} agora é o vídeo ${i + 2}.`);
    });
    botao('Remover', false, () => {
      juntar.videos.splice(i, 1);
      desenharVideos();
      falar(`Removido. Restam ${juntar.videos.length}.`);
      $('j-btn-add').focus();
    });

    li.appendChild(acoes);
    ul.appendChild(li);
  });
}

$('j-btn-add').addEventListener('click', async () => {
  const novos = await window.api.escolherVideos();
  if (!novos.length) return;
  novos.forEach((caminho) => juntar.videos.push({ caminho, titulo: '' }));
  desenharVideos();
  falar(`${novos.length} vídeo(s) adicionado(s). Total: ${juntar.videos.length}.`);
});

$('j-btn-limpar').addEventListener('click', () => {
  if (!juntar.videos.length) return falar('A lista já está vazia.');
  juntar.videos = [];
  desenharVideos();
  falar('Todos os vídeos foram removidos.');
});

/**
 * Análise sob demanda. É o "olho emprestado": diz o que vai acontecer com cada
 * arquivo antes de gastar tempo gerando.
 */
async function conferirVideos(silencioSeLimpo) {
  if (!juntar.videos.length) {
    falar('Adicione vídeos primeiro.');
    return null;
  }

  falar('Analisando...');
  const r = await window.api.analisarVideos({
    caminhos: juntar.videos.map((v) => v.caminho),
    formatoId: $('j-formato').value
  });

  if (r.erro) {
    falar('Não consegui analisar: ' + r.erro);
    return null;
  }

  if (r.erros.length) {
    falar(r.erros.join(' '));
    return null;
  }

  if (r.relatorio.length) {
    falar(`${juntar.videos.length} vídeos, ${formatarTempo(r.duracaoTotal)} no total. ` +
          r.relatorio.join(' '));
  } else if (!silencioSeLimpo) {
    falar(`${juntar.videos.length} vídeos, ${formatarTempo(r.duracaoTotal)} no total. ` +
          'Todos compatíveis, nada a ajustar.');
  }

  return r;
}

$('j-btn-conferir').addEventListener('click', () => conferirVideos(false));

// --- Trilha ------------------------------------------------------------------

// Percentuais nomeados em vez de um controle deslizante: dá pra escolher de
// ouvido, sem depender de saber onde o cursor parou.
// Testamos três níveis e a Joy decidiu: só o equilibrado vale a pena ter —
// o sutil não tira silêncio suficiente pra justificar existir, e o agressivo
// arrisca cortar o começo de uma palavra. Por isso nem aparece como escolha
// na tela: é sempre este.
const NIVEL_SILENCIO_PADRAO = { limiarDb: -30, duracaoMinima: 0.6, margem: 0.15 };

function nivelSilencioEscolhido() {
  return NIVEL_SILENCIO_PADRAO;
}

const VOLUMES_TRILHA = [
  { valor: 0.06, nome: 'Bem baixa, 6 por cento' },
  { valor: 0.1, nome: 'Baixa, 10 por cento' },
  { valor: 0.18, nome: 'Média, 18 por cento' },
  { valor: 0.3, nome: 'Alta, 30 por cento' }
];


$('j-btn-trilha-arquivo').addEventListener('click', async () => {
  const r = await window.api.escolherAudio();
  if (!r) return;
  juntar.trilhaEscolhida = r.caminho;
  $('j-trilha-arquivo-info').textContent = r.duracao
    ? `${nomeDoArquivo(r.caminho)}, ${formatarTempo(r.duracao)}.`
    : nomeDoArquivo(r.caminho);
  falar(`Arquivo escolhido: ${nomeDoArquivo(r.caminho)}.`);
});

$('j-btn-add-trilha').addEventListener('click', async () => {
  if (!juntar.trilhaEscolhida) return falar('Escolha um arquivo de trilha antes de adicionar.');

  const tipo = trilhaTipoReal('j');
  let tempo = 0;
  let tempoTexto = '';
  let repetir = false;

  if (tipo === 'estatico') {
    const segundos = await trilhaTempoLido('j');
    if (segundos === null) {
      return falar('Não entendi o tempo de início da trilha. Use hora, minuto e segundo, como 00:03:20.');
    }
    tempo = segundos;
    tempoTexto = await window.api.escreverTempo(segundos);
    repetir = trilhaRepete('j');
  }

  const volume = parseFloat($('j-trilha-volume').value);
  const arquivo = juntar.trilhaEscolhida;
  const nome = nomeDoArquivo(arquivo);
  const nova = {
    arquivo, nome, tipo, tempo, tempoTexto, repetir, volume,
    fadeEntrada: $('j-trilha-fade-entrada').checked,
    fadeSaida: $('j-trilha-fade-saida').checked
  };

  const adicionou = finalizarAdicaoTrilha('j', juntar.camadas, nova);
  if (adicionou) {
    desenharTrilhas('j', juntar.camadas);
    falar(
      tipo === 'loop'
        ? `Trilha em loop adicionada: ${nome}. Total: ${juntar.camadas.length}.`
        : repetir
          ? `Trilha adicionada: ${nome}, começando em ${tempoTexto} e repetindo até o fim do vídeo. Total: ${juntar.camadas.length}.`
          : `Trilha estática adicionada: ${nome}, ${trilhaQuando('j', tempoTexto)}, tocando uma vez só. Total: ${juntar.camadas.length}.`
    );
  }

  juntar.trilhaEscolhida = null;
  $('j-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('j-trilha-tempo').value = '00:00:00';
  $('j-trilha-fade-entrada').checked = true;
  $('j-trilha-fade-saida').checked = true;
  atualizarBlocoFadeTrilha('j');
});

$('j-trilha-conflito-encerrar').addEventListener('click', () => resolverConflitoTrilha('j', juntar.camadas, true));
$('j-trilha-conflito-sobrepor').addEventListener('click', () => resolverConflitoTrilha('j', juntar.camadas, false));

$('j-trilha-tempo').addEventListener('blur', async () => {
  const seg = await window.api.lerTempo($('j-trilha-tempo').value);
  if (seg !== null) $('j-trilha-tempo').value = await window.api.escreverTempo(seg);
});

$('j-btn-juntar').addEventListener('click', async () => {
  if (juntar.rodando) return;

  const analise = await conferirVideos(true);
  if (!analise) return;

  const saida = await window.api.escolherSaida('video-juntado.mp4');
  if (!saida) return falar('Cancelado: nenhum arquivo de saída escolhido.');

  travarJuntar(true);
  falar('Começando a juntar.');

  const r = await window.api.juntarVideos({
    videos: juntar.videos.map((v) => ({ caminho: v.caminho, titulo: v.titulo })),
    fim: $('j-texto-fim').value.trim(),
    presetId: $('j-preset').value,
    formatoId: $('j-formato').value,
    qualidadeId: $('j-qualidade').value,
    nivelar: $('j-nivelar').checked,
    camadas: juntar.camadas.map((c) => ({ arquivo: c.arquivo, tipo: c.tipo, tempo: c.tempo, repetir: c.repetir || undefined, encerraEm: c.encerraEm, fadeEntrada: c.fadeEntrada, fadeSaida: c.fadeSaida, volume: c.volume })),
    saida
  });

  travarJuntar(false);

  if (r.ok) {
    juntar.ultimaSaida = r.saida;
    $('j-progresso').value = 100;
    $('j-btn-abrir').hidden = false;
    falar(`Pronto. ${r.trechos} trechos, ${formatarTempo(r.duracao)}, salvo em ${nomeDoArquivo(r.saida)}.`);
    $('j-btn-abrir').focus();
  } else if (r.cancelado) {
    falar('Cancelado.');
    $('j-btn-juntar').focus();
  } else {
    falar('Deu erro: ' + r.erro);
    $('j-btn-juntar').focus();
  }
});

$('j-btn-cancelar').addEventListener('click', async () => {
  await window.api.cancelarRender();
  falar('Cancelando...');
});

$('j-btn-abrir').addEventListener('click', () => {
  if (juntar.ultimaSaida) window.api.abrirPasta(juntar.ultimaSaida);
});

$('j-texto-fim').addEventListener('input', () => {
  const formato = $('j-formato').value || 'horizontal';
  const lim = estado.limites && estado.limites[formato];
  const limite = lim ? lim.fim : 30;
  const usado = $('j-texto-fim').value.trim().length;
  const alvo = $('j-fim-contador');
  alvo.textContent = usado > limite
    ? `${usado} de ${limite} caracteres. Passou ${usado - limite}.`
    : `${usado} de ${limite} caracteres.`;
  if (usado > limite) alvo.setAttribute('role', 'alert');
  else alvo.removeAttribute('role');
});

function travarJuntar(rodando) {
  juntar.rodando = rodando;
  estado.juntando = rodando;
  ['j-btn-juntar', 'j-btn-add', 'j-btn-limpar', 'j-btn-conferir',
   'j-preset', 'j-formato', 'j-qualidade', 'j-texto-fim', 'j-nivelar',
   'j-btn-trilha-arquivo', 'j-btn-add-trilha', 'j-trilha-tipo-loop',
   'j-trilha-tipo-estatico', 'j-trilha-tempo', 'j-trilha-volume',
   'j-trilha-inicio-comeco', 'j-trilha-inicio-tempo', 'j-trilha-fade-entrada', 'j-trilha-fade-saida'].forEach((id) => {
    $(id).disabled = rodando;
  });
  $('j-btn-cancelar').disabled = !rodando;
  if (rodando) {
    $('j-btn-abrir').hidden = true;
    $('j-progresso').value = 0;
  }
}

// --- Cortar vídeo ------------------------------------------------------------

const corte = {
  video: null,        // { caminho, url, duracao, temAudio }
  descartes: [],      // { inicio, fim } em segundos
  legenda: null,      // caminho do arquivo de legenda, ou null
  camadas: [],        // trilhas de fundo adicionadas
  trilhaEscolhida: null,
  rodando: false,
  resultado: null,    // { saida, url }
  ouvindo: 'original', // qual arquivo está carregado no tocador
  salto: 5,           // segundos de cada voltar e avançar (F2 muda)
  marcas: Marcas.criar(), // trechos marcados com Alt I / Alt F, em lote
  historico: [],      // lotes de descartes adicionados, para o Alt Z desfazer
  formatoTrecho: 'horizontal' // última escolha do Alt S
};

/** O botão Salvar vídeo grava o vídeo com descartes, trilhas e legenda. */
function atualizarRotuloBotaoCortar() {
  $('c-btn-cortar').textContent = 'Salvar vídeo';
}

/** Só os descartes marcados na lista entram no vídeo e no áudio salvos. */
const descartesAtivos = () => Selecao.selecionados(corte.descartes);

const player = () => $('c-player');

/** Tempo com décimo de segundo, vírgula decimal, sempre com hora. */
function tempoPreciso(seg) {
  const t = Math.max(0, seg);
  const decimos = Math.round(t * 10);
  const h = Math.floor(decimos / 36000);
  const m = Math.floor((decimos % 36000) / 600);
  const s = Math.floor((decimos % 600) / 10);
  const d = decimos % 10;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${d}`;
}

/**
 * Aceita "00:03:21,4", "3:21.4", "3:21" e "21,4". A forma curta segue o
 * costume dos contadores: "3:21" é minuto e segundo.
 */
/**
 * Confere um tropeço específico: dois-pontos no lugar da vírgula.
 * "14:9" é lido como 14 minutos e 9 segundos, não 14,9 segundos — e como o
 * rótulo do campo mostra "hora:minuto:segundo", é fácil digitar dois-pontos
 * por hábito onde a vírgula era o certo. Sinal forte: o último grupo depois
 * do dois-pontos tem só um dígito, o que quase nunca é um segundo de verdade
 * (seria "09", não "9").
 */
function pareceTropecoDoisPontos(texto) {
  const partes = String(texto || '').trim().split(':');
  if (partes.length < 2) return false;
  return partes[partes.length - 1].length === 1;
}

function lerTempoPreciso(texto) {
  const limpo = String(texto || '').trim().replace(',', '.');
  if (!/^\d{1,2}(:\d{1,2}){0,2}(\.\d+)?$/.test(limpo)) return null;
  const [inteiro, fracao] = limpo.split('.');
  const partes = inteiro.split(':').map(Number);
  let h = 0, m = 0, s = 0;
  if (partes.length === 3) [h, m, s] = partes;
  else if (partes.length === 2) [m, s] = partes;
  else [s] = partes;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s + (fracao ? Number('0.' + fracao) : 0);
}

/** Duração falada: "3 minutos e 12 segundos" em vez de números soltos. */
function duracaoFalada(seg) {
  const t = Math.round(seg * 10) / 10;
  const m = Math.floor(t / 60);
  const s = Math.round((t % 60) * 10) / 10;
  const sTxt = String(s).replace('.', ',');
  if (m && s) return `${m} minuto${m > 1 ? 's' : ''} e ${sTxt} segundos`;
  if (m) return `${m} minuto${m > 1 ? 's' : ''}`;
  return `${sTxt} segundos`;
}

// --- Tocador ---

let emendaAtiva = null;

function pararEmenda() {
  if (emendaAtiva) {
    cancelAnimationFrame(emendaAtiva);
    emendaAtiva = null;
  }
}

function pararTudoNoPlayer() {
  pararEmenda();
  try { player().pause(); } catch (_) {}
}

function exigirVideo() {
  if (!corte.video) {
    falar('Escolha um vídeo primeiro.');
    return false;
  }
  return true;
}

$('c-btn-video').addEventListener('click', async () => {
  const r = await window.api.escolherVideo();
  if (!r) return;
  if (r.erro) return falar('Não consegui abrir: ' + r.erro);

  pararTudoNoPlayer();
  corte.video = r;
  corte.descartes = [];
  corte.legenda = null;
  corte.camadas = [];
  corte.trilhaEscolhida = null;
  corte.resultado = null;
  corte.ouvindo = 'original';
  player().src = r.url;

  $('c-info').textContent =
    `${nomeDoArquivo(r.caminho)}, ${tempoPreciso(r.duracao)}` +
    (r.temAudio ? '.' : '. Atenção: este vídeo não tem áudio.');
  Marcas.limpar(corte.marcas);
  corte.historico = [];
  $('c-info-srt').textContent = 'Nenhuma legenda escolhida.';
  $('c-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('c-trilha-tempo').value = '00:00:00';
  carregarNoCorte(r);
  falar(`Vídeo carregado: ${nomeDoArquivo(r.caminho)}, ${duracaoFalada(r.duracao)}.`);
});

/** Parte comum de carregar um vídeo no Editar (pela janela de escolha ou vindo do Gravar/Melhorar). */
function carregarNoCorte(r) {
  $('c-silencio-status').textContent = '';
  $('c-btn-resultado').hidden = true;
  $('c-btn-original').hidden = true;
  $('c-btn-abrir').hidden = true;
  pararOuvirAjuste();
  corte.ajuste = ajusteNeutroNovo();
  mostrarAjusteCorte();
  atualizarRotuloBotaoCortar();
  desenharDescartes();
  desenharTrilhas('c', corte.camadas);
}

/** Abre um arquivo no Editar sem janela de escolha (a gravação ou o vídeo melhorado). */
async function abrirNoEditar(caminho) {
  if (corte.rodando) return falar('O Editar vídeo está salvando outro vídeo. Espere terminar.');
  const r = await window.api.abrirVideoPorCaminho(caminho);
  if (!r || r.erro) return falar('Não consegui abrir no Editar vídeo: ' + (r ? r.erro : 'erro desconhecido.'));
  mostrarTela('cortar');
  pararTudoNoPlayer();
  corte.video = r;
  corte.descartes = [];
  corte.legenda = null;
  corte.camadas = [];
  corte.trilhaEscolhida = null;
  corte.resultado = null;
  corte.ouvindo = 'original';
  player().src = r.url;
  $('c-info').textContent = `${nomeDoArquivo(r.caminho)}, ${tempoPreciso(r.duracao)}` + (r.temAudio ? '.' : '. Atenção: este vídeo não tem áudio.');
  Marcas.limpar(corte.marcas);
  corte.historico = [];
  $('c-info-srt').textContent = 'Nenhuma legenda escolhida.';
  $('c-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('c-trilha-tempo').value = '00:00:00';
  carregarNoCorte(r);
  setTimeout(() => falar(`Editar vídeo, com o vídeo ${nomeDoArquivo(r.caminho)} carregado, ${duracaoFalada(r.duracao)}. Alt H lista os atalhos.`), 300);
}

// Não é possível tocar enquanto o tocador ainda não sabe a própria duração.
player().addEventListener('error', () => {
  falar('O tocador não conseguiu abrir este formato. O corte ainda funciona, ' +
        'mas não dá para ouvir aqui dentro. Formatos que tocam bem: MP4 e WebM.');
});

player().addEventListener('ended', () => {
  pararEmenda();
  falar('Fim do vídeo.');
});

$('c-tocar').addEventListener('click', () => {
  if (!exigirVideo()) return;
  pararEmenda();
  pararOuvirAjuste();
  const p = player();
  if (p.paused) {
    p.play().then(() => falar('Tocando.')).catch(() => falar('Não consegui tocar.'));
  } else {
    p.pause();
    falar(`Pausado em ${tempoPreciso(p.currentTime)}.`);
  }
});

// --- Salto configurável (F2) ---

/** "5 segundos", "1 minuto", "1 minuto e 30 segundos". */
function descricaoSalto(seg) {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  const mTxt = m ? `${m} minuto${m > 1 ? 's' : ''}` : '';
  const sTxt = s ? `${s} segundo${s > 1 ? 's' : ''}` : '';
  return [mTxt, sTxt].filter(Boolean).join(' e ') || '0 segundos';
}

/** Rótulos de voltar e avançar acompanham o salto escolhido. */
function atualizarRotulosSalto() {
  const d = descricaoSalto(corte.salto);
  $('c-voltar').textContent = `Voltar ${d}`;
  $('c-avancar').textContent = `Avançar ${d}`;
}

/** Tempo falado curto: "1:20", "1:20,5", "1:02:03". */
function tempoCurto(seg) {
  const decimos = Math.round(Math.max(0, seg) * 10);
  const h = Math.floor(decimos / 36000);
  const m = Math.floor((decimos % 36000) / 600);
  const s = Math.floor((decimos % 600) / 10);
  const d = decimos % 10;
  const pad = (n) => String(n).padStart(2, '0');
  const base = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return d ? `${base},${d}` : base;
}

function pular(delta) {
  if (!exigirVideo()) return;
  pararEmenda();
  const p = player();
  p.currentTime = Math.min(Math.max(0, p.currentTime + delta), p.duration || 0);
  falar(tempoPreciso(p.currentTime));
}

$('c-voltar').addEventListener('click', () => pular(-corte.salto));
$('c-avancar').addEventListener('click', () => pular(corte.salto));
/** O (ou Alt O): onde o vídeo está e o que está marcado. Só pelo teclado. */
function ondeEstou() {
  if (!exigirVideo()) return;
  const p = player();
  const onde = corte.ouvindo === 'resultado' ? ' no resultado' : '';
  falar(`${tempoPreciso(p.currentTime)}${onde}, de ${tempoPreciso(p.duration || 0)}. ${resumoMarcas()}`);
}

// --- Marcação em lote (Alt I, Alt F, Delete, Alt S, Alt Z) ---

function podeMarcar() {
  if (!exigirVideo()) return false;
  if (corte.ouvindo === 'resultado') {
    falar('Você está ouvindo o resultado. Volte ao vídeo original para marcar.');
    return false;
  }
  return true;
}

/** "2 trechos marcados. Início aberto em 10:00, ainda sem fim." */
function resumoMarcas() {
  const n = corte.marcas.trechos.length;
  let txt = n === 0 ? 'Nenhum trecho marcado.' : n === 1 ? '1 trecho marcado.' : `${n} trechos marcados.`;
  if (corte.marcas.inicioAberto !== null) {
    txt += ` Início aberto em ${tempoCurto(corte.marcas.inicioAberto)}, ainda sem fim.`;
  }
  return txt;
}

function avisoInicioAberto() {
  return corte.marcas.inicioAberto !== null
    ? ` O início em ${tempoCurto(corte.marcas.inicioAberto)} ficou sem fim e foi ignorado.`
    : '';
}

function marcarInicio() {
  if (!podeMarcar()) return;
  // currentTime pode ser 0 (o começo do vídeo) e isso é uma marca válida.
  const t = Number(player().currentTime) || 0;
  const r = Marcas.marcarInicio(corte.marcas, t);
  const n = corte.marcas.trechos.length + 1;
  falar(`Início do trecho ${n} em ${tempoCurto(t)}.` +
    (r.substituiu ? ` Trocou o início anterior, de ${tempoCurto(r.anterior)}.` : ''));
}

function marcarFim() {
  if (!podeMarcar()) return;
  const dur = corte.video.duracao;
  let t = Number(player().currentTime) || 0;
  if (t >= dur - 0.15) t = dur; // End deixa o tocador um tiquinho antes do fim
  const r = Marcas.marcarFim(corte.marcas, t, dur);
  if (!r.ok && r.erro === 'sem-inicio') return falar('Falta o início: aperte Alt I antes do Alt F. Nada foi marcado.');
  if (!r.ok) return falar(`O fim precisa vir depois do início, que está em ${tempoCurto(r.inicio)}. Nada foi marcado.`);
  falar(`Trecho ${r.numero} marcado, de ${tempoCurto(r.trecho.inicio)} a ${tempoCurto(r.trecho.fim)}.`);
}

function semTrechos() {
  if (corte.marcas.trechos.length) return false;
  falar(corte.marcas.inicioAberto !== null
    ? `Nenhum trecho completo. O início em ${tempoCurto(corte.marcas.inicioAberto)} ainda não tem fim: aperte Alt F no ponto do fim.`
    : 'Nenhum trecho marcado. Alt I marca o início e Alt F marca o fim; dá para marcar vários.');
  return true;
}

function descreverTrecho(tr) {
  const de = tr.inicio <= 0.05 ? 'do começo do vídeo' : `de ${tempoCurto(tr.inicio)}`;
  const ate = corte.video && tr.fim >= corte.video.duracao - 0.05 ? 'até o final' : `a ${tempoCurto(tr.fim)}`;
  return `${de} ${ate}`;
}

/** Delete ou Backspace: descarta todos os trechos marcados, de uma vez. */
async function descartarMarcado() {
  if (!podeMarcar()) return;
  if (corte.rodando) return falar('Espere o processamento terminar.');
  if (semTrechos()) return;
  const lote = [];
  for (const tr of Marcas.paraDescarte(corte.marcas.trechos)) {
    const repetido = corte.descartes.find((d) => Math.abs(d.inicio - tr.inicio) < 0.05 && Math.abs(d.fim - tr.fim) < 0.05);
    if (repetido) { repetido.selecionado = true; continue; }
    const novo = { inicio: tr.inicio, fim: tr.fim };
    corte.descartes.push(novo);
    lote.push(novo);
  }
  corte.descartes.sort((a, b) => a.inicio - b.inicio);
  if (lote.length) corte.historico.push(lote); // o lote todo desfaz com um Alt Z
  const n = corte.marcas.trechos.length;
  const aviso = avisoInicioAberto();
  // As marcas são consumidas: um segundo Delete sem querer não descarta de novo.
  Marcas.limpar(corte.marcas);
  atualizarRotuloBotaoCortar();
  await desenharDescartes();
  falar((n === 1 ? '1 trecho descartado.' : `${n} trechos descartados de uma vez.`) +
    `${aviso} ${$('c-resumo').textContent}`);
}
async function desfazerDescarte() {
  if (!exigirVideo()) return;
  if (corte.rodando) return falar('Espere o processamento terminar.');
  while (corte.historico.length) {
    const lote = corte.historico.pop();
    const presentes = lote.filter((d) => corte.descartes.includes(d));
    if (!presentes.length) continue; // já removido à mão pela lista
    corte.descartes = corte.descartes.filter((d) => !presentes.includes(d));
    atualizarRotuloBotaoCortar();
    await desenharDescartes();
    const resumo = $('c-resumo').textContent || 'Nenhum descarte marcado.';
    if (presentes.length === 1) {
      falar(`Desfeito. O trecho ${descreverTrecho(presentes[0])} voltou para o vídeo. ${resumo}`);
    } else {
      falar(`Desfeito. ${presentes.length} trechos voltaram para o vídeo. ${resumo}`);
    }
    return;
  }
  falar('Não há descarte para desfazer.');
}

/**
 * Teclas da tela Editar vídeo. Devolve true quando a tecla foi usada.
 * Alt I, Alt F, Alt S e Alt Z funcionam em qualquer lugar da tela, até dentro
 * de campo de texto (Alt com letra não digita nada). F2 também. Delete e
 * Backspace só fora de campo de texto ou lista de seleção, onde apagam texto.
 */
function tratarTeclaCortar(e, emCampoDeTexto) {
  const code = e.code || '';
  const k = (e.key || '').toLowerCase();
  const soAlt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const semModificador = !e.altKey && !e.ctrlKey && !e.metaKey;
  if (soAlt && (code === 'KeyI' || k === 'i')) { marcarInicio(); return true; }
  if (soAlt && (code === 'KeyF' || k === 'f')) { marcarFim(); return true; }
  if (soAlt && (code === 'KeyS' || k === 's')) { salvarTrechoMarcado(); return true; }
  if (soAlt && (code === 'KeyZ' || k === 'z')) { desfazerDescarte(); return true; }
  if (soAlt && (code === 'KeyO' || k === 'o')) { ondeEstou(); return true; }
  if (semModificador && !e.shiftKey && e.key === 'F2') { abrirAjustes(); return true; }
  // Caixa de seleção não é campo de texto: Delete ali também descarta.
  const el = document.activeElement || {};
  const naCaixa = el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
  if (semModificador && (!emCampoDeTexto || naCaixa) && (e.key === 'Delete' || e.key === 'Backspace')) {
    descartarMarcado();
    return true;
  }
  return false;
}

// --- Janelas acessíveis (F2 e Alt S) ---

/**
 * Abre um <dialog> modal com o foco preso dentro: Tab e Shift Tab dão a volta
 * só entre os controles da janela, Escape fecha, Enter num campo confirma.
 * Ao fechar, o foco volta para onde estava antes.
 */
function abrirJanela(dlg, { primeiro, aoConfirmar, aoCancelar }) {
  const antes = document.activeElement;
  let confirmado = false;

  const focaveis = () => [...dlg.querySelectorAll('input, button, select, textarea')]
    .filter((el) => !el.disabled && el.offsetParent !== null &&
      !(el.type === 'radio' && !el.checked && dlg.querySelector(`input[name="${el.name}"]:checked`)));

  const teclas = (e) => {
    if (e.key === 'Tab') {
      const lista = focaveis();
      if (!lista.length) return;
      const i = lista.indexOf(document.activeElement);
      e.preventDefault();
      const prox = e.shiftKey ? (i <= 0 ? lista.length - 1 : i - 1) : (i === lista.length - 1 ? 0 : i + 1);
      lista[prox].focus();
    } else if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'BUTTON') {
      e.preventDefault();
      confirmar();
    }
    // Nada daqui de dentro chega aos atalhos da tela por trás.
    e.stopPropagation();
  };

  const fechar = () => {
    dlg.removeEventListener('keydown', teclas);
    dlg.removeEventListener('close', aoFechar);
    okBtn.removeEventListener('click', confirmar);
    cancelarBtn.removeEventListener('click', cancelar);
    if (dlg.open) dlg.close();
    if (antes && document.contains(antes) && !antes.disabled) antes.focus();
  };
  const confirmar = () => {
    if (aoConfirmar() === false) return; // validação falhou: a janela fica aberta
    confirmado = true;
    fechar();
  };
  const cancelar = () => { fechar(); };
  // Escape fecha o <dialog> sozinho; aqui só se avisa e se devolve o foco.
  const aoFechar = () => {
    if (!confirmado && aoCancelar) aoCancelar();
    fechar();
  };

  const okBtn = dlg.querySelector('[id$="-ok"]');
  const cancelarBtn = dlg.querySelector('[id$="-cancelar"]');
  dlg.addEventListener('keydown', teclas);
  dlg.addEventListener('close', aoFechar);
  okBtn.addEventListener('click', confirmar);
  cancelarBtn.addEventListener('click', cancelar);
  dlg.showModal();
  if (primeiro) {
    primeiro.focus();
    if (primeiro.select && primeiro.type === 'text') primeiro.select();
  }
}

function abrirAjustes() {
  if (corte.rodando) return falar('Espere o processamento terminar.');
  const pad = (n) => String(n).padStart(2, '0');
  $('dlg-salto-min').value = pad(Math.floor(corte.salto / 60));
  $('dlg-salto-seg').value = pad(Math.round(corte.salto % 60));
  $('dlg-ajustes-erro').textContent = '';

  const erro = (msg, campo) => {
    $('dlg-ajustes-erro').textContent = msg;
    falar(msg);
    campo.focus();
    if (campo.select) campo.select();
    return false;
  };

  // F2 muda só o tamanho do salto: minutos e segundos, sem hora.
  abrirJanela($('dlg-ajustes'), {
    primeiro: $('dlg-salto-min'),
    aoCancelar: () => falar('Tamanho do salto não mudou.'),
    aoConfirmar: () => {
      const minTxt = $('dlg-salto-min').value.trim() || '0';
      const segTxt = $('dlg-salto-seg').value.trim() || '0';
      if (!/^\d{1,2}$/.test(minTxt) || Number(minTxt) > 59) {
        return erro('Minutos do salto: use um número de 0 a 59.', $('dlg-salto-min'));
      }
      if (!/^\d{1,2}$/.test(segTxt) || Number(segTxt) > 59) {
        return erro('Segundos do salto: use um número de 0 a 59.', $('dlg-salto-seg'));
      }
      const salto = Number(minTxt) * 60 + Number(segTxt);
      if (salto < 1) return erro('O salto precisa ter pelo menos 1 segundo.', $('dlg-salto-seg'));
      const mudou = salto !== corte.salto;
      if (mudou) {
        corte.salto = salto;
        atualizarRotulosSalto();
      }
      // Avisa depois que a janela fechar, para o leitor não cortar a fala.
      setTimeout(() => falar(mudou ? `Salto agora de ${descricaoSalto(salto)}.` : `Salto continua de ${descricaoSalto(salto)}.`), 50);
      return true;
    }
  });
}

// --- Salvar os trechos marcados (Alt S), cada um num arquivo ---

function salvarTrechoMarcado() {
  if (!podeMarcar()) return;
  if (corte.rodando) return falar('Espere o processamento terminar.');
  if (semTrechos()) return;
  const trechos = Marcas.emOrdem(corte.marcas.trechos);

  const radio = $('dlg-formato-' + corte.formatoTrecho) || $('dlg-formato-horizontal');
  radio.checked = true;
  $('dlg-formato-audio').disabled = !corte.video.temAudio;
  if (!corte.video.temAudio && corte.formatoTrecho === 'audio') $('dlg-formato-horizontal').checked = true;
  $('dlg-formato-titulo').textContent = trechos.length === 1 ? 'Salvar o trecho marcado' : `Salvar os ${trechos.length} trechos marcados`;
  $('dlg-formato-info').textContent = (trechos.length === 1
    ? `Trecho ${descreverTrecho(trechos[0])}, ${duracaoFalada(trechos[0].fim - trechos[0].inicio)}.`
    : `${trechos.length} trechos, cada um num arquivo, numerados na ordem do vídeo.`) +
    avisoInicioAberto() + ' O vídeo original não muda.';

  abrirJanela($('dlg-formato'), {
    primeiro: document.querySelector('input[name="dlg-formato"]:checked'),
    aoCancelar: () => falar('Salvar trechos cancelado.'),
    aoConfirmar: () => {
      const escolhido = document.querySelector('input[name="dlg-formato"]:checked').value;
      corte.formatoTrecho = escolhido;
      // A janela de salvar só abre depois que esta fechar.
      setTimeout(() => executarSalvarTrechos(trechos, escolhido), 0);
      return true;
    }
  });
}

async function executarSalvarTrechos(trechos, formato) {
  const antes = document.activeElement;
  const base = nomeDoArquivo(corte.video.caminho).replace(/\.[^.]+$/, '');
  const sufixo = formato === 'vertical' ? '-short' : formato === 'audio' ? '-audio' : '';
  const ext = formato === 'audio' ? 'mp3' : 'mp4';
  const varios = trechos.length > 1;
  const marca = tempoCurto(trechos[0].inicio).replace(/[:,]/g, '-');
  const saida = await window.api.escolherSalvarComo({
    tipo: formato === 'audio' ? 'audio' : 'video',
    titulo: varios
      ? `Nome base dos ${trechos.length} arquivos (cada um ganha -01, -02...)`
      : (formato === 'audio' ? 'Salvar o áudio do trecho como' : 'Salvar o trecho como'),
    sugestao: varios ? `${base}-trecho${sufixo}.${ext}` : `${base}-trecho-${marca}${sufixo}.${ext}`
  });
  if (!saida) {
    if (antes && document.contains(antes)) antes.focus();
    return falar('Cancelado: nenhum arquivo escolhido.');
  }
  const nomesSaida = Marcas.nomesNumerados(saida, trechos.length);

  pararTudoNoPlayer();
  travarCorte(true);
  const nomes = { horizontal: 'horizontal', vertical: 'vertical para short', audio: 'só áudio' };
  falar(varios ? `Salvando ${trechos.length} trechos, ${nomes[formato]}.` : `Salvando o trecho, ${nomes[formato]}.`);

  const salvos = [];
  let falha = null;
  for (let i = 0; i < trechos.length; i++) {
    if (varios && i > 0) falar(`Salvando o trecho ${i + 1} de ${trechos.length}.`);
    const r = await window.api.salvarTrecho({
      entrada: corte.video.caminho, inicio: trechos[i].inicio, fim: trechos[i].fim, formato, saida: nomesSaida[i]
    });
    if (r.ok) salvos.push(r);
    else { falha = r; break; }
  }

  travarCorte(false);
  // O que estava à vista antes dos trechos continua à vista.
  if (corte.resultado) {
    $('c-btn-resultado').hidden = false;
    $('c-btn-abrir').hidden = false;
    $('c-btn-original').hidden = corte.ouvindo !== 'resultado';
  }
  if (antes && document.contains(antes) && !antes.disabled) antes.focus();

  if (!falha) {
    $('c-progresso').value = 100;
    falar(varios
      ? `Pronto. ${salvos.length} trechos salvos, de ${nomeDoArquivo(salvos[0].saida)} a ${nomeDoArquivo(salvos[salvos.length - 1].saida)}. As marcas continuam: Delete descarta esses mesmos trechos.`
      : `Pronto. Trecho salvo em ${nomeDoArquivo(salvos[0].saida)}, ${duracaoFalada(salvos[0].duracao)}. As marcas continuam: Delete descarta esse mesmo trecho.`);
  } else if (falha.cancelado) {
    falar(`Salvar trechos cancelado. ${salvos.length} de ${trechos.length} já tinham sido salvos.`);
  } else {
    falar(`Não consegui salvar o trecho ${salvos.length + 1}: ${falha.erro}` +
      (salvos.length ? ` Os ${salvos.length} anteriores foram salvos.` : ''));
  }
}

// --- Salvar áudio (Editar vídeo e Montar vídeo) ---

/** Um áudio por vez, em segundo plano, sem travar nenhuma tela. */
let exportandoAudio = false;

function camadasParaEnvio(camadas) {
  return camadas.map((c) => ({
    arquivo: c.arquivo, tipo: c.tipo, tempo: c.tempo,
    repetir: c.repetir || undefined, encerraEm: c.encerraEm,
    fadeEntrada: c.fadeEntrada, fadeSaida: c.fadeSaida, volume: c.volume
  }));
}

async function salvarAudioEmSegundoPlano({ entrada, descartes, camadas, sugestao, titulo, ajuste = null, fade = false }) {
  if (exportandoAudio) return falar('Já estou salvando um áudio. Aviso quando terminar.');
  const saida = await window.api.escolherSalvarComo({ tipo: 'audio', sugestao, titulo });
  if (!saida) return falar('Cancelado: nenhum arquivo escolhido.');
  exportandoAudio = true;
  falar('Salvando o áudio em segundo plano. Pode continuar trabalhando; aviso quando terminar.');
  let r;
  try {
    r = await window.api.exportarAudio({ entrada, descartes, camadas, saida, ajuste, fade });
  } finally {
    exportandoAudio = false;
  }
  if (r && r.ok) falar(`Áudio salvo: ${nomeDoArquivo(r.saida)}, ${duracaoFalada(r.duracao)}.`);
  else falar('Não consegui salvar o áudio: ' + (r ? r.erro : 'erro desconhecido.'));
}

$('c-btn-salvar-audio').addEventListener('click', async () => {
  if (!exigirVideo()) return;
  if (!corte.video.temAudio) return falar('Este vídeo não tem áudio para salvar.');
  const ativos = descartesAtivos();
  if (ativos.length) {
    const plano = await window.api.planejarCortes({ descartes: ativos.map((d) => ({ inicio: d.inicio, fim: d.fim })), duracao: corte.video.duracao });
    if (plano.erros.length) return falar('Não dá para salvar o áudio ainda. ' + plano.erros.join(' '));
  }
  const base = nomeDoArquivo(corte.video.caminho).replace(/\.[^.]+$/, '');
  const comAjuste = !AJU.ajusteNeutro(corte.ajuste);
  const editado = ativos.length || corte.camadas.length || comAjuste;
  salvarAudioEmSegundoPlano({
    entrada: corte.video.caminho,
    descartes: ativos.map((d) => ({ inicio: d.inicio, fim: d.fim })),
    camadas: camadasParaEnvio(corte.camadas),
    ajuste: comAjuste ? copiaAjuste() : null,
    fade: $('c-fade').checked,
    sugestao: `${base}${editado ? '-editado' : ''}.mp3`,
    titulo: 'Salvar o áudio editado como'
  });
});

// --- Lista ---


async function desenharDescartes() {
  const ul = $('c-lista');
  ul.innerHTML = '';

  if (!corte.descartes.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum descarte marcado.';
    ul.appendChild(li);
    $('c-resumo').textContent = '';
    atualizarCaixaTodos('c-todos', corte.descartes);
    return;
  }

  corte.descartes.forEach((d, i) => {
    const li = document.createElement('li');
    const n = corte.descartes.length;
    const dur = corte.video ? corte.video.duracao : 0;

    let tipo = 'no meio';
    if (d.inicio <= 0.05) tipo = 'do começo';
    else if (d.fim >= dur - 0.05) tipo = 'até o fim';

    // A descrição é o rótulo da caixa: marcado entra no vídeo, desmarcado
    // fica na lista mas não é aplicado.
    const txt = document.createElement('label');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.checked = Selecao.estaSelecionado(d);
    caixa.addEventListener('change', async () => {
      d.selecionado = caixa.checked;
      await desenharDescartes();
      const nova = $('c-lista').querySelectorAll('input[type="checkbox"]')[i];
      if (nova) nova.focus();
      falar(`${resumoSelecao(corte.descartes, 'descarte', 'descartes')} ${$('c-resumo').textContent}`);
    });
    txt.appendChild(caixa);
    txt.appendChild(document.createTextNode(
      ` Descarte ${i + 1} de ${n}, ${tipo}: de ${tempoPreciso(d.inicio)} ` +
      `a ${tempoPreciso(d.fim)}, ${duracaoFalada(d.fim - d.inicio)}.`));
    li.appendChild(txt);

    const acoes = document.createElement('span');
    acoes.className = 'acoes';

    const bOuvir = document.createElement('button');
    bOuvir.type = 'button';
    bOuvir.textContent = 'Ouvir a emenda';
    bOuvir.setAttribute('aria-label', `Ouvir a emenda do descarte ${i + 1}`);
    bOuvir.addEventListener('click', () => ouvirEmenda(d, i + 1));
    acoes.appendChild(bOuvir);

    const bRem = document.createElement('button');
    bRem.type = 'button';
    bRem.textContent = 'Remover';
    bRem.setAttribute('aria-label', `Remover descarte ${i + 1}`);
    bRem.addEventListener('click', async () => {
      corte.descartes.splice(i, 1);
      atualizarRotuloBotaoCortar();
      await desenharDescartes();
      falar(`Descarte removido. ${$('c-resumo').textContent || 'Nenhum descarte marcado.'}`);
      // O foco vai para o Remover do item que ficou no lugar, ou para o
      // botão de detectar silêncios se a lista ficou vazia.
      const botoes = [...$('c-lista').querySelectorAll('button')].filter((b) => b.textContent === 'Remover');
      (botoes[Math.min(i, botoes.length - 1)] || $('c-btn-detectar-silencio')).focus();
    });
    acoes.appendChild(bRem);

    li.appendChild(acoes);
    ul.appendChild(li);
  });

  atualizarCaixaTodos('c-todos', corte.descartes);
  const ativos = descartesAtivos();
  if (corte.video && !ativos.length) {
    $('c-resumo').textContent = 'Nenhum descarte selecionado: o vídeo fica inteiro.';
  } else if (corte.video) {
    const plano = await window.api.planejarCortes({
      descartes: ativos.map((d) => ({ inicio: d.inicio, fim: d.fim })),
      duracao: corte.video.duracao
    });
    if (plano.erros.length) {
      $('c-resumo').textContent = plano.erros.join(' ');
    } else {
      $('c-resumo').textContent =
        `O vídeo vai de ${duracaoFalada(corte.video.duracao)} para ` +
        `${duracaoFalada(plano.duracaoFinal)}.` +
        (plano.avisos.length ? ' ' + plano.avisos.join(' ') : '');
    }
  }
}

/**
 * Ouvir a emenda: toca uns segundos antes do corte, pula o descarte e continua
 * do outro lado, direto do arquivo original, sem gerar nada. É o que permite
 * julgar se o corte caiu no lugar certo e se a passagem ficou brusca.
 */
const ANTES = 4;
const DEPOIS = 4;

function ouvirEmenda(d, numero) {
  if (!exigirVideo()) return;
  if (corte.ouvindo === 'resultado') {
    return falar('Você está ouvindo o resultado. Volte ao vídeo original para ouvir as emendas.');
  }

  pararTudoNoPlayer();
  const p = player();
  const dur = corte.video.duracao;
  const doComeco = d.inicio <= 0.05;
  const ateOFim = d.fim >= dur - 0.05;

  // Corte do começo: só existe o "depois". Corte do fim: só o "antes".
  let fase;
  let limite;
  if (doComeco) {
    p.currentTime = d.fim;
    fase = 'depois';
    limite = Math.min(dur, d.fim + DEPOIS);
    falar(`Descarte ${numero}: ouvindo como o vídeo vai começar.`);
  } else {
    p.currentTime = Math.max(0, d.inicio - ANTES);
    fase = 'antes';
    limite = d.inicio;
    falar(ateOFim
      ? `Descarte ${numero}: ouvindo como o vídeo vai terminar.`
      : `Descarte ${numero}: ouvindo a emenda.`);
  }

  // Pequena espera para a fala do leitor de tela não cobrir o começo do áudio.
  setTimeout(() => {
    p.play().catch(() => falar('Não consegui tocar.'));

    const vigiar = () => {
      if (p.paused) { emendaAtiva = null; return; }

      if (p.currentTime >= limite) {
        if (fase === 'antes' && !ateOFim) {
          // O salto em si: pula o trecho descartado.
          p.currentTime = d.fim;
          fase = 'depois';
          limite = Math.min(dur, d.fim + DEPOIS);
        } else {
          p.pause();
          emendaAtiva = null;
          return;
        }
      }
      emendaAtiva = requestAnimationFrame(vigiar);
    };
    emendaAtiva = requestAnimationFrame(vigiar);
  }, 900);
}

ligarSelecionarTodos({
  idCaixa: 'c-todos', idLista: 'c-lista',
  lista: () => corte.descartes, singular: 'descarte', plural: 'descartes',
  redesenhar: () => desenharDescartes()
});

// --- Detectar silêncios (Editar vídeo) -----------------------------------

$('c-btn-detectar-silencio').addEventListener('click', async () => {
  if (!exigirVideo()) return;

  const { limiarDb, duracaoMinima, margem } = nivelSilencioEscolhido();

  $('c-silencio-status').textContent = 'Procurando silêncios...';
  falar('Procurando silêncios...');

  const r = await window.api.detectarSilencios({
    entrada: corte.video.caminho,
    limiarDb,
    duracaoMinima,
    margem
  });

  if (!r.ok) {
    $('c-silencio-status').textContent = `Não consegui procurar: ${r.erro}`;
    return falar(`Não consegui procurar silêncios: ${r.erro}`);
  }

  if (!r.silencios.length) {
    $('c-silencio-status').textContent = 'Nenhum silêncio encontrado com essa sensibilidade.';
    return falar('Nenhum silêncio encontrado com essa sensibilidade.');
  }

  const lote = r.silencios.map((s) => ({ inicio: s.inicio, fim: s.fim }));
  lote.forEach((d) => corte.descartes.push(d));
  corte.descartes.sort((a, b) => a.inicio - b.inicio);
  corte.historico.push(lote);
  atualizarRotuloBotaoCortar();
  await desenharDescartes();

  const msg = `${r.silencios.length} silêncio(s) encontrado(s) e adicionado(s) à lista de descartes. ` +
    'Revise, ouça a emenda de cada um e remova o que não quiser, como faria com um descarte marcado à mão.';
  $('c-silencio-status').textContent = msg;
  falar(msg);
});

// --- Trilhas de fundo (Editar vídeo) -------------------------------------


$('c-btn-trilha-arquivo').addEventListener('click', async () => {
  const r = await window.api.escolherAudio();
  if (!r) return;
  corte.trilhaEscolhida = r.caminho;
  $('c-trilha-arquivo-info').textContent = r.duracao
    ? `${nomeDoArquivo(r.caminho)}, ${formatarTempo(r.duracao)}.`
    : nomeDoArquivo(r.caminho);
  falar(`Arquivo escolhido: ${nomeDoArquivo(r.caminho)}.`);
});

// Não existe um tocador separado pra trilha aqui: a tela já tem um, na seção
// 2, usado tanto pra marcar descartes quanto pra marcar o tempo da trilha.
$('c-trilha-marcar').addEventListener('click', async () => {
  if (!exigirVideo()) return;
  const t = player().currentTime;
  const texto = await window.api.escreverTempo(t);
  $('c-trilha-tempo').value = texto;
  falar(`Tempo da trilha marcado em ${texto}.`);
});

$('c-trilha-previa').addEventListener('click', async () => {
  if (!exigirVideo()) return;

  const camadas = corte.camadas.slice();
  if (corte.trilhaEscolhida) {
    const tempo = await trilhaTempoLido('c');
    camadas.push({
      arquivo: corte.trilhaEscolhida,
      tipo: trilhaTipoReal('c'),
      tempo: tempo || 0,
      repetir: trilhaRepete('c'),
      fadeEntrada: $('c-trilha-fade-entrada').checked,
      fadeSaida: $('c-trilha-fade-saida').checked,
      volume: parseFloat($('c-trilha-volume').value)
    });
  }

  $('c-previa-status').textContent = 'Gerando prévia...';
  falar('Gerando prévia...');

  const r = await window.api.previaMixagem({
    audioPrincipal: corte.video.caminho,
    duracaoAudio: corte.video.duracao,
    cursor: player().currentTime,
    camadas
  });

  if (!r.ok) {
    $('c-previa-status').textContent = `Não foi possível gerar a prévia: ${r.erro}`;
    falar(`Não foi possível gerar a prévia: ${r.erro}`);
    return;
  }

  const p = $('c-previa-audio');
  p.src = r.url;
  const mensagem = `Prévia de ${r.duracaoJanela.toFixed(1)} segundos, começando em ${formatarTempo(r.inicio)} do vídeo original.`;
  $('c-previa-status').textContent = mensagem;
  try {
    await p.play();
    falar(mensagem);
  } catch (_) {
    falar(`${mensagem} Toque o botão de novo, ou use o player, pra ouvir.`);
  }
});

$('c-btn-add-trilha').addEventListener('click', async () => {
  if (!corte.trilhaEscolhida) return falar('Escolha um arquivo de trilha antes de adicionar.');

  const tipo = trilhaTipoReal('c');
  let tempo = 0;
  let tempoTexto = '';
  let repetir = false;

  if (tipo === 'estatico') {
    const segundos = await trilhaTempoLido('c');
    if (segundos === null) {
      return falar('Não entendi o tempo de início da trilha. Use hora, minuto e segundo, como 00:03:20.');
    }
    tempo = segundos;
    tempoTexto = await window.api.escreverTempo(segundos);
    repetir = trilhaRepete('c');
  }

  const volume = parseFloat($('c-trilha-volume').value);
  const arquivo = corte.trilhaEscolhida;
  const nome = nomeDoArquivo(arquivo);
  const nova = {
    arquivo, nome, tipo, tempo, tempoTexto, repetir, volume,
    fadeEntrada: $('c-trilha-fade-entrada').checked,
    fadeSaida: $('c-trilha-fade-saida').checked
  };

  const adicionou = finalizarAdicaoTrilha('c', corte.camadas, nova);
  if (adicionou) {
    desenharTrilhas('c', corte.camadas);
    falar(
      tipo === 'loop'
        ? `Trilha em loop adicionada: ${nome}. Total: ${corte.camadas.length}.`
        : repetir
          ? `Trilha adicionada: ${nome}, começando em ${tempoTexto} e repetindo até o fim do vídeo. Total: ${corte.camadas.length}.`
          : `Trilha estática adicionada: ${nome}, ${trilhaQuando('c', tempoTexto)}, tocando uma vez só. Total: ${corte.camadas.length}.`
    );
  }

  corte.trilhaEscolhida = null;
  $('c-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('c-trilha-tempo').value = '00:00:00';
  $('c-trilha-fade-entrada').checked = true;
  $('c-trilha-fade-saida').checked = true;
  atualizarBlocoFadeTrilha('c');
});

$('c-trilha-conflito-encerrar').addEventListener('click', () => resolverConflitoTrilha('c', corte.camadas, true));
$('c-trilha-conflito-sobrepor').addEventListener('click', () => resolverConflitoTrilha('c', corte.camadas, false));

$('c-trilha-tempo').addEventListener('blur', async () => {
  const seg = await window.api.lerTempo($('c-trilha-tempo').value);
  if (seg !== null) $('c-trilha-tempo').value = await window.api.escreverTempo(seg);
});

// --- Legenda (Editar vídeo) ----------------------------------------------

$('c-btn-srt').addEventListener('click', async () => {
  const caminho = await window.api.escolherSrt();
  if (!caminho) return;
  corte.legenda = caminho;
  $('c-info-srt').textContent = nomeDoArquivo(caminho);
  atualizarRotuloBotaoCortar();
  falar(`Legenda escolhida: ${nomeDoArquivo(caminho)}.`);
});

$('c-btn-tirar-srt').addEventListener('click', () => {
  if (!corte.legenda) return falar('Não há legenda escolhida.');
  corte.legenda = null;
  $('c-info-srt').textContent = 'Nenhuma legenda escolhida.';
  atualizarRotuloBotaoCortar();
  falar('Legenda removida.');
});

// --- Gerar ---

$('c-btn-cortar').addEventListener('click', async () => {
  if (corte.rodando) return;
  if (!exigirVideo()) return;
  const ativos = descartesAtivos().map((d) => ({ inicio: d.inicio, fim: d.fim }));
  const comAjuste = !AJU.ajusteNeutro(corte.ajuste);
  if (!ativos.length && !corte.legenda && !corte.camadas.length && !comAjuste) {
    return falar(corte.descartes.length
      ? 'Nenhum descarte selecionado. Marque pelo menos um, ou use Selecionar todos.'
      : 'Marque pelo menos um descarte, escolha uma legenda, adicione uma trilha, ou ajuste o áudio.');
  }

  if (ativos.length) {
    const plano = await window.api.planejarCortes({
      descartes: ativos,
      duracao: corte.video.duracao
    });
    if (plano.erros.length) return falar('Não dá para cortar ainda. ' + plano.erros.join(' '));
  }

  const base = nomeDoArquivo(corte.video.caminho).replace(/\.[^.]+$/, '');
  const sufixo = ativos.length ? '-cortado' : corte.camadas.length ? '-com-trilha' : corte.legenda ? '-legendado' : '-ajustado';
  const saida = await window.api.escolherSaida(`${base}${sufixo}.mp4`);
  if (!saida) return falar('Cancelado: nenhum arquivo de saída escolhido.');

  pararTudoNoPlayer();
  travarCorte(true);
  falar(ativos.length ? 'Salvando o vídeo editado. Em vídeo longo, demora.'
                      : 'Salvando o vídeo. Em vídeo longo, demora.');

  const r = await window.api.cortarVideo({
    entrada: corte.video.caminho,
    descartes: ativos,
    legenda: corte.legenda,
    camadas: corte.camadas.map((c) => ({
      arquivo: c.arquivo, tipo: c.tipo, tempo: c.tempo,
      repetir: c.repetir || undefined, encerraEm: c.encerraEm,
      fadeEntrada: c.fadeEntrada, fadeSaida: c.fadeSaida, volume: c.volume
    })),
    ajuste: comAjuste ? copiaAjuste() : null,
    fade: $('c-fade').checked,
    saida
  });

  travarCorte(false);

  if (r.ok) {
    corte.resultado = r;
    $('c-progresso').value = 100;
    $('c-btn-resultado').hidden = false;
    $('c-btn-abrir').hidden = false;
    falar(
      `Pronto. O vídeo ficou com ${duracaoFalada(r.duracao)}, salvo em ` +
      `${nomeDoArquivo(r.saida)}. Use Ouvir o resultado para conferir.`
    );
    $('c-btn-resultado').focus();
  } else if (r.cancelado) {
    falar('Salvar vídeo cancelado.');
    $('c-btn-cortar').focus();
  } else {
    falar('Deu erro: ' + r.erro);
    $('c-btn-cortar').focus();
  }
});

$('c-btn-resultado').addEventListener('click', () => {
  if (!corte.resultado) return;
  pararTudoNoPlayer();
  corte.ouvindo = 'resultado';
  player().src = corte.resultado.url;
  $('c-btn-original').hidden = false;
  falar('Resultado carregado. Os mesmos botões de tocar, voltar e avançar valem para ele.');
  player().play().catch(() => {});
});

$('c-btn-original').addEventListener('click', () => {
  if (!corte.video) return;
  pararTudoNoPlayer();
  corte.ouvindo = 'original';
  player().src = corte.video.url;
  $('c-btn-original').hidden = true;
  falar('De volta ao vídeo original.');
});

$('c-btn-cancelar').addEventListener('click', async () => {
  await window.api.cancelarRender();
  falar('Cancelando...');
});

$('c-btn-abrir').addEventListener('click', () => {
  if (corte.resultado) window.api.abrirPasta(corte.resultado.saida);
});

$('c-btn-voltar').addEventListener('click', () => {
  if (corte.rodando) return falar('Espere terminar, ou cancele antes de voltar.');
  mostrarTela('edicao');
  desenharEdicao();
});

function travarCorte(rodando) {
  corte.rodando = rodando;
  estado.cortando = rodando;
  ['c-btn-cortar', 'c-todos', 'c-btn-video', 'c-tocar', 'c-voltar', 'c-avancar', 'c-btn-srt', 'c-btn-tirar-srt', 'c-btn-detectar-silencio',
   'c-btn-trilha-arquivo', 'c-btn-add-trilha', 'c-trilha-tipo-loop', 'c-trilha-tipo-estatico',
   'c-trilha-tempo', 'c-trilha-volume', 'c-trilha-marcar', 'c-trilha-previa',
   'c-trilha-inicio-comeco', 'c-trilha-inicio-tempo', 'c-trilha-fade-entrada', 'c-trilha-fade-saida',
   'c-fade', 'c-btn-melhorar', ...CAMPOS_AJUSTE_IDS, 'c-eq-predefinicao', 'c-eq-ouvir', 'c-eq-zerar'
  ].forEach((id) => { $(id).disabled = rodando; });
  $('c-btn-cancelar').disabled = !rodando;
  if (rodando) {
    $('c-btn-resultado').hidden = true;
    $('c-btn-original').hidden = true;
    $('c-btn-abrir').hidden = true;
    $('c-progresso').value = 0;
  }
}

// --- Ajuste do áudio do vídeo todo (volume, equalização, velocidade) -----------

const AJU = window.api.puro.ajuste;
const ajusteNeutroNovo = () => ({ volume: 1, velocidade: 1, eq: { graves: 0, medios: 0, agudos: 0 } });
corte.ajuste = ajusteNeutroNovo();
const copiaAjuste = () => ({ volume: corte.ajuste.volume, velocidade: corte.ajuste.velocidade, eq: { ...corte.ajuste.eq } });
const CAMPOS_AJUSTE = { 'c-eq-volume': null, 'c-eq-graves': 'graves', 'c-eq-medios': 'medios', 'c-eq-agudos': 'agudos', 'c-eq-velocidade': null };
const CAMPOS_AJUSTE_IDS = Object.keys(CAMPOS_AJUSTE);

function textoCampoAjuste(id, v) {
  if (id === 'c-eq-volume' || id === 'c-eq-velocidade') return `${v}%`;
  return AJU.decibeisFalados(v);
}

function mostrarAjusteCorte() {
  const a = corte.ajuste;
  $('c-eq-volume').value = String(Math.round(a.volume * 100));
  $('c-eq-velocidade').value = String(Math.round(a.velocidade * 100));
  for (const [id, k] of Object.entries(CAMPOS_AJUSTE)) {
    if (k) $(id).value = String(a.eq[k]);
    $(id).setAttribute('aria-valuetext', textoCampoAjuste(id, Number($(id).value)));
  }
  const nome = AJU.nomeDoEq(a.eq);
  const p = AJU.PREDEFINICOES_EQ.find((x) => x.nome === nome);
  $('c-eq-predefinicao').value = p ? p.id : 'personalizada';
  $('c-ajuste-info').textContent = AJU.resumoDoAjuste(a) +
    (corte.video ? ` Vídeo de ${duracaoFalada(corte.video.duracao / a.velocidade)}.` : '');
}

function mudarVolumeCorte(direcao) {
  if (!exigirVideo()) return;
  const antes = corte.ajuste.volume;
  const novo = AJU.mudarVolume(antes, direcao);
  if (novo === antes) return falar(`Volume já está em ${AJU.porcento(novo)}, o ${direcao > 0 ? 'máximo' : 'mínimo'}.`);
  corte.ajuste.volume = novo;
  mostrarAjusteCorte();
  falar(`Volume ${AJU.porcento(novo)}.`);
}

function mudarVelocidadeCorte(direcao) {
  if (!exigirVideo()) return;
  const antes = corte.ajuste.velocidade;
  const nova = AJU.mudarVelocidade(antes, direcao);
  if (nova === antes) return falar(`Velocidade já está em ${AJU.porcento(nova)}, o ${direcao > 0 ? 'máximo' : 'mínimo'}.`);
  corte.ajuste.velocidade = nova;
  mostrarAjusteCorte();
  falar(`Velocidade ${AJU.porcento(nova)}. Vídeo de ${duracaoFalada(corte.video.duracao / nova)}.`);
}

/** Control com setas no Editar. Para os lados, fora de campo de texto e de controle deslizante. */
function tratarCtrlAjuste(e) {
  const ctrl = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (!ctrl || corte.rodando) return false;
  const t = e.target || {};
  const campo = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['radio', 'checkbox', 'button'].includes(t.type));
  if (!campo && e.key === 'ArrowRight') { mudarVolumeCorte(1); return true; }
  if (!campo && e.key === 'ArrowLeft') { mudarVolumeCorte(-1); return true; }
  if (e.key === 'ArrowUp') { mudarVelocidadeCorte(1); return true; }
  if (e.key === 'ArrowDown') { mudarVelocidadeCorte(-1); return true; }
  return false;
}

let ouvindoAjuste = null;
function pararOuvirAjuste() {
  const el = $('c-ajuste-player');
  if (el && !el.paused) el.pause();
  ouvindoAjuste = null;
}

async function ouvirAjusteCorte() {
  if (!exigirVideo()) return;
  if (!corte.video.temAudio) return falar('Este vídeo não tem áudio para ouvir.');
  pararTudoNoPlayer();
  pararOuvirAjuste();
  const inicio = Math.max(0, Math.min(player().currentTime || 0, Math.max(0, corte.video.duracao - 1)));
  const pedido = Symbol('ouvir');
  ouvindoAjuste = pedido;
  falar(`Preparando 6 segundos com o ajuste, a partir de ${tempoPreciso(inicio)}.`);
  const r = await window.api.ouvirAjuste({ entrada: corte.video.caminho, inicio, ajuste: copiaAjuste() });
  if (ouvindoAjuste !== pedido) return;
  if (!r || !r.ok) return falar('Não consegui preparar o trecho: ' + (r ? r.erro : 'erro desconhecido.'));
  const el = $('c-ajuste-player');
  el.src = r.url;
  el.onended = () => { if (ouvindoAjuste === pedido) { ouvindoAjuste = null; falar('Fim do trecho com o ajuste.'); } };
  el.play().catch(() => falar('Não consegui tocar o trecho.'));
}

(function montarAjusteCorte() {
  const pre = $('c-eq-predefinicao');
  for (const p of AJU.PREDEFINICOES_EQ) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.nome; pre.appendChild(o);
  }
  const pers = document.createElement('option');
  pers.value = 'personalizada'; pers.textContent = 'Personalizada';
  pre.appendChild(pers);
  let espera = null;
  for (const id of CAMPOS_AJUSTE_IDS) {
    $(id).addEventListener('input', (e) => {
      const a = corte.ajuste;
      const v = Number(e.target.value);
      if (id === 'c-eq-volume') a.volume = Math.max(0.1, Math.min(3, v / 100));
      else if (id === 'c-eq-velocidade') a.velocidade = Math.max(0.5, Math.min(2.5, v / 100));
      else a.eq = AJU.normalizarEq({ ...a.eq, [CAMPOS_AJUSTE[id]]: v });
      mostrarAjusteCorte();
      // O controle deslizante já fala o próprio valor; o resumo vem depois de uma pausa.
      clearTimeout(espera);
      espera = setTimeout(() => falar($('c-ajuste-info').textContent), 900);
    });
  }
  pre.addEventListener('change', () => {
    const p = AJU.PREDEFINICOES_EQ.find((x) => x.id === pre.value);
    if (!p) return;
    corte.ajuste.eq = { ...p.eq };
    mostrarAjusteCorte();
    falar(`${p.nome}: graves ${AJU.decibeisFalados(p.eq.graves)}, médios ${AJU.decibeisFalados(p.eq.medios)}, agudos ${AJU.decibeisFalados(p.eq.agudos)}.`);
  });
  $('c-eq-ouvir').addEventListener('click', ouvirAjusteCorte);
  $('c-eq-zerar').addEventListener('click', () => {
    corte.ajuste = ajusteNeutroNovo();
    mostrarAjusteCorte();
    falar('Áudio original: volume 100%, equalização Neutro, velocidade 100%.');
  });
  $('c-fade').addEventListener('change', () => {
    falar($('c-fade').checked ? 'Suavizar as emendas: marcado.' : 'Suavizar as emendas: desmarcado.');
  });
  $('c-btn-melhorar').addEventListener('click', () => {
    if (!exigirVideo()) return;
    if (corte.rodando) return falar('Espere terminar de salvar.');
    if (!window.gravarTela) return falar('A tela Alterar plano de fundo não carregou. Feche e abra o programa de novo.');
    pararTudoNoPlayer();
    pararOuvirAjuste();
    window.gravarTela.melhorarDoEditar(corte.video);
  });
  mostrarAjusteCorte();
})();

// --- Dividir vídeo (1.9.2: em etapas) -------------------------------------------------------------
// Por tempo: partes iguais (0 = não divide, só muda a orientação). Cortes manuais: pela audição, nas
// mesmas telas de Cortes do áudio; o Alt S pergunta o formato e a orientação de cada corte.

const divisao = { video: null, rodando: false, modo: null, temLegenda: false, legenda: null, confirmado: null, cortesManuais: null };
const DV = window.Divisao;
const PASSOS_DV = ['dv-video', 'dv-modo', 'dv-tempo', 'dv-legenda', 'dv-gerar'];
function mostrarDv(id, aviso = '') {
  for (const p of PASSOS_DV) $(p).hidden = p !== id;
  const t = $(id + '-titulo');
  if (id === 'dv-tempo') t.textContent = 'Etapa 3: Tempo e orientação';
  if (id === 'dv-legenda') t.textContent = divisao.modo === 'manual' ? 'Etapa 3: Legenda' : 'Etapa 4: Legenda';
  if (id === 'dv-gerar') t.textContent = 'Etapa 5: Dividir';
  t.focus();
  falarDepois(`${aviso ? aviso + ' ' : ''}${t.textContent}.`, 200);
}
const valorDv = (nome) => { const r = document.querySelector(`input[name="${nome}"]:checked`); return r ? r.value : ''; };
function montarOrientacoes(grupo, nome, escolhido, aoMudar) {
  for (const o of DV.ORIENTACOES) {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = nome; inp.value = o.valor; inp.id = `${nome}-${o.valor}`; inp.checked = o.valor === escolhido;
    inp.addEventListener('change', aoMudar);
    inp.setAttribute('aria-describedby', `${inp.id}-desc`);
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = o.nome;
    const desc = document.createElement('div'); desc.id = `${inp.id}-desc`; desc.className = 'desc'; desc.textContent = o.descricao || '';
    d.append(inp, lab, desc); grupo.appendChild(d);
  }
}
const nomeOrientacao = (v) => (DV.ORIENTACOES.find((o) => o.valor === v) || {}).nome || v;

$('d-btn-video').addEventListener('click', async () => {
  if (divisao.rodando) return;
  const r = await window.api.escolherVideo('Escolha o vídeo para dividir');
  if (!r) return;
  if (r.erro) return falar('Não consegui abrir: ' + r.erro);
  divisao.video = r; divisao.legenda = null; divisao.temLegenda = false; divisao.confirmado = null;
  $('d-btn-abrir').hidden = true;
  const fmt = DV.formatoDe(r.largura, r.altura);
  $('d-info').textContent = `${nomeDoArquivo(r.caminho)}, ${duracaoFalada(r.duracao)}, ${fmt}, ${r.largura} por ${r.altura}. Procurando legenda na imagem...`;
  falar($('d-info').textContent);
  try {
    const d = await window.api.editarDetectar({ arquivo: r.caminho, duracao: r.duracao });
    divisao.temLegenda = !!(d.ok && d.valor.legenda);
  } catch (_) { divisao.temLegenda = false; }
  $('d-info').textContent = `${nomeDoArquivo(r.caminho)}, ${duracaoFalada(r.duracao)}, ${fmt}, ${r.largura} por ${r.altura}.` + (divisao.temLegenda ? ' Parece ter legenda gravada na imagem.' : '');
  setTimeout(() => falar($('d-info').textContent), 150);
});

/** Resumo da divisão por tempo, com os avisos antes de fazer. Devolve { ok, partes, avisos }. */
function resumoDivisao() {
  const v = divisao.video;
  const t = DV.lerTempo($('d-tamanho').value);
  const orientacao = valorDv('dv-orientacao') || 'manter';
  if (t === null) return { ok: false, texto: 'Digite o tamanho de cada parte em minutos e segundos, como 1:30, ou 0 para só mudar a orientação.' };
  if (t === 0 && orientacao === 'manter') return { ok: false, texto: 'Com 0, o vídeo não é dividido: escolha uma orientação nova, senão não há o que fazer.' };
  if (t > 0 && t < 5) return { ok: false, texto: 'Cada parte precisa ter pelo menos 5 segundos.' };
  const partes = DV.planejarPartes(v.duracao, t);
  const avisos = DV.avisosOrientacao(orientacao, v.largura, v.altura, divisao.temLegenda);
  let texto;
  if (t === 0 || partes.length === 1) texto = `O vídeo não é dividido: sai inteiro, ${nomeOrientacao(orientacao).toLowerCase()}.`;
  else {
    const ultima = partes[partes.length - 1];
    const durUltima = ultima.fim - ultima.inicio;
    texto = `${partes.length} partes de ${duracaoFalada(t)}` + (Math.abs(durUltima - t) > 0.5 ? `, a última com ${duracaoFalada(durUltima)}.` : '.') + ` Orientação: ${nomeOrientacao(orientacao).toLowerCase()}.`;
  }
  return { ok: true, partes, orientacao, avisos, texto: texto + (avisos.length ? ' Atenção: ' + avisos.join(' ') : '') };
}
function atualizarResumoDivisao() { if (divisao.video) $('d-resumo').textContent = resumoDivisao().texto; divisao.confirmado = null; }
$('d-tamanho').addEventListener('input', atualizarResumoDivisao);
$('d-tamanho').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); atualizarResumoDivisao(); falar($('d-resumo').textContent); } });
montarOrientacoes($('grupo-dv-orientacao'), 'dv-orientacao', 'manter', atualizarResumoDivisao);

$('dv-video-continuar').addEventListener('click', () => {
  if (!divisao.video) return falar('Escolha o vídeo antes de continuar.');
  mostrarDv('dv-modo');
});
$('dv-video-fechar').addEventListener('click', () => { if (!divisao.rodando) window.api.appSair(); });
$('d-btn-voltar').addEventListener('click', () => { if (divisao.rodando) return falar('Espere terminar, ou cancele antes de voltar.'); mostrarTela('inicial'); });
$('dv-modo-continuar').addEventListener('click', () => {
  const m = valorDv('dv-modo');
  if (!m) return falar('Escolha como dividir: por tempo ou cortes manuais.');
  divisao.modo = m;
  if (m === 'tempo') { atualizarResumoDivisao(); return mostrarDv('dv-tempo'); }
  abrirLegendaDv();
});
$('dv-modo-voltar').addEventListener('click', () => mostrarDv('dv-video'));
$('dv-modo-fechar').addEventListener('click', () => window.api.appSair());
$('dv-tempo-continuar').addEventListener('click', () => {
  const r = resumoDivisao();
  $('d-resumo').textContent = r.texto;
  if (!r.ok) return falar(r.texto);
  // Com aviso, o primeiro Salvar e continuar só avisa; o segundo segue.
  const chave = JSON.stringify([r.partes.length, r.orientacao, $('d-tamanho').value]);
  if (r.avisos.length && divisao.confirmado !== chave) {
    divisao.confirmado = chave;
    return falar(`${r.avisos.join(' ')} Para seguir assim, Salvar e continuar de novo.`);
  }
  divisao.plano = r;
  abrirLegendaDv();
});
$('dv-tempo-voltar').addEventListener('click', () => mostrarDv('dv-modo'));
$('dv-tempo-fechar').addEventListener('click', () => window.api.appSair());

function infoLegendaDv() {
  if (divisao.legenda) return `Legenda: ${divisao.legenda.nome}, ${divisao.legenda.quantas} falas, estilo ${Legendas.estilo(divisao.legenda.estilo).nome}.`;
  if (divisao.temLegenda) return 'Parece ter legenda gravada na imagem. No formato vertical, preenchendo a tela, ela pode ficar cortada. Você decide se continua.';
  return 'O vídeo não parece ter legenda. Dá para incluir uma nova, no estilo Shorts e Reels, por SRT ou gerando com o modelo. Opcional.';
}
function abrirLegendaDv(aviso = '') {
  $('dv-legenda-info').textContent = infoLegendaDv();
  $('dv-legenda-abrir').textContent = divisao.legenda ? 'Trocar a legenda' : 'Adicionar legenda';
  mostrarDv('dv-legenda', aviso ? `${aviso} ${$('dv-legenda-info').textContent}` : $('dv-legenda-info').textContent);
}
$('dv-legenda-abrir').addEventListener('click', () => {
  const v = divisao.video;
  // O estilo Shorts e Reels já vem marcado; a pessoa pode trocar.
  const sh = document.getElementById('lg-estilo-shorts'); if (sh) sh.checked = true;
  window.gravarTela.abrirLegenda({
    audio: v.caminho,
    nome: nomeDoArquivo(v.caminho).replace(/\.[^.]+$/, ''),
    aoTerminar: (r) => { if (r) divisao.legenda = r; mostrarTela('dividir'); abrirLegendaDv(r ? 'Legenda feita.' : ''); },
    aoVoltar: () => { mostrarTela('dividir'); abrirLegendaDv(); }
  });
});
$('dv-legenda-continuar').addEventListener('click', () => {
  if (divisao.modo === 'manual') return abrirCortesManuais();
  const p = divisao.plano;
  $('dv-gerar-info').textContent = `${p.texto}${divisao.legenda ? ' Com legenda.' : ''}`;
  mostrarDv('dv-gerar', $('dv-gerar-info').textContent);
});
$('dv-legenda-voltar').addEventListener('click', () => (divisao.modo === 'manual' ? mostrarDv('dv-modo') : mostrarDv('dv-tempo')));
$('dv-legenda-fechar').addEventListener('click', () => window.api.appSair());
$('dv-gerar-voltar').addEventListener('click', () => { if (!divisao.rodando) abrirLegendaDv(); });
$('dv-gerar-fechar').addEventListener('click', () => { if (!divisao.rodando) window.api.appSair(); });

/** Salva os trechos (partes ou cortes) e diz como foi. */
async function salvarTrechosDv(cortes, modo, rotulo) {
  divisao.rodando = true; travarDivisao(true);
  const total = cortes.length;
  const solta = window.api.aoAndamentoDivisao((d) => {
    $('d-progresso').value = Math.round(((d.atual - 1) / d.total) * 100);
    falar(`${rotulo === 'corte' ? 'Corte' : 'Parte'} ${d.atual} de ${d.total}.`);
  });
  try {
    const r = await window.api.dividirCortes({ entrada: divisao.video.caminho, cortes, modo, legenda: divisao.legenda ? { srt: divisao.legenda.srt, estilo: divisao.legenda.estilo } : null,
      nome: nomeDoArquivo(divisao.video.caminho), rotulo });
    if (!r.ok) {
      if (/CANCELADO/.test(r.erro || '')) { falar('Cancelado. As partes já prontas ficaram na pasta.'); return null; }
      falar('Não consegui dividir. ' + r.erro); return null;
    }
    const v = r.valor;
    $('d-progresso').value = 100;
    const formato = v.video && v.audio ? 'em vídeo e em áudio' : v.video ? 'em vídeo' : 'em áudio';
    const msg = `Pronto: ${v.feitos.length === 1 ? (rotulo === 'corte' ? '1 corte salvo' : '1 parte salva') : v.feitos.length + (rotulo === 'corte' ? ' cortes salvos' : ' partes salvas')} ${formato}, na pasta ${v.documentos}, Olho da Cena.`;
    return msg;
  } finally { solta(); divisao.rodando = false; travarDivisao(false); void total; }
}
$('d-btn-dividir').addEventListener('click', async () => {
  if (divisao.rodando || !divisao.plano) return;
  const p = divisao.plano;
  const msg = await salvarTrechosDv(p.partes.map((x) => ({ ...x, orientacao: p.orientacao })), 'video', 'parte');
  if (msg) { $('dv-gerar-info').textContent = msg; $('d-btn-abrir').hidden = false; $('d-btn-abrir').focus(); setTimeout(() => falar(msg), 150); }
});
$('d-btn-cancelar').addEventListener('click', () => { if (divisao.rodando) { window.api.dividirCancelar(); falar('Cancelando depois da parte atual.'); } });
$('d-btn-abrir').addEventListener('click', () => window.api.pastaAbrir());

// --- Cortes manuais: as telas de Cortes do áudio, e o Alt S abre a janela de salvar ---
function abrirCortesManuais() {
  window.gravarTela.dividirManual({ caminho: divisao.video.caminho, nome: nomeDoArquivo(divisao.video.caminho) }, {
    aoSalvar: (trechos) => abrirJanelaCortes(trechos),
    aoVoltar: () => { mostrarTela('dividir'); abrirLegendaDv(); }
  });
}
function avisosDosCortes() {
  const v = divisao.video, avisos = new Set();
  for (const sel of $('dv-dlg-cortes').querySelectorAll('select')) for (const a of DV.avisosOrientacao(sel.value, v.largura, v.altura, divisao.temLegenda)) avisos.add(a);
  if (valorDv('dv-saida') === 'audio') return '';
  return avisos.size ? 'Atenção: ' + [...avisos].join(' ') : '';
}
function abrirJanelaCortes(trechos) {
  divisao.cortesManuais = trechos;
  const lista = $('dv-dlg-cortes');
  lista.innerHTML = '';
  trechos.forEach((t, i) => {
    const id = 'dv-corte-' + i;
    const lab = document.createElement('label'); lab.htmlFor = id;
    lab.textContent = `Orientação do corte ${i + 1}, de ${tempoPreciso(t.inicio)} a ${tempoPreciso(t.fim)}`;
    const sel = document.createElement('select'); sel.id = id;
    for (const o of DV.ORIENTACOES) { const op = document.createElement('option'); op.value = o.valor; op.textContent = o.nome; sel.appendChild(op); }
    sel.value = divisao.ultimaOrientacao || 'manter';
    sel.addEventListener('change', () => { divisao.ultimaOrientacao = sel.value; $('dv-dlg-avisos').textContent = avisosDosCortes(); });
    lista.append(lab, sel);
  });
  $('dv-dlg-info').textContent = `${trechos.length === 1 ? '1 corte' : trechos.length + ' cortes'}.${divisao.legenda ? ' Com legenda.' : ''}`;
  $('dv-dlg-avisos').textContent = avisosDosCortes();
  const dlg = $('dv-dlg');
  dlg.showModal();
  const formatoCfg = (window.__olhoConfig || {}).altS || 'ambos';
  $('dv-saida-' + formatoCfg).checked = true;
  (document.querySelector('input[name="dv-saida"]:checked') || $('dv-saida-ambos')).focus();
  falar(`Salvar os cortes. ${$('dv-dlg-info').textContent} Apenas áudio, apenas vídeo ou ambos.`);
}
document.querySelectorAll('input[name="dv-saida"]').forEach((r) => r.addEventListener('change', () => { $('dv-dlg-avisos').textContent = avisosDosCortes(); }));
$('dv-dlg-cancelar').addEventListener('click', () => $('dv-dlg').close());
$('dv-dlg-salvar').addEventListener('click', async () => {
  if (divisao.rodando) return;
  const modo = valorDv('dv-saida') || 'ambos';
  const cortes = divisao.cortesManuais.map((t, i) => ({ inicio: t.inicio, fim: t.fim, orientacao: $('dv-corte-' + i).value }));
  $('dv-dlg').close();
  falar(`Salvando ${cortes.length === 1 ? 'o corte' : 'os ' + cortes.length + ' cortes'}.`);
  const msg = await salvarTrechosDv(cortes, modo, 'corte');
  if (msg) setTimeout(() => falar(msg + ' As seleções continuam marcadas.'), 150);
});

function travarDivisao(rodando) {
  for (const id of ['d-btn-video', 'd-tamanho', 'd-btn-dividir', 'dv-gerar-voltar', 'dv-video-continuar']) $(id).disabled = rodando;
  $('d-btn-cancelar').disabled = !rodando;
}

$('ir-dividir').addEventListener('click', () => {
  mostrarTela('dividir');
  mostrarDv('dv-video', 'Dividir vídeo.');
});

// --- Sem imagens e movimento renovado ----------------------------------------

function semImagensAtivo() {
  return $('g-sem-imagens').checked;
}

$('g-sem-imagens').addEventListener('change', () => {
  const sem = semImagensAtivo();
  $('g-sec-modo').hidden = sem;
  $('g-sec-imagens').hidden = sem;
  falar(
    sem
      ? 'Sem imagens: o vídeo será uma tela preta com o título do vídeo. Escreva o título acima. As imagens deixam de ser pedidas.'
      : 'Voltou a pedir imagens.'
  );
});

// --- Etapas da tela de montar ------------------------------------------------

const NOMES_ETAPAS = ['Áudio', 'Orientação e título', 'Imagens', 'Legenda', 'Títulos em outros momentos', 'Logo', 'Encerramento', 'Atmosfera e qualidade'];
const N_ETAPAS = NOMES_ETAPAS.length;

function etapaAtual() {
  for (let n = 1; n <= N_ETAPAS; n++) if (!$('g-etapa-' + n).hidden) return n;
  return 1;
}

/**
 * Mostra só uma etapa. O foco vai para o título da etapa nova (o leitor de
 * tela lê "Etapa 2 de 8: Orientação e título" sozinho) e o som de qualquer
 * tocador da etapa que ficou para trás é parado, senão ele continuaria
 * tocando fora de vista.
 */
function irParaEtapa(n) {
  for (let i = 1; i <= N_ETAPAS; i++) {
    $('g-etapa-' + i).hidden = i !== n;
    const b = $('g-nav-' + i);
    if (i === n) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  }
  try { $('m-audio').pause(); } catch (_) {}
  try { lAudio().pause(); } catch (_) {}
  try { $('t5-audio').pause(); } catch (_) {}
  if (n === 3) {
    const sem = semImagensAtivo();
    $('g-sem-imagens-aviso').hidden = !sem;
  }
  aplicarAtalhos(telaAtual());
  // 3.0.3: na etapa dos títulos o foco vai para um botão, para o NVDA deixar Home, End e Page Up e Down chegarem à tela.
  ($('g-etapa-' + n + '-titulo') && n !== 5 ? $('g-etapa-' + n + '-titulo') : $('t5-tocar')).focus();
}

function temImagensParaGerar() {
  return modoManualAtivo() ? estado.manualImagens.length > 0 : estado.imagens.length > 0;
}

// 1.9: o áudio do Montar passa pelas quatro etapas de áudio do Gravar vídeo. Só depois disso
// as outras etapas ficam livres, porque títulos, imagens manuais e logos são marcados no áudio final.
estado.audioPronto = false;
function pedirEtapa(n) {
  if (n > 1 && !estado.audioPronto) {
    return falar('Primeiro o áudio: na Etapa 1, escolha o áudio e use Salvar e continuar para passar pelas etapas de áudio.');
  }
  irParaEtapa(n);
}

/** Etapa 1, Salvar e continuar: leva o áudio para as etapas de áudio (Cortes, Silêncios, Efeitos e trilhas, Equalização). */
async function audioParaEtapasDeAudio() {
  if (!estado.audios.length) return falar('Escolha o áudio antes de continuar.');
  if (estado.audioPendente && !(await montarAudioFinal())) return;
  if (!estado.audio) return falar('Escolha o áudio antes de continuar.');
  // O áudio que entra nas etapas é o da lista (o original ou o montado), não o resultado anterior.
  if (!estado.audioDaLista || estado.audioPendenteDeEtapas) {
    estado.audioDaLista = { caminho: estado.audio, url: estado.audioUrl, duracao: estado.duracaoAudio };
    estado.audioPendenteDeEtapas = false;
  }
  const fonte = estado.audioDaLista;
  window.gravarTela.audioDoMontar({ original: fonte.caminho, nome: nomeDoArquivo(estado.audios[0].caminho), pasta: '' }, {
    aoTerminar: async (salvo) => {
      const r = await window.api.montarExtrairaudio({ arquivo: salvo.arquivo });
      if (!r.ok) return falar('Não consegui preparar o áudio final: ' + r.erro);
      const v = r.valor;
      aplicarAudioAtual(v.caminho, v.url, v.duracao);
      estado.audioPronto = true;
      atualizarResumoAudios();
      $('audio-status').textContent = `Áudio pronto para o vídeo: ${formatarTempo(v.duracao)}.`;
      mostrarTela('gerar');
      irParaEtapa(2);
      setTimeout(() => falar(`Áudio pronto: ${duracaoFalada(v.duracao)}. Etapa 2 de 8: Orientação e título.`), 250);
    },
    aoVoltar: () => {
      mostrarTela('gerar');
      irParaEtapa(1);
    }
  });
}

document.querySelectorAll('#g-etapas button').forEach((b) => {
  b.addEventListener('click', () => { if (!estado.rodando) pedirEtapa(Number(b.dataset.etapa)); });
});

for (let n = 1; n < N_ETAPAS; n++) {
  $('g-continuar-' + n).addEventListener('click', async () => {
    if (estado.rodando) return;
    if (n === 1) return audioParaEtapasDeAudio();
    if (n === 2 && semImagensAtivo() && !$('titulo-simples').value.trim()) {
      return falar('Sem imagens, o título do vídeo é obrigatório. Escreva o título antes de continuar.');
    }
    if (n === 3 && !semImagensAtivo() && !temImagensParaGerar()) {
      return falar(
        modoManualAtivo()
          ? 'Marque pelo menos uma imagem ouvindo o áudio antes de continuar.'
          : 'Adicione pelo menos uma imagem antes de continuar.'
      );
    }
    // 1.9: depois das Imagens, a tela de legenda.
    if (n === 3) return abrirLegendaMontar();
    irParaEtapa(n + 1);
  });
}

for (let n = 1; n <= N_ETAPAS; n++) {
  $('g-voltar-' + n).addEventListener('click', () => {
    if (estado.rodando) return falar('Espere terminar, ou cancele antes de voltar.');
    if (n === 1) return mostrarTela('inicial');
    // Da Etapa 2, Voltar volta para a última etapa de áudio.
    if (n === 2 && window.gravarTela.voltarAoAudioDoMontar()) return;
    irParaEtapa(n - 1);
  });
  $('g-fechar-' + n).addEventListener('click', () => {
    if (estado.rodando) return falar('Espere terminar, ou cancele antes de fechar.');
    window.api.appSair();
  });
}

// --- Navegação ---------------------------------------------------------------

$('ir-gravar').addEventListener('click', () => {
  // Do menu inicial, a tela Gravar sempre abre no começo, para gravar (o vídeo anterior já está salvo).
  $('grav-captura').hidden = false;
  $('grav-decidir').hidden = true;
  $('grav-pronto').hidden = true;
  // 1.9: do menu inicial, começa sempre na Etapa 1 da gravação.
  if (window.gravarTela && window.gravarTela.irParaEtapaGrav) window.gravarTela.irParaEtapaGrav(1, { silencioso: true });
  mostrarTela('gravar');
});

$('ir-pasta').addEventListener('click', async () => {
  const r = await window.api.pastaAbrir();
  if (r && r.ok) falar('Abrindo a pasta Olho da Cena.');
  else falar('Não consegui abrir a pasta: ' + (r ? r.erro : 'erro desconhecido.'));
});

/** Ponte com o gravar.js (telas Gravar e Melhorar). */
window.olho = {
  telaAtual,
  mostrarTela,
  abrirNoEditar,
  // 1.9.6: Alt D na foto do Editar.
  descreverComModelo: (caminho) => descreverComModelo(caminho),
  // 2.0.2: Alt Q, a descrição completa do quadro em que o vídeo ou a câmera está.
  // 3.0.1: com contexto (moldura, fundo, escrito, figurinha), o descritor analisa a composição, e não só descreve a cena.
  async descreverQuadro(caminho, contexto) {
    if (descritor.ocupado) return falar('Aguarde, o descritor está trabalhando.');
    if (!descritor.instalado) { if (await oferecerGemma()) falar('Gemma instalado. Aperte Alt Q de novo para descrever.'); return; }
    falar(contexto ? 'Olhando a imagem e a composição com o descritor. Pode levar alguns minutos.' : 'Olhando o quadro com o descritor. Pode levar alguns minutos.');
    const r = await pedirDescricao(caminho, contexto ? 'composicao' : 'quadro', contexto);
    if (!r.ok) return falar(r.cancelado ? 'Descrição cancelada.' : 'Não consegui descrever o quadro. ' + r.erro);
    falarLimpo(r.texto);
    return r.texto;
  },
  // 1.9.2: com "Perguntar a cada vez", o Alt S abre a janela Salvar em; devolve o formato, ou null se cancelou.
  // Com "Salvar automaticamente", devolve undefined (vale o formato das Configurações).
  perguntarFormato() {
    if ((window.__olhoConfig || {}).altSPergunta !== 'perguntar') return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const dlg = $('altS-dlg');
      const atual = (window.__olhoConfig || {}).altS || 'ambos';
      $('altS-saida-' + atual).checked = true;
      let resposta = null;
      const salvar = () => { resposta = (document.querySelector('input[name="altS-saida"]:checked') || {}).value || 'ambos'; dlg.close(); };
      const cancelar = () => dlg.close();
      $('altS-dlg-salvar').onclick = salvar;
      $('altS-dlg-cancelar').onclick = cancelar;
      const antes = document.activeElement;
      dlg.onclose = () => { if (antes && document.contains(antes)) antes.focus(); if (!resposta) falar('Nada foi salvo.'); resolve(resposta); };
      dlg.showModal();
      $('altS-saida-' + atual).focus();
      falar('Salvar em: apenas áudio, apenas vídeo ou ambos.');
    });
  },
  // 1.9.1: Alt S nas telas do renderer.
  async salvarNaTela(tela) {
    const copia = async (arquivo, nome, oque) => {
      const modo = await window.olho.perguntarFormato();
      if (modo === null) return;
      falar(`Salvando ${oque}.`);
      const r = await window.api.salvarCopia({ arquivo, nome, modo });
      if (!r.ok) return falar('Não consegui salvar. ' + r.erro);
      const v = r.valor;
      const formato = v.video && v.audio ? 'em vídeo e em áudio' : v.video ? 'em vídeo' : 'em áudio';
      setTimeout(() => falar(`Salvo ${formato}, na pasta ${v.documentos}, Olho da Cena, com o nome ${v.nome}.`), 150);
    };
    if (tela === 'gerar') {
      if (estado.rodando) return falar('Espere terminar a montagem.');
      if (!estado.audioPronto || !estado.audio) return falar('Nada para salvar ainda. O áudio fica pronto depois das etapas de áudio, na Etapa 1.');
      return copia(estado.audio, nomeDoArquivo(estado.audios.length ? estado.audios[0].caminho : estado.audio), 'o áudio do vídeo');
    }
    if (tela === 'edicao') {
      if (!edicao.arquivo) return falar('Nada para salvar ainda. Adicione um vídeo ou um áudio.');
      return copia(edicao.arquivo.original, edicao.arquivo.nome, 'uma cópia do arquivo');
    }
    if (tela === 'juntar') return $('j-btn-juntar').click();
    if (tela === 'dividir') return $('d-btn-dividir').click();
    falar('Nada para salvar nesta tela.');
  },
  voltarAEdicao(aviso) {
    mostrarTela('edicao');
    desenharEdicao();
    setTimeout(() => falar(aviso ? `${aviso} De volta à tela Editar.` : 'De volta à tela Editar.'), 250);
  },
  // 1.9.2: Editar áudio, "Imagens, como no Montar vídeo": o áudio editado entra pronto no Montar, na Etapa 2.
  async montarComAudio(arquivo, nome, formato) {
    const r = await window.api.montarExtrairaudio({ arquivo });
    if (!r.ok) return falar('Não consegui preparar o áudio para o Montar. ' + r.erro);
    const v = r.valor;
    estado.audios = [{ caminho: v.caminho, url: v.url, duracao: v.duracao, nome: `${nome}.m4a`, velocidade: 1 }];
    estado.audioPendente = false;
    aplicarAudioAtual(v.caminho, v.url, v.duracao);
    estado.audioDaLista = { caminho: v.caminho, url: v.url, duracao: v.duracao };
    estado.audioPronto = true;
    desenharAudios(); atualizarResumoAudios();
    const sel = $('formato');
    if (sel && [...sel.options].some((o) => o.value === formato)) sel.value = formato;
    mostrarTela('gerar');
    irParaEtapa(2);
    setTimeout(() => falar('Áudio pronto no Montar vídeo. Etapa 2 de 8: Orientação e título.'), 250);
  },
  voltarAoEditar() {
    mostrarTela('cortar');
    setTimeout(() => falar('De volta ao Editar vídeo.' + (corte.video ? ` Vídeo ${nomeDoArquivo(corte.video.caminho)}.` : '')), 250);
  }
};

$('ir-gerar').addEventListener('click', () => {
  mostrarTela('gerar');
  falar('Tela de montar vídeo.');
});

$('ir-juntar').addEventListener('click', () => {
  mostrarTela('juntar');
  falar('Tela de juntar vídeos.');
});

// 1.9: Edição de vídeo e áudio: primeiro o arquivo, depois Editar áudio ou Editar vídeo.
const edicao = { arquivo: null, modo: 'video' };
function desenharEdicao() {
  const a = edicao.arquivo;
  $('ed-opcoes').hidden = !a;
  if (!a) { $('ed-info').textContent = 'Nenhum arquivo escolhido.'; return; }
  // 3.0: pelo menu Vídeo só vale Editar vídeo, e pelo menu Áudio só Editar áudio.
  $('ed-audio').hidden = !a.temAudio || edicao.modo === 'video';
  $('ed-video').hidden = a.soAudio || edicao.modo === 'audio';
  const tipo = a.soAudio ? 'Áudio' : 'Vídeo';
  let aviso = a.soAudio ? ' É um arquivo só de áudio: use Editar áudio.' : (a.temAudio ? '' : ' Atenção: este vídeo não tem som, então só o Editar vídeo vale para ele.');
  if (edicao.modo === 'video' && a.soAudio) aviso = ' É um arquivo só de áudio, e aqui se edita vídeo. Use o menu Áudio, Editar.';
  if (edicao.modo === 'audio' && !a.temAudio) aviso = ' Este vídeo não tem som, então não há áudio para editar.';
  $('ed-info').textContent = `${tipo} ${a.nome}, ${duracaoFalada(a.duracao)}.${aviso}`;
}
function abrirEdicao(modo) {
  edicao.modo = modo;
  mostrarTela('edicao');
  desenharEdicao();
  const o = modo === 'audio' ? 'Editar áudio.' : 'Editar vídeo.';
  falar(o + (edicao.arquivo ? '' : ` Adicione ${modo === 'audio' ? 'um áudio, ou um vídeo para editar o som dele' : 'um vídeo'}.`));
}
$('ir-cortar').addEventListener('click', () => abrirEdicao('video'));
$('ir-editar-audio').addEventListener('click', () => abrirEdicao('audio'));
$('ir-gaudio').addEventListener('click', () => mostrarTela('gaudio'));
$('ed-adicionar').addEventListener('click', async () => {
  const r = await window.api.edicaoEscolher();
  if (!r.ok) return falar('Não consegui abrir: ' + r.erro);
  if (!r.valor) return;
  edicao.arquivo = r.valor;
  desenharEdicao();
  // 3.0.3: depois de adicionar, já vai para a primeira etapa. Só fica na tela, com o aviso, quando o arquivo não serve a este modo.
  const alvoFoco = edicao.modo === 'audio' ? 'ed-audio' : 'ed-video';
  if (!$(alvoFoco).hidden) { $(alvoFoco).click(); return; }
  falar($('ed-info').textContent);
});
$('ed-audio').addEventListener('click', () => {
  if (!edicao.arquivo) return;
  if (window.gravarTela && window.gravarTela.editarAudio) window.gravarTela.editarAudio(edicao.modo === 'audio' ? { ...edicao.arquivo, semImagem: true } : edicao.arquivo);
});
// 1.9.2: o Editar vídeo novo, em etapas (a tela antiga saiu do caminho).
$('ed-video').addEventListener('click', () => {
  if (!edicao.arquivo || edicao.arquivo.soAudio) return;
  if (window.gravarTela && window.gravarTela.editarVideo) window.gravarTela.editarVideo(edicao.arquivo);
});
$('ed-voltar').addEventListener('click', () => mostrarTela('inicial'));
$('ed-fechar').addEventListener('click', () => window.api.appSair());

$('j-btn-voltar').addEventListener('click', () => {
  if (estado.juntando) return falar('Espere terminar, ou cancele antes de voltar.');
  mostrarTela('inicial');
});


// --- Início ------------------------------------------------------------------

(async function iniciar() {
  estado.presets = await window.api.listarPresets();
  const sel = $('preset');
  estado.presets.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.nome;
    sel.appendChild(o);
  });
  $('descricao-preset').textContent = estado.presets[0]?.descricao || '';
  // 1.9.2: os presets como opções de marcar, cada um com o texto embaixo, igual aos fundos.
  // A lista escondida (#preset) continua sendo a fonte do valor para o resto do Montar.
  const grupoPreset = $('grupo-preset');
  estado.presets.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = 'preset-escolha'; inp.value = p.id; inp.id = 'preset-' + p.id; inp.checked = i === 0;
    inp.setAttribute('aria-describedby', `preset-${p.id}-desc`);
    inp.addEventListener('change', () => { if (inp.checked) { sel.value = p.id; sel.dispatchEvent(new Event('change')); } });
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = p.nome;
    const desc = document.createElement('p'); desc.className = 'desc'; desc.id = `preset-${p.id}-desc`;
    desc.textContent = `${p.utilizacao} ${p.contraindicacao} ${p.cena}`;
    d.append(inp, lab, desc); grupoPreset.appendChild(d);
  });

  // A troca de preset por título usa a mesma lista, com "não trocar" na
  // frente — por isso é um <select> à parte, montado aqui também.
  const selTroca = $('titulo-trocar-preset');
  estado.presets.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.nome;
    selTroca.appendChild(o);
  });

  // Formato e qualidade: mesmo padrão dos presets — o <select> lista os nomes e
  // o parágrafo abaixo explica, ligado por aria-describedby.
  const preencher = async (idSelect, idDescricao, carregar) => {
    const itens = await carregar();
    const el = $(idSelect);
    itens.forEach((it) => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.nome;
      el.appendChild(o);
    });
    $(idDescricao).textContent = itens[0]?.descricao || '';
    el.addEventListener('change', () => {
      const atual = itens.find((x) => x.id === el.value);
      $(idDescricao).textContent = atual ? atual.descricao : '';
    });
  };

  await preencher('formato', 'descricao-formato', window.api.listarFormatos);
  await preencher('qualidade', 'descricao-qualidade', window.api.listarQualidades);

  // Montar vídeo: orientação, atmosfera (preset) e qualidade ficam guardadas para a próxima vez.
  const rc = await window.api.configLer();
  const cfg = rc && rc.ok ? rc.valor : {};
  const restaurar = (id, valor) => {
    const el = $(id);
    if (valor && [...el.options].some((o) => o.value === valor)) {
      el.value = valor;
      el.dispatchEvent(new Event('change'));
    }
  };
  restaurar('formato', cfg.montarFormato);
  restaurar('preset', cfg.montarPreset);
  restaurar('qualidade', cfg.montarQualidade);
  const guardar = (id, chave) => $(id).addEventListener('change', () => { window.api.configSalvar({ [chave]: $(id).value }); });
  guardar('formato', 'montarFormato');
  guardar('preset', 'montarPreset');
  guardar('qualidade', 'montarQualidade');

  // Pasta do programa e aviso (uma vez só) sobre a pasta antiga do Gravador.
  let avisoPasta = '';
  const rp = await window.api.pastasInfo();
  if (rp && rp.ok) {
    const pi = rp.valor;
    $('pasta-info').textContent = cfg.pastaArquivos ? `Tudo o que o programa salva vai para a pasta ${cfg.pastaArquivos}.` : `Tudo o que o programa salva vai para a pasta ${pi.nomePasta}, em ${pi.documentos}.`;
    if (pi.antiga && !cfg.avisoPastaAntiga) {
      avisoPasta = ` As gravações antigas continuam na pasta ${pi.nomeAntiga}, em ${pi.documentos}; nada foi movido nem apagado. As novas vão para a pasta ${pi.nomePasta}.`;
      window.api.configSalvar({ avisoPastaAntiga: true });
    }
    if (pi.avisoAtualizacao) {
      avisoPasta += ' ' + pi.avisoAtualizacao;
      window.api.configSalvar({ avisoAtualizacao: '' });
    }
  }

  // Mesmos menus na tela de juntar. Os presets aparecem lá com a descrição
  // escrita para um contexto sem imagem nem movimento: só o estilo do título.
  await preencher('j-preset', 'j-desc-preset', () => window.api.listarPresets('titulo'));
  await preencher('j-formato', 'j-desc-formato', window.api.listarFormatos);
  await preencher('j-qualidade', 'j-desc-qualidade', window.api.listarQualidades);

  VOLUMES_TRILHA.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = String(v.valor);
    o.textContent = v.nome;
    if (i === 1) o.selected = true; // baixa, 10 por cento
    $('j-trilha-volume').appendChild(o);
  });

  VOLUMES_TRILHA.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = String(v.valor);
    o.textContent = v.nome;
    if (i === 1) o.selected = true;
    $('c-trilha-volume').appendChild(o);
  });

  const ff = await window.api.verificarFFmpeg();
  if (!ff.ffmpeg || !ff.ffprobe) {
    falar(
      'Atenção: o FFmpeg não foi encontrado. Procurei no PATH e nas pastas do ' +
      'winget, scoop e chocolatey. Instale o FFmpeg, ou aponte a pasta dele na ' +
      'variável de ambiente FFMPEG_DIR.'
    );
  } else {
    // Dizer de onde veio ajuda quando há mais de uma instalação na máquina.
    // 3.0.1: a abertura diz o nome e a versão, e mais nada que não ajude (a nota do FFmpeg fora do PATH saiu).
    let ver = '';
    try { const rv = await window.api.appVersao(); if (rv && rv.ok) ver = rv.valor; } catch (_) { /* sem a versão */ }
    falar(`Olho da Cena${ver ? `, versão ${ver}` : ''}. Seu olhar autônomo para inclusão nas redes sociais.` + avisoPasta);
  }

  estado.limites = await window.api.limitesTitulo();

  // O limite muda com o formato (no vertical cabe menos), então os contadores
  // são recalculados quando o formato muda.
  $('formato').addEventListener('change', async () => {
    atualizarContador('titulo-texto', 'titulo-contador', 'titulo');
    atualizarContador('texto-fim', 'fim-contador', 'fim');
    atualizarContador('titulo-simples', 'titulo-simples-contador', 'titulo');
    const todas = [...new Set([...estado.imagens, ...estado.manualImagens.map((m) => m.caminho)])];
    await revalidarImagens(todas);
    desenharLista();
    desenharManual();
    const nome = $('formato').selectedOptions[0] ? $('formato').selectedOptions[0].textContent : 'novo formato';
    const conflitos = todas.filter((c) => {
      const a = estado.avisosImagens[c];
      return a && !a.ignorado && a.motivo === 'orientacao';
    }).length;
    if (todas.length) {
      falar(
        conflitos
          ? `Formato: ${nome}. ${conflitos} imagem(ns) não combinam com essa orientação; confira os avisos na lista.`
          : `Formato: ${nome}. Todas as imagens combinam com essa orientação.`
      );
    }
  });

  atualizarContador('titulo-texto', 'titulo-contador', 'titulo');
  atualizarContador('titulo-simples', 'titulo-simples-contador', 'titulo');
  atualizarContador('texto-fim', 'fim-contador', 'fim');

  desenharLista();
  desenharTitulos();
  desenharVideos();
  desenharDescartes();
  desenharTrilhas('j', juntar.camadas);
  desenharTrilhas('c', corte.camadas);
  ['j', 'c', 'e'].forEach(atualizarBlocoFadeTrilha);
  mostrarTela('inicial');
})();


// --- 1.8: Configurações ---------------------------------------------------------
const MODOS_ALT_S = { ambos: 'vídeo e áudio', video: 'vídeo', audio: 'áudio' };
function modoAltS() { return MODOS_ALT_S[(window.__olhoConfig || {}).altS] || MODOS_ALT_S.ambos; }
window.__olhoConfig = {};
// 1.9: fonte, tamanho e posição das legendas saíram daqui: agora vêm do estilo escolhido na tela de legenda.
const CAMPOS_CONFIG = ['confirmacao', 'gravados', 'importados', 'altSPergunta', 'altS', 'idiomaDescricao', 'descartados', 'pastas'];
async function carregarConfig() {
  const r = await window.api.configLer();
  if (r && r.ok) window.__olhoConfig = r.valor;
  if (window.__olhoConfig.pastaArquivos) $('pasta-info').textContent = `Tudo o que o programa salva vai para a pasta ${window.__olhoConfig.pastaArquivos}.`;
  return window.__olhoConfig;
}
async function mostrarConfig() {
  const c = await carregarConfig();
  for (const k of CAMPOS_CONFIG) { const el = $(`cf-${k}-${c[k]}`); if (el) el.checked = true; }
  const p = await window.api.pastasInfo();
  $('cf-pasta').textContent = p && p.ok ? p.valor.pasta : '';
}
for (const k of CAMPOS_CONFIG) {
  document.querySelectorAll(`input[name="cf-${k}"]`).forEach((el) => el.addEventListener('change', async () => {
    if (!el.checked) return;
    const r = await window.api.configSalvar({ [k]: el.value });
    if (r && r.ok) window.__olhoConfig = r.valor;
  }));
}

// --- 2.0: Extras: transcrever áudio e descrever imagem -------------------------------------------
const extras = { whisper: null, ocupado: false };
const semExtensao = (n) => String(n).replace(/\.[^.]+$/, '');
async function atualizarExtras() {
  if (!$('tela-extras')) return;
  // Transcrição
  let w = null;
  try { const r = await window.api.legendaEstado(); w = r && r.ok ? r.valor : null; } catch (_) { w = null; }
  extras.whisper = w;
  const modelos = w ? w.modelos : [];
  const instalados = modelos.filter((m) => m.instalado);
  for (const m of modelos) {
    const b = $('ex-tr-baixar-' + m.id);
    if (!b) continue;
    b.hidden = m.instalado;
    b.textContent = `Baixar o ${m.nome}, ${m.tamanhoTexto}`;
  }
  $('ex-tr-grupo').hidden = instalados.length < 2;
  const sel = $('ex-tr-modelo'); const antes = sel.value;
  sel.innerHTML = '';
  for (const m of instalados) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.nome.charAt(0).toUpperCase() + m.nome.slice(1); sel.appendChild(o); }
  if (instalados.some((m) => m.id === antes)) sel.value = antes;
  $('ex-tr-escolher').hidden = !instalados.length;
  $('ex-tr-info').textContent = instalados.length
    ? 'Escolha um áudio ou um vídeo. O programa salva a transcrição em texto e um arquivo SRT, com os tempos, na pasta Olho da Cena.'
    : 'Ainda não há modelo de transcrição. Baixe um para transcrever: o pequeno é mais rápido, o grande é mais preciso.';
  // Descrição de imagem
  $('ex-ds-baixar').hidden = descritor.instalado;
  $('ex-ds-escolher').hidden = !descritor.instalado;
  $('ex-ds-info').textContent = descritor.instalado
    ? 'Escolha uma imagem. O programa fala a descrição e salva em texto na pasta Olho da Cena. Idioma da descrição: nas Configurações.'
    : 'Ainda não há descritor de imagens. Baixe para descrever imagens. É experimental.';
}
async function baixarModeloExtras(id) {
  if (extras.ocupado || descritor.ocupado) return falar('Aguarde, o programa está trabalhando.');
  const m = ((extras.whisper || { modelos: [] }).modelos).find((x) => x.id === id);
  if (!m || m.instalado) return;
  extras.ocupado = true;
  $('ex-tr-cancelar-baixar').hidden = false; $('ex-tr-barra').hidden = false; $('ex-tr-barra').value = 0;
  $('ex-tr-estado').textContent = `Baixando o ${m.nome}. Pode levar alguns minutos.`;
  falar($('ex-tr-estado').textContent);
  comecarBipesDescritor();
  let avisado = -1;
  const solta = window.api.aoProgressoLegenda((p) => {
    $('ex-tr-barra').value = p.pct;
    const degrau = Math.floor(p.pct / 10);
    if (degrau <= avisado || p.pct >= 100 || degrau < 1) return;
    avisado = degrau;
    falarLimpo(`Modelo: ${degrau * 10} por cento.`);
  });
  const r = await window.api.legendaBaixar({ modelo: id });
  solta(); pararBipesDescritor(r.ok);
  extras.ocupado = false;
  $('ex-tr-cancelar-baixar').hidden = true; $('ex-tr-barra').hidden = true;
  await atualizarExtras();
  if (r.ok) { $('ex-tr-estado').textContent = `O ${m.nome} foi baixado e ficou guardado no computador.`; falarLimpo($('ex-tr-estado').textContent); }
  else if (/CANCELADO/.test(r.erro || '')) { $('ex-tr-estado').textContent = 'Download cancelado.'; falar('Download cancelado.'); }
  else falar('Não consegui baixar o modelo. ' + r.erro + ' Confira a internet e tente de novo.');
}
async function transcreverExtras() {
  if (extras.ocupado || descritor.ocupado) return falar('Aguarde, o programa está trabalhando.');
  const modelo = $('ex-tr-modelo').value;
  if (!modelo) return falar('Baixe um modelo primeiro.');
  const e = await window.api.edicaoEscolher();
  if (!e || !e.ok || !e.valor) return falar('Nenhum arquivo escolhido.');
  const arq = e.valor;
  if (!arq.temAudio) return falar('Este arquivo não tem som, então não há o que transcrever.');
  extras.ocupado = true;
  $('ex-tr-escolher').disabled = true; $('ex-tr-cancelar').hidden = false; $('ex-tr-barra').hidden = false; $('ex-tr-barra').value = 0;
  $('ex-tr-estado').textContent = `Transcrevendo ${arq.nome}, ${duracaoFalada(arq.duracao)}. Pode demorar.`;
  falar($('ex-tr-estado').textContent);
  comecarBipesDescritor();
  let avisado = -1, ultimo = Date.now();
  const vivo = setInterval(() => { if (Date.now() - ultimo >= 29000) { ultimo = Date.now(); falarLimpo('Ainda transcrevendo, aguarde.'); } }, 5000);
  const solta = window.api.aoProgressoLegenda((p) => {
    $('ex-tr-barra').value = p.pct;
    const degrau = Math.floor(p.pct / 10);
    if (degrau <= avisado || p.pct >= 100 || degrau < 1) return;
    avisado = degrau; ultimo = Date.now();
    falarLimpo(`Transcrição: ${degrau * 10} por cento.`);
  });
  const r = await window.api.legendaTranscrever({ arquivo: arq.original, modelo });
  solta(); clearInterval(vivo);
  const fim = () => { extras.ocupado = false; $('ex-tr-escolher').disabled = false; $('ex-tr-cancelar').hidden = true; $('ex-tr-barra').hidden = true; };
  if (!r.ok) {
    pararBipesDescritor(false); fim();
    const msg = /CANCELADO/.test(r.erro || '') ? 'Transcrição cancelada.' : 'Não consegui fazer a transcrição. ' + r.erro;
    $('ex-tr-estado').textContent = msg; return falar(msg);
  }
  const palavras = r.valor.palavras;
  const nome = semExtensao(arq.nome);
  const t = await window.api.legendaSalvartexto({ palavras, nome });
  let srt = null;
  if (t.ok) {
    const l = await window.api.legendaMontar({ palavras, estilo: 'youtube' });
    if (l.ok) srt = await window.api.legendaSalvarsrt({ legendas: l.valor, estilo: 'youtube', nome });
  }
  pararBipesDescritor(true); fim();
  if (!t.ok) { const msg = 'A transcrição terminou, mas não consegui salvar. ' + t.erro; $('ex-tr-estado').textContent = msg; return falar(msg); }
  const msg = `Pronto: transcrição de ${arq.nome} salva, com ${t.valor.linhas === 1 ? '1 linha' : t.valor.linhas + ' linhas'} e ${palavras.length} palavras, na pasta ${t.valor.documentos}, Olho da Cena, com o nome ${t.valor.nome.replace(/\.txt$/i, '')}.` +
    (srt && srt.ok ? ` Também o arquivo de legenda SRT, ${srt.valor.nome.replace(/\.srt$/i, '')}.` : '');
  $('ex-tr-estado').textContent = msg;
  falarLimpo(msg);
}
async function descreverExtras() {
  if (extras.ocupado || descritor.ocupado) return falar('Aguarde, o programa está trabalhando.');
  if (!descritor.instalado) return falar('Baixe o descritor primeiro.');
  const c = await window.api.escolherFoto({ titulo: 'Imagem para descrever' });
  if (!c || !c.ok || !c.valor) return falar('Nenhuma imagem escolhida.');
  const caminho = c.valor, nome = nomeDoArquivo(caminho);
  $('ex-ds-escolher').disabled = true; $('ex-ds-cancelar').hidden = false;
  $('ex-ds-texto').textContent = `Descrevendo ${nome}.`;
  falar($('ex-ds-texto').textContent);
  const r = await pedirDescricao(caminho);
  $('ex-ds-escolher').disabled = false; $('ex-ds-cancelar').hidden = true;
  if (!r.ok) { const msg = r.cancelado ? 'Descrição cancelada.' : 'Não consegui descrever a imagem. ' + r.erro; $('ex-ds-texto').textContent = msg; return falar(msg); }
  let saiu = '';
  const s = await window.api.extrasSalvartexto({ nome: semExtensao(nome), sufixo: 'descrição', texto: r.texto });
  if (s.ok) saiu = ` Salvo em texto, na pasta ${s.valor.documentos}, Olho da Cena, com o nome ${s.valor.nome.replace(/\.txt$/i, '')}.`;
  $('ex-ds-texto').textContent = r.texto + saiu;
  falarLimpo(r.texto + saiu);
}
async function abrirExtras(secao) {
  await atualizarDescritor();
  mostrarTela('extras');
  falar(secao === 'descrever' ? 'Extras, descrever imagem.' : 'Extras, transcrever áudio.');
  const h = $(secao === 'descrever' ? 'ex-t-descrever' : 'ex-t-transcrever');
  if (h) { h.tabIndex = -1; h.focus(); }
}
$('ir-transcrever').addEventListener('click', () => abrirExtras('transcrever'));
$('ir-descrever').addEventListener('click', () => abrirExtras('descrever'));
$('ex-tr-baixar-pequeno').addEventListener('click', () => baixarModeloExtras('pequeno'));
$('ex-tr-baixar-grande').addEventListener('click', () => baixarModeloExtras('grande'));
$('ex-tr-cancelar-baixar').addEventListener('click', () => window.api.legendaCancelar());
$('ex-tr-cancelar').addEventListener('click', () => window.api.legendaCancelar());
$('ex-tr-escolher').addEventListener('click', transcreverExtras);
$('ex-ds-baixar').addEventListener('click', () => baixarDescritor({ baixar: $('ex-ds-baixar'), cancelar: $('ex-ds-cancelar-baixar'), barra: $('ex-ds-barra') }));
$('ex-ds-cancelar-baixar').addEventListener('click', () => window.api.descritorCancelar());
$('ex-ds-cancelar').addEventListener('click', () => window.api.descritorCancelar());
$('ex-ds-escolher').addEventListener('click', descreverExtras);
$('ex-voltar').addEventListener('click', () => {
  if (extras.ocupado || descritor.ocupado) return falar('Aguarde, o programa está trabalhando. Para parar, use Cancelar.');
  mostrarTela('inicial');
});
$('ex-fechar').addEventListener('click', () => {
  if (extras.ocupado || descritor.ocupado) return falar('Aguarde, o programa está trabalhando. Para parar, use Cancelar.');
  window.api.appSair();
});

// --- 2.0.5: converter áudios em lote em vídeo simples ---------------------------------------------
const lote = { info: null, rodando: false, bipes: null, pct: 0, atual: 0 };
(async function desenharFormatosLote() {
  const r = await window.api.listarFormatos();
  const lista = r && r.length ? r : [];
  const g = $('lt-grupo-formato');
  lista.forEach((f, i) => {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'lt-formato'; inp.value = f.id; inp.id = `lt-formato-${f.id}`; inp.checked = i === 0;
    inp.setAttribute('aria-describedby', `${inp.id}-desc`);
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = f.nome;
    const desc = document.createElement('p'); desc.className = 'desc'; desc.id = `${inp.id}-desc`; desc.textContent = f.descricao;
    d.append(inp, lab, desc); g.appendChild(d);
  });
})();
const formatoLote = () => { const r = document.querySelector('input[name="lt-formato"]:checked'); return r ? r.value : ''; };
const bipeLote = (f) => { if ((window.__olhoConfig || {}).confirmacao !== 'som' && window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(f); };
function pararBipesLote(fim) {
  if (lote.bipes) { clearInterval(lote.bipes); lote.bipes = null; }
  if (fim) bipeLote('concluido');
}
/** Bipes que sobem de tom conforme a conversão avança: do grave, no começo, ao agudo, no fim. */
function comecarBipesLote() {
  pararBipesLote();
  lote.pct = 0;
  lote.bipes = setInterval(() => bipeLote(300 + Math.max(0, Math.min(100, lote.pct)) * 15), 3000);
}
const textoPastaLote = (i) => {
  const n = i.audios.length;
  const partes = [`Pasta ${i.nome}: ${n === 0 ? 'nenhum áudio' : n === 1 ? '1 áudio' : n + ' áudios'}`];
  partes.push(i.logo ? `com logo, ${i.logo}` : 'sem logo');
  partes.push(i.imagem ? `e com imagem, ${i.imagem}` : 'e sem imagem');
  return partes.join(', ') + '.' + (i.avisos.length ? ' ' + i.avisos.join(' ') : '');
};
$('ir-foto').addEventListener('click', () => mostrarTela('foto'));
$('ir-editar-foto').addEventListener('click', () => mostrarTela('editfoto'));
$('ir-post').addEventListener('click', () => mostrarTela('post'));
$('ir-lote').addEventListener('click', () => {
  mostrarTela('lote');
  falar('Converter áudios em lote em vídeo simples. Escolha a pasta e a proporção, e converta.');
});
$('lt-pasta').addEventListener('click', async () => {
  if (lote.rodando) return falar('Aguarde, a conversão está em andamento.');
  const r = await window.api.loteEscolherpasta();
  if (!r || !r.ok || !r.valor) return falar('Nenhuma pasta escolhida.');
  lote.info = r.valor;
  const t = textoPastaLote(lote.info);
  $('lt-pasta-info').textContent = t;
  $('lt-andamento').textContent = '';
  falarDepois(lote.info.audios.length ? t : t + ' Escolha outra pasta.', 250);
});
async function converterLote() {
  if (lote.rodando) return falar('Aguarde, a conversão já está em andamento.');
  if (!lote.info) { falar('Escolha a pasta primeiro.'); return $('lt-pasta').focus(); }
  if (!lote.info.audios.length) return falar('A pasta não tem áudios. Escolha outra pasta.');
  const formato = formatoLote();
  if (!formato) return falar('Escolha a proporção.');
  const c = await window.api.loteConferir({ pasta: lote.info.pasta, formato });
  if (c && c.ok && c.valor.avisos.length) {
    const dlg = $('lt-dlg');
    $('lt-dlg-avisos').innerHTML = '';
    c.valor.avisos.forEach((t) => { const p = document.createElement('p'); p.textContent = t; $('lt-dlg-avisos').appendChild(p); });
    const decisao = await new Promise((resolve) => {
      let escolha = 'trocar';
      $('lt-dlg-seguir').onclick = () => { escolha = 'seguir'; dlg.close(); };
      $('lt-dlg-trocar').onclick = () => { escolha = 'trocar'; dlg.close(); };
      dlg.onclose = () => resolve(escolha);
      dlg.showModal();
      $('lt-dlg-trocar').focus();
      falar('A imagem não combina bem com este formato. ' + c.valor.avisos.join(' ') + ' Você pode converter assim mesmo ou trocar a proporção.');
    });
    if (decisao === 'trocar') {
      const r = document.querySelector('input[name="lt-formato"]:checked') || document.querySelector('input[name="lt-formato"]');
      if (r) r.focus();
      return falarDepois('Escolha outra proporção.', 250);
    }
  }
  lote.rodando = true; lote.atual = 0;
  $('lt-converter').disabled = true; $('lt-cancelar').hidden = false; $('lt-barra').hidden = false; $('lt-barra').value = 0;
  const total = lote.info.audios.length;
  $('lt-andamento').textContent = `Convertendo ${total === 1 ? '1 áudio' : total + ' áudios'}.`;
  falar($('lt-andamento').textContent);
  comecarBipesLote();
  const solta = window.api.aoAndamentoLote((p) => {
    lote.pct = p.pctGeral;
    $('lt-barra').value = p.pctGeral;
    $('lt-andamento').textContent = `Áudio ${p.atual} de ${p.total}, ${p.nome}: ${p.pctGeral} por cento no total.`;
    if (p.atual !== lote.atual) { lote.atual = p.atual; falarLimpo(`Áudio ${p.atual} de ${p.total}.`); }
  });
  const r = await window.api.loteConverter({ pasta: lote.info.pasta, formato });
  solta(); pararBipesLote(!!r.ok && !r.valor.cancelado);
  lote.rodando = false;
  $('lt-converter').disabled = false; $('lt-cancelar').hidden = true; $('lt-barra').hidden = true;
  let msg;
  if (!r.ok) msg = 'Não consegui converter. ' + r.erro;
  else {
    const v = r.valor;
    const partes = v.pasta.split(/[\\/]/);
    const pasta = partes.pop(), origem = partes.pop() || '';
    msg = v.cancelado
      ? `Conversão cancelada. ${v.feitos} de ${v.total} vídeos ficaram prontos, na pasta ${pasta}, dentro da pasta ${origem}.`
      : `Pronto: ${v.feitos} de ${v.total} vídeos, na pasta ${pasta}, dentro da pasta ${origem}.`;
    if (v.falhas.length) msg += ` Não consegui converter ${v.falhas.length === 1 ? '1 áudio' : v.falhas.length + ' áudios'}: ${v.falhas.map((f) => `${f.nome}, ${f.erro}`).join('; ')}.`;
  }
  $('lt-andamento').textContent = msg;
  falarLimpo(msg);
}
$('lt-converter').addEventListener('click', converterLote);
$('lt-cancelar').addEventListener('click', () => { window.api.loteCancelar(); falar('Cancelando, um instante.'); });
$('lt-voltar').addEventListener('click', () => {
  if (lote.rodando) return falar('Aguarde, a conversão está em andamento. Para parar, use Cancelar.');
  mostrarTela('inicial');
});
$('lt-fechar').addEventListener('click', () => {
  if (lote.rodando) return falar('Aguarde, a conversão está em andamento. Para parar, use Cancelar.');
  window.api.appSair();
});

// --- 2.0.6: aviso de versão nova --------------------------------------------------------------------
const atualizacao = { achada: null, baixando: false, bipes: null };
async function conferirAtualizacao() {
  let r;
  try { r = await window.api.atualizacaoVerificar(); } catch (_) { return; }
  if (!r || !r.ok || !r.valor) return;
  atualizacao.achada = r.valor;
  const mb = r.valor.tamanho ? `, uns ${Math.round(r.valor.tamanho / 1048576)} MB` : '';
  $('atualizacao-info').textContent = `Versão ${r.valor.versao}, no lugar da ${r.valor.atual}${mb}.${r.valor.notas ? ' ' + r.valor.notas : ''} Seus projetos e configurações ficam como estão. ${r.valor.rota === 'leve' ? 'É uma atualização rápida: depois do download, você escolhe a hora de fechar e abrir o programa de novo.' : 'O programa fecha, instala e abre de novo sozinho.'}`;
  $('atualizacao-bloco').hidden = false;
  falarDepois(`Há uma versão nova do Olho da Cena, ${r.valor.versao}. Na tela inicial, use o botão Baixar e instalar a versão nova, quando quiser.`, 4000);
}
$('atualizacao-instalar').addEventListener('click', async () => {
  if (atualizacao.baixando || !atualizacao.achada) return;
  atualizacao.baixando = true;
  $('atualizacao-instalar').disabled = true; $('atualizacao-cancelar').hidden = false; $('atualizacao-barra').hidden = false; $('atualizacao-barra').value = 0;
  falar(`Baixando a versão ${atualizacao.achada.versao}.`);
  let avisado = -1;
  const bip = () => { if ((window.__olhoConfig || {}).confirmacao !== 'som' && window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe('andamento'); };
  atualizacao.bipes = setInterval(bip, 4000);
  const solta = window.api.aoProgressoAtualizacao((p) => {
    $('atualizacao-barra').value = p.pct;
    const degrau = Math.floor(p.pct / 10);
    if (degrau <= avisado || p.pct >= 100 || degrau < 1) return;
    avisado = degrau; falarLimpo(`Atualização: ${degrau * 10} por cento.`);
  });
  const r = await window.api.atualizacaoInstalar();
  solta(); clearInterval(atualizacao.bipes); atualizacao.bipes = null;
  atualizacao.baixando = false;
  $('atualizacao-cancelar').hidden = true; $('atualizacao-barra').hidden = true; $('atualizacao-instalar').disabled = false;
  if (r.ok && r.valor && r.valor.leveFalhou) {
    const mb = r.valor.tamanho ? `, uns ${Math.round(r.valor.tamanho / 1048576)} MB` : '';
    $('atualizacao-info').textContent = `A atualização rápida não deu certo, e nada foi alterado no seu programa. Dá para instalar a versão ${r.valor.versao} completa${mb}. O programa fecha, instala e abre de novo sozinho.`;
    $('atualizacao-instalar').textContent = 'Baixar e instalar a versão completa';
    falarLimpo(`A atualização rápida não deu certo, e nada foi alterado. ${r.valor.motivo ? 'Motivo: ' + r.valor.motivo + ' ' : ''}O botão Baixar e instalar a versão completa continua na tela inicial.`);
    $('atualizacao-instalar').focus();
  } else if (r.ok && r.valor && r.valor.leve) {
    if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe('concluido');
    $('atualizacao-instalar').hidden = true; $('atualizacao-reiniciar').hidden = false;
    falarLimpo('Atualização rápida baixada e conferida. Salve o que estiver fazendo e termine qualquer gravação ou preparo em andamento. Quando puder, use o botão Fechar e abrir a versão nova. O programa não fecha sozinho.');
    $('atualizacao-reiniciar').focus();
  } else if (r.ok) { if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe('concluido'); falarLimpo('Atualização baixada e conferida. O programa vai fechar, instalar e abrir de novo.'); }
  else if (/CANCELADO/.test(r.erro || '')) falar('Download cancelado.');
  else falar('Não consegui baixar a atualização. ' + r.erro + ' Confira a internet e tente de novo.');
});
$('atualizacao-reiniciar').addEventListener('click', async () => {
  $('atualizacao-reiniciar').disabled = true;
  falarLimpo('Fechando o programa para trocar o arquivo. Ele abre de novo sozinho em instantes.');
  const r = await window.api.atualizacaoReiniciar();
  if (!r.ok) { $('atualizacao-reiniciar').disabled = false; falar('Não consegui aplicar a atualização. ' + r.erro + ' Nada foi alterado.'); }
});
$('atualizacao-cancelar').addEventListener('click', () => { window.api.atualizacaoCancelar(); });
setTimeout(conferirAtualizacao, 3500);

$('ir-sobre').addEventListener('click', async () => {
  let v = ''; try { const r = await window.api.appVersao(); v = r && r.ok ? r.valor : ''; } catch (_) { /* sem versão */ }
  $('sb-versao').textContent = `Olho da Cena${v ? `, versão ${v}` : ''}, seu olhar autônomo para inclusão nas redes sociais.`;
  mostrarTela('sobre');
  $('sb-versao').focus();
});
$('sb-voltar').addEventListener('click', () => mostrarTela('inicial'));
document.querySelectorAll('a[data-externo]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.api.externoAbrir({ url: a.href }); }));
$('ir-config').addEventListener('click', async () => { await mostrarConfig(); mostrarTela('config'); });
$('cf-alterar-pasta').addEventListener('click', async () => {
  const r = await window.api.configPasta();
  if (r && r.ok && r.valor) { $('cf-pasta').textContent = r.valor; await carregarConfig(); falar(`Pasta alterada: ${r.valor}.`); }
});
$('cf-voltar').addEventListener('click', () => mostrarTela('inicial'));
carregarConfig();
