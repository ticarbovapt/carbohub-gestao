// Dataset curado de emojis (sem lib): categorias + palavras-chave (PT) p/ busca.
// Cobre o uso do chat interno sem trazer MBs de uma lib de emoji.
export interface Emoji { e: string; kw: string }
export interface EmojiCategory { id: string; label: string; icon: string; emojis: Emoji[] }

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "rostos", label: "Rostos e emoções", icon: "😀", emojis: [
      { e: "😀", kw: "sorriso feliz alegre" }, { e: "😃", kw: "sorriso feliz alegre" },
      { e: "😄", kw: "sorriso risada feliz" }, { e: "😁", kw: "sorriso dentes feliz" },
      { e: "😆", kw: "risada rir" }, { e: "😅", kw: "risada suor alivio" },
      { e: "🤣", kw: "rolando rindo gargalhada" }, { e: "😂", kw: "chorando de rir lagrima" },
      { e: "🙂", kw: "sorriso leve" }, { e: "🙃", kw: "de cabeca para baixo ironia" },
      { e: "😉", kw: "piscando piscadela" }, { e: "😊", kw: "sorriso timido feliz" },
      { e: "😇", kw: "anjo inocente" }, { e: "🥰", kw: "amor apaixonado coracoes" },
      { e: "😍", kw: "apaixonado olhos de coracao amor" }, { e: "🤩", kw: "estrelas uau incrivel" },
      { e: "😘", kw: "beijo" }, { e: "😗", kw: "beijo" }, { e: "😙", kw: "beijo" },
      { e: "😋", kw: "delicia gostoso lingua" }, { e: "😛", kw: "lingua" }, { e: "😜", kw: "lingua piscando brincadeira" },
      { e: "🤪", kw: "louco doido maluco" }, { e: "😝", kw: "lingua olhos fechados" },
      { e: "🤗", kw: "abraco" }, { e: "🤭", kw: "risadinha ops mao na boca" },
      { e: "🤫", kw: "silencio shh segredo" }, { e: "🤔", kw: "pensando duvida" },
      { e: "😐", kw: "neutro serio" }, { e: "😑", kw: "sem expressao" }, { e: "😶", kw: "sem boca calado" },
      { e: "😏", kw: "malicia sorriso torto" }, { e: "😒", kw: "chateado desanimado" },
      { e: "🙄", kw: "revirar olhos" }, { e: "😬", kw: "constrangido nervoso" },
      { e: "😌", kw: "aliviado calmo" }, { e: "😔", kw: "triste pensativo" },
      { e: "😪", kw: "sono cansado" }, { e: "😴", kw: "dormindo sono" },
      { e: "😷", kw: "mascara doente" }, { e: "🤒", kw: "doente febre" }, { e: "🤕", kw: "machucado" },
      { e: "🥵", kw: "calor quente" }, { e: "🥶", kw: "frio congelando" },
      { e: "😵", kw: "tonto atordoado" }, { e: "🤯", kw: "explodindo cabeca chocado" },
      { e: "🥳", kw: "festa comemorar aniversario" }, { e: "😎", kw: "oculos legal descolado" },
      { e: "🤓", kw: "nerd" }, { e: "🧐", kw: "monoculo analisando" },
      { e: "😕", kw: "confuso" }, { e: "🙁", kw: "triste" }, { e: "😮", kw: "surpreso uau" },
      { e: "😲", kw: "chocado espanto" }, { e: "🥺", kw: "suplicando pidao carente" },
      { e: "😨", kw: "medo assustado" }, { e: "😰", kw: "ansioso suor" }, { e: "😢", kw: "triste chorando lagrima" },
      { e: "😭", kw: "chorando muito" }, { e: "😱", kw: "grito panico medo" },
      { e: "😩", kw: "cansado exausto" }, { e: "😫", kw: "cansado frustrado" }, { e: "🥱", kw: "bocejo sono" },
      { e: "😤", kw: "bufando irritado" }, { e: "😡", kw: "raiva bravo" }, { e: "😠", kw: "bravo" },
      { e: "🤬", kw: "xingando palavrao raiva" }, { e: "😈", kw: "diabo travesso" }, { e: "💀", kw: "caveira morto morri" },
    ],
  },
  {
    id: "gestos", label: "Gestos", icon: "👍", emojis: [
      { e: "👍", kw: "joinha positivo curti like" }, { e: "👎", kw: "negativo nao dislike" },
      { e: "👌", kw: "ok certo perfeito" }, { e: "🤌", kw: "italiano dedos" }, { e: "🤏", kw: "pouco pequeno" },
      { e: "✌️", kw: "paz victoria" }, { e: "🤞", kw: "torcendo sorte" }, { e: "🤟", kw: "amor rock" },
      { e: "🤘", kw: "rock chifre" }, { e: "🤙", kw: "me liga aloha" },
      { e: "👈", kw: "esquerda aponta" }, { e: "👉", kw: "direita aponta" }, { e: "👆", kw: "cima aponta" }, { e: "👇", kw: "baixo aponta" },
      { e: "☝️", kw: "um aponta cima" }, { e: "✋", kw: "mao para pare" }, { e: "🤚", kw: "mao" }, { e: "🖐️", kw: "mao dedos" },
      { e: "🖖", kw: "spock vulcano" }, { e: "👋", kw: "tchau oi acenando" }, { e: "🤝", kw: "aperto de mao acordo negocio" },
      { e: "🙏", kw: "obrigado por favor reza oracao" }, { e: "💪", kw: "forca musculo biceps" },
      { e: "👏", kw: "palmas aplausos parabens" }, { e: "🙌", kw: "maos ao alto comemorar" }, { e: "👐", kw: "maos abertas" },
      { e: "🤲", kw: "maos oferecendo" }, { e: "🫶", kw: "coracao com as maos amor" }, { e: "🫡", kw: "continencia respeito" },
      { e: "👀", kw: "olhos olhando" }, { e: "🫠", kw: "derretendo" }, { e: "🤦", kw: "facepalm vergonha" }, { e: "🤷", kw: "sei la ombros duvida" },
    ],
  },
  {
    id: "coracoes", label: "Corações", icon: "❤️", emojis: [
      { e: "❤️", kw: "coracao amor vermelho" }, { e: "🧡", kw: "coracao laranja" }, { e: "💛", kw: "coracao amarelo" },
      { e: "💚", kw: "coracao verde" }, { e: "💙", kw: "coracao azul" }, { e: "💜", kw: "coracao roxo" },
      { e: "🖤", kw: "coracao preto" }, { e: "🤍", kw: "coracao branco" }, { e: "🤎", kw: "coracao marrom" },
      { e: "💔", kw: "coracao partido" }, { e: "❣️", kw: "coracao exclamacao" }, { e: "💕", kw: "dois coracoes amor" },
      { e: "💞", kw: "coracoes girando" }, { e: "💓", kw: "coracao batendo" }, { e: "💗", kw: "coracao crescendo" },
      { e: "💖", kw: "coracao brilhante" }, { e: "💘", kw: "coracao flecha cupido" }, { e: "💝", kw: "coracao presente" },
    ],
  },
  {
    id: "animais", label: "Animais e natureza", icon: "🐶", emojis: [
      { e: "🐶", kw: "cachorro dog" }, { e: "🐱", kw: "gato cat" }, { e: "🐭", kw: "rato" }, { e: "🐹", kw: "hamster" },
      { e: "🐰", kw: "coelho" }, { e: "🦊", kw: "raposa" }, { e: "🐻", kw: "urso" }, { e: "🐼", kw: "panda" },
      { e: "🐨", kw: "coala" }, { e: "🐯", kw: "tigre" }, { e: "🦁", kw: "leao" }, { e: "🐮", kw: "vaca boi" },
      { e: "🐷", kw: "porco" }, { e: "🐸", kw: "sapo" }, { e: "🐵", kw: "macaco" }, { e: "🐔", kw: "galinha" },
      { e: "🐧", kw: "pinguim" }, { e: "🐦", kw: "passaro" }, { e: "🦄", kw: "unicornio" }, { e: "🐝", kw: "abelha" },
      { e: "🦋", kw: "borboleta" }, { e: "🐢", kw: "tartaruga" }, { e: "🐍", kw: "cobra" }, { e: "🐙", kw: "polvo" },
      { e: "🐳", kw: "baleia" }, { e: "🐬", kw: "golfinho" }, { e: "🐟", kw: "peixe" }, { e: "🌵", kw: "cacto" },
      { e: "🌲", kw: "arvore pinheiro" }, { e: "🌳", kw: "arvore" }, { e: "🌴", kw: "coqueiro palmeira" }, { e: "🌷", kw: "tulipa flor" },
      { e: "🌸", kw: "flor cerejeira" }, { e: "🌹", kw: "rosa flor" }, { e: "🌻", kw: "girassol" }, { e: "🌼", kw: "flor margarida" },
      { e: "⭐", kw: "estrela" }, { e: "🌟", kw: "estrela brilho" }, { e: "🌈", kw: "arco iris" }, { e: "☀️", kw: "sol" },
      { e: "⛅", kw: "nuvem sol tempo" }, { e: "☁️", kw: "nuvem" }, { e: "❄️", kw: "neve floco frio" }, { e: "🔥", kw: "fogo chama quente" },
      { e: "💧", kw: "gota agua" }, { e: "🌊", kw: "onda mar" },
    ],
  },
  {
    id: "comida", label: "Comida e bebida", icon: "🍔", emojis: [
      { e: "🍏", kw: "maca verde fruta" }, { e: "🍎", kw: "maca fruta" }, { e: "🍐", kw: "pera" }, { e: "🍊", kw: "laranja" },
      { e: "🍋", kw: "limao" }, { e: "🍌", kw: "banana" }, { e: "🍉", kw: "melancia" }, { e: "🍇", kw: "uva" },
      { e: "🍓", kw: "morango" }, { e: "🫐", kw: "mirtilo blueberry" }, { e: "🍒", kw: "cereja" }, { e: "🍑", kw: "pessego bumbum" },
      { e: "🥭", kw: "manga" }, { e: "🍍", kw: "abacaxi" }, { e: "🥥", kw: "coco" }, { e: "🥝", kw: "kiwi" },
      { e: "🍅", kw: "tomate" }, { e: "🥑", kw: "abacate" }, { e: "🌽", kw: "milho" }, { e: "🥕", kw: "cenoura" },
      { e: "🍞", kw: "pao" }, { e: "🧀", kw: "queijo" }, { e: "🥚", kw: "ovo" }, { e: "🍳", kw: "ovo frito frigideira" },
      { e: "🥞", kw: "panqueca" }, { e: "🥓", kw: "bacon" }, { e: "🍔", kw: "hamburguer lanche" }, { e: "🍟", kw: "batata frita" },
      { e: "🍕", kw: "pizza" }, { e: "🌭", kw: "cachorro quente hot dog" }, { e: "🌮", kw: "taco" }, { e: "🌯", kw: "burrito" },
      { e: "🍜", kw: "lamen sopa macarrao" }, { e: "🍝", kw: "macarrao espaguete" }, { e: "🍣", kw: "sushi" }, { e: "🍦", kw: "sorvete casquinha" },
      { e: "🍩", kw: "rosquinha donut" }, { e: "🍪", kw: "biscoito cookie" }, { e: "🎂", kw: "bolo aniversario" }, { e: "🍰", kw: "bolo fatia" },
      { e: "🍫", kw: "chocolate" }, { e: "🍬", kw: "bala doce" }, { e: "🍭", kw: "pirulito" }, { e: "🍿", kw: "pipoca" },
      { e: "☕", kw: "cafe" }, { e: "🍵", kw: "cha" }, { e: "🥤", kw: "refrigerante copo" }, { e: "🍺", kw: "cerveja" },
      { e: "🍻", kw: "cerveja brinde" }, { e: "🍷", kw: "vinho" }, { e: "🥂", kw: "brinde champanhe" }, { e: "🍾", kw: "champanhe comemorar" },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: "⚽", emojis: [
      { e: "⚽", kw: "futebol bola" }, { e: "🏀", kw: "basquete" }, { e: "🏈", kw: "futebol americano" }, { e: "⚾", kw: "beisebol" },
      { e: "🎾", kw: "tenis" }, { e: "🏐", kw: "volei" }, { e: "🏓", kw: "ping pong tenis de mesa" }, { e: "🏸", kw: "badminton" },
      { e: "🥅", kw: "gol trave" }, { e: "🏆", kw: "trofeu vitoria campeao" }, { e: "🥇", kw: "medalha ouro primeiro" }, { e: "🥈", kw: "medalha prata" },
      { e: "🥉", kw: "medalha bronze" }, { e: "🏅", kw: "medalha" }, { e: "🎯", kw: "alvo mira dardo" }, { e: "🎮", kw: "videogame controle" },
      { e: "🎲", kw: "dado sorte" }, { e: "🎸", kw: "guitarra violao" }, { e: "🎹", kw: "piano teclado" }, { e: "🎤", kw: "microfone cantar" },
      { e: "🎧", kw: "fone musica" }, { e: "🎵", kw: "nota musical musica" }, { e: "🎬", kw: "cinema claquete filme" }, { e: "🚀", kw: "foguete lançamento decolar" },
    ],
  },
  {
    id: "viagem", label: "Viagem e lugares", icon: "✈️", emojis: [
      { e: "🚗", kw: "carro" }, { e: "🚕", kw: "taxi" }, { e: "🚌", kw: "onibus" }, { e: "🏍️", kw: "moto" },
      { e: "🚲", kw: "bicicleta" }, { e: "✈️", kw: "aviao viagem" }, { e: "🚆", kw: "trem" }, { e: "🚢", kw: "navio barco" },
      { e: "⛵", kw: "veleiro barco" }, { e: "🚁", kw: "helicoptero" }, { e: "🏠", kw: "casa" }, { e: "🏢", kw: "predio empresa escritorio" },
      { e: "🏬", kw: "loja shopping" }, { e: "🏭", kw: "fabrica industria" }, { e: "🏥", kw: "hospital" }, { e: "🏦", kw: "banco" },
      { e: "🗺️", kw: "mapa" }, { e: "🧭", kw: "bussola direcao" }, { e: "⛰️", kw: "montanha" }, { e: "🏖️", kw: "praia" },
      { e: "🏝️", kw: "ilha" }, { e: "🌅", kw: "nascer do sol" }, { e: "🌃", kw: "noite cidade" }, { e: "🌆", kw: "por do sol cidade" },
    ],
  },
  {
    id: "objetos", label: "Objetos", icon: "💡", emojis: [
      { e: "💡", kw: "ideia lampada" }, { e: "🔦", kw: "lanterna" }, { e: "📱", kw: "celular telefone" }, { e: "💻", kw: "notebook computador laptop" },
      { e: "🖥️", kw: "computador monitor" }, { e: "⌨️", kw: "teclado" }, { e: "🖱️", kw: "mouse" }, { e: "🖨️", kw: "impressora" },
      { e: "📷", kw: "camera foto" }, { e: "🎥", kw: "filmadora video" }, { e: "📺", kw: "tv televisao" }, { e: "🔋", kw: "bateria" },
      { e: "🔌", kw: "tomada energia" }, { e: "💾", kw: "salvar disquete" }, { e: "💿", kw: "cd disco" }, { e: "📀", kw: "dvd" },
      { e: "📞", kw: "telefone ligar" }, { e: "☎️", kw: "telefone" }, { e: "📧", kw: "email" }, { e: "📩", kw: "email mensagem" },
      { e: "📨", kw: "email recebido" }, { e: "📬", kw: "caixa de correio" }, { e: "📦", kw: "caixa pacote encomenda" }, { e: "📝", kw: "anotar nota escrever" },
      { e: "📌", kw: "alfinete fixar pin" }, { e: "📎", kw: "clipe anexo" }, { e: "✂️", kw: "tesoura cortar" }, { e: "🔒", kw: "cadeado bloqueado" },
      { e: "🔓", kw: "cadeado aberto" }, { e: "🔑", kw: "chave" }, { e: "🔨", kw: "martelo" }, { e: "🛠️", kw: "ferramentas" },
      { e: "⚙️", kw: "engrenagem configuracao" }, { e: "💰", kw: "dinheiro saco" }, { e: "💵", kw: "dinheiro nota dolar" }, { e: "💳", kw: "cartao credito" },
      { e: "📈", kw: "grafico subindo alta crescimento" }, { e: "📉", kw: "grafico caindo queda baixa" }, { e: "📊", kw: "grafico barras dados" }, { e: "🗓️", kw: "calendario data" },
      { e: "⏰", kw: "despertador alarme hora" }, { e: "⏳", kw: "ampulheta tempo" }, { e: "🔔", kw: "sino notificacao" }, { e: "🎁", kw: "presente" },
    ],
  },
  {
    id: "simbolos", label: "Símbolos", icon: "✅", emojis: [
      { e: "✅", kw: "certo ok concluido feito verde" }, { e: "☑️", kw: "marcado checkbox" }, { e: "✔️", kw: "certo confirmado" }, { e: "❌", kw: "errado x cancelar" },
      { e: "❎", kw: "x negativo" }, { e: "➕", kw: "mais adicionar" }, { e: "➖", kw: "menos" }, { e: "❓", kw: "duvida pergunta interrogacao" },
      { e: "❗", kw: "importante exclamacao atencao" }, { e: "⚠️", kw: "atencao aviso perigo" }, { e: "🚫", kw: "proibido nao" }, { e: "💯", kw: "cem nota maxima top" },
      { e: "✨", kw: "brilho estrelas novo" }, { e: "🎉", kw: "festa comemorar parabens" }, { e: "🎊", kw: "confete festa" }, { e: "💬", kw: "balao fala mensagem chat" },
      { e: "💭", kw: "pensamento balao" }, { e: "🔴", kw: "bolinha vermelha" }, { e: "🟠", kw: "bolinha laranja" }, { e: "🟡", kw: "bolinha amarela" },
      { e: "🟢", kw: "bolinha verde online" }, { e: "🔵", kw: "bolinha azul" }, { e: "🟣", kw: "bolinha roxa" }, { e: "⚫", kw: "bolinha preta" },
      { e: "⚪", kw: "bolinha branca" }, { e: "🔺", kw: "triangulo vermelho" }, { e: "🔻", kw: "triangulo baixo" }, { e: "♻️", kw: "reciclar" },
      { e: "🔝", kw: "topo top cima" }, { e: "🆗", kw: "ok" }, { e: "🆕", kw: "novo new" }, { e: "🔜", kw: "em breve" },
    ],
  },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Busca por palavra-chave (sem acento) ou pelo próprio emoji.
export function searchEmojis(query: string): Emoji[] {
  const q = norm(query.trim());
  if (!q) return [];
  const out: Emoji[] = [];
  const seen = new Set<string>();
  for (const cat of EMOJI_CATEGORIES) {
    for (const em of cat.emojis) {
      if (seen.has(em.e)) continue;
      if (em.e === query || norm(em.kw).includes(q)) { out.push(em); seen.add(em.e); }
    }
  }
  return out;
}

const RECENTS_KEY = "carbo-chat-emoji-recents";
export function getRecentEmojis(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]") as string[]; } catch { return []; }
}
export function pushRecentEmoji(e: string) {
  try {
    const cur = getRecentEmojis().filter((x) => x !== e);
    cur.unshift(e);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(cur.slice(0, 24)));
  } catch { /* ignora */ }
}
