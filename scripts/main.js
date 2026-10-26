/**
 * T20 - Ações de Turno (HUD)
 * Foundry VTT v13 • Tormenta20
 *
 * Regras (Tipos de Ações):
 *  - Uma ação padrão + uma ação de movimento (qualquer ordem);
 *  - OU duas ações de movimento (a padrão vira movimento);
 *  - OU uma ação completa (gasta padrão + movimento).
 * Ações livres e reações: sem limite.
 */

const ID = "t20-acoes-hud";
const FLAG = "acoes";
const VAZIO = { std: false, mov: false, conv: false, full: false, dist: 0, hist: [] };
// std  = ação padrão gasta
// mov  = ação de movimento gasta
// conv = a ação padrão foi gasta como 2º movimento
// full = ação completa usada
// dist = distância já percorrida no turno (em quadrados)
// hist = passos de movimento do turno [{ d: distância, m: gastou movimento, c: gastou 2º movimento }] (usado pelo Ctrl+Z)

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
const getEstado = (c) => ({ ...VAZIO, ...(c?.getFlag(ID, FLAG) ?? {}) });


/* ---------- Deslocamento ---------- */

const cfg = (k) => game.settings.get(ID, k);

/** Deslocamento do ator em metros (tenta alguns caminhos do sistema T20; senão usa o padrão das configurações). */
function deslocamentoMetros(actor) {
  const a = actor?.system?.attributes;
  const mv = a?.movement ?? a?.deslocamento;
  const candidatos = [actor?.getFlag?.(ID, "deslocamento"), mv?.walk?.value, mv?.walk, mv?.value, mv?.base, mv?.total, a?.desloc];
  for (const v of candidatos) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return cfg("deslocamentoPadrao");
}

/** Deslocamento de uma ação de movimento, em quadrados. */
function quadradosPorAcao(actor) {
  return deslocamentoMetros(actor) / cfg("metrosPorQuadrado");
}

/** Quantas ações de movimento o combatente ainda pode ter no total (já gastas + obteníveis). */
function maxMovimentos(e) {
  if (e.full) return 0;
  const gastas = (e.mov ? 1 : 0) + (e.conv ? 1 : 0);
  return gastas + (e.mov ? 0 : 1) + (e.std ? 0 : 1);
}

/* ---------- Itens ---------- */

const normalizar = (t) =>
  String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function classificarExecucao(t) {
  if (/complet|full/.test(t)) return "completa";
  if (/moviment|move/.test(t)) return "movimento";
  if (/livre|free|reac|reaction/.test(t)) return null; // livre e reação não gastam
  // No T20 a ação padrão aparece como "action" (também aceita padrão/standard)
  if (/^(action|acao|standard|padr)/.test(t)) return "padrao";
  return null;
}

/** Procura em `system` um texto cuja chave pareça "execução / ativação / ação". */
function buscarExecucao(obj, nivel = 0) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || nivel > 3) return "";
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v && /exec|activ|ativ|acao|action/.test(normalizar(k))) return v;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = buscarExecucao(v, nivel + 1);
      if (r) return r;
    }
  }
  return "";
}

/** Descobre o tipo de ação que um item consome: "padrao" | "movimento" | "completa" | null (livre, reação, passivo...). */
function tipoDeAcao(item) {
  const tipoItem = normalizar(item.type);
  if (["arma", "weapon"].includes(tipoItem)) return "padrao"; // armas: ação padrão
  const s = item.system ?? {};
  const candidatos = [
    s.ativacao?.execucao, s.ativacao?.execution, s.ativacao?.tipo,
    s.activation?.execution, s.activation?.type,
    s.execucao, s.execution
  ];
  for (const bruto of candidatos) {
    const t = normalizar(typeof bruto === "object" && bruto ? bruto.value ?? bruto.type : bruto);
    if (t) return classificarExecucao(t);
  }
  const achado = normalizar(buscarExecucao(s));
  if (achado) return classificarExecucao(achado);
  // Magia sem execução legível na ficha: a maioria é ação padrão
  if (["magia", "spell"].includes(tipoItem)) return "padrao";
  return null;
}

/** As regras de movimento valem para jogadores, e para o Mestre só quando ele ativa o modo de teste. */
const seguirRegras = () => !game.user.isGM || cfg("regrasParaMestre");

const USO_ITEM = { chave: null, itens: new Set() }; // itens já cobrados no turno atual

/* ---------- Recursos (PV / PM / CD) ---------- */

const numero = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Lê PV ou PM do ator (chave "pv" | "pm"). Retorna null se o sistema não tiver esse recurso. */
function lerRecurso(actor, chave) {
  for (const base of ["system.attributes", "system.resources", "system"]) {
    const obj = foundry.utils.getProperty(actor, `${base}.${chave}`);
    if (obj && typeof obj === "object") {
      return { caminho: `${base}.${chave}`, value: numero(obj.value), max: numero(obj.max), temp: numero(obj.temp) };
    }
  }
  return null;
}

const numOuNulo = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "object") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** CD das magias = base (10 + metade do nível, ou o valor da ficha) + modificador do atributo-chave de conjuração. */
function cdMagias(actor) {
  const s = actor?.system ?? {};
  const a = s.attributes ?? {};
  let rd = {};
  try {
    rd = actor.getRollData?.() ?? {};
  } catch (err) { /* ignora */ }

  // atributo-chave (system.attributes.conjuracao): "int", "sab", "car"...
  const bruta = a.conjuracao?.value ?? a.conjuracao;
  const chave = typeof bruta === "string" && bruta.trim() ? normalizar(bruta).slice(0, 3) : null;
  const at = chave ? s.atributos?.[chave] : null;
  let mod = null;
  if (chave) {
    for (const v of [rd?.[chave], rd?.atributos?.[chave]?.value, at?.value, at?.mod, at?.total, at?.final]) {
      mod = numOuNulo(v);
      if (mod !== null) break;
    }
  }

  // base: valor da ficha (10 + metade do nível, sem o atributo) ou calculado pelo nível
  let base = null;
  for (const v of [a.cd?.value, a.cd, a.cdmagia?.value, a.cdmagia, a.spellcd, s.cd]) {
    const n = numOuNulo(v);
    if (n !== null && n > 0) {
      base = Math.round(n);
      break;
    }
  }
  let nivel = null;
  for (const v of [a.nivel?.value, a.nivel, a.level?.value, rd?.nivel, rd?.attributes?.nivel?.value, s.details?.level?.value]) {
    const n = numOuNulo(v);
    if (n !== null && n > 0) {
      nivel = n;
      break;
    }
  }
  if (nivel === null) {
    const classes = actor.items?.filter?.((i) => normalizar(i.type) === "classe") ?? [];
    const soma = classes.reduce((t, i) => t + numero(i.system?.niveis ?? i.system?.nivel ?? i.system?.level), 0);
    if (soma > 0) nivel = soma;
  }
  if (base === null && nivel !== null) base = 10 + Math.floor(nivel / 2);
  if (typeof dbg === "function") dbg("CD", { conjuracao: bruta, chave, mod, base, nivel, atributo: at });
  if (base === null) return null;
  return base + (mod ?? 0);
}

/** Defesa total do personagem. */
function defesaTotal(actor) {
  const a = actor?.system?.attributes ?? {};
  for (const v of [a.defesa?.value, a.defesa?.total, a.defesa, a.def?.value, a.ac?.value, a.defense?.value]) {
    const n = numOuNulo(v);
    if (n !== null && n > 0) return Math.round(n);
  }
  return null;
}

const NOMES = {
  padrao: "ação padrão",
  movimento: "ação de movimento",
  completa: "ação completa"
};

class AcoesHUD {
  static el = null;
  static _ultimo = null;

  /* ---------- Dados ---------- */

  static combatenteAtual() {
    const combat = game.combat;
    if (!combat?.started) return null;
    return combat.combatant ?? null;
  }

  static podeVer(c) {
    if (!c) return false;
    if (game.user.isGM) return game.settings.get(ID, "mostrarGM");
    return c.isOwner;
  }

