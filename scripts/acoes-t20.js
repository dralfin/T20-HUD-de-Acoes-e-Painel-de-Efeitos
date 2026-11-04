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
 *  - especial: "misericordia" liga o fluxo do Golpe de Misericórdia (escolha de arma, 20 natural, chance de morte);
 *              "atrasar" liga o fluxo de Atrasar (escolha da nova Iniciativa e passagem do turno);
 *              "corrida" liga o fluxo da Corrida (teste de Atletismo, deslocamento em linha reta, fôlego e fadiga).
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
        nome: "Atropelar",
        desc: "Você usa uma ação padrão durante um movimento para avançar pelo espaço ocupado por uma criatura (normalmente, você não pode fazer uma ação padrão durante um movimento; isto é uma exceção). A criatura pode lhe dar passagem ou resistir. Se der passagem, você avança pelo espaço dela; nenhum teste é necessário. Se resistir, faça um teste de manobra oposto; se você vencer, deixa a criatura caída e continua seu avanço. Se o alvo vencer, continua de pé e detém seu avanço. Atropelar é uma ação livre se tentada durante uma investida."
      },
      {
        nome: "Fintar",
        desc: "Faça um teste de Enganação oposto ao teste de Reflexos de uma criatura em alcance curto. Se você passar, ela fica desprevenida contra seu próximo ataque, mas apenas até o fim de seu próximo turno."
      },
      {
        nome: "Preparar",
        desc: "Você prepara uma ação (padrão, de movimento ou livre) para realizar mais tarde, após seu turno, mas antes de seu turno na próxima rodada. Diga a ação que vai fazer e em quais circunstâncias (por exemplo, “disparar minha besta na primeira criatura que passar pela porta”). A qualquer momento antes de seu próximo turno, você pode fazer a ação preparada como uma reação a essas circunstâncias.\nSe, no seu próximo turno, você ainda não tiver realizado sua ação preparada, não pode mais realizá-la (embora possa preparar a mesma ação de novo).\nPelo resto do combate, sua Iniciativa fica imediatamente acima da qual você fez a ação preparada."
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
        nome: "Levantar-se",
        efeito: { condicao: "caido", aplicar: false },
        desc: "Levantar do chão (ou de uma cama, cadeira...) exige uma ação de movimento."
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
    icone: "fa-burst",
    cor: "#e0b85c",
    gasta: "completa",
    resumo: "Uma ação completa consome a ação padrão e a de movimento do turno.",
    acoes: [
      {
        nome: "Corrida",
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
        nome: "Golpe de Misericórdia",
        especial: "misericordia",
        desc: "Você desfere um golpe letal em um oponente adjacente e indefeso. Um golpe de misericórdia é um acerto crítico automático.\nAlém de sofrer dano, a vítima tem uma chance de morrer instantaneamente. Esta chance é de 25% (1 em 1d4) para personagens e NPCs importantes e de 75% (1 a 3 em 1d4) para NPCs secundários."
      },
      {
        nome: "Investida",
        desc: "Você avança até o dobro de seu deslocamento (e no mínimo 3m) em linha reta e, no fim do movimento, faz um ataque corpo a corpo. Você recebe +2 no teste de ataque, mas sofre –2 na Defesa até o seu próximo turno, porque sua guarda fica aberta. Você não pode fazer uma investida em terreno difícil. Durante uma investida, você pode fazer a manobra atropelar como uma ação livre (mas não pode atropelar e atacar o mesmo alvo)."
      },
      {
        nome: "Lançar uma Magia",
        auto: true,
        desc: "Ao lançar magias com execução maior do que uma ação completa, você gasta uma ação completa a cada rodada."
      }
    ]
  },
  {
    id: "livre",
    nome: "Ações Livres",
    curto: "Livre",
    singular: "Ação Livre",
    icone: "fa-bolt",
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
        nome: "Falar",
        desc: "Em geral, falar é uma ação livre. Lançar magias ou usar habilidades de classe que dependem da voz não são ações livres. O mestre também pode limitar aquilo que você consegue falar durante uma rodada (vinte palavras são o limite padrão)."
      },
      {
        nome: "Jogar-se no Chão",
        efeito: { condicao: "caido", aplicar: true },
        desc: "Jogar-se no chão é uma ação livre. Você recebe os benefícios e penalidades normais por estar caído, mas normalmente não sofre dano ao se jogar no chão."
      },
      {
        nome: "Largar um Item",
        desc: "Deixar cair um item que esteja segurando é uma ação livre. Mas deixar cair (ou jogar) um item com a intenção de acertar algo é uma ação padrão. E deixar cair (ou jogar) um item para que outra pessoa agarre é uma ação de movimento."
      }
    ]
  }
];
