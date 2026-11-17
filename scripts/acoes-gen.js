/**
 * Automação genérica das ações de perícia (ver MenuAcoes.testeGeral em main.js).
 * Chave: nome da ação em acoes-t20.js. Campos:
 *  - cd:        número fixo | { opcoes:[{t, v, pedir?, soma?}] } | { numero:true } (o Mestre digita) | { mais:{ base, rotulo } } (base + número digitado)
 *  - oposto:    { pericias:[chaves], cond?:{ passou:[condições], passou10:[condições] } } — teste oposto a uma criatura (o Mestre rola em segredo)
 *  - secreto:   true → o Mestre define a CD (se ela não for fixa) e a rolagem e o resultado ficam só com ele
 *  - kit:       { re, nome, pen } — item procurado no inventário; sem ele, a penalidade é aplicada
 *  - mods:      [{ t, v? (no teste), cd? (na CD), alvo? (no teste da criatura), num?, cdPorUnid?, alt? }] — alt: "completa" troca o tipo de ação (o card e o gasto passam a ser da ação completa)
 *     — marcados numa janela antes do teste
 *  - resultado: { passou, passou10, falhou, falhou5 } — texto do card ({total} = resultado do teste, {tl} = T$ do Sustento)
 */
const SEM_INSTR = { t: "Sem instrumentos de ofício (–5)", v: -5 };