  /** Calcula o novo estado ao gastar/devolver. Retorna null se não for possível. */
  static aplicar(tipo, acao, estado) {
    const e = { ...estado };
    if (acao === "gastar") {
      if (tipo === "padrao") {
        if (e.std) return null;
        e.std = true;
        e.conv = false;
      } else if (tipo === "movimento") {
        if (!e.mov) e.mov = true;
        else if (!e.std) {
          e.std = true;
          e.conv = true; // padrão trocada por movimento
        } else return null;
      } else if (tipo === "completa") {
        if (e.std || e.mov) return null;
        e.std = e.mov = e.full = true;
        e.conv = false;
      }
      return e;
    }
    // devolver
    if (e.full) return { ...VAZIO };
    if (tipo === "padrao") {
      if (!e.std || e.conv) return null;
      e.std = false;
    } else if (tipo === "movimento") {
      if (e.conv) {
        e.conv = false;
        e.std = false;
      } else if (e.mov) e.mov = false;
      else return null;
    } else return null;
    return e;
  }

  static async usar(tipo, acao, nomeItem = null) {
    const c = this.combatenteAtual();
    if (!c) return false;
    const antes = getEstado(c);
    let novo;
    let plano = null;
    if (acao === "devolver" && tipo === "movimento" && seguirRegras() && !antes.full &&
        (antes.dist ?? 0) > 0.001 && (antes.mov || antes.conv)) {
      // Jogador devolveu uma ação de movimento depois de andar: o token volta pelo caminho percorrido.
      // 2 movimentos usados -> volta até o máximo da 1ª movimentação; 1 movimento -> volta ao início.
      if (antes.conv) {
        const alvoS = Math.min(quadradosPorAcao(c.actor), antes.dist ?? 0);
        plano = planejarVolta(c.token, antes, alvoS);
        novo = { ...antes, conv: false, std: false, dist: alvoS, hist: plano?.histAndando ?? antes.hist };
      } else {
        plano = planejarVolta(c.token, antes, 0);
        novo = { ...antes, mov: false, dist: 0, hist: [] };
      }
    } else {
      novo = this.aplicar(tipo, acao, antes);
    }
    if (!novo) {
      if (acao === "gastar") ui.notifications.warn(`${c.name} não tem ${NOMES[tipo]} disponível.`);
      return false;
    }
    if (acao === "devolver") USO_ITEM.itens.clear();
    if (acao === "devolver" && tipo !== "padrao") {
      const gastas = (novo.mov ? 1 : 0) + (novo.conv ? 1 : 0);
      novo.dist = Math.min(novo.dist ?? 0, gastas * quadradosPorAcao(c.actor));
    }
    try {
      ESTADO_RECENTE.delete(c.id);
      if (!plano && acao === "devolver" && tipo === "movimento") {
        dbg(seguirRegras() ? "devolver movimento: sem plano de volta" : "devolver movimento: Mestre (token não se move; ative o modo de teste para ver a volta)", { dist: antes.dist, hist: antes.hist });
      }
      if (plano) {
        const modo = await executarVolta(c.token, plano);
        if (antes.conv) novo.hist = modo === "nativo" ? plano.histNativo : plano.histAndando;
      }
      await c.setFlag(ID, FLAG, novo);
      if (acao === "gastar" && game.settings.get(ID, "anunciarChat")) {
        const usada = tipo === "movimento" && novo.conv ? "uma 2ª ação de movimento (no lugar da padrão)" : `uma ${NOMES[tipo]}`;
        ChatMessage.create({
          speaker: { alias: c.name },
          flags: { [ID]: { anuncio: true } },
          content: `<p class="t20ah-chat"><em>usa ${usada}${nomeItem ? ` — ${esc(nomeItem)}` : ""}.</em></p>`
        });
      }
    } catch (err) {
      console.error(`${ID} | erro ao atualizar ações`, err);
      ui.notifications.error("Sem permissão para alterar as ações deste combatente.");
      return false;
    }
    return true;
  }

  /**
   * Chamado quando o card de um item vai para o chat. Gasta a ação correspondente do combatente do turno.
   * Cada item só é cobrado uma vez por turno (ex.: rolar o dano depois do ataque não gasta de novo).
   */
  static aoUsarItem(item) {
    const actor = item?.actor;
    const combat = game.combat;
    if (!actor || !combat?.started) return false;
    const c = combat.combatant;
    if (!c || !(c.actor?.uuid === actor.uuid || c.actorId === actor.id)) return false; // não é o turno dele
    const tipo = tipoDeAcao(item);
    dbg("item", item.name, item.type, "->", tipo, item.system);
    if (!tipo) return false;

    const chave = this.chaveTurno(combat);
    if (USO_ITEM.chave !== chave) {
      USO_ITEM.chave = chave;
      USO_ITEM.itens = new Set();
    }
    if (USO_ITEM.itens.has(item.uuid)) return false;

    const novo = this.aplicar(tipo, "gastar", getEstado(c));
    if (!novo) {
      ui.notifications.warn(`${c.name} não tem ${NOMES[tipo]} disponível para usar ${item.name}.`);
      return false;
    }
    USO_ITEM.itens.add(item.uuid);
    this.usar(tipo, "gastar", item.name);
    return true;
  }

