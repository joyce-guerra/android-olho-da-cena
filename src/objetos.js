'use strict';
/**
 * Alt E: objetos reconhecidos na imagem (detector EfficientDet-Lite do MediaPipe, rótulos COCO),
 * em português. "Pessoa" não entra: as pessoas já são faladas pelos rostos.
 */

// [nome, gênero (m/f), plural (se não for só acrescentar "s")]
const NOMES = {
  bicycle: ['bicicleta', 'f'], car: ['carro', 'm'], motorcycle: ['moto', 'f'], airplane: ['avião', 'm', 'aviões'],
  bus: ['ônibus', 'm', 'ônibus'], train: ['trem', 'm', 'trens'], truck: ['caminhão', 'm', 'caminhões'], boat: ['barco', 'm'],
  'traffic light': ['semáforo', 'm'], 'fire hydrant': ['hidrante', 'm'], 'stop sign': ['placa de pare', 'f', 'placas de pare'],
  'parking meter': ['parquímetro', 'm'], bench: ['banco', 'm'], bird: ['pássaro', 'm'], cat: ['gato', 'm'], dog: ['cachorro', 'm'],
  horse: ['cavalo', 'm'], sheep: ['ovelha', 'f'], cow: ['vaca', 'f'], elephant: ['elefante', 'm'], bear: ['urso', 'm'],
  zebra: ['zebra', 'f'], giraffe: ['girafa', 'f'], backpack: ['mochila', 'f'], umbrella: ['guarda-chuva', 'm'],
  handbag: ['bolsa', 'f'], tie: ['gravata', 'f'], suitcase: ['mala', 'f'], frisbee: ['frisbee', 'm'], skis: ['esqui', 'm'],
  snowboard: ['prancha de snowboard', 'f', 'pranchas de snowboard'], 'sports ball': ['bola', 'f'], kite: ['pipa', 'f'],
  'baseball bat': ['taco de beisebol', 'm', 'tacos de beisebol'], 'baseball glove': ['luva de beisebol', 'f', 'luvas de beisebol'],
  skateboard: ['skate', 'm'], surfboard: ['prancha de surfe', 'f', 'pranchas de surfe'], 'tennis racket': ['raquete', 'f'],
  bottle: ['garrafa', 'f'], 'wine glass': ['taça', 'f'], cup: ['xícara', 'f'], fork: ['garfo', 'm'], knife: ['faca', 'f'],
  spoon: ['colher', 'f', 'colheres'], bowl: ['tigela', 'f'], banana: ['banana', 'f'], apple: ['maçã', 'f'],
  sandwich: ['sanduíche', 'm'], orange: ['laranja', 'f'], broccoli: ['brócolis', 'm', 'brócolis'], carrot: ['cenoura', 'f'],
  'hot dog': ['cachorro-quente', 'm', 'cachorros-quentes'], pizza: ['pizza', 'f'], donut: ['rosquinha', 'f'], cake: ['bolo', 'm'],
  chair: ['cadeira', 'f'], couch: ['sofá', 'm'], 'potted plant': ['vaso de planta', 'm', 'vasos de planta'], bed: ['cama', 'f'],
  'dining table': ['mesa', 'f'], toilet: ['vaso sanitário', 'm', 'vasos sanitários'], tv: ['televisão', 'f', 'televisões'],
  laptop: ['notebook', 'm'], mouse: ['mouse', 'm', 'mouses'], remote: ['controle remoto', 'm', 'controles remotos'],
  keyboard: ['teclado', 'm'], 'cell phone': ['celular', 'm', 'celulares'], microwave: ['micro-ondas', 'm', 'micro-ondas'],
  oven: ['forno', 'm'], toaster: ['torradeira', 'f'], sink: ['pia', 'f'], refrigerator: ['geladeira', 'f'], book: ['livro', 'm'],
  clock: ['relógio', 'm', 'relógios'], vase: ['vaso', 'm'], scissors: ['tesoura', 'f'],
  'teddy bear': ['ursinho de pelúcia', 'm', 'ursinhos de pelúcia'], 'hair drier': ['secador de cabelo', 'm', 'secadores de cabelo'],
  toothbrush: ['escova de dentes', 'f', 'escovas de dentes']
};

/** Confiança mínima para falar um objeto. Alguns rótulos confundem mais e pedem mais certeza. */
const CONFIANCA = { padrao: 0.5, exigentes: { tv: 0.6, 'dining table': 0.55, bed: 0.6, toilet: 0.65, sink: 0.6, refrigerator: 0.6, oven: 0.6, tie: 0.6, kite: 0.65 } };
const MAXIMO = 6;
const CONTAGEM = { m: ['', 'um', 'dois', 'três', 'quatro', 'cinco'], f: ['', 'uma', 'duas', 'três', 'quatro', 'cinco'] };

function nomeDoObjeto(rotulo, n = 1) {
  const e = NOMES[String(rotulo || '').toLowerCase()];
  if (!e) return null;
  const [nome, genero, plural] = e;
  if (n <= 1) return nome;
  return `${n <= 5 ? CONTAGEM[genero][n] : n} ${plural || nome + 's'}`;
}

function juntarComE(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * deteccoes: [{ rotulo, score }]. Devolve { texto: 'Na imagem: notebook, xícara e celular.' ou '', itens }.
 * Ordena do mais certo ao menos certo; conta repetidos ("dois livros").
 */
function descreverObjetos(deteccoes) {
  const grupos = new Map();
  for (const d of deteccoes || []) {
    const r = String(d && d.rotulo || '').toLowerCase();
    if (!r || r === 'person' || !NOMES[r]) continue;
    const minimo = CONFIANCA.exigentes[r] || CONFIANCA.padrao;
    if (!(d.score >= minimo)) continue;
    const g = grupos.get(r) || { rotulo: r, n: 0, melhor: 0 };
    g.n++; g.melhor = Math.max(g.melhor, d.score);
    grupos.set(r, g);
  }
  const itens = [...grupos.values()].sort((a, b) => b.melhor - a.melhor).slice(0, MAXIMO);
  if (!itens.length) return { texto: '', itens: [] };
  return { texto: `Na imagem: ${juntarComE(itens.map((g) => nomeDoObjeto(g.rotulo, g.n)))}.`, itens };
}

module.exports = { NOMES, CONFIANCA, nomeDoObjeto, descreverObjetos, juntarComE };
