# T20 - HUD de Ações e Painel de Efeitos

Módulo para **Tormenta20** no **Foundry VTT v13**. Ele reúne duas ferramentas:

1. **HUD do personagem**, que segue o token selecionado e controla as ações do turno.
2. **Painel de Efeitos**, exclusivo do Mestre, que lista os efeitos de todos os tokens da cena.

---

## 1. HUD do personagem

Uma janela leve, arrastável e recolhível, no tema escuro com detalhes dourados.

### Quando aparece
- Para o **token selecionado**, dentro ou fora de combate. Sem token selecionado, mostra o combatente do turno.
- Jogadores veem a HUD dos tokens que controlam. O Mestre vê a HUD de qualquer token (dá para desligar em *Mostrar a HUD para o Mestre*).
- Arraste pelo cabeçalho para mover. **Duplo clique** no cabeçalho recentraliza. O botão ⌃ recolhe a HUD para uma barra compacta.
- Mostra a imagem do **token** ou o **retrato (portrait)** do personagem, à sua escolha.

### Recursos do personagem (sempre visíveis)
- **PV** e **PM**, com barra, valor atual e máximo.
- **PV temporário** e **PM temporário**, em campos próprios (ícone do recurso com uma ampulheta).
- **Defesa total** (DEF) e **CD das magias** (10 + metade do nível + atributo de conjuração).
- **Edição direta:** clique no campo, digite e aperte Enter (Esc cancela). Aceita um número (`12`) ou `+5` / `-5` para somar ou subtrair do valor atual. O valor atual não passa do máximo, e o PM e os temporários não ficam negativos.
- Com a HUD recolhida, o cabeçalho mostra um resumo de PV, PM e defesa.

### Ações do turno (no turno do token)
Segue a regra **Tipos de Ações** do livro:
- **Padrão** — gasta a ação padrão.
- **Movimento** — o 1º clique gasta a ação de movimento; o 2º troca a ação padrão por outro movimento (2 movimentos).
- **Completa** — gasta padrão e movimento juntos; só vale se nenhuma das duas foi gasta.
- **Clique com o botão direito** em uma ação devolve o gasto. O botão ↺ reinicia todas.
- Ações livres e reações não têm limite.
- As ações voltam a ficar disponíveis no início de cada turno (feito pelo Mestre conectado).
- Com a HUD recolhida, o punho e o boneco correndo mostram, acesos ou apagados, se a ação padrão e a de movimento ainda estão disponíveis.

### Encerrar turno e timer
- Botão **Encerrar turno** passa a vez ao próximo combatente. Se o jogador não tiver permissão, o pedido vai ao Mestre pelo socket.
- **Timer** com contagem regressiva e barra. Nos últimos 10 segundos fica vermelho e pulsa; ao acabar, a HUD treme e toca o **som de tempo esgotado**.
- O tempo máximo é configurável (0 = sem limite). O Mestre também pode mudar clicando no cronômetro da HUD.
- O som pode ser qualquer arquivo de áudio. Sem arquivo, toca um sinal de três notas gerado pelo módulo. O botão de alto-falante testa o som.
- Opcional: passar o turno automaticamente quando o tempo acaba.

### Limite de movimento
- O token anda normalmente até o **deslocamento** do personagem (lido da ficha; padrão 9 m).
- Passar disso gasta uma **segunda ação de movimento** (no lugar da padrão). Além de dois movimentos, o token é **bloqueado** com um aviso que diz quantos metros ainda restam.
- A distância é cobrada pelo **custo medido pelo Foundry**, o mesmo da régua. Terreno difícil e regras de diagonal contam do mesmo jeito. Arrastos divididos em vários trechos pelo Foundry são cobrados uma única vez.
- Uma barra mostra o deslocamento usado e o máximo (por exemplo, `10,5 / 21 m`).
- Jogadores só movem o token **no próprio turno** (configurável). O **Mestre move livremente**.
- **Ctrl+Z** no movimento devolve a distância e a ação gastas. Cada Ctrl+Z desfaz um trecho, até a parada anterior.
- **Devolver a ação de movimento** (botão direito) faz o token **voltar andando pelo caminho percorrido**:
  - com 2 movimentos usados, devolver um volta até o último ponto da 1ª movimentação (o "último verde" da régua);
  - com 1 movimento usado, o token volta ao início do turno.
  - A volta usa o histórico de movimento do Foundry, então a régua também devolve essa distância.