  static async reiniciar() {
    const c = this.combatenteAtual();
    if (!c) return;
    USO_ITEM.itens.clear();
    ESTADO_RECENTE.delete(c.id);
    try {
      const antes = getEstado(c);
      if (seguirRegras() && (antes.dist ?? 0) > 0.001) {
        const plano = planejarVolta(c.token, antes, 0);
        if (plano) await executarVolta(c.token, plano);
      }
      await c.setFlag(ID, FLAG, { ...VAZIO });
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------- Interface ---------- */

  static garantirEl() {
    if (this.el?.isConnected) return this.el;
    const el = document.createElement("section");
    el.id = "t20ah";
    el.classList.add("oculto");
    document.body.appendChild(el);

    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b || !el.contains(b)) return;
      if (b.dataset.tipo) this.usar(b.dataset.tipo, "gastar");
      else if (b.dataset.acao === "reset") this.reiniciar();
      else if (b.dataset.acao === "passar") this.passarTurno();
      else if (b.dataset.acao === "tempo") this.definirTempo();
      else if (b.dataset.acao === "som") this.tocarSom();
      else if (b.dataset.acao === "recolher")
        game.settings.set(ID, "recolhido", !game.settings.get(ID, "recolhido"));
    });
    el.addEventListener("contextmenu", (ev) => {
      const b = ev.target.closest("[data-tipo]");
      if (!b) return;
      ev.preventDefault();
      this.usar(b.dataset.tipo, "devolver");
    });
    el.addEventListener("change", (ev) => {
      const inp = ev.target.closest?.("input[data-rec]");
      if (inp) this.editarRecurso(inp);
    });
    el.addEventListener("keydown", (ev) => {
      if (!ev.target.matches?.("input[data-rec]")) return;
      if (ev.key === "Enter") ev.target.blur();
      else if (ev.key === "Escape") {
        ev.target.value = ev.target.defaultValue;
        ev.target.blur();
      }
    });
    el.addEventListener("focusin", (ev) => {
      if (ev.target.matches?.("input[data-rec]")) ev.target.select();
    });
    el.addEventListener("focusout", () => {
      if (this._pendente) {
        this._pendente = false;
        setTimeout(() => this.render(), 80);
      }
    });
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button === 0 && ev.target.closest(".t20ah-cabeca")) this.iniciarArraste(ev);
    });
    el.addEventListener("dblclick", (ev) => {
      if (ev.target.closest(".t20ah-cabeca") && !ev.target.closest("button")) {
        game.settings.set(ID, "posicao", {});
      }
    });

    this.el = el;
    return el;
  }

  static pip(classe) {
    return `<span class="pip ${classe}"></span>`;
  }

  static tile(tipo, icone, rotulo, dica, { gasto, ativa = false, pips }) {
    return `
      <button type="button" class="t20ah-tile ${tipo} ${gasto ? "gasto" : ""} ${ativa ? "ativa" : ""}"
              data-tipo="${tipo}" title="${dica}" aria-disabled="${gasto}">
        <i class="fa-solid ${icone}"></i>
        <span class="t20ah-rotulo">${rotulo}</span>
        <span class="t20ah-pips">${pips}</span>
      </button>`;
  }

  /** Token em foco: o selecionado; sem seleção, o combatente do turno. */
  static alvo() {
    if (!canvas?.ready) return null;
    let doc = canvas.tokens?.controlled?.find((t) => t.actor)?.document ?? null;
    if (!doc) doc = this.combatenteAtual()?.token ?? null;
    const actor = doc?.actor;
    if (!actor) return null;
    if (game.user.isGM) {
      if (!cfg("mostrarGM")) return null;
    } else if (!actor.isOwner) return null;
    const combat = game.combat;
    const c = combat?.started ? combat.combatants.find((x) => x.tokenId === doc.id) ?? null : null;
    const turno = !!c && combat.combatant?.id === c.id;
    return { doc, actor, c, turno };
  }

  static renderSoon() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.render(), 40);
  }

  static linhaRecurso(actor, chave, icone, rotulo) {
    const r = lerRecurso(actor, chave);
    if (!r) return "";
    const pct = r.max > 0 ? clamp((r.value / r.max) * 100, 0, 100) : 0;
    const campo = (nome, valor, dica) =>
      `<input type="text" inputmode="numeric" autocomplete="off" data-rec="${chave}" data-campo="${nome}" value="${valor}" title="${dica}">`;
    return `
      <div class="t20ah-rec ${chave}">
        <i class="fa-solid ${icone} rec-ico" title="${rotulo}"></i>
        <div class="trilho" title="${rotulo}: ${r.value} / ${r.max}"><div class="fill" style="width:${pct}%"></div></div>
        <span class="rec-val">${campo("value", r.value, `${rotulo} atual — digite um número, ou +5 / -5 para somar ou subtrair`)}<span class="max">/ ${r.max}</span></span>
        <span class="rec-temp" title="${rotulo} temporário"><span class="temp-ico"><i class="fa-solid ${icone}"></i><i class="fa-solid fa-hourglass-half badge"></i></span>${campo("temp", r.temp, `${rotulo} temporário`)}</span>
      </div>`;
  }

  /** Edita PV/PM (ou temporários). Aceita "12", "+5" ou "-5". */
  static async editarRecurso(inp) {
    const t = this.alvo();
    if (!t) return;
    const chave = inp.dataset.rec;
    const campo = inp.dataset.campo;
    const r = lerRecurso(t.actor, chave);
    if (!r) return;
    const txt = inp.value.trim().replace(",", ".");
    const atual = campo === "temp" ? r.temp : r.value;
    let novo;
    if (/^[+-]\d+(\.\d+)?$/.test(txt)) novo = atual + Number(txt);
    else if (/^\d+(\.\d+)?$/.test(txt)) novo = Number(txt);
    else return this.render();
    novo = Math.round(novo);
    if (campo === "temp") novo = Math.max(0, novo);
    else {
      if (r.max > 0) novo = Math.min(novo, r.max);
      if (chave === "pm") novo = Math.max(0, novo);
    }
    if (novo === atual) return this.render();
    try {
      await t.actor.update({ [`${r.caminho}.${campo}`]: novo });
    } catch (err) {
      console.error(`${ID} | erro ao editar ${chave}`, err);
      ui.notifications.error("Sem permissão para alterar este personagem.");
      this.render();
    }
  }

  static render() {
    const el = this.garantirEl();
    const t = this.alvo();
    if (!t) {
      el.classList.add("oculto");
      this._ultimo = null;
      return;
    }
    // não reconstrói a HUD enquanto o jogador digita
    if (el.contains(document.activeElement) && document.activeElement.matches?.("input")) {
      this._pendente = true;
      return;
    }

    const { doc, actor, c, turno } = t;
    const recolhido = game.settings.get(ID, "recolhido");
    const escala = game.settings.get(ID, "escala");
    const ehVideo = (src) => /\.(webm|mp4|m4v)$/i.test(src ?? "");
    const fontes = cfg("imagem") === "portrait"
      ? [actor.img, doc.texture?.src, c?.img]
      : [doc.texture?.src, c?.img, actor.img];
    const img = fontes.find((src) => src && !ehVideo(src)) ?? actor.img;
    const fmt = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

    // ----- recursos (sempre) -----
    const pv = lerRecurso(actor, "pv");
    const pm = lerRecurso(actor, "pm");
    const cd = cdMagias(actor);
    const def = defesaTotal(actor);
    const chips = [
      def != null ? `<span class="chip def" title="Defesa total"><i class="fa-solid fa-shield"></i> DEF ${def}</span>` : "",
      cd != null ? `<span class="chip cd" title="CD das magias"><i class="fa-solid fa-wand-sparkles"></i> CD ${cd}</span>` : ""
    ].join("");
    const recursos = this.linhaRecurso(actor, "pv", "fa-heart", "PV") + this.linhaRecurso(actor, "pm", "fa-wand-sparkles", "PM");
    const resumoRec = [
      pv ? `<span class="pv"><i class="fa-solid fa-heart"></i> ${pv.value}${pv.temp ? `+${pv.temp}` : ""}/${pv.max}</span>` : "",
      pm ? `<span class="pm"><i class="fa-solid fa-wand-sparkles"></i> ${pm.value}${pm.temp ? `+${pm.temp}` : ""}/${pm.max}</span>` : "",
      def != null ? `<span class="def"><i class="fa-solid fa-shield"></i> ${def}</span>` : ""
    ].join("");

    // ----- ações (só no turno do token) -----
    let acoes = "";
    let resumoAcoes = "";
    let btnsTurno = "";
    if (turno) {
      const e = getEstado(c);
      const limitar = cfg("limitarMovimento");
      const porAcao = quadradosPorAcao(actor);
      const capQuad = maxMovimentos(e) * porAcao;
      const mQuad = cfg("metrosPorQuadrado");
      const usadoM = (e.dist ?? 0) * mQuad;
      const capM = capQuad * mQuad;
      const pct = capQuad > 0 ? Math.min(100, ((e.dist ?? 0) / capQuad) * 100) : 100;
      const barra = limitar
        ? `<div class="t20ah-desloc" title="Deslocamento por ação de movimento: ${fmt(deslocamentoMetros(actor))} m">
             <i class="fa-solid fa-shoe-prints"></i>
             <div class="trilho"><div class="fill ${pct >= 100 ? "cheio" : ""}" style="width:${pct}%"></div></div>
             <span>${fmt(usadoM)} / ${fmt(capM)} m</span>
           </div>`
        : "";
      const tempoHtml = `
        <div class="t20ah-tempo">
          <button type="button" class="t20ah-mini" data-acao="tempo"
                  title="${game.user.isGM ? "Clique para definir o tempo máximo do turno" : "Tempo no turno"}"><i class="fa-solid fa-stopwatch"></i></button>
          <div class="trilho"><div class="fill"></div></div>
          <span class="js-tempo-txt">00:00</span>
          <button type="button" class="t20ah-mini" data-acao="som" title="Testar o som de tempo esgotado"><i class="fa-solid fa-volume-high"></i></button>
        </div>`;
      const tiles = [
        this.tile("padrao", "fa-hand-fist", "Padrão", "Clique: gastar • Botão direito: devolver", {
          gasto: e.std,
          pips: this.pip(e.std ? "on" : "")
        }),
        this.tile("movimento", "fa-person-running", "Movimento", "Clique: gastar (2ª vez troca a padrão) • Botão direito: devolver", {
          gasto: e.mov && e.std,
          pips: this.pip(e.mov ? "on" : "") + this.pip(e.conv ? "on" : e.std ? "bloq" : "")
        }),
        this.tile("completa", "fa-burst", "Completa", "Gasta padrão + movimento • Botão direito: devolver", {
          gasto: e.std || e.mov,
          ativa: e.full,
          pips: this.pip(e.full ? "on" : "") + this.pip(e.full ? "on" : "")
        })
      ].join("");
      acoes = `
        <div class="t20ah-sep"></div>
        <div class="t20ah-botoes">${tiles}</div>
        ${tempoHtml}
        ${barra}
        <button type="button" class="t20ah-passar" data-acao="passar" title="Passa a vez para o próximo combatente">
          <i class="fa-solid fa-forward-step"></i> Encerrar turno
        </button>
        <footer class="t20ah-rodape"><i class="fa-solid fa-bolt"></i> Ações livres e reações: sem limite</footer>`;
      resumoAcoes = `
        <i class="fa-solid fa-hand-fist ico-acao padrao ${!e.std ? "livre" : ""}" title="Ação padrão"></i>
        <i class="fa-solid fa-person-running ico-acao movimento ${!e.mov || !e.std ? "livre" : ""}" title="Ação de movimento"></i>
        <span class="t20ah-tempo-mini js-tempo-txt"></span>`;
      btnsTurno = `
        <button type="button" class="t20ah-mini passar-mini" data-acao="passar" title="Encerrar turno"><i class="fa-solid fa-forward-step"></i></button>
        <button type="button" class="t20ah-mini" data-acao="reset" title="Reiniciar ações"><i class="fa-solid fa-rotate-left"></i></button>`;
    } else if (c) {
      acoes = `<div class="t20ah-espera"><i class="fa-solid fa-hourglass-start"></i> Aguardando o turno</div>`;
    }

    const sub = turno ? "Turno de" : c ? "Em combate" : "Selecionado";
    el.style.setProperty("--esc", escala);
    el.classList.toggle("recolhido", recolhido);
    el.classList.toggle("em-turno", turno);
    el.innerHTML = `
      <header class="t20ah-cabeca" title="Arraste para mover • Duplo clique para recentralizar">
        <img class="t20ah-retrato" src="${esc(img || "icons/svg/mystery-man.svg")}" alt="" draggable="false">
        <div class="t20ah-titulo">
          <span class="t20ah-sub">${sub}</span>
          <span class="t20ah-nome">${esc(doc.name ?? actor.name)}</span>
        </div>
        <span class="t20ah-resumo"><span class="t20ah-resumo-rec">${resumoRec}</span>${resumoAcoes}</span>
        ${btnsTurno}
        <button type="button" class="t20ah-mini recolher" data-acao="recolher" title="Recolher / expandir"><i class="fa-solid fa-chevron-up"></i></button>
      </header>
      <div class="t20ah-corpo">
        <div class="t20ah-recursos">${recursos}</div>
        ${chips ? `<div class="t20ah-chips">${chips}</div>` : ""}
        ${acoes}
      </div>`;

    const chaveVisual = `${doc.id}:${turno}`;
    const estavaOculto = el.classList.contains("oculto");
    el.classList.remove("oculto");
    if (estavaOculto || this._ultimo !== chaveVisual) {
      el.classList.remove("entra");
      void el.offsetWidth; // reinicia a animação
      el.classList.add("entra");
    }
    this._ultimo = chaveVisual;
    this.aplicarPosicao();
    this.atualizarTempo();
  }

  /* ---------- Turno, timer e som ---------- */

  static chaveTurno(combat) {
    return `${combat.id}:${combat.round}:${combat.turn}:${combat.combatant?.id}`;
  }

  /** Momento (ms) em que o turno atual começou. Usa o marcador do Mestre; senão, o relógio local. */
  static inicioTurno(combat, chave) {
    const f = combat.getFlag(ID, "turno");
    if (f?.chave === chave && Number.isFinite(f.inicio)) return f.inicio;
    if (!(chave in (this._locais ?? {}))) this._locais = { [chave]: Date.now() };
    return this._locais[chave];
  }

  static medirTempo() {
    const combat = game.combat;
    if (!combat?.started || !combat.combatant) return null;
    const chave = this.chaveTurno(combat);
    const dec = Math.max(0, (Date.now() - this.inicioTurno(combat, chave)) / 1000);
    return { combat, chave, dec, max: Number(cfg("tempoMaximo")) || 0 };
  }

  static formatarTempo(seg) {
    const t = Math.max(0, Math.floor(seg));
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }

  static atualizarTempo() {
    const el = this.el;
    if (!el?.isConnected || el.classList.contains("oculto")) return;
    const t = this.medirTempo();
    if (!t) return;
    const { dec, max } = t;
    const restante = max - dec;
    const txt = max > 0 ? this.formatarTempo(Math.ceil(restante)) : this.formatarTempo(dec);
    el.querySelectorAll(".js-tempo-txt").forEach((n) => (n.textContent = txt));
    const linha = el.querySelector(".t20ah-tempo");
    if (!linha) {
      el.classList.remove("tempo-aviso", "tempo-fim");
      return;
    }
    linha.classList.toggle("sem-limite", max <= 0);
    const fill = el.querySelector(".t20ah-tempo .fill");
    if (fill) fill.style.width = max > 0 ? `${clamp((restante / max) * 100, 0, 100)}%` : "0%";
    el.classList.toggle("tempo-aviso", max > 0 && restante > 0 && restante <= 10);
    el.classList.toggle("tempo-fim", max > 0 && restante <= 0);
  }

  static tick() {
    const t = this.medirTempo();
    if (!t) return;
    this.atualizarTempo();
    // dispara uma única vez, só se o tempo acabou agora (não ao recarregar a página)
    if (t.max > 0 && t.dec >= t.max && t.dec - t.max < 4 && this._disparou !== t.chave) {
      this._disparou = t.chave;
      this.fimDoTempo(t.combat);
    }
  }

  static fimDoTempo(combat) {
    const c = combat.combatant;
    if (!c) return;
    const q = cfg("somQuemOuve");
    const ouve = q === "todos" || (q === "donoMestre" && (game.user.isGM || c.isOwner)) || (q === "mestre" && game.user.isGM);
    if (ouve) {
      this.tocarSom();
      ui.notifications.warn(`Tempo esgotado para ${c.name}!`);
    }
    if (cfg("passarAoFim") && game.user.isActiveGM) combat.nextTurn();
  }

  static tocarSom() {
    const src = cfg("somArquivo");
    const vol = cfg("somVolume");
    try {
      if (src) {
        const Helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
        Helper.play({ src, volume: vol, autoplay: true, loop: false }, false);
        return;
      }
      // Sinal padrão sintetizado (nenhum arquivo necessário)
      const ctx = game.audio?.context ?? new AudioContext();
      ctx.resume?.();
      const t0 = ctx.currentTime;
      [[880, 0], [660, 0.2], [440, 0.4]].forEach(([freq, atraso]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + atraso);
        gain.gain.linearRampToValueAtTime(Math.max(0.0001, vol * 0.5), t0 + atraso + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.55);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + atraso);
        osc.stop(t0 + atraso + 0.6);
      });
    } catch (err) {
      console.warn(`${ID} | não foi possível tocar o som`, err);
    }
  }

  static async passarTurno() {
    const combat = game.combat;
    const c = combat?.combatant;
    if (!c) return;
    try {
      await combat.nextTurn();
    } catch (err) {
      // Sem permissão direta: pede ao Mestre via socket
      game.socket.emit(`module.${ID}`, { tipo: "passar", combatId: combat.id, combatenteId: c.id });
    }
  }

  static async definirTempo() {
    if (!game.user.isGM) return;
    try {
      const v = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Tempo máximo do turno" },
        content: `<div class="form-group"><label>Segundos (0 = sem limite)</label>
          <input type="number" name="seg" min="0" step="5" value="${cfg("tempoMaximo")}" autofocus></div>`,
        ok: { label: "Salvar", callback: (ev, btn) => Number(btn.form.elements.seg.value) }
      });
      if (Number.isFinite(v) && v >= 0) await game.settings.set(ID, "tempoMaximo", Math.round(v));
    } catch (err) {
      /* cancelado */
    }
  }

  /* ---------- Posição / arraste ---------- */

  static posicionar(left, top) {
    const el = this.el;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.bottom = "auto";
    el.style.translate = "none";
  }

  static aplicarPosicao() {
    const el = this.el;
    const p = game.settings.get(ID, "posicao");
    if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) {
      this.posicionar(
        clamp(p.left, 0, window.innerWidth - el.offsetWidth),
        clamp(p.top, 0, window.innerHeight - el.offsetHeight)
      );
    } else {
      el.style.left = el.style.top = el.style.bottom = el.style.translate = "";
    }
  }

  static iniciarArraste(ev) {
    if (ev.target.closest("button")) return;
    const el = this.el;
    const r = el.getBoundingClientRect();
    const dx = ev.clientX - r.left;
    const dy = ev.clientY - r.top;
    let pos = null;
    el.classList.add("arrastando");

    const mover = (e) => {
      pos = {
        left: clamp(e.clientX - dx, 0, window.innerWidth - el.offsetWidth),
        top: clamp(e.clientY - dy, 0, window.innerHeight - el.offsetHeight)
      };
      this.posicionar(pos.left, pos.top);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      el.classList.remove("arrastando");
      if (pos) game.settings.set(ID, "posicao", pos);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
  }
}

