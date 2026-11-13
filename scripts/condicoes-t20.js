// Condições do Tormenta20 (texto do livro), usadas no pop-up das descrições. Para corrigir um texto, edite aqui.
// tipo: define a cor, igual à dos cards de condição (Medo, Movimento, Mental, Sentidos, Metabolismo, Veneno, Cansaço, Metamorfose, Física).
export const CONDICOES_T20 = [
  {
    "nome": "Abalado",
    "tipo": "Medo",
    "desc": "O personagem sofre –2 em testes de perícia. Se ficar abalado novamente, em vez disso fica apavorado."
  },
  {
    "nome": "Agarrado",
    "tipo": "Movimento",
    "desc": "O personagem fica desprevenido e imóvel, sofre –2 em testes de ataque e só pode atacar com armas leves. Ataques à distância contra um alvo envolvido em uma manobra agarrar têm 50% de chance de acertar o alvo errado."
  },
  {
    "nome": "Alquebrado",
    "tipo": "Mental",
    "desc": "O custo em pontos de mana das habilidades do personagem aumenta em +1."
  },
  {
    "nome": "Apavorado",
    "tipo": "Medo",
    "desc": "O personagem sofre –5 em testes de perícia e não pode se aproximar voluntariamente da fonte do medo."
  },
  {
    "nome": "Atordoado",
    "tipo": "Mental",
    "desc": "O personagem fica desprevenido e não pode fazer ações."
  },
  {
    "nome": "Caído",
    "tipo": "Física",
    "desc": "O personagem sofre –5 na Defesa contra ataques corpo a corpo e recebe +5 na Defesa contra ataques à distância (cumulativos com outras condições). Além disso, sofre –5 em ataques corpo a corpo e seu deslocamento é reduzido a 1,5m."
  },
  {
    "nome": "Cego",
    "tipo": "Sentidos",
    "desc": "O personagem fica desprevenido e lento, não pode fazer testes de Percepção para observar e sofre –5 em testes de perícias baseadas em Força ou Destreza. Todos os alvos de seus ataques recebem camuflagem total. Você é considerado cego enquanto estiver em uma área de escuridão total, a menos que algo lhe permita perceber no escuro."
  },
  {
    "nome": "Confuso",
    "tipo": "Mental",
    "desc": "O personagem comporta-se de modo aleatório. Role 1d6 no início de seus turnos:\n1) Movimenta-se em uma direção escolhida por uma rolagem de 1d8;\n2-3) Não pode fazer ações, e fica balbuciando incoerentemente;\n4-5) Usa a arma que estiver empunhando para atacar a criatura mais próxima, ou a si mesmo se estiver sozinho (nesse caso, apenas role o dano);\n6) A condição termina e pode agir normalmente."
  },
  {
    "nome": "Debilitado",
    "tipo": "Física",
    "desc": "O personagem sofre –5 em testes de Força, Destreza e Constituição e de perícias baseadas nesses atributos. Se o personagem ficar debilitado novamente, em vez disso fica inconsciente."
  },
  {
    "nome": "Desprevenido",
    "tipo": "Física",
    "desc": "O personagem sofre –5 na Defesa e em Reflexos. Você fica desprevenido contra inimigos que não possa perceber."
  },
  {
    "nome": "Doente",
    "tipo": "Metabolismo",
    "desc": "Sob efeito de uma doença."
  },
  {
    "nome": "Em Chamas",
    "tipo": "Física",
    "desc": "O personagem está pegando fogo. No início de seus turnos, sofre 1d6 pontos de dano de fogo. O personagem pode gastar uma ação padrão para apagar o fogo com as mãos. Imersão em água também apaga as chamas."
  },
  {
    "nome": "Enfeitiçado",
    "tipo": "Mental",
    "desc": "O personagem se torna prestativo em relação à fonte da condição. Ele não fica sob controle da fonte, mas percebe suas palavras e ações da maneira mais favorável possível. A fonte da condição recebe +10 em testes de Diplomacia com o personagem."
  },
  {
    "nome": "Enjoado",
    "tipo": "Metabolismo",
    "desc": "O personagem só pode realizar uma ação padrão ou de movimento (não ambas) por rodada. Ele pode gastar uma ação padrão para fazer uma investida, mas pode avançar no máximo seu deslocamento (e não o dobro)."
  },
  {
    "nome": "Enredado",
    "tipo": "Movimento",
    "desc": "O personagem fica lento, vulnerável e sofre –2 em testes de ataque."
  },
  {
    "nome": "Envenenado",
    "tipo": "Veneno",
    "desc": "O efeito desta condição varia de acordo com o veneno. Pode ser perda de vida recorrente ou outra condição (como fraco ou enjoado). Perda de vida recorrente por venenos é cumulativa."
  },
  {
    "nome": "Esmorecido",
    "tipo": "Mental",
    "desc": "O personagem sofre –5 em testes de Inteligência, Sabedoria e Carisma e de perícias baseadas nesses atributos."
  },
  {
    "nome": "Exausto",
    "tipo": "Cansaço",
    "desc": "O personagem fica debilitado, lento e vulnerável. Se ficar exausto novamente, em vez disso fica inconsciente."
  },
  {
    "nome": "Fascinado",
    "tipo": "Mental",
    "desc": "Com a atenção presa em alguma coisa. O personagem sofre –5 em Percepção e não pode fazer ações, exceto observar aquilo que o fascinou. Esta condição é anulada por ações hostis contra o personagem ou se o que o fascinou não estiver mais visível. Balançar uma criatura fascinada para tirá-la desse estado gasta uma ação padrão."
  },
  {
    "nome": "Fatigado",
    "tipo": "Cansaço",
    "desc": "O personagem fica fraco e vulnerável. Se ficar fatigado novamente, em vez disso fica exausto."
  },
  {
    "nome": "Fraco",
    "tipo": "Física",
    "desc": "O personagem sofre –2 em testes de Força, Destreza e Constituição e de perícias baseadas nesses atributos. Se ficar fraco novamente, em vez disso fica debilitado."
  },
  {
    "nome": "Frustrado",
    "tipo": "Mental",
    "desc": "O personagem sofre –2 em testes de Inteligência, Sabedoria e Carisma e de perícias baseadas nesses atributos. Se ficar frustrado novamente, em vez disso fica esmorecido."
  },
  {
    "nome": "Imóvel",
    "tipo": "Movimento",
    "desc": "Todas as formas de deslocamento do personagem são reduzidas a 0m."
  },
  {
    "nome": "Inconsciente",
    "tipo": "Física",
    "desc": "O personagem fica indefeso e não pode fazer ações, incluindo reações (mas ainda pode fazer testes que sejam naturalmente feitos quando se está inconsciente, como testes de\nConstituição para estabilizar sangramento). Balançar uma criatura para acordá-la gasta uma ação padrão."
  },
  {
    "nome": "Indefeso",
    "tipo": "Física",
    "desc": "O personagem fica desprevenido, mas sofre –10 na Defesa, falha automaticamente em testes de Reflexos e pode sofrer golpes de misericórdia."
  },
  {
    "nome": "Lento",
    "tipo": "Movimento",
    "desc": "Todas as formas de deslocamento do personagem são reduzidas à metade (arredonde para baixo para o primeiro incremento de 1,5m) e ele não pode correr ou fazer investidas."
  },
  {
    "nome": "Ofuscado",
    "tipo": "Sentidos",
    "desc": "O personagem sofre –2 em testes de ataque e de Percepção."
  },
  {
    "nome": "Paralisado",
    "tipo": "Movimento",
    "desc": "Fica imóvel e indefeso e só pode realizar ações puramente mentais."
  },
  {
    "nome": "Pasmo",
    "tipo": "Mental",
    "desc": "Não pode fazer ações."
  },
  {
    "nome": "Petrificado",
    "tipo": "Metamorfose",
    "desc": "O personagem fica inconsciente e recebe redução de dano 8."
  },
  {
    "nome": "Sangrando",
    "tipo": "Metabolismo",
    "desc": "No início de seu turno, o personagem deve fazer um teste de Constituição (CD 15). Se falhar, perde 1d6 pontos de vida e continua sangrando. Se passar, remove essa condição."
  },
  {
    "nome": "Sobrecarregado",
    "tipo": "Movimento",
    "desc": "O personagem sofre penalidade de armadura –5 e seu deslocamento é reduzido em –3m."
  },
  {
    "nome": "Surdo",
    "tipo": "Sentidos",
    "desc": "O personagem não pode fazer testes de Percepção para ouvir e sofre –5 em testes de Iniciativa. Além disso, é considerado em condição ruim para lançar magias."
  },
  {
    "nome": "Surpreendido",
    "tipo": "Física",
    "desc": "O personagem fica desprevenido e não pode fazer ações."
  },
  {
    "nome": "Vulnerável",
    "tipo": "Física",
    "desc": "O personagem sofre –2 na Defesa."
  }
];