### Gasto de ação ao usar itens
- Quando o card de um item vai para o **chat**, o módulo gasta a ação dele.
- **Armas** gastam ação padrão. Poderes, magias e itens usam a execução indicada na ficha: `action` (padrão), `move` (movimento) ou `full` (completa). Livre e reação não gastam. Magia sem execução legível conta como padrão.
- Cada item é cobrado uma vez por turno (rolar o dano depois do ataque não gasta de novo).
- Opcional: anunciar no chat sempre que uma ação for gasta.

---

## 2. Painel de Efeitos (só o Mestre)

- Abra pelo **botão dourado na lateral esquerda** (abaixo da barra de controles da cena) ou digitando `/efeitos` no chat.
- Lista os efeitos de todos os tokens da cena, **separados por token**. Cada efeito é uma tag só com o nome:
  - vermelho: condição;
  - azul: efeito vindo de um item;
  - borda tracejada: temporário;
  - apagado e riscado: desativado.
- **Passe o mouse numa tag** para ver nome, descrição, duração, tempo restante, origem, condição, estado (desativado ou suprimido) e as primeiras mudanças que o efeito aplica. **Clique na tag** para abrir o efeito.
- **Clique no nome do token** para selecioná-lo e centralizar a tela nele.
- **Filtros** (salvos entre sessões):
  - **Disposição:** Hostil, Neutro, Amigável e Secreto;
  - **Ficha:** os tipos de ficha que existem na cena (Personagem, NPC, Objeto de Cena...);
  - **Mostrar:** efeitos de itens, desativados e tokens sem efeitos (todos ocultos por padrão);
  - **Busca** por nome de token ou de efeito.
- A janela é arrastável e redimensionável, e atualiza sozinha quando um efeito, token, item ou o combate mudam.

---

## Configurações

**Mundo** (só o Mestre altera):
- Limitar o movimento dos tokens em combate · Bloquear movimento fora do turno
- Deslocamento padrão (metros) · Metros por quadrado (padrão 1,5)
- Gastar ações ao usar itens · Anunciar ações no chat
- Tempo máximo por turno · Som de tempo esgotado · Quem ouve o som · Passar o turno automaticamente ao acabar o tempo
- Ativar o Painel de Efeitos (Mestre)

**Pessoais** (cada usuário):
- Mostrar a HUD para o Mestre · Imagem na HUD (token ou retrato) · Tamanho da HUD · Volume do som
- Aplicar as regras também ao Mestre (teste) — o Mestre passa a ser limitado como um jogador, útil para testar
- Depuração no console

---

## Instalação

1. Extraia a pasta `t20-acoes-hud` em `Data/modules/`.
2. Reinicie o Foundry e ative o módulo no mundo.
3. Dê um recarregamento forçado no navegador (Ctrl+F5) para não usar arquivos antigos em cache.

**Requisitos:** Foundry VTT v13 e o sistema Tormenta20.

## Para macros

`game.modules.get("t20-acoes-hud").api` expõe:
- `gastarPorItem(item)` — gasta a ação do item, como se ele tivesse ido ao chat;
- `tipoDeAcao(item)` — devolve `"padrao"`, `"movimento"`, `"completa"` ou `null`;
- `painelEfeitos.abrir()`, `.fechar()` e `.alternar()` — controlam o Painel de Efeitos (só para o Mestre).

## Observações e limites

- O módulo assume estes campos do sistema Tormenta20: `system.attributes.pv` e `pm` (`value`, `max`, `temp`), `system.attributes.conjuracao` (atributo de conjuração), `system.attributes.defesa` e a execução dos itens (`action`, `move`, `full`). Se algum valor não aparecer ou vier errado, ligue a **Depuração no console** e verifique as linhas do módulo no console (F12).
- A edição de PV e PM altera os valores diretamente, sem passar pelo cálculo de dano do sistema, então redução de dano e imunidades não são aplicadas.
- Não há tratamento de condições que mudam o deslocamento, nem de outros tipos de deslocamento (voo, natação).
- O timer não pausa quando o jogo está pausado.

## Solução de problemas

- **Um token não se move:** ligue a Depuração no console, mova o token e veja as linhas `preMoveToken`. Elas mostram se o módulo bloqueou o movimento e por quê. Lembre-se de que o Mestre só é limitado com a opção de teste ligada.
- **A HUD não aparece:** selecione um token que você controle (ou, como Mestre, confira se *Mostrar a HUD para o Mestre* está ligada).
- **O painel de efeitos não abre:** confira se *Ativar o Painel de Efeitos (Mestre)* está ligada e se você está logado como Mestre. Dá para abrir também com `/efeitos`.