/* ---------- Configurações ---------- */

Hooks.once("init", () => {
  game.settings.register(ID, "mostrarGM", {
    name: "Mostrar a HUD para o Mestre",
    hint: "Se ativado, o Mestre vê a HUD no turno de qualquer combatente (inclusive NPCs).",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "imagem", {
    name: "Imagem na HUD",
    hint: "Escolha se a HUD mostra a imagem do token ou o retrato (portrait) do personagem. Apenas para você.",
    scope: "client",
    config: true,
    type: String,
    choices: { token: "Token", portrait: "Retrato (portrait)" },
    default: "token",
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "escala", {
    name: "Tamanho da HUD",
    hint: "Ajusta a escala da HUD (apenas para você).",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0.8, max: 1.5, step: 0.05 },
    default: 1,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "anunciarChat", {
    name: "Anunciar ações no chat",
    hint: "Envia uma linha discreta no chat sempre que uma ação for gasta.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(ID, "limitarMovimento", {
    name: "Limitar o movimento dos tokens em combate",
    hint: "Jogadores só movem o token até o deslocamento; passar disso gasta outra ação de movimento (no lugar da padrão); além disso o movimento é bloqueado. O Mestre move livremente.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "gastarPorItem", {
    name: "Gastar ações ao usar itens",
    hint: "Quando o card de um item vai para o chat, gasta a ação dele: armas e magias padrão = ação padrão; poderes e itens usam a execução indicada na ficha (padrão, movimento ou completa). Ações livres e reações não gastam.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(ID, "regrasParaMestre", {
    name: "Aplicar as regras também ao Mestre (teste)",
    hint: "Normalmente o Mestre move tokens livremente. Ative para testar o limite e o gasto de ações logado como Mestre.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(ID, "debug", {
    name: "Depuração no console",
    hint: "Mostra no console (F12) o que o módulo calcula a cada movimento.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(ID, "bloquearForaDoTurno", {
    name: "Bloquear movimento fora do turno",
    hint: "Jogadores não podem mover tokens que estão no combate quando não é o turno deles.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(ID, "deslocamentoPadrao", {
    name: "Deslocamento padrão (metros)",
    hint: "Usado quando o módulo não encontra o deslocamento na ficha. Em Tormenta20 o padrão é 9 m (6 quadrados).",
    scope: "world",
    config: true,
    type: Number,
    default: 9,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "metrosPorQuadrado", {
    name: "Metros por quadrado",
    hint: "Tamanho de cada quadrado do grid em metros. Em Tormenta20 é 1,5 m.",
    scope: "world",
    config: true,
    type: Number,
    default: 1.5,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "tempoMaximo", {
    name: "Tempo máximo por turno (segundos)",
    hint: "0 = sem limite. O Mestre também pode mudar clicando na ampulheta da HUD.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 600, step: 5 },
    default: 60,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "somArquivo", {
    name: "Som de tempo esgotado",
    hint: "Escolha um arquivo de áudio. Deixe vazio para usar um sinal sonoro padrão do módulo.",
    scope: "world",
    config: true,
    type: String,
    filePicker: "audio",
    default: ""
  });
  game.settings.register(ID, "somVolume", {
    name: "Volume do som",
    hint: "Apenas para você.",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8
  });
  game.settings.register(ID, "somQuemOuve", {
    name: "Quem ouve o som",
    scope: "world",
    config: true,
    type: String,
    choices: {
      todos: "Todos os jogadores",
      donoMestre: "Dono do personagem e Mestre",
      mestre: "Somente o Mestre"
    },
    default: "todos"
  });
  game.settings.register(ID, "passarAoFim", {
    name: "Passar o turno automaticamente ao acabar o tempo",
    hint: "O Mestre precisa estar conectado.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(ID, "recolhido", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "posicao", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: () => AcoesHUD.aplicarPosicao()
  });
});

/* ---------- Hooks de combate ---------- */

Hooks.once("ready", () => {
  const mod = game.modules.get(ID);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { gastarPorItem: (item) => AcoesHUD.aoUsarItem(item), tipoDeAcao });
  AcoesHUD.render();
  setInterval(() => AcoesHUD.tick(), 250);

  // Jogador sem permissão para avançar o combate pede ao Mestre
  game.socket.on(`module.${ID}`, (data, userId) => {
    if (data?.tipo !== "passar" || !game.user.isActiveGM) return;
    const combat = game.combats.get(data.combatId);
    const atual = combat?.combatant;
    const quem = game.users.get(userId);
    if (atual?.id === data.combatenteId && quem && atual.testUserPermission(quem, "OWNER")) combat.nextTurn();
  });
});
Hooks.on("canvasReady", () => AcoesHUD.render());
Hooks.on("controlToken", () => AcoesHUD.renderSoon());
Hooks.on("deleteToken", () => AcoesHUD.renderSoon());
Hooks.on("updateActor", (actor) => {
  if (AcoesHUD.alvo()?.actor.id === actor.id) AcoesHUD.renderSoon();
});
Hooks.on("updateToken", (doc) => {
  if (AcoesHUD.alvo()?.doc.id === doc.id) AcoesHUD.renderSoon();
});
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateItem"]) {
  Hooks.on(hook, () => AcoesHUD.renderSoon());
}

Hooks.on("updateCombat", async (combat, changes) => {
  // Só o Mestre ativo renova as ações no início de cada turno.
  if (game.user.isActiveGM && combat.started && ("turn" in changes || "round" in changes)) {
    combat.setFlag(ID, "turno", { chave: AcoesHUD.chaveTurno(combat), inicio: Date.now() }).catch(() => {});
    const c = combat.combatant;
    if (c && (() => { const x = getEstado(c); return x.std || x.mov || x.conv || x.full || x.dist || x.hist?.length; })()) {
      try {
        await c.setFlag(ID, FLAG, { ...VAZIO });
      } catch (err) {
        console.error(`${ID} |`, err);
      }
    }
  }
  AcoesHUD.render();
});

for (const hook of ["createCombat", "deleteCombat", "createCombatant", "deleteCombatant"]) {
  Hooks.on(hook, () => AcoesHUD.render());
}

Hooks.on("updateCombatant", (combatant) => {
  if (combatant.id === game.combat?.combatant?.id) AcoesHUD.render();
});

/* ---------- Limite de movimento (v13: preMoveToken / moveToken) ---------- */

const PENDENTES = new Map(); // tokenId -> { combatenteId, estado }

/** Distância (em unidades da cena) do trecho que está prestes a ser percorrido (ou desfeito). */
function distanciaDoMovimento(doc, movement, incluirPassado = false) {
  const candidatos = [movement?.pending?.cost, movement?.pending?.distance];
  if (incluirPassado) candidatos.push(movement?.passed?.cost, movement?.passed?.distance);
  for (const d of candidatos) {
    if (Number.isFinite(Number(d)) && Number(d) > 0) return Number(d);
  }
  // Plano B: mede origem -> waypoints -> destino
  try {
    const pts = [movement?.origin, ...(movement?.pending?.waypoints ?? []), movement?.destination]
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: p.x, y: p.y }));
    if (pts.length >= 2) return canvas.grid.measurePath(pts).distance ?? 0;
  } catch (err) {
    console.warn(`${ID} | não foi possível medir o movimento`, err);
  }
  return 0;
}