export const GEN = {
  /* ---------------- Padrão ---------------- */
  "Assustar": {
    oposto: { pericias: ["vont"], cond: { passou: ["abalado"], passou10: ["apavorado"] } },
    resultado: {
      passou: "A criatura fica <b>abalada</b> pelo resto da cena.",
      passou10: "A criatura fica <b>apavorada</b> por uma rodada e então <b>abalada</b> pelo resto da cena.",
      falhou: "A criatura resiste ao susto."
    }
  },
  "Ocultar": {
    oposto: { pericias: ["perc"] },
    mods: [
      { t: "Objeto discreto ou pequeno (+5)", v: 5 },
      { t: "Objeto desajeitado ou grande (–5)", v: -5 },
      { t: "Alguém está revistando você (Percepção +10)", alvo: 10 }
    ],
    resultado: { passou: "O objeto fica escondido.", falhou: "O objeto é descoberto." }
  },
  "Plano de Ação": {
    cd: 20,
    resultado: {
      passou: "O aliado em alcance médio recebe <b>+5 na Iniciativa</b>. Se ficar com Iniciativa maior que a sua e ainda não tiver agido na rodada, age logo após o seu turno; nas rodadas seguintes age pela nova ordem (ajuste a Iniciativa dele no rastreador).",
      falhou: "O plano não surte efeito."
    }
  },
  "Punga": {
    cd: 20,
    resultado: {
      passou: "Pega (ou planta) o objeto. A vítima faz um teste de Percepção contra <b>CD {total}</b>: se passar, percebe a tentativa.",
      falhou: "Não consegue pegar o objeto. A vítima faz um teste de Percepção contra <b>CD {total}</b>: se passar, percebe a tentativa."
    }
  },

  /* ---------------- Movimento ---------------- */
  "Analisar Terreno": {
    cd: 20,
    resultado: { passou: "Descobre uma vantagem no campo de batalha (cobertura, camuflagem, terreno elevado…), se houver.", falhou: "Não percebe nada de útil." }
  },
  "Manejar Animal": {
    cd: 15,
    resultado: { passou: "O animal executa a tarefa para a qual foi treinado.", falhou: "O animal não obedece." }
  },
  "Pilotar Veículo": {
    cd: { opcoes: [{ t: "Situação ruim", v: 15 }, { t: "Situação extrema", v: 25 }] },
    resultado: {
      passou: "Conduz o veículo normalmente.",
      falhou: "Avança apenas <b>metade do deslocamento</b>.",
      falhou5: "Avança metade do deslocamento e <b>se acidenta</b> de alguma forma (o Mestre decide)."
    }
  },

  /* ---------------- Completa ---------------- */
  "Abrir Fechadura": {
    cd: { opcoes: [{ t: "Fechadura simples (porta de loja)", v: 20 }, { t: "Fechadura média (prisão, baú)", v: 25 }, { t: "Fechadura superior (cofre, câmara do tesouro)", v: 30 }] },
    kit: { re: "gazua", nome: "gazua", pen: -5 },
    resultado: { passou: "A fechadura se abre.", falhou: "A fechadura resiste." }
  },
  "Acalmar Animal": {
    cd: 25,
    resultado: { passou: "O animal se acalma.", falhou: "O animal continua nervoso ou agressivo." }
  },
  "Detectar Magia": {
    cd: 15,
    mods: [{ t: "Aura atrás de barreira de madeira ou pedra (–5)", v: -5 }, { t: "Aura atrás de barreira de ferro ou chumbo (–10)", v: -10 }],
    resultado: {
      passou: "Detecta a presença e a intensidade das auras mágicas em alcance curto (não suas localizações exatas).",
      falhou: "Não detecta nenhuma aura."
    }
  },
  "Escapar": {
    cd: { opcoes: [
      { t: "Redes", v: 20 },
      { t: "Algemas", v: 30 },
      { t: "Cordas", pedir: "Qual foi o resultado do teste de Destreza de quem amarrou? A CD será esse valor + 10.", soma: 10 }
    ] },
    resultado: { passou: "Escapa das amarras.", falhou: "Continua preso." }
  },
  "Identificar (Ofício)": {
    cd: 20,
    mods: [SEM_INSTR],
    resultado: { passou: "Descobre as propriedades do item e seu preço.", falhou: "Não consegue identificar o item." }
  },

  /* ---------------- Livre ---------------- */
  "Acampamento": {
    cd: { opcoes: [
      { t: "Planícies e colinas", v: 15 },
      { t: "Florestas e pântanos", v: 20 },
      { t: "Desertos ou montanhas", v: 25 },
      { t: "Regiões planares perigosas ou Tormenta", v: 30 }
    ] },
    kit: { re: "viagem", nome: "equipamento de viagem", pen: -5 },
    mods: [{ t: "Região muito árida ou estéril (–5)", v: -5 }, { t: "Clima ruim: neve, tempestade… (–5)", v: -5 }],
    resultado: {
      passou: "Consegue <b>abrigo e alimento</b> para o grupo por um dia.",
      falhou: "Não consegue abrigo nem alimento (dormir ao relento sem acampamento diminui a recuperação de PV e PM)."
    }
  },
  "Barganha": {
    oposto: { pericias: ["vont"] },
    resultado: {
      passou: "Muda o preço em <b>10%</b> a seu favor.",
      passou10: "Muda o preço em <b>20%</b> a seu favor.",
      falhou: "O negociante não cede: o preço não muda.",
      falhou5: "<b>Ofende o negociante</b>: ele não volta a tratar com você por pelo menos uma semana."
    }
  },
  "Coagir": {
    oposto: { pericias: ["vont"] },
    resultado: {
      passou: "A criatura <b>obedece uma ordem</b> sua (se for perigosa ou contra a natureza dela, ela recebe +5 no teste ou passa automaticamente). O alvo fica hostil contra você.",
      falhou: "A criatura se recusa. O alvo fica hostil contra você."
    }
  },
  "Consertar": {
    cd: { opcoes: [{ t: "Item simples", v: 15 }, { t: "Item complexo", v: 20 }] },
    mods: [SEM_INSTR],
    resultado: {
      passou: "O item é consertado (consome uma hora de trabalho e um décimo do preço original).",
      falhou: "Falha: o tempo e o dinheiro são perdidos (pode tentar de novo)."
    }
  },
  "Disfarce": {
    oposto: { pericias: ["perc"] },
    kit: { re: "estojo.*disfarce|disfarce", nome: "estojo de disfarces", pen: -5 },
    mods: [{ t: "Disfarce muito complexo, como outra raça (–5)", v: -5 }, { t: "Imita uma pessoa específica que o observador conhece (Percepção +10)", alvo: 10 }],
    resultado: { passou: "A pessoa acredita no disfarce.", falhou: "A pessoa percebe que há algo errado." }
  },
  "Esconder-se": {
    oposto: { pericias: ["perc"] },
    mods: [{ t: "Moveu-se neste turno (–5)", v: -5 }, { t: "Atacou ou fez outra ação muito chamativa (–20)", v: -20 }],
    resultado: { passou: "Não é percebido por essa criatura: tem <b>camuflagem total</b> contra ela.", falhou: "É percebido por essa criatura." }
  },
  "Etiqueta": {
    cd: 15,
    resultado: { passou: "Porta-se bem no ambiente aristocrático.", falhou: "Comete um deslize de etiqueta." }
  },
  "Fabricar": {
    cd: { opcoes: [{ t: "Item simples (equipamento de aventura, arma simples, munição, armadura leve…)", v: 15 }, { t: "Item complexo (arma marcial/exótica/de fogo, armadura pesada, ferramenta, veneno…)", v: 20 }] },
    mods: [{ t: "Fabricar duas unidades de um consumível (–5)", v: -5 }, SEM_INSTR],
    resultado: {
      passou: "Produz o item (matéria-prima: um terço do preço; tempo conforme o tipo de item).",
      falhou: "Falha: o item não é produzido."
    }
  },
  "Falsificação": {
    oposto: { pericias: ["perc"] },
    mods: [{ t: "Documento muito complexo ou com assinatura/carimbo específico (–10)", v: -10 }],
    resultado: { passou: "Quem examinar acredita na falsificação.", falhou: "Quem examinar percebe que é falso." }
  },
  "Idiomas": {
    secreto: true,
    cd: { opcoes: [{ t: "Idioma comum", v: 20 }, { t: "Idioma exótico ou muito antigo", v: 30 }] },
    resultado: { passou: "Entende o idioma.", falhou: "Não consegue entender o idioma.", falhou5: "Tira uma <b>conclusão falsa</b> sobre o que está escrito ou dito." }
  },
  "Identificar Item Mágico (Misticismo)": {
    secreto: true,
    cd: { opcoes: [{ t: "Item mágico menor", v: 20 }, { t: "Item mágico médio", v: 25 }, { t: "Item mágico maior", v: 30 }] },
    mods: [{ t: "Fazer em uma ação completa em vez de uma hora (–10)", v: -10, alt: "completa" }],
    resultado: { passou: "Identifica os poderes do item.", falhou: "Não consegue identificar os poderes do item." }
  },
  "Identificar Item Mágico (Religião)": {
    secreto: true,
    cd: { opcoes: [{ t: "Item mágico menor", v: 20 }, { t: "Item mágico médio", v: 25 }, { t: "Item mágico maior", v: 30 }] },
    mods: [{ t: "Fazer em uma ação completa em vez de uma hora (–10)", v: -10, alt: "completa" }],
    resultado: { passou: "Identifica os poderes do item.", falhou: "Não consegue identificar os poderes do item." }
  },
  "Impressionar": {
    oposto: { pericias: ["vont"] },
    resultado: {
      passou: "<b>+2</b> em testes de perícias baseadas em Carisma contra essa pessoa no mesmo dia.",
      falhou: "<b>–2</b> nesses testes e não pode tentar de novo no mesmo dia."
    }
  },
  "Informação (Conhecimento)": {
    secreto: true,
    cd: { opcoes: [{ t: "Questão complexa", v: 20 }, { t: "Mistério ou enigma", v: 30 }] },
    resultado: { passou: "Responde a dúvida.", falhou: "Não sabe a resposta." }
  },
  "Informação (Misticismo)": {
    secreto: true,
    cd: { opcoes: [{ t: "Questão complexa", v: 20 }, { t: "Mistério ou enigma", v: 30 }] },
    resultado: { passou: "Responde a dúvida.", falhou: "Não sabe a resposta." }
  },
  "Informação (Nobreza)": {
    secreto: true,
    cd: { opcoes: [{ t: "Questão complexa", v: 20 }, { t: "Mistério ou enigma", v: 30 }] },
    resultado: { passou: "Responde a dúvida.", falhou: "Não sabe a resposta." }
  },
  "Informação (Religião)": {
    secreto: true,
    cd: { opcoes: [{ t: "Questão complexa", v: 20 }, { t: "Mistério ou enigma", v: 30 }] },
    resultado: { passou: "Responde a dúvida.", falhou: "Não sabe a resposta." }
  },
  "Insinuação": {
    cd: 20,
    resultado: {
      passou: "O receptor entende a mensagem. Outras pessoas podem fazer um teste de Intuição contra o seu teste de Enganação ({total}); se passarem, também entendem.",
      falhou: "O receptor não entende a mensagem.",
      falhou5: "O receptor entende <b>algo diferente</b> do que você queria."
    }
  },
  "Intriga": {
    secreto: true,
    cd: { opcoes: [{ t: "Intriga plausível", v: 20 }, { t: "Intriga muito improvável", v: 30 }] },
    resultado: {
      passou: "A fofoca se espalha. Alguém pode investigar a fonte: teste de Investigação contra <b>CD {total}</b>.",
      falhou: "A fofoca não pega.",
      falhou5: "O alvo da intriga <b>descobre</b> que você está fofocando a respeito dele."
    }
  },
  "Interrogar": {
    secreto: true,
    cd: { opcoes: [{ t: "Informação restrita", v: 20 }, { t: "Informação confidencial ou perigosa de revelar", v: 30 }] },
    resultado: { passou: "Descobre a informação.", falhou: "Não descobre nada." }
  },
  "Lançar Magia de Armadura": {
    cd: { mais: { base: 20, rotulo: "Qual é o custo em PM da magia? (CD 20 + custo)" } },
    resultado: { passou: "A magia funciona.", falhou: "A magia não funciona, mas os pontos de mana são gastos mesmo assim." }
  },
  "Mentir": {
    oposto: { pericias: ["intu"] },
    mods: [{ t: "Mentira muito implausível (–10)", v: -10 }],
    resultado: { passou: "A vítima acredita na mentira.", falhou: "A vítima não acredita na mentira." }
  },
  "Mudar Atitude": {
    oposto: { pericias: ["vont"] },
    mods: [{ t: "Fazer em uma ação completa em vez de um minuto (–10)", v: -10, alt: "completa" }],
    resultado: {
      passou: "Muda a atitude do alvo em <b>uma categoria</b>, para cima ou para baixo, à sua escolha.",
      passou10: "Muda a atitude do alvo em <b>duas categorias</b>, para cima ou para baixo, à sua escolha.",
      falhou: "A atitude do alvo não muda.",
      falhou5: "A atitude do alvo muda <b>uma categoria na direção oposta</b>."
    }
  },
  "Perceber Mentira": {
    oposto: { pericias: ["enga"] },
    resultado: { passou: "Percebe que a pessoa está mentindo.", falhou: "Não percebe a mentira." }
  },
  "Pressentimento": {
    secreto: true,
    cd: 20,
    resultado: { passou: "Percebe se há algo anormal na pessoa ou na situação (sem revelar a causa).", falhou: "Não percebe nada de anormal." }
  },
  "Observar": {
    secreto: true,
    cd: { numero: true },
    resultado: { passou: "Vê o que estava discreto ou escondido.", falhou: "Não percebe." }
  },
  "Orientar-se": {
    secreto: true,
    cd: { opcoes: [
      { t: "Planícies e colinas", v: 15 },
      { t: "Florestas e pântanos", v: 20 },
      { t: "Desertos ou montanhas", v: 25 },
      { t: "Regiões planares perigosas ou Tormenta", v: 30 }
    ] },
    resultado: {
      passou: "Avança o <b>deslocamento normal</b> no dia.",
      falhou: "Avança apenas <b>metade</b> do deslocamento no dia.",
      falhou5: "<b>Se perde</b> e não avança no dia."
    }
  },
  "Ouvir": {
    secreto: true,
    cd: { opcoes: [
      { t: "Conversa casual próxima", v: 0 },
      { t: "Pessoas sussurrando", v: 15 },
      { t: "Criatura que não pode ser vista", v: 20 }
    ] },
    mods: [{ t: "Do outro lado de uma porta (CD +10)", cd: 10 }, { t: "Dormindo (–10)", v: -10 }],
    resultado: { passou: "Escuta o barulho.", falhou: "Não escuta nada." }
  },
  "Persuasão": {
    cd: 20,
    mods: [{ t: "Pedido custoso (–5)", v: -5 }, { t: "Pedido perigoso (–10)", v: -10 }],
    resultado: { passou: "A pessoa é convencida.", falhou: "A pessoa não se convence. (A critério do Mestre, o teste pode ser oposto à Vontade dela.)" }
  },
  "Procurar": {
    secreto: true,
    cd: { opcoes: [{ t: "Item no meio da bagunça", v: 15 }, { t: "Item escondido", v: 20 }, { t: "Item muito bem escondido", v: 30 }] },
    resultado: { passou: "Encontra o que procurava.", falhou: "Não encontra nada." }
  },
  "Rastrear": {
    cd: { opcoes: [{ t: "Solo macio (neve, lama)", v: 15 }, { t: "Solo comum (grama, terra)", v: 20 }, { t: "Solo duro (rocha, piso de interiores)", v: 25 }] },
    mods: [
      { t: "Grupo grande (10+) ou criaturas Enormes/Colossais (CD –5)", cd: -5 },
      { t: "Visibilidade precária: noite, chuva, neblina (CD +5)", cd: 5 },
      { t: "Dias desde a criação dos rastros (CD +1 por dia)", num: true, cdPorUnid: 1 }
    ],
    resultado: {
      passou: "Identifica e segue os rastros (deslocamento reduzido à metade enquanto rastreia).",
      falhou: "Perde os rastros. Pode tentar de novo gastando mais um dia."
    }
  },
  "Rito": {
    cd: 20,
    resultado: { passou: "A cerimônia é realizada.", falhou: "A cerimônia não dá certo." }
  },
  "Sabotar": {
    cd: { opcoes: [{ t: "Ação simples (emperrar fechadura, armadilha básica…)", v: 20 }, { t: "Ação complexa (armadilha avançada, canhão…)", v: 30 }] },
    mods: [{ t: "Fazer como ação completa em vez de 1d4 rodadas (–5)", v: -5, alt: "completa" }],
    resultado: {
      passou: "O dispositivo é desabilitado.",
      falhou: "O dispositivo continua funcionando.",
      falhou5: "Algo sai errado: a armadilha se ativa, ou o mecanismo parece desabilitado mas ainda funciona."
    }
  },
  "Seguir": {
    oposto: { pericias: ["perc"] },
    mods: [{ t: "Lugar sem esconderijos ou movimento (–5)", v: -5 }, { t: "Vítima tomando precauções (Percepção +5)", alvo: 5 }],
    resultado: { passou: "Segue a pessoa até o destino dela.", falhou: "A pessoa o percebe na metade do caminho." }
  },
  "Sustento": {
    cd: 15,
    mods: [SEM_INSTR],
    resultado: { passou: "Ganha <b>T$ {tl}</b> pela semana de trabalho (T$ 1, mais T$ 1 por ponto acima da CD).", falhou: "A semana de trabalho não rende nada." }
  },

  /* ---------------- Reação ---------------- */
  "Identificar Magia": {
    cd: { mais: { base: 15, rotulo: "Qual é o custo em PM da magia? (CD 15 + custo)" } },
    resultado: { passou: "Adivinha qual é a magia pelos gestos e palavras.", falhou: "Não consegue identificar a magia." }
  }
};
