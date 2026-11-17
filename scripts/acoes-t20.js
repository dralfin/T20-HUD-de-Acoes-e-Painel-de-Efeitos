/**
 * Ações de combate mostradas nos botões "Padrão / Movimento / Completa / Livre" da HUD.
 *
 * Campos de cada categoria:
 *  - gasta: ação da HUD que é gasta ao usar ("padrao", "movimento", "completa") ou null (ação livre, sem custo).
 *
 * Campos de cada ação:
 *  - nome, desc: título e texto da regra. Use "\n" para separar parágrafos.
 *  - topicos: itens extras da regra, no formato { t: "Título", d: "Texto" } (opcional).
 *  - efeito: { condicao: "caido", aplicar: true|false } aplica ou remove uma condição do personagem ao usar a ação.
 *  - tempo: (categoria "outros") tempo que a atividade leva; o card mostra isso no lugar do tipo de ação.
 *  - custo: texto do custo mostrado no card (substitui o padrão "Ação livre: sem custo").
 *  - cd: texto da dificuldade mostrado no título (ex.: "15"). O título mostra: perícia · CD · Apenas treinado (se "treinada").
 *  - teste: chave da perícia (ex.: "acro"). Depois do card, abre a escolha da perícia (essa vem marcada) e rola o teste pela ficha.
 *  - especial: "levantarRapido" rola Acrobacia primeiro: passou na CD 20, remove Caído sem gastar ação; falhou, gasta o movimento e continua caído;
 *              "misericordia" liga o fluxo do Golpe de Misericórdia (escolha de arma, 20 natural, chance de morte);
 *              "fintar" liga o fluxo de Fintar (alvo, testes opostos Enganação x Reflexos e condição Desprevenido);
 *              "manobra" liga o fluxo das Manobras de Combate (escolha da manobra e do alvo; o card traz só a regra da manobra escolhida);
 *              "atrasar" liga o fluxo de Atrasar (escolha da nova Iniciativa e passagem do turno);
 *              "investida" liga o fluxo da Investida (movimento em linha reta, +2 no ataque, –2 na Defesa até o próximo turno);
 *              "corrida" liga o fluxo da Corrida (teste de Atletismo, deslocamento em linha reta, fôlego e fadiga).
 *  - treinada: chave da perícia (ex.: "acro"). A ação só aparece para quem é treinado nela (system.pericias.<chave>.treinado).
 *  - reacao: true para reações (o card mostra "Reação" no lugar de "Ação livre").
 *  - auto: true quando o módulo JÁ gasta essa ação sozinho (ataque com arma, magia, uso de item, andar).
 *          Nesses casos, clicar apenas consulta a regra e envia o card ao chat, sem gastar de novo.
 *
 * Para ajustar um texto ou incluir outra ação, edite este arquivo e recarregue o Foundry.
 */