// Importante: nunca devolve valor. Hooks como preMoveToken cancelam a ação quando retornam false.
const dbg = (...a) => {
  if (cfg("debug")) console.log(`${ID} |`, ...a);
};

const quadradosDe = (doc, unidades) => unidades / (doc.parent?.grid?.distance || canvas.grid?.distance || 1);

/** Combate e combatente que se aplicam a este movimento (ou null se o token está livre). */
function contextoMovimento(doc) {
  if (!cfg("limitarMovimento")) return null;
  if (game.user.isGM && !cfg("regrasParaMestre")) return null;
  const combat = game.combat;
  if (!combat?.started) return null;
  const c = combat.combatants.find((x) => x.tokenId === doc.id);
  return c ? { combat, c } : null;
}

const RETORNANDO = new Set(); // tokens que o próprio módulo está devolvendo ao ponto de partida
const COBRADOS = new Map(); // tokenId -> momento do último movimento cobrado

const mesmoPonto = (p, q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1;

/** Pontos do trecho que o token vai percorrer (da posição atual ao destino). */
function pontosDoMovimento(doc, movement) {
  const pts = [{ x: doc.x, y: doc.y }];
  for (const w of movement?.pending?.waypoints ?? []) {
    if (Number.isFinite(w?.x) && Number.isFinite(w?.y)) pts.push({ x: w.x, y: w.y });
  }
  const d = movement?.destination;
  if (Number.isFinite(d?.x) && Number.isFinite(d?.y)) pts.push({ x: d.x, y: d.y });
  return pts.filter((p, i) => i === 0 || !mesmoPonto(p, pts[i - 1])).slice(0, 16);
}

/** Distância (em quadrados) entre dois pontos, pela régua do grid. */
function distSeg(doc, p, q) {
  try {
    return quadradosDe(doc, canvas.grid.measurePath([{ x: p.x, y: p.y }, { x: q.x, y: q.y }]).distance ?? 0);
  } catch (err) {
    return Math.hypot(p.x - q.x, p.y - q.y) / (canvas.grid?.size || 100);
  }
}

function ajustarGrade(p) {
  try {
    const modos = foundry.CONST?.GRID_SNAPPING_MODES ?? CONST.GRID_SNAPPING_MODES;
    return canvas.grid.getSnappedPoint({ x: p.x, y: p.y }, { mode: modos.TOP_LEFT_VERTEX });
  } catch (err) {
    return p;
  }
}

/**
 * Planeja a volta do token pelo caminho que ele andou, até a distância `alvoS` (em quadrados) contada do início.
 * Retorna { caminho: pontos a percorrer na volta, hist: histórico que sobra } ou null se não houver o que desfazer.
 */
function planejarCaminho(doc, e, alvoS) {
  const hist = e.hist ?? [];
  if (!doc || !hist.length) return null;
  const pts = [];
  for (const h of hist) {
    for (const q of (h.p?.length ? h.p : [h.a, h.b]).filter(Boolean)) {
      if (!pts.length || !mesmoPonto(pts.at(-1), q)) pts.push({ x: q.x, y: q.y });
    }
  }
  if (pts.length < 2) return null;
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + distSeg(doc, pts[i - 1], pts[i]));
  if (alvoS >= s.at(-1) - 0.05) return null; // já está dentro do alvo

  let i = s.findIndex((v) => v > alvoS);
  if (i <= 0) i = 1;
  let T = pts[0];
  if (alvoS > 0.001) {
    const f = clamp((alvoS - s[i - 1]) / (s[i] - s[i - 1] || 1), 0, 1);
    T = ajustarGrade({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f });
  }
  const caminho = [];
  for (let j = pts.length - 2; j >= i; j--) caminho.push(pts[j]);
  caminho.push({ x: T.x, y: T.y });
  const limpo = caminho.filter((q, k) => k === 0 || !mesmoPonto(q, caminho[k - 1]));
  const novoHist = alvoS > 0.001
    ? [{ d: alvoS, m: true, c: false, a: pts[0], b: { x: T.x, y: T.y }, p: [...pts.slice(0, i), { x: T.x, y: T.y }].filter((q, k, arr) => k === 0 || !mesmoPonto(q, arr[k - 1])) }]
    : [];
  return { caminho: limpo, hist: novoHist, alvo: { x: T.x, y: T.y } };
}

/**
 * Planeja a volta do token até `alvoS` quadrados (contados do início do turno).
 * - nativo: desfaz os movimentos no histórico do Foundry (revertRecordedMovement), para a régua do Foundry
 *   também devolver essa distância; se o alvo cair no meio de um trecho, avança só até ele depois.
 * - andando (plano B): o token volta andando pelo caminho.
 */
function planejarVoltaAprox(doc, e, alvoS) {
  const hist = e.hist ?? [];
  const andando = planejarCaminho(doc, e, alvoS);
  if (!doc || !hist.length || !andando) return null;

  const passos = hist.map((h) => ({
    pts: (h.p?.length ? h.p : [h.a, h.b]).filter(Boolean).map((q) => ({ x: q.x, y: q.y }))
  }));
  let acc = 0;
  const info = passos.map((ps) => {
    let len = 0;
    for (let i = 1; i < ps.pts.length; i++) len += distSeg(doc, ps.pts[i - 1], ps.pts[i]);
    const r = { ini: acc, len };
    acc += len;
    return r;
  });
  const j = info.findIndex((x) => alvoS < x.ini + x.len - 0.001);
  if (j < 0) return { caminho: andando.caminho, alvo: andando.alvo, histAndando: andando.hist, histNativo: andando.hist, revert: [], avanco: [] };

  const resto = alvoS - info[j].ini;
  const parcial = resto > 0.05;
  let avanco = [];
  let histNativo = hist.slice(0, j);
  if (parcial) {
    const pts = passos[j].pts;
    let r = resto;
    for (let i = 1; i < pts.length; i++) {
      const d = distSeg(doc, pts[i - 1], pts[i]);
      if (r >= d - 0.001) {
        avanco.push(pts[i]);
        r -= d;
      } else {
        const f = clamp(r / (d || 1), 0, 1);
        avanco.push(ajustarGrade({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }));
        break;
      }
    }
    const T = avanco.at(-1);
    histNativo = [
      ...histNativo,
      { d: resto, m: !!hist[j].m, c: false, a: hist[j].a, b: { x: T.x, y: T.y }, p: [pts[0], ...avanco], mid: null }
    ];
  }
  return {
    caminho: andando.caminho,
    alvo: andando.alvo,
    histAndando: andando.hist,
    histNativo,
    revert: hist.slice(j).map((h) => h.mid),
    avanco,
    aposRevert: hist[j]?.a ? { x: hist[j].a.x, y: hist[j].a.y } : null
  };
}

/** Lê o histórico de movimento gravado pelo Foundry: [{ x, y, cost, id }] em ordem. */
function lerHistoricoFoundry(doc, log = false) {
  let bruto = doc.movementHistory;
  if (!Array.isArray(bruto)) bruto = doc._source?._movementHistory ?? doc._source?.movementHistory;
  if (log) dbg("movementHistory", { ehArray: Array.isArray(doc.movementHistory), tamanho: bruto?.length, exemplo: bruto?.[0] });
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((w) => Number.isFinite(w?.x) && Number.isFinite(w?.y))
    .map((w) => ({ x: w.x, y: w.y, cost: numero(w.cost), id: w.movementId }));
}

/**
 * Trecho do histórico que pertence a este turno: de trás para frente, até somar a distância já gasta (`distTotal`).
 * Não depende de ids guardados, só da distância cobrada.
 */
function historicoDoTurno(doc, distTotal) {
  const lista = lerHistoricoFoundry(doc, true);
  if (lista.length < 2 || distTotal <= 0.001) return { wps: [], offset: 0 };
  const unidade = doc.parent?.grid?.distance || canvas.grid?.distance || 1;
  let soma = 0;
  let ini = 0;
  for (let i = lista.length - 1; i >= 1; i--) {
    soma += lista[i].cost / unidade;
    ini = i - 1;
    if (soma >= distTotal - 0.05) break;
  }
  while (ini >= 1 && lista[ini].id === lista[ini + 1]?.id) ini--; // não corta um movimento ao meio
  const wps = lista.slice(ini).map((w, i) => (i === 0 ? { ...w, cost: 0 } : w));
  const total = wps.reduce((t, w) => t + w.cost / unidade, 0);
  return { wps, offset: Math.max(0, total - distTotal) };
}

/** Pontos reais percorridos por um movimento (do histórico do Foundry); senão, só origem e destino. */
function pontosReais(doc, id, a, b) {
  const lista = lerHistoricoFoundry(doc).filter((w) => w.id === id);
  const bruto = lista.length ? [a, ...lista.map((w) => ({ x: w.x, y: w.y }))] : [a, b];
  return bruto.filter((q, i, arr) => i === 0 || !mesmoPonto(q, arr[i - 1])).slice(0, 16);
}

/**
 * Volta o token até o último ponto em que o custo acumulado ainda cabe em `alvoS` quadrados (o "último verde"),
 * usando o caminho real, casa por casa, que o Foundry gravou.
 */