export const CATEGORIAS_ACOES = [
  {
    id: "padrao",
    nome: "Ações Padrão",
    curto: "Padrão",
    singular: "Ação Padrão",
    icone: "fa-hand-fist",
    cor: "#ff6b6b",
    gasta: "padrao",
    resumo: "Você tem uma ação padrão por turno e pode trocá-la por uma ação de movimento.",
    acoes: [
      {
        nome: "Agredir",
        auto: true,
        desc: "Você faz um ataque com uma arma corpo a corpo ou à distância.\nCom uma arma corpo a corpo, você pode atacar qualquer inimigo dentro de seu alcance natural (1,5m para criaturas Pequenas e Médias ou um inimigo adjacente no mapa). Personagens maiores, ou usando certas armas, podem atacar mais longe. Você pode substituir um ataque corpo a corpo por uma manobra de combate (veja a seguir).\nCom uma arma de ataque à distância, você pode atacar qualquer inimigo que consiga ver e que esteja no alcance da arma (ou até o dobro do alcance, sofrendo uma penalidade de –5).",
        topicos: [
          {
            t: "Atirando em Combate Corpo a Corpo",
            d: "Quando faz um ataque à distância contra uma criatura em combate corpo a corpo, você sofre –5 no teste de ataque. Uma criatura está em combate corpo a corpo se estiver dentro do alcance natural de qualquer inimigo (incluindo você)."
          }
        ]
      },
      {
        nome: "Lançar uma Magia",
        auto: true,
        desc: "A maioria das magias exige uma ação padrão para ser executada."
      },
      {
        nome: "Assustar",
        teste: "inti",
        cd: "Oposto a Vontade",
        desc: "Gaste uma ação padrão e faça um teste de Intimidação oposto pelo teste de Vontade de uma criatura em alcance curto. Se você passar, ela fica abalada pelo resto da cena. Se você passar por 10 ou mais, ela fica apavorada por uma rodada e então abalada pelo resto da cena."
      },
      {
        nome: "Atropelar",
        desc: "Você usa uma ação padrão durante um movimento para avançar pelo espaço ocupado por uma criatura (normalmente, você não pode fazer uma ação padrão durante um movimento; isto é uma exceção). A criatura pode lhe dar passagem ou resistir. Se der passagem, você avança pelo espaço dela; nenhum teste é necessário. Se resistir, faça um teste de manobra oposto; se você vencer, deixa a criatura caída e continua seu avanço. Se o alvo vencer, continua de pé e detém seu avanço. Atropelar é uma ação livre se tentada durante uma investida."
      },
      {
        nome: "Fintar",
        pericia: "enga",
        especial: "fintar",
        desc: "Faça um teste de Enganação oposto ao teste de Reflexos de uma criatura em alcance curto. Se você passar, ela fica desprevenida contra seu próximo ataque, mas apenas até o fim de seu próximo turno."
      },
      {
        nome: "Identificar Criatura",
        especial: "identificarCriatura",
        cd: "15 + ND da criatura",
        custo: "Ação padrão",
        desc: "O Mestre define a natureza da criatura, e isso decide a perícia usada.",
        topicos: [
          { t: "Misticismo (apenas treinado)", d: "Você analisa uma criatura mágica (construto, dragão, fada, morto-vivo etc.) que possa ver. Se passar, lembra uma característica da criatura, como um poder ou vulnerabilidade. Para cada 5 pontos pelos quais o resultado do teste superar a CD, você lembra outra característica. Se falhar por 5 ou mais, tira uma conclusão errada (por exemplo, acredita que a criatura é vulnerável a fogo, quando na verdade é vulnerável a frio). Este uso gasta uma ação padrão." },
          { t: "Religião (apenas treinado)", d: "Você pode identificar uma criatura com origem divina (anjos, demônios, alguns mortos-vivos e construtos etc.). Veja a perícia Misticismo. Este uso gasta uma ação padrão." },
          { t: "Sobrevivência", d: "Você pode identificar um animal ou monstro. Veja a perícia Misticismo. Este uso gasta uma ação padrão." }
        ]
      },
      {
        nome: "Manobras de Combate",
        especial: "manobra",
        desc: "Uma manobra é um ataque corpo a corpo para fazer algo diferente de causar dano — como arrancar a arma do oponente ou empurrá-lo para um abismo. Não é possível fazer manobras de combate com ataques à distância.\nFaça um teste de manobra (um teste de ataque corpo a corpo) oposto com a criatura. Mesmo que ela esteja usando uma arma de ataque à distância, deve fazer o teste usando seu valor de Luta. Em caso de empate, o personagem com o maior bônus vence. Se os bônus forem iguais, outro teste deve ser feito. Em geral, você pode usar qualquer arma corpo a corpo para fazer manobras de combate. Estas são as manobras que você pode fazer.",
        topicos: [
          {
            t: "Agarrar",
            d: "Você segura uma criatura (por seu braço, sua roupa etc.). Uma criatura agarrada fica desprevenida e imóvel, sofre –2 nos testes de ataque e só pode atacar com armas leves. Ela pode se soltar com uma ação padrão, vencendo um teste de manobra oposto. Você só pode agarrar com um ataque desarmado ou arma natural e, enquanto agarra, fica com essa mão ou arma natural ocupada. Além disso, move-se metade do deslocamento normal, mas arrasta a criatura que estiver agarrando. Você pode soltá-la com uma ação livre. Você pode atacar uma criatura agarrada com sua mão livre. Se preferir, pode substituir um ataque por um teste de agarrar contra a criatura. Se vencer, causa dano de impacto igual a um ataque desarmado ou arma natural. Isso significa que você está esmagando ou sufocando o inimigo. Um personagem fazendo um ataque à distância contra um alvo envolvido na manobra agarrar tem 50% de chance de mirar no alvo errado!"
          },
          {
            t: "Derrubar",
            d: "Você deixa o alvo caído. Esta queda normalmente não causa dano. Se você vencer o teste oposto por 5 pontos ou mais, derruba o oponente com tanta força que também o empurra um quadrado em uma direção a sua escolha. Se isso o jogar além de um parapeito ou precipício, ele pode fazer um teste de Reflexos (CD 20) para se agarrar numa beirada."
          },
          {
            t: "Desarmar",
            d: "Você derruba um item que a criatura esteja segurando. Normalmente o item cai no mesmo lugar em que o alvo está (a menos que o alvo esteja voando, sobre uma ponte etc.). Se você vencer o teste oposto por 5 pontos ou mais, derruba o item com tanta força que também o empurra um quadrado em uma direção a sua escolha."
          },
          {
            t: "Empurrar",
            d: "Você empurra a criatura 1,5m. Para cada 5 pontos de diferença entre os testes, você empurra o alvo mais 1,5m. Você pode gastar uma ação de movimento para avançar junto com a criatura (até o limite do seu deslocamento)."
          },
          {
            t: "Quebrar",
            d: "Você atinge um item que a criatura esteja segurando. Veja as estatísticas de objetos na página 239."
          }
        ]
      },
      {
        nome: "Ocultar",
        treinada: "ladi",
        teste: "ladi",
        cd: "Oposto a Percepção",
        desc: "Você esconde um objeto em você mesmo. Gaste uma ação padrão e faça um teste de Ladinagem oposto pelo teste de Percepção de qualquer um que possa vê-lo. Objetos discretos ou pequenos fornecem +5 no teste; objetos desajeitados ou grandes impõem –5. Se uma pessoa revistar você, recebe +10 no teste de Percepção."
      },
      {
        nome: "Plano de Ação",
        treinada: "guer",
        teste: "guer",
        cd: "20",
        desc: "Como uma ação padrão, você orienta um aliado em alcance médio. Se passar, fornece +5 na Iniciativa dele. Se ele ficar com uma Iniciativa maior do que a sua e ainda não tiver agido nesta rodada, age imediatamente após seu turno. Nas próximas rodadas, ele age de acordo com a nova ordem."
      },
      {
        nome: "Preparar",
        desc: "Você prepara uma ação (padrão, de movimento ou livre) para realizar mais tarde, após seu turno, mas antes de seu turno na próxima rodada. Diga a ação que vai fazer e em quais circunstâncias (por exemplo, “disparar minha besta na primeira criatura que passar pela porta”). A qualquer momento antes de seu próximo turno, você pode fazer a ação preparada como uma reação a essas circunstâncias.\nSe, no seu próximo turno, você ainda não tiver realizado sua ação preparada, não pode mais realizá-la (embora possa preparar a mesma ação de novo).\nPelo resto do combate, sua Iniciativa fica imediatamente acima da qual você fez a ação preparada."
      },
      {
        nome: "Primeiros Socorros",
        especial: "primeirosSocorros",
        teste: "cura",
        cd: "15",
        desc: "Você estabiliza um personagem adjacente que esteja sangrando. Este uso gasta uma ação padrão. Esta perícia exige uma maleta de medicamentos. Sem ela, você sofre –5 no teste. Você pode usar a perícia Cura em si mesmo, mas sofre –5 no teste."
      },
      {
        nome: "Punga",
        treinada: "ladi",
        teste: "ladi",
        cd: "20",
        desc: "Você pega um objeto de outra pessoa (ou planta um objeto nas posses dela). Gaste uma ação padrão e faça um teste de Ladinagem. Se passar, você pega (ou coloca) o que queria. A vítima tem direito a um teste de Percepção (CD igual ao resultado de seu teste de Ladinagem). Se passar, ela percebe sua tentativa, tenha você conseguido ou não."
      },
      {
        nome: "Usar Habilidade ou Item",
        auto: true,
        desc: "Algumas habilidades e itens, como poções, exigem uma ação padrão para serem usadas."
      }
    ]
  },
  {
    id: "movimento",
    nome: "Ações de Movimento",
    curto: "Movimento",
    singular: "Ação de Movimento",
    icone: "fa-person-running",
    cor: "#4db6e6",
    gasta: "movimento",
    resumo: "Você tem uma ação de movimento por turno. Trocar a ação padrão por outra de movimento dá duas. Andar já gasta a ação de movimento sozinho.",
    acoes: [
      {
        nome: "Analisar Terreno",
        treinada: "guer",
        teste: "guer",
        cd: "20",
        desc: "Como uma ação de movimento, você pode observar o campo de batalha. Se passar, descobre uma vantagem, como cobertura, camuflagem ou terreno elevado, se houver."
      },
      {
        nome: "Escalar",
        pericia: "atle",
        cd: "10, 15, 20 ou 25",
        mov: {
          pericia: "atle",
          pergunta: "Que superfície o personagem está escalando?",
          superficies: [
            { id: 10, t: "Com apoios para pés e mãos", d: "CD 10 · como o cordame de um navio", icone: "fa-sailboat" },
            { id: 15, t: "Árvore", d: "CD 15", icone: "fa-tree" },
            { id: 20, t: "Muro com reentrâncias", d: "CD 20 · como o de uma ruína", icone: "fa-landmark" },
            { id: 25, t: "Muro liso", d: "CD 25 · como o de um castelo", icone: "fa-chess-rook" }
          ],
          msg: { passa: "avança na escalada", falha: "e não avança.", grave: "<b>cai</b> e não avança." },
          condicaoGrave: "caido",
          nota: "Escalando, o personagem fica desprevenido; se sofrer dano, faz novo teste de Atletismo e cai se falhar. Se alguém adjacente cair, dá para tentar pegá-lo com um teste de Atletismo contra a CD da superfície +10 (falhar por 5 ou mais derruba você também)."
        },
        desc: "Você pode subir superfícies inclinadas ou verticais. Gaste uma ação de movimento e faça um teste de Atletismo. Se passar, você avança metade do seu deslocamento. Se falhar, não avança. Se falhar por 5 ou mais, você cai. A CD é 10 para superfícies com apoios para os pés e mãos (como o cordame de um navio), 15 para uma árvore, 20 para um muro com reentrâncias (como o de uma ruína) e 25 para um muro liso (como o de um castelo). Você pode sofrer –5 em seu teste para avançar seu deslocamento total. Quando está escalando você fica desprevenido e, se sofrer dano, deve fazer um novo teste de Atletismo; se falhar, você cai. Se um personagem adjacente a você estiver escalando e cair, você pode tentar pegá-lo. Faça um teste de Atletismo contra a CD da superfície +10. Se passar, segura o personagem. Se falhar por 5 ou mais, você também cai!"
      },
      {
        nome: "Levantar-se",
        efeito: { condicao: "caido", aplicar: false },
        desc: "Levantar do chão (ou de uma cama, cadeira...) exige uma ação de movimento."
      },
      {
        nome: "Equilíbrio",
        pericia: "acro",
        cd: "10, 15 ou 20",
        mov: {
          pericia: "acro",
          pergunta: "Em que tipo de superfície o personagem está se equilibrando?",
          superficies: [
            { id: 10, t: "Piso escorregadio", d: "CD 10", icone: "fa-droplet" },
            { id: 15, t: "Superfície estreita", d: "CD 15 · como o topo de um muro", icone: "fa-grip-lines" },
            { id: 20, t: "Superfície muito estreita", d: "CD 20 · como uma corda esticada", icone: "fa-grip-lines-vertical" }
          ],
          msg: { passa: "mantém o equilíbrio", falha: "e não avança.", grave: "<b>cai</b> e não avança." },
          condicaoGrave: "caido",
          nota: "Equilibrando-se, o personagem fica desprevenido; se sofrer dano, faz novo teste de Acrobacia e cai se falhar."
        },
        desc: "Se estiver andando por superfícies precárias, você precisa fazer testes de Acrobacia para não cair. Cada ação de movimento exige um teste. Se passar, você avança metade do seu deslocamento. Se falhar, não avança. Se falhar por 5 ou mais, cai. A CD é 10 para piso escorregadio, 15 para uma superfície estreita (como o topo de um muro) e 20 para uma superfície muito estreita (como uma corda esticada). Você pode sofrer –5 no teste para avançar seu deslocamento total. Quando está se equilibrando você fica desprevenido e, se sofrer dano, deve fazer um novo teste de Acrobacia; se falhar, cai."
      },
      {
        nome: "Levantar-se Rapidamente",
        treinada: "acro",
        especial: "levantarRapido",
        cd: "20",
        desc: "Se estiver caído, você pode fazer um teste de Acrobacia para ficar de pé. Você precisa ter uma ação de movimento disponível. Se passar no teste, se levanta como uma ação livre. Se falhar, gasta sua ação de movimento, mas continua caído."
      },
      {
        nome: "Manejar Animal",
        treinada: "ades",
        teste: "ades",
        cd: "15",
        desc: "Você faz um animal realizar uma tarefa para a qual foi treinado (como “atacar”, “sentar”, “vigiar”...). Isso permite usar Adestramento como Pilotagem para veículos de tração animal. Este uso gasta uma ação de movimento."
      },
      {
        nome: "Manipular Item",
        desc: "Muitas vezes, manipular um item exige uma ação de movimento. Pegar um objeto em uma mochila, abrir ou fechar uma porta e atirar uma corda para alguém são ações de movimento."
      },
      {
        nome: "Mirar",
        desc: "Você mira em um alvo que possa ver, dentro do alcance de sua arma. Isso anula a penalidade de –5 em testes de Pontaria realizados neste turno contra aquele alvo caso ele esteja engajado em combate corpo a corpo."
      },
      {
        nome: "Natação",
        pericia: "atle",
        cd: "10, 15 ou 20+",
        mov: {
          pericia: "atle",
          total: false,
          rotuloSup: "água",
          pergunta: "Como está a água?",
          superficies: [
            { id: 10, t: "Água calma", d: "CD 10", icone: "fa-water" },
            { id: 15, t: "Água agitada", d: "CD 15", icone: "fa-wind" },
            { id: 20, t: "Água tempestuosa", d: "CD 20 ou mais (o Mestre define)", icone: "fa-cloud-showers-heavy" }
          ],
          msg: { passa: "nada", falha: "mas consegue boiar, sem avançar.", grave: "<b>afunda</b>." },
          nota: "Para avançar mais, dá para gastar uma segunda ação de movimento na rodada com outro teste. Submerso, o personagem prende a respiração por 1 + Constituição rodadas; depois, teste de Fortitude por rodada (CD 15 +1 por teste anterior) ou se afoga (0 PV), perdendo 3d6 PV por rodada. Há penalidade de armadura no teste de Atletismo para nadar."
        },
        desc: "Se iniciar seu turno na água, você precisa gastar uma ação de movimento e fazer um teste de Atletismo. A CD é 10 para água calma, 15 para agitada e 20 ou mais para tempestuosa. Se passar, você pode avançar metade de seu deslocamento. Se falhar, consegue boiar, mas não avançar. Se falhar por 5 ou mais, você afunda. Se quiser avançar mais, pode gastar uma segunda ação de movimento na mesma rodada para outro teste de Atletismo. Se você estiver submerso (seja por ter falhado no teste de Atletismo, seja por ter mergulhado de propósito), deve prender a respiração. Você pode prender a respiração por um número de rodadas igual a 1 + sua Constituição. Após isso, deve fazer um teste de Fortitude por rodada (CD 15 +1 por teste anterior). Se falhar, se afoga (é reduzido a 0 pontos de vida). Se continuar submerso, perde 3d6 pontos de vida por rodada até ser tirado da água ou morrer. Você sofre penalidade de armadura em testes de Atletismo para nadar."
      },
      {
        nome: "Passar por Inimigo",
        especial: "passarInimigo",
        teste: "acro",
        cd: "Teste oposto",
        desc: "Você pode atravessar um espaço ocupado por um inimigo como parte de seu movimento. Faça um teste de Acrobacia oposto ao teste de Acrobacia, Iniciativa ou Luta do oponente (o que for melhor). Se você passar, atravessa o espaço; se falhar, não atravessa e sua ação de movimento termina. Um espaço ocupado por um inimigo conta como terreno difícil."
      },
      {
        nome: "Pilotar Veículo",
        treinada: "pilo",
        teste: "pilo",
        cd: "15 ou 25",
        desc: "Você sabe operar veículos como carroças, barcos e balões. Ações simples não exigem testes — você pode atrelhar seus trobos a sua carroça e conduzi-la pela estrada, ou levantar âncora e velejar seu navio em águas tranquilas, automaticamente. Porém, conduzir um veículo em situações ruins (terreno acidentado para veículos terrestres, chuva ou ventania para veículos aquáticos ou aéreos), exige uma ação de movimento e um teste de Pilotagem contra CD 15 por turno ou cena, de acordo com o mestre. Se falhar, você avança metade do deslocamento. Se falhar por 5 ou mais, se acidenta de alguma forma. Situações extremas (terreno com obstáculos, tempestade...) aumentam a CD para 25."
      },
      {
        nome: "Sacar ou Guardar Item",
        desc: "Sacar ou guardar um item exige uma ação de movimento. Se puder usar mais de uma arma (como por possuir Ambidestria), pode sacar todas elas."
      }
    ]
  },
  {
    id: "completa",
    nome: "Ações Completas",
    curto: "Completa",
    singular: "Ação Completa",
    icone: "fa-hourglass-half",
    cor: "#e0b85c",
    gasta: "completa",
    resumo: "Uma ação completa consome a ação padrão e a de movimento do turno.",
    acoes: [
      {
        nome: "Abrir Fechadura",
        treinada: "ladi",
        teste: "ladi",
        cd: "20, 25 ou 30",
        desc: "Você abre uma fechadura trancada. A CD é 20 para fechaduras simples (porta de loja), 25 para fechaduras médias (prisão, baú) e 30 para fechaduras superiores (cofre, câmara do tesouro). Este uso exige uma ação completa e uma gazua. Sem ela, você sofre –5 em seu teste."
      },
      {
        nome: "Acalmar Animal",
        treinada: "ades",
        teste: "ades",
        cd: "25",
        desc: "Você acalma um animal nervoso ou agressivo. Isso permite a você controlar um cavalo assustado ou convencer um lobo a não devorá-lo. Este uso gasta uma ação completa."
      },
      {
        nome: "Corrida",
        pericia: "atle",
        especial: "corrida",
        desc: "Gaste uma ação completa e faça um teste de Atletismo. Você avança um número de quadrados de 1,5m igual ao resultado do teste. Assim, se somar 20 no teste, avança 20 quadrados de 1,5m.\nVocê recebe um modificador de +/–2 para cada 1,5m de deslocamento acima ou abaixo de 9m que possua. Assim, um elfo (deslocamento 12m) recebe +4 em testes de Atletismo para correr, enquanto um anão (deslocamento 6m) sofre uma penalidade de –4.\nVocê só pode correr em linha reta e não pode correr através de terreno difícil.",
        topicos: [
          {
            t: "Fôlego",
            d: "Você pode correr por um número de rodadas igual a 1 + sua Constituição. Após isso, deve fazer um teste de Fortitude por rodada (CD 15 +1 por teste anterior). Se falhar, fica fatigado (cumulativo com novas falhas)."
          }
        ]
      },
      {
        nome: "Detectar Magia",
        treinada: "mist",
        teste: "mist",
        cd: "15",
        desc: "Como uma ação completa, você detecta a presença e intensidade de auras mágicas em alcance curto (mas não suas localizações exatas). A intensidade de uma aura depende do círculo da magia ou categoria do item mágico que a gerou. Magias de 1º e 2º círculos e itens mágicos menores geram uma aura tênue, magias de 3º e 4º círculos e itens mágicos médios geram uma aura moderada e magias de 5º círculo e itens mágicos maiores geram uma aura poderosa. Magias lançadas por um deus maior e artefatos geram uma aura avassaladora. Caso a aura esteja atrás de uma barreira, você sofre uma penalidade em seu teste (–5 para madeira ou pedra, –10 para ferro ou chumbo)."
      },
      {
        nome: "Escapar",
        teste: "acro",
        cd: "CD variável",
        desc: "Você pode escapar de amarras. A dificuldade varia: cordas (CD igual ao resultado do teste de Destreza de quem o amarrou +10), redes (CD 20), algemas (CD 30). Este uso gasta uma ação completa."
      },
      {
        nome: "Galopar",
        pericia: "cava",
        especial: "cavalgar",
        desc: "Gaste uma ação completa e faça um teste de Cavalgar. Você avança um número de quadrados de 1,5m igual ao resultado do teste. Seu teste sofre um modificador de +/–2 para cada 1,5m de deslocamento acima ou abaixo de 9m que você possua. Esta perícia exige uma sela. Sem ela, você sofre –5 no teste."
      },
      {
        nome: "Golpe de Misericórdia",
        especial: "misericordia",
        desc: "Você desfere um golpe letal em um oponente adjacente e indefeso. Um golpe de misericórdia é um acerto crítico automático.\nAlém de sofrer dano, a vítima tem uma chance de morrer instantaneamente. Esta chance é de 25% (1 em 1d4) para personagens e NPCs importantes e de 75% (1 a 3 em 1d4) para NPCs secundários."
      },
      {
        nome: "Identificar (Ofício)",
        treinada: "ofic",
        teste: "ofic",
        cd: "20",
        desc: "Você pode identificar itens raros e exóticos ligados ao seu Ofício. Se passar, descobre as propriedades do item e seu preço. Este uso gasta uma ação completa. Cada Ofício exige instrumentos de ofício específicos. Sem eles, você sofre –5 no teste."
      },
      {
        nome: "Investida",
        especial: "investida",
        desc: "Você avança até o dobro de seu deslocamento (e no mínimo 3m) em linha reta e, no fim do movimento, faz um ataque corpo a corpo. Você recebe +2 no teste de ataque, mas sofre –2 na Defesa até o seu próximo turno, porque sua guarda fica aberta. Você não pode fazer uma investida em terreno difícil. Durante uma investida, você pode fazer a manobra atropelar como uma ação livre (mas não pode atropelar e atacar o mesmo alvo)."
      },
      {
        nome: "Lançar uma Magia",
        auto: true,
        desc: "Ao lançar magias com execução maior do que uma ação completa, você gasta uma ação completa a cada rodada."
      },
      {
        nome: "Passar por Espaço Apertado",
        treinada: "acro",
        especial: "espacoApertado",
        cd: "25",
        desc: "Você pode se espremer por espaços estreitos, suficientes para criaturas uma categoria de tamanho menor. Você gasta uma ação completa e avança metade do deslocamento."
      },
      {
        nome: "Tratamento",
        especial: "primeirosSocorros",
        treinada: "cura",
        teste: "cura",
        cd: "CD da doença ou veneno",
        desc: "Você ajuda a vítima de uma doença ou veneno com efeito contínuo. Gaste uma ação completa e faça um teste de Cura contra a CD da doença ou veneno. Se você passar, o paciente recebe +5 em seu próximo teste de Fortitude contra esse efeito. Esta perícia exige uma maleta de medicamentos. Sem ela, você sofre –5 no teste. Você pode usar a perícia Cura em si mesmo, mas sofre –5 no teste."
      }
    ]
  },
  {
    id: "livre",
    nome: "Ações Livres",
    curto: "Livre",
    singular: "Ação Livre",
    icone: "fa-feather",
    cor: "#6fd08c",
    gasta: null,
    resumo: "Ações livres e reações não têm limite por turno.",
    acoes: [


      {
        nome: "Atrasar",
        especial: "atrasar",
        desc: "Escolhendo atrasar sua ação, você age mais tarde na ordem de Iniciativa, em relação à Iniciativa que rolou. Isto é o mesmo que reduzir sua Iniciativa voluntariamente pelo resto do combate. Quando sua nova Iniciativa chegar, você age normalmente. Você pode especificar este novo valor de Iniciativa ou apenas esperar até algum momento e então agir, fixando sua nova Iniciativa neste ponto. Atrasar é útil para ver o que seus amigos ou inimigos farão, antes de decidir o que você mesmo fará.",
        topicos: [
          {
            t: "Limites para atrasar",
            d: "Você pode atrasar sua Iniciativa até –10 menos seu valor de Iniciativa. Quando a contagem de Iniciativa chega a esse ponto, você deve agir ou abrir mão de qualquer ação na rodada. Por exemplo, um personagem com um valor de Iniciativa +3 pode esperar até a contagem de Iniciativa chegar a –13. Nesse ponto, deve agir ou desistir de seu turno. Isso importa quando vários personagens atrasam suas ações."
          },
          {
            t: "Vários atrasos",
            d: "Se vários personagens estão atrasando suas ações, aquele com o maior valor de Iniciativa (ou a maior Destreza, em caso de empate) tem a vantagem. Se dois ou mais personagens que estejam atrasando quiserem agir na mesma contagem de Iniciativa, aquele com o maior valor age primeiro. Se dois ou mais personagens estão tentando agir um depois do outro, aquele com o maior valor de Iniciativa tem o direito de agir depois."
          }
        ]
      },
      {
        nome: "Barganha",
        teste: "dipl",
        cd: "Oposto a Vontade",
        desc: "Comprando ou vendendo algo, você pode barganhar. Seu teste de Diplomacia é oposto pelo teste de Vontade do negociante. Se passar, você muda o preço em 10% a seu favor. Se passar por 10 ou mais, muda em 20%. Se falhar por 5 ou mais, você ofende o negociante — ele não voltará a tratar com você durante pelo menos uma semana. Alguns comerciantes ou estabelecimentos podem não ter permissão de baixar seus preços."
      },

      {
        nome: "Conduzir",
        pericia: "cava",
        cd: "15 ou 25",
        especial: "cavalgar",
        desc: "Cavalgar através de obstáculos exige testes de Cavalgar. A CD é 15 para terreno ruim e obstáculos pequenos (planície pedregosa, vala estreita) e 25 para terreno perigoso ou obstáculos grandes (encosta nevada, pântano traiçoeiro). Se você falhar, cai da montaria e sofre 1d6 pontos de dano. Conduzir é parte de seu movimento e não exige uma ação. Esta perícia exige uma sela. Sem ela, você sofre –5 no teste."
      },



      {
        nome: "Esconder-se",
        teste: "furt",
        cd: "Oposto a Percepção",
        desc: "Faça um teste de Furtividade oposto pelos testes de Percepção de qualquer um que possa notá-lo. Todos que falharem não conseguem percebê-lo (você tem camuflagem total contra eles). Esconder-se é uma ação livre que você só pode fazer no final do seu turno e apenas se terminar seu turno em um lugar onde seja possível se esconder (atrás de uma porta, num quarto escuro, numa mata densa, no meio de uma multidão...). Se tiver se movido durante o turno, você sofre –5 no teste (você pode se mover à metade do deslocamento normal para não sofrer essa penalidade). Se tiver atacado ou feito outra ação muito chamativa, sofre –20."
      },
      {
        nome: "Etiqueta",
        treinada: "nobr",
        teste: "nobr",
        cd: "15",
        desc: "Você sabe se portar em ambientes aristocráticos, como bailes e audiências."
      },

      {
        nome: "Falar",
        desc: "Em geral, falar é uma ação livre. Lançar magias ou usar habilidades de classe que dependem da voz não são ações livres. O mestre também pode limitar aquilo que você consegue falar durante uma rodada (vinte palavras são o limite padrão)."
      },
      {
        nome: "Falsificação",
        teste: "enga",
        cd: "Oposto a Percepção",
        desc: "Você falsifica um documento. Faça um teste de Enganação oposto pelo teste de Percepção de quem examinar o documento. Se você passar, a pessoa acredita na falsificação; caso contrário, percebe que é falso. Se o documento é muito complexo, ou inclui uma assinatura ou carimbo específico, você sofre –10 no teste. Usada em conjunto com Ofício, você pode falsificar outros objetos (como joias e armas). Use Ofício para fabricar a peça e então um teste de Enganação para que ela pareça genuína."
      },
      {
        nome: "Idiomas",
        treinada: "conh",
        teste: "conh",
        cd: "20 ou 30",
        desc: "Você pode entender idiomas desconhecidos. Se falhar por 5 ou mais, você tira uma conclusão falsa. Idiomas exóticos ou muito antigos têm CD 30."
      },



      {
        nome: "Informação (Conhecimento)",
        treinada: "conh",
        teste: "conh",
        cd: "20 ou 30",
        desc: "Você responde dúvidas gerais. Questões simples, como o ano de fundação de um reino, não exigem testes. Questões complexas, como saber o antídoto de um veneno, têm CD 20. Por fim, mistérios e enigmas, como a origem de uma antiga maldição, têm CD 30."
      },
      {
        nome: "Informação (Misticismo)",
        treinada: "mist",
        teste: "mist",
        cd: "20 ou 30",
        desc: "Você responde dúvidas relativas a magias, itens mágicos, fenômenos sobrenaturais, runas, profecias, planos de existência etc. Questões simples não exigem teste. Questões complexas têm CD 20. Por fim, mistérios e enigmas têm CD 30."
      },
      {
        nome: "Informação (Nobreza)",
        treinada: "nobr",
        teste: "nobr",
        cd: "20 ou 30",
        desc: "Você responde dúvidas relativas a leis, tradições, linhagens e heráldica. Questões simples não exigem teste. Questões complexas têm CD 20. Por fim, mistérios e enigmas têm CD 30."
      },
      {
        nome: "Informação (Religião)",
        treinada: "reli",
        teste: "reli",
        cd: "20 ou 30",
        desc: "Você responde dúvidas relativas a deuses, profecias, planos de existência etc. Questões simples não exigem teste. Questões complexas têm CD 20. Por fim, mistérios e enigmas têm CD 30."
      },
      {
        nome: "Insinuação",
        teste: "enga",
        cd: "20",
        desc: "Você fala algo para alguém sem que outras pessoas entendam do que você está falando. Se você passar, o receptor entende sua mensagem. Se você falhar por 5 ou mais, ele entende algo diferente do que você queria. Outras pessoas podem fazer um teste de Intuição oposto ao seu teste de Enganação. Se passarem, entendem o que você está dizendo."
      },



      {
        nome: "Jogar-se no Chão",
        efeito: { condicao: "caido", aplicar: true },
        desc: "Jogar-se no chão é uma ação livre. Você recebe os benefícios e penalidades normais por estar caído, mas normalmente não sofre dano ao se jogar no chão."
      },
      {
        nome: "Lançar Magia de Armadura",
        treinada: "mist",
        teste: "mist",
        cd: "20 + custo em PM da magia",
        custo: "Parte do lançamento da magia: não gasta ação própria",
        desc: "Lançar uma magia arcana usando armadura exige um teste. Esse teste sofre penalidade de armadura. Se falhar, a magia não funciona, mas gasta pontos de mana mesmo assim."
      },
      {
        nome: "Largar um Item",
        especial: "largar",
        desc: "Deixar cair um item que esteja segurando é uma ação livre. Mas deixar cair (ou jogar) um item com a intenção de acertar algo é uma ação padrão. E deixar cair (ou jogar) um item para que outra pessoa agarre é uma ação de movimento."
      },
      {
        nome: "Mentir",
        teste: "enga",
        cd: "Oposto a Intuição",
        desc: "Você faz uma pessoa acreditar em algo que não é verdade. Seu teste é oposto pelo teste de Intuição da vítima. Mentiras muito implausíveis impõem uma penalidade de –10 em seu teste."
      },
      {
        nome: "Montar Rapidamente",
        pericia: "cava",
        cd: "20",
        especial: "cavalgar",
        desc: "Você pode montar ou desmontar como uma ação livre (o normal é gastar uma ação de movimento). Se falhar por 5 ou mais, você cai no chão. Esta perícia exige uma sela. Sem ela, você sofre –5 no teste."
      },


      {
        nome: "Perceber Mentira",
        teste: "intu",
        cd: "Oposto a Enganação",
        desc: "Você descobre se alguém está mentindo (veja a perícia Enganação)."
      },
      {
        nome: "Pressentimento",
        treinada: "intu",
        teste: "intu",
        cd: "20",
        desc: "Você analisa uma pessoa, para ter uma noção de sua índole ou caráter, ou uma situação, para saber se há algo anormal (por exemplo, se os habitantes de uma vila estão agindo de forma estranha). Este uso apenas indica se há algo anormal, mas não revela a causa."
      },
      {
        nome: "Observar",
        teste: "perc",
        cd: "15 a 30",
        desc: "Você vê coisas discretas ou escondidas. A CD varia de 15, para algo difícil de ser visto (um livro específico em uma estante) a 30, para algo quase invisível (uma gota de sangue em uma folha no meio de uma floresta à noite). Para pessoas ou itens escondidos, a CD é o resultado do teste de Furtividade ou Ladinagem feito para esconder a pessoa ou o item. Você também pode ler lábios (CD 20)."
      },

      {
        nome: "Ouvir",
        teste: "perc",
        cd: "0, 15 ou 20",
        desc: "Você escuta barulhos sutis. Uma conversa casual próxima tem CD 0 — ou seja, a menos que exista alguma penalidade, você passa automaticamente. Ouvir pessoas sussurrando tem CD 15. Ouvir do outro lado de uma porta aumenta a CD em +10. Você pode fazer testes de Percepção para ouvir mesmo que esteja dormindo, mas sofre –10 no teste; um sucesso faz você acordar. Perceber criaturas que não possam ser vistas tem CD 20, ou +10 no teste de Furtividade da criatura, o que for maior. Mesmo que você passe no teste, ainda sofre penalidades normais por lutar sem ver o inimigo."
      },


      {
        nome: "Rastrear",
        treinada: "sobr",
        teste: "sobr",
        cd: "15, 20 ou 25",
        desc: "Você pode identificar e seguir rastros. A CD é 15 para solo macio (neve, lama), 20 para solo comum (grama, terra) e 25 para solo duro (rocha ou piso de interiores). A CD diminui em –5 se você estiver rastreando um grupo grande (dez ou mais indivíduos) ou criaturas Enormes ou Colossais, mas aumenta em +5 em visibilidade precária (noite, chuva, neblina...). Enquanto rastreia, seu deslocamento é reduzido à metade. Se falhar, pode tentar novamente gastando mais um dia. Porém, a cada dia desde a criação dos rastros, a CD aumenta em +1."
      },
      {
        nome: "Rito",
        treinada: "reli",
        teste: "reli",
        cd: "20",
        desc: "Você realiza uma cerimônia religiosa, como um batizado, casamento ou funeral. Isso inclui a cerimônia de penitência para redimir um devoto que tenha descumprido as Obrigações & Restrições de sua divindade. Uma cerimônia de penitência exige um sacrifício de T$ 100 por nível de personagem do devoto ou a realização de uma missão sagrada, de acordo com o mestre."
      },
      {
        nome: "Sabotar",
        treinada: "ladi",
        teste: "ladi",
        cd: "20 ou 30",
        custo: "Leva 1d4 rodadas (ou uma ação completa com –5 no teste)",
        desc: "Você desabilita um dispositivo mecânico. Uma ação simples (emperrar uma fechadura, desativar uma armadilha básica, sabotar uma roda de carroça para que quebre 1d4 rodadas após o uso) tem CD 20. Uma ação complexa (desativar uma armadilha avançada, sabotar um canhão para explodir quando utilizado) tem CD 30. Se você falhar por 5 ou mais, alguma coisa sai errada — a armadilha se ativa, você acha que o mecanismo está desabilitado, mas na verdade ele ainda funciona... Usar esta perícia leva 1d4 rodadas. Você pode sofrer –5 em seu teste para fazê-lo como uma ação completa."
      },
      {
        nome: "Saltar",
        pericia: "atle",
        cd: "CD pela distância",
        especial: "saltar",
        desc: "Você pode pular sobre buracos ou obstáculos ou alcançar algo elevado. Para um salto longo, a CD é 5 por quadrado de 1,5m (CD 10 para 3m, 15 para 4,5m, 20 para 6m e assim por diante). Para um salto em altura, a CD 15 é por quadrado de 1,5m (30 para 3m, 45 para 4,5m e assim por diante). Você deve ter pelo menos 6m para correr e pegar impulso (sem esse espaço, a CD aumenta em +10). Saltar é parte de seu movimento e não exige uma ação."
      },
      {
        nome: "Seguir",
        teste: "furt",
        cd: "Oposto a Percepção",
        desc: "Faça um teste de Furtividade oposto ao teste de Percepção da pessoa sendo seguida. Você sofre –5 se estiver em um lugar sem esconderijos ou sem movimento, como um descampado ou rua deserta. A vítima recebe +5 em seu teste de Percepção se estiver tomando precauções para não ser seguida (como olhar para trás de vez em quando). Se você passar, segue a pessoa até ela chegar ao seu destino. Se falhar, a pessoa o percebe na metade do caminho."
      }

    ]
  },
  {
    id: "reacao",
    nome: "Reações",
    curto: "Reação",
    singular: "Reação",
    icone: "fa-bolt",
    cor: "#b48cf0",
    gasta: null,
    reacao: true,
    resumo: "Reações acontecem em resposta a algo e não têm limite por turno. Podem ser usadas mesmo fora do seu turno.",
    acoes: [
      {
        nome: "Amortecer Queda",
        especial: "amortecerQueda",
        treinada: "acro",
        teste: "acro",
        cd: "15",
        desc: "Quando cai, você pode gastar uma reação e fazer um teste de Acrobacia para reduzir o dano. Se passar, reduz o dano da queda em 1d6, mais 1d6 para cada 5 pontos pelos quais o resultado do teste exceder a CD. Se reduzir o dano a zero, você cai de pé."
      },
      {
        nome: "Identificar Magia",
        treinada: "mist",
        teste: "mist",
        cd: "15 + custo em PM da magia",
        desc: "Quando alguém lança uma magia, você pode adivinhar qual é através de seus gestos e palavras. Este uso é uma reação."
      }
    ]
  },
  {
    id: "outros",
    nome: "Outras Ações (longa duração)",
    curto: "Outros",
    singular: "Longa duração",
    icone: "fa-clock",
    cor: "#5fd1c4",
    gasta: null,
    resumo: "Atividades que levam minutos, horas, dias ou mais: não se encaixam em nenhuma ação de combate. O card mostra o tempo que levam.",
    acoes: [
      {
        nome: "Acampamento",
        teste: "sobr",
        cd: "15, 20, 25 ou 30",
        custo: "Abrigo e alimento por um dia (exige equipamento de viagem)",
        desc: "Você consegue abrigo e alimento para você e seu grupo por um dia (caçando, pescando, colhendo frutos...). A CD depende do terreno: 15 para planícies e colinas, 20 para florestas e pântanos, 25 para desertos ou montanhas e 30 para regiões planares perigosas ou áreas de Tormenta. Regiões muito áridas ou estéreis e clima ruim (neve, tempestade etc.) impõem penalidade cumulativa de –5. Dormir ao relento sem um acampamento e um saco de dormir diminui sua recuperação de PV e PM (veja a página 106). Este uso exige equipamento de viagem. Sem ele, você sofre –5 em seu teste."
      },
      {
        nome: "Apresentação",
        tempo: "1 dia (ou noite)",
        pericia: "atua",
        especial: "apresentacao",
        cd: "20",
        custo: "Leva um dia (ou noite): não gasta ação de combate",
        desc: "Você sabe fazer apresentações artísticas, incluindo música, dança e dramaturgia. Você pode se apresentar para ganhar dinheiro. Faça um teste. Se passar, você recebe T$ 1d6, mais T$ 1d6 para cada 5 pontos pelos quais o resultado do teste exceder a CD. Este uso leva um dia (ou noite...). Os valores recebidos pressupõem que você está se apresentando em um lugar propício, como o palco de uma taverna. De acordo com o mestre, você pode receber metade do valor, se estiver em um lugar inadequado (as ruas de uma cidade, um acampamento militar), ou o dobro, se estiver em um lugar especialmente propício (um festival, os salões de um palácio)."
      },
      {
        nome: "Coagir",
        tempo: "1 minuto ou mais",
        teste: "inti",
        cd: "Oposto a Vontade",
        custo: "Leva um minuto ou mais, conforme o Mestre",
        desc: "Faça um teste de Intimidação oposto pelo teste de Vontade de uma criatura inteligente (Int –3 ou maior) adjacente. Se você passar, ela obedece uma ordem sua (como fazer uma pequena tarefa, deixar que você passe por um lugar que ela estava protegendo...). Se você mandá-la fazer algo perigoso ou que vá contra a natureza dela, ela recebe +5 no teste ou passa automaticamente. Este uso gasta um minuto ou mais, de acordo com o mestre, e deixa o alvo hostil contra você."
      },
      {
        nome: "Consertar",
        tempo: "1 hora por tentativa",
        treinada: "ofic",
        teste: "ofic",
        cd: "15 ou 20 (a mesma de fabricar)",
        custo: "Cada tentativa leva uma hora e custa um décimo do preço do item",
        desc: "Reparar um item destruído tem a mesma CD para fabricá-lo. Cada tentativa consome uma hora de trabalho e um décimo do preço original do item. Em caso de falha, o tempo e o dinheiro são perdidos (mas você pode tentar novamente). Cada Ofício exige instrumentos de ofício específicos. Sem eles, você sofre –5 no teste."
      },
      {
        nome: "Cuidados Prolongados",
        tempo: "1 hora",
        especial: "cuidadosProlongados",
        treinada: "cura",
        teste: "cura",
        cd: "15",
        custo: "Leva uma hora: não gasta ação de combate",
        desc: "Você trata uma pessoa para que ela se recupere mais rapidamente. Se passar, ela aumenta sua recuperação de PV em +1 por nível nesse dia. Este uso leva uma hora e o número máximo de pessoas que você pode cuidar é igual ao seu nível. Esta perícia exige uma maleta de medicamentos. Sem ela, você sofre –5 no teste. Você pode usar a perícia Cura em si mesmo, mas sofre –5 no teste."
      },
      {
        nome: "Disfarce",
        tempo: "10 minutos",
        teste: "enga",
        cd: "Oposto a Percepção",
        custo: "Leva dez minutos e um estojo de disfarces",
        desc: "Você muda sua aparência ou a de outra pessoa. Faça um teste de Enganação oposto pelo teste de Percepção de quem prestar atenção no disfarçado. Se você passar, a pessoa acredita no disfarce; caso contrário, percebe que há algo errado. Disfarces muito complexos (como uma raça diferente) impõem –5 no seu teste. Se o disfarce é de uma pessoa específica, quem conhecer essa pessoa recebe +10 no teste de Percepção. Um disfarce exige dez minutos e um estojo de disfarces. Sem ele, você sofre –5 no teste."
      },
      {
        nome: "Fabricar",
        tempo: "1 dia a 1 mês",
        treinada: "ofic",
        teste: "ofic",
        cd: "15 ou 20",
        custo: "Leva de um dia a um mês, conforme o item; matéria-prima: um terço do preço",
        desc: "Você produz um item gastando matéria-prima e tempo de trabalho. A matéria-prima custa um terço do preço do item. O tempo de trabalho depende do tipo de item: um dia para consumíveis (itens alquímicos, pergaminhos, poções, munições...); uma semana para não consumíveis comuns (armas, ferramentas...) e um mês para não consumíveis superiores e/ou mágicos. Para consumíveis, você pode sofrer –5 no teste para fabricar duas unidades do item no mesmo tempo (pagando o custo de ambas). A critério do mestre, itens muito simples e sem efeito mecânico podem levar menos tempo. Da mesma forma, itens muito grandes ou complexos, como uma casa ou ponte, podem demorar vários meses. A CD do teste é 15 para itens simples (equipamentos de aventura, armas simples, munições, armaduras leves, escudos, preparados, catalisadores e outros a critério do mestre) e 20 para itens complexos (armas marciais, exóticas ou de fogo, armaduras pesadas, ferramentas, vestuários, esotéricos, venenos...). Cada Ofício exige instrumentos de ofício específicos. Sem eles, você sofre –5 no teste."
      },
      {
        nome: "Identificar Item Mágico (Misticismo)",
        tempo: "1 hora",
        treinada: "mist",
        teste: "mist",
        cd: "20, 25 ou 30",
        custo: "Leva uma hora (ou uma ação completa com –10 no teste)",
        desc: "Você estuda um item mágico para identificar seus poderes. A CD é 20 para itens mágicos menores, 25 para médios e 30 para itens mágicos maiores. Este uso gasta uma hora. Você pode sofrer uma penalidade de –10 no teste para diminuir o tempo para uma ação completa."
      },
      {
        nome: "Identificar Item Mágico (Religião)",
        tempo: "1 hora",
        treinada: "reli",
        teste: "reli",
        cd: "20, 25 ou 30",
        custo: "Leva uma hora (ou uma ação completa com –10 no teste)",
        desc: "Você pode identificar um item mágico de origem divina. Veja a perícia Misticismo."
      },
      {
        nome: "Impressionar",
        tempo: "Minutos a horas",
        teste: "atua",
        cd: "Oposto a Vontade",
        custo: "Leva de alguns minutos a algumas horas: não gasta ação de combate",
        desc: "Faça um teste de Atuação oposto pelo teste de Vontade de quem você quer impressionar. Se você passar, recebe +2 em testes de perícias baseadas em Carisma contra essa pessoa no mesmo dia. Se falhar, sofre –2 nesses testes e não pode tentar de novo no mesmo dia. Se estiver tentando impressionar mais de uma pessoa, o mestre faz apenas um teste pela plateia, usando o melhor bônus. Este uso leva de alguns minutos (canto ou dança) até algumas horas (apresentação teatral)."
      },
      {
        nome: "Intriga",
        tempo: "1 dia ou mais",
        teste: "enga",
        cd: "20 ou 30",
        custo: "Leva um dia ou mais, conforme o Mestre",
        desc: "Você espalha uma fofoca. Por exemplo, pode dizer que o dono da taverna está aguando a cerveja, para enfurecer o povo contra ele. Intrigas muito improváveis têm CD 30. Se você falhar por 5 ou mais, o alvo da intriga descobre que você está fofocando a respeito dele. Mesmo que você passe, uma pessoa pode investigar a fonte da intriga e chegar até você. Isso exige um teste de Investigação por parte dela (CD igual ao seu teste para a intriga). Este uso exige um dia ou mais, de acordo com o mestre."
      },
      {
        nome: "Interrogar",
        tempo: "1 hora",
        teste: "inve",
        cd: "20 ou 30",
        custo: "Leva uma hora e T$ 3d6 (valores variam conforme o Mestre)",
        desc: "Você descobre informações perguntando ou indo para um lugar movimentado e mantendo os ouvidos atentos. Informações gerais (“Quem é o guerreiro mais forte da aldeia?”) não exigem teste. Informações restritas, que poucas pessoas conhecem (“Quem é o ancião que está sempre ao lado do rei?”), têm CD 20. Informações confidenciais ou que podem colocar em risco quem falar sobre elas (“Quem é o líder da guilda dos ladrões?”), têm CD 30. Este uso gasta uma hora e T$ 3d6 (para comprar bebidas, subornar oficiais etc.), mas esses valores podem variar de acordo com o mestre."
      },
      {
        nome: "Apostar",
        tempo: "1 noite",
        treinada: "joga",
        especial: "apostar",
        cd: "tabela de ganhos",
        custo: "Leva uma noite de jogatina: não gasta ação de combate",
        desc: "Para resolver uma noite de jogatina, pague T$ 1d10, faça um teste de perícia e consulte a tabela para determinar quanto você ganha. Teste 9 ou menos: nenhum ganho. 10 a 14: metade da aposta. 15 a 19: valor da aposta (você “empata”). 20 a 29: dobro da aposta. 30 a 39: triplo da aposta. 40 ou mais: quíntuplo da aposta. O mestre pode variar o valor da aposta básica. De T$ 1d3, para uma taverna no porto frequentada por marujos e estivadores, a 1d10 x T$ 1.000, para um cassino de luxo na Capital."
      },
      {
        nome: "Mudar Atitude",
        tempo: "1 minuto",
        teste: "dipl",
        cd: "Oposto a Vontade",
        custo: "Leva um minuto (ou uma ação completa com –10 no teste)",
        desc: "Você muda a categoria de atitude de um NPC em relação a você ou a outra pessoa (veja a página 259). Faça um teste de Diplomacia oposto pelo teste de Vontade do alvo. Se você passar, muda a atitude dele em uma categoria para cima ou para baixo, à sua escolha (ou, se passar por 10 ou mais, em duas categorias). Se falhar por 5 ou mais, a atitude do alvo muda uma categoria na direção oposta. Este uso gasta um minuto. Você pode sofrer –10 no teste para fazê-lo como uma ação completa (para evitar uma briga, por exemplo). Você só pode mudar a atitude de um mesmo alvo uma vez por dia."
      },
      {
        nome: "Necropsia",
        tempo: "10 minutos",
        especial: "necropsia",
        treinada: "cura",
        teste: "cura",
        cd: "20",
        custo: "Leva dez minutos: não gasta ação de combate",
        desc: "Você examina um cadáver para determinar a causa e o momento aproximado da morte. Causas raras ou extraordinárias, como um veneno ou maldição, possuem CD 30. Este uso leva dez minutos. Esta perícia exige uma maleta de medicamentos. Sem ela, você sofre –5 no teste. Você pode usar a perícia Cura em si mesmo, mas sofre –5 no teste."
      },
      {
        nome: "Orientar-se",
        tempo: "1 dia de viagem",
        teste: "sobr",
        cd: "15, 20, 25 ou 30 (pelo terreno)",
        custo: "Um teste por dia de viagem, só em jornadas perigosas",
        desc: "Um personagem viajando pelos ermos precisa fazer um teste de Sobrevivência por dia para avançar. A CD depende do tipo de terreno (veja em “Acampamento”). Se passar, você avança seu deslocamento normal. Se falhar, avança apenas metade. Se falhar por 5 ou mais, se perde e não avança pelo dia. Num grupo, um personagem deve ser escolhido como guia. Personagens treinados em Sobrevivência podem ajudá-lo. Entretanto, se mais de um personagem quiser fazer o teste por si só, todos deverão rolar em segredo. Os jogadores devem decidir qual guia seguir antes de verem o resultado! Este teste é exigido apenas em jornadas perigosas (de acordo com o mestre)."
      },
      {
        nome: "Persuasão",
        tempo: "1 minuto ou mais",
        teste: "dipl",
        cd: "20",
        custo: "Leva um minuto ou mais, conforme o Mestre",
        desc: "Você convence uma pessoa a fazer algo, como responder uma pergunta ou prestar um favor. Se essa coisa for custosa (como fornecer uma carona de navio) você sofre –5 em seu teste. Se for perigosa (como ajudar numa luta) você sofre –10 ou falha automaticamente (veja também a página 259 para modificadores por categorias de atitude). De acordo com o mestre, seu teste pode ser oposto ao teste de Vontade da pessoa. Este uso gasta um minuto ou mais, de acordo com o mestre."
      },
      {
        nome: "Procurar",
        tempo: "Ação completa a 1 dia",
        teste: "inve",
        cd: "15, 20 ou 30",
        custo: "Gasta de uma ação completa a um dia, conforme o Mestre",
        desc: "Você examina um local em busca de algo. A CD varia: 15 para um item ou no meio de uma bagunça, mas não necessariamente escondido; 20 para um item escondido (cofre atrás de um quadro, documento no fundo falso de uma gaveta); 30 para um item muito bem escondido (passagem secreta ativada por um botão, documento escrito com tinta invisível). Este uso gasta desde uma ação completa (examinar uma escrivaninha) até um dia (pesquisar uma biblioteca). Você também pode encontrar armadilhas (CD de acordo com a armadilha) e rastros (mas para segui-los deve usar Sobrevivência)."
      },
      {
        nome: "Sustento",
        tempo: "1 semana",
        treinada: "ofic",
        teste: "ofic",
        cd: "15",
        custo: "Leva uma semana de trabalho",
        desc: "Com uma semana de trabalho e um teste de Ofício, você ganha T$ 1, mais T$ 1 por ponto que seu teste exceder a CD. Por exemplo, com um resultado 20, ganha T$ 6 pela semana de trabalho. Trabalhadores sem treinamento usam testes de atributo para sustento. De acordo com o mestre, outras perícias podem ser usadas para sustento, como Adestramento, Cura ou Sobrevivência. Cada Ofício exige instrumentos de ofício específicos. Sem eles, você sofre –5 no teste."
      }
    ]
  }

];