function planejarVoltaFoundry(doc, e, alvoS) {
  const { wps, offset } = historicoDoTurno(doc, e.dist ?? 0);
  if (wps.length < 2) return null;
  const unidade = doc.parent?.grid?.distance || canvas.grid?.distance || 1;
  const cum = [0];
  for (let i = 1; i < wps.length; i++) cum.push(cum[i - 1] + wps[i].cost / unidade);
  const alvoAdj = alvoS + offset;
  if (alvoAdj >= cum.at(-1) - 0.01) return null; // nada além do alvo

  let k = 0;
  for (let i = 0; i < wps.length; i++) if (cum[i] <= alvoAdj + 0.01) k = i;

  const ordem = [];
  for (let i = 1; i < wps.length; i++) if (!ordem.includes(wps[i].id)) ordem.push(wps[i].id);
  const iniDe = (id) => wps.findIndex((w, i) => i > 0 && w.id === id);
  const fimDe = (id) => wps.reduce((f, w, i) => (i > 0 && w.id === id ? i : f), -1);

  const mAlvo = k === 0 ? ordem[0] : wps[k].id;
  const noFim = k > 0 && k === fimDe(mAlvo);
  const idx = ordem.indexOf(mAlvo);
  const revert = ordem.slice(noFim ? idx + 1 : idx);
  const parcial = k > 0 && !noFim;
  const avanco = parcial ? wps.slice(iniDe(mAlvo), k + 1).map((w) => ({ x: w.x, y: w.y })) : [];

  // histórico que sobra (um passo por movimento do Foundry mantido)
  const histNativo = [];
  for (const id of ordem) {
    const ini = iniDe(id);
    if (ini > k) break;
    const fim = Math.min(fimDe(id), k);
    const a = { x: wps[ini - 1].x, y: wps[ini - 1].y };
    histNativo.push({
      d: cum[fim] - cum[ini - 1], m: histNativo.length === 0, c: false, a,
      b: { x: wps[fim].x, y: wps[fim].y },
      p: [a, ...wps.slice(ini, fim + 1).map((w) => ({ x: w.x, y: w.y })).slice(-14)],
      mid: fimDe(id) > k ? null : id
    });
  }
  const caminho = [];
  for (let i = wps.length - 2; i >= k; i--) caminho.push({ x: wps[i].x, y: wps[i].y });
  const histAndando = alvoS > 0.001
    ? [{ d: cum[k], m: true, c: false, a: { x: wps[0].x, y: wps[0].y }, b: { x: wps[k].x, y: wps[k].y }, p: [{ x: wps[0].x, y: wps[0].y }, { x: wps[k].x, y: wps[k].y }], mid: null }]
    : [];
  const aposRevert = revert.length ? { x: wps[iniDe(revert[0]) - 1].x, y: wps[iniDe(revert[0]) - 1].y } : null;
  dbg("volta (histórico do Foundry)", { alvoS, offset, k, custo: cum[k], revert, avanco: avanco.length });
  return { caminho, alvo: { x: wps[k].x, y: wps[k].y }, histAndando, histNativo, revert, avanco, aposRevert };
}

/** Último recurso para voltar ao início do turno: vai direto ao ponto de partida gravado. */
function planoDireto(e) {
  const origem = e?.hist?.find((h) => h?.a)?.a;
  if (!origem) return null;
  return { caminho: [{ x: origem.x, y: origem.y }], alvo: { x: origem.x, y: origem.y }, histAndando: [], histNativo: [], revert: [], avanco: [], aposRevert: null };
}

function planejarVolta(doc, e, alvoS) {
  return planejarVoltaFoundry(doc, e, alvoS) ?? planejarVoltaAprox(doc, e, alvoS) ?? (alvoS <= 0.001 ? planoDireto(e) : null);
}

async function esperarAnimacao(doc) {
  try {
    const pr = doc.object?.movementAnimationPromise;
    if (pr) await pr;
    else await new Promise((r) => setTimeout(r, 350));
  } catch (err) { /* ignora */ }
}

/** Anda o token pelos pontos (animado). Fica registrado no histórico do Foundry. */
async function andarPontos(doc, pontos) {
  if (!doc || !pontos?.length) return;
  const lista = pontos.map((p) => ({ x: p.x, y: p.y }));
  if (typeof doc.move === "function") {
    try {
      if ((await doc.move(lista)) !== false) return;
    } catch (err) {
      console.warn(`${ID} | move() falhou; usando update`, err);
    }
  }
  for (const p of lista) {
    await doc.update({ x: p.x, y: p.y });
    await esperarAnimacao(doc);
  }
}

/** Executa a volta. Retorna "nativo" (histórico do Foundry desfeito) ou "andando" (plano B). */
async function executarVolta(doc, plano) {
  if (!doc || !plano) return null;
  RETORNANDO.add(doc.id);
  const perto = (q) => q && Math.abs(q.x - doc.x) < 2 && Math.abs(q.y - doc.y) < 2;
  const inicio = { x: doc.x, y: doc.y };
  let modo = "andando";
  dbg("executarVolta", { inicio, alvo: plano.alvo, aposRevert: plano.aposRevert, revert: plano.revert, avanco: plano.avanco?.length, caminho: plano.caminho?.length });
  try {
    let ok = false;
    if (typeof doc.revertRecordedMovement === "function" && plano.revert?.length && plano.revert.every(Boolean)) {
      ok = true;
      try {
        // do movimento mais recente para o mais antigo
        for (const id of [...plano.revert].reverse()) {
          const r = await doc.revertRecordedMovement(id);
          dbg("revertRecordedMovement", id, "->", r, { x: doc.x, y: doc.y });
          if (r === false) {
            ok = false;
            break;
          }
          await esperarAnimacao(doc);
        }
      } catch (err) {
        ok = false;
        console.warn(`${ID} | revertRecordedMovement falhou`, err);
      }
      // confere se o token realmente voltou; o retorno do Foundry pode ser "ok" sem ter movido nada
      if (ok && plano.aposRevert && !perto(plano.aposRevert)) {
        dbg("revert nativo não levou o token ao ponto esperado");
        ok = false;
      }
    }
    if (ok) {
      modo = "nativo";
      if (plano.avanco?.length) {
        await andarPontos(doc, plano.avanco);
        const ultimo = plano.histNativo.at(-1);
        if (ultimo && !ultimo.mid) ultimo.mid = doc.movementHistory?.at?.(-1)?.movementId ?? null;
      }
    } else {
      // plano B: anda de volta pelo caminho (se o token já saiu do lugar, vai direto ao alvo)
      const moveu = !perto(inicio);
      await andarPontos(doc, moveu ? [plano.alvo] : plano.caminho);
    }
    // último recurso: se ainda não chegou ao alvo, move direto
    if (plano.alvo && !perto(plano.alvo)) {
      dbg("último recurso: update direto", plano.alvo, { x: doc.x, y: doc.y });
      await doc.update({ x: plano.alvo.x, y: plano.alvo.y });
    }
  } catch (err) {
    console.error(`${ID} | não foi possível devolver o token`, err);
  } finally {
    setTimeout(() => RETORNANDO.delete(doc.id), 1500);
  }
  return modo;
}

/** Remove os passos [k..fim] do histórico, devolvendo distância e ações gastas por eles. */
function desfazerPassos(e, k) {
  const hist = [...(e.hist ?? [])];
  const removidos = hist.splice(k);
  const novo = { ...e, hist };
  for (const h of removidos.reverse()) {
    novo.dist = Math.max(0, (novo.dist ?? 0) - h.d);
    if (h.m) novo.mov = false;
    if (h.c) {
      novo.conv = false;
      novo.std = false;
    }
  }
  if (!hist.length) novo.dist = 0;
  return novo;
}

/** Plano B do Ctrl+Z (sem posições gravadas): usa a distância desfeita. */
function calcularDesfazer(doc, movement, c) {
  const e = getEstado(c);
  const hist = e.hist ?? [];
  if (!hist.length) return null;
  let resta = quadradosDe(doc, distanciaDoMovimento(doc, movement, true));
  let k = hist.length;
  do {
    k -= 1;
    resta -= hist[k].d;
  } while (resta > 0.05 && k > 0);
  return desfazerPassos(e, k);
}

/**
 * Ctrl+Z (ou qualquer volta do token a uma parada anterior): compara a posição atual do token com
 * as paradas do turno e devolve o movimento gasto desde aquela parada.
 */
async function reconciliar(doc, movement = null) {
  if (RETORNANDO.has(doc.id)) return false;
  const ctx = contextoMovimento(doc);
  if (!ctx) return false;
  const { combat, c } = ctx;
  if (combat.combatant?.id !== c.id) return false;
  const e = getEstado(c);
  const hist = e.hist ?? [];
  if (!hist.length) return false;

  const igual = (q) => q && Math.abs(q.x - doc.x) < 2 && Math.abs(q.y - doc.y) < 2;
  if (igual(hist.at(-1).b)) return false; // token está onde o histórico diz: nada a desfazer

  let k = -1;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (igual(hist[i].a)) {
      k = i;
      break;
    }
  }
  let novo = null;
  if (k >= 0) novo = desfazerPassos(e, k);
  else if (movement?.method === "undo") novo = calcularDesfazer(doc, movement, c);
  dbg("reconciliar", { k, novo });
  if (!novo) return false;
  ESTADO_RECENTE.delete(c.id);
  try {
    await c.setFlag(ID, FLAG, novo);
  } catch (err) {
    console.error(`${ID} |`, err);
  }
  return true;
}

const TETO = new Map(); // tokenId -> custo total (quadrados) já validado no 1º trecho da jogada
const ESTADO_RECENTE = new Map(); // combatenteId -> { estado, t } (evita ler a ficha antes da gravação chegar)

function estadoAtual(c) {
  const r = ESTADO_RECENTE.get(c.id);
  if (r && Date.now() - r.t < 3000) return { ...VAZIO, ...r.estado };
  return getEstado(c);
}

/** Custo (em quadrados) que o Foundry de fato gravou para este movimento; null se não der para saber. */
function custoReal(doc, id) {
  if (!id) return null;
  let bruto = doc.movementHistory;
  if (!Array.isArray(bruto)) bruto = doc._source?._movementHistory ?? doc._source?.movementHistory;
  if (!Array.isArray(bruto)) return null;
  const ws = bruto.filter((w) => w.movementId === id);
  if (!ws.length) return null;
  return ws.reduce((t, w) => t + numero(w.cost), 0) / (doc.parent?.grid?.distance || canvas.grid?.distance || 1);
}

Hooks.on("preMoveToken", (doc, movement) => {
  dbg("preMoveToken", doc.name, movement?.method, movement);
  if (RETORNANDO.has(doc.id)) return;
  const ctx = contextoMovimento(doc);
  if (!ctx) return dbg("ignorado: token livre / Mestre / sem combate");
  const { combat, c } = ctx;

  // Ctrl+Z: tratado depois que o token já voltou (moveToken / updateToken)
  if (movement?.method === "undo") return;

  if (combat.combatant?.id !== c.id) {
    if (cfg("bloquearForaDoTurno")) {
      ui.notifications.warn(`${c.name} só pode se mover no próprio turno.`);
      return false;
    }
    return;
  }

  // O Foundry pode dividir um mesmo arrasto em vários trechos ("continuação"): chain != vazio.
  const continuacao = (movement?.chain?.length ?? 0) > 0;
  if (!continuacao) TETO.delete(doc.id);
  const pend = quadradosDe(doc, distanciaDoMovimento(doc, movement));
  if (pend <= 0.001 && !continuacao) return dbg("ignorado: distância zero");

  const e = estadoAtual(c);
  const porAcao = quadradosPorAcao(c.actor);
  const total = (e.dist ?? 0) + pend;
  const necessarias = Math.max(1, Math.ceil(total / porAcao - 0.01));
  const maximo = maxMovimentos(e);
  dbg({ continuacao, pend, porAcao, total, necessarias, maximo, estado: e, deslocamentoM: deslocamentoMetros(c.actor) });

  // trechos seguintes da mesma jogada já foram validados no primeiro trecho
  const jaValidado = continuacao && TETO.has(doc.id);
  if (!jaValidado && necessarias > maximo) {
    const resta = Math.max(0, maximo * porAcao - (e.dist ?? 0)) * cfg("metrosPorQuadrado");
    const txt = (Math.round(resta * 10) / 10).toString().replace(".", ",");
    ui.notifications.warn(
      maximo === 0
        ? `${c.name} não tem mais ações de movimento disponíveis.`
        : `Movimento bloqueado: ${c.name} só pode andar mais ${txt} m neste turno.`
    );
    return false;
  }
  if (!continuacao) TETO.set(doc.id, total);

  COBRADOS.set(doc.id, Date.now());
  PENDENTES.set(doc.id, { combatenteId: c.id, continuacao, a: { x: doc.x, y: doc.y }, pend, p: pontosDoMovimento(doc, movement) });
});

Hooks.on("moveToken", async (doc, movement, operation, user) => {
  if (user?.id !== game.user.id) return;
  if (RETORNANDO.has(doc.id)) return;
  const p = PENDENTES.get(doc.id);
  PENDENTES.delete(doc.id);

  if (!p) {
    // Movimento que não foi cobrado (ex.: Ctrl+Z): confere se o token voltou a uma parada anterior
    dbg("moveToken (sem cobrança)", doc.name, movement?.method);
    await reconciliar(doc, movement);
    return;
  }
  const c = game.combat?.combatants.get(p.combatenteId);
  if (!c) return;

  // cobra o que o Foundry realmente gravou para este trecho (ou a estimativa, se não houver histórico)
  let real = custoReal(doc, movement?.id);
  // sem histórico: usa a estimativa, mas nunca cobra de novo um trecho de continuação
  if (real === null) real = p.continuacao ? 0 : p.pend;
  dbg("moveToken", doc.name, movement?.method, { real, estimado: p.pend });
  if (real <= 0.001) return;

  const e = estadoAtual(c);
  const total = (e.dist ?? 0) + real;
  const necessarias = Math.max(1, Math.ceil(total / quadradosPorAcao(c.actor) - 0.01));
  const novo = { ...e, dist: total };
  if (necessarias >= 1) novo.mov = true;
  if (necessarias >= 2 && !novo.conv) {
    novo.conv = true; // 2º movimento usa a ação padrão
    novo.std = true;
  }
  const b = { x: doc.x, y: doc.y };
  const pts = pontosReais(doc, movement?.id, p.a, b);
  novo.hist = [
    ...(e.hist ?? []),
    { d: real, m: !e.mov && novo.mov, c: !e.conv && novo.conv, a: p.a, b, p: pts, mid: movement?.id ?? null }
  ].slice(-40);
  ESTADO_RECENTE.set(c.id, { estado: novo, t: Date.now() });
  try {
    await c.setFlag(ID, FLAG, novo);
  } catch (err) {
    console.error(`${ID} |`, err);
  }
});

// Plano B: se o Ctrl+Z não passar pelos hooks de movimento, confere pela posição do token.
Hooks.on("updateToken", (doc, changes, options, userId) => {
  if (userId !== game.user.id) return;
  if (!("x" in changes || "y" in changes)) return;
  if (RETORNANDO.has(doc.id)) return;
  if (Date.now() - (COBRADOS.get(doc.id) ?? 0) < 1000) return; // movimento recém cobrado
  setTimeout(() => reconciliar(doc), 250);
});

/* ---------- Uso de itens (detectado quando o card vai para o chat) ---------- */

/** Coleta strings de um objeto (para achar ids/uuids de item nas flags da mensagem). */
function coletarTextos(obj, saida = [], nivel = 0) {
  if (nivel > 4 || saida.length > 300 || obj == null) return saida;
  if (typeof obj === "string") saida.push(obj);
  else if (typeof obj === "object") for (const v of Object.values(obj)) coletarTextos(v, saida, nivel + 1);
  return saida;
}

/** Descobre qual item gerou a mensagem (flags do sistema, atributos data-* do HTML ou título do card). */
function itemDaMensagem(message) {
  const sp = message.speaker ?? {};
  const actor = ChatMessage.getSpeakerActor?.(sp) ?? game.actors.get(sp.actor);

  // 1) ids / uuids dentro das flags
  for (const t of coletarTextos(message.flags)) {
    try {
      if (/(^|\.)Item\./.test(t)) {
        const it = fromUuidSync(t, { strict: false });
        if (it?.documentName === "Item") return it;
      } else if (actor && /^[A-Za-z0-9]{16}$/.test(t)) {
        const it = actor.items.get(t);
        if (it) return it;
      }
    } catch (err) { /* ignora */ }
  }

  // 2) atributos data-* no HTML
  const html = message.content ?? "";
  const m = html.match(/data-(?:item-)?uuid="([^"]+)"/) ?? null;
  if (m) {
    try {
      const it = fromUuidSync(m[1], { strict: false });
      if (it?.documentName === "Item") return it;
    } catch (err) { /* ignora */ }
  }
  const id = html.match(/data-item-id="([^"]+)"/)?.[1];
  if (id && actor?.items.get(id)) return actor.items.get(id);

  // 3) título do card = nome do item
  if (actor && html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const titulo = normalizar(doc.querySelector("h1,h2,h3,h4,.card-header,.item-name,header")?.textContent);
    if (titulo) {
      const exato = actor.items.find((i) => normalizar(i.name) === titulo);
      if (exato) return exato;
      return actor.items.find((i) => i.name.length >= 4 && titulo.includes(normalizar(i.name))) ?? null;
    }
  }
  return null;
}

Hooks.on("createChatMessage", (message) => {
  if (!cfg("gastarPorItem")) return;
  if ((message.author ?? message.user)?.id !== game.user.id) return; // só quem enviou
  if (message.flags?.[ID]?.anuncio) return;
  const item = itemDaMensagem(message);
  dbg("chat", message.id, item?.name ?? "(sem item)");
  if (item) AcoesHUD.aoUsarItem(item);
});

window.addEventListener("resize", () => AcoesHUD.el?.isConnected && AcoesHUD.aplicarPosicao());
