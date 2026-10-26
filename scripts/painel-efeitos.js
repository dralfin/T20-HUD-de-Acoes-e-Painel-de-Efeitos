/**
 * T20 - Painel de Efeitos (GM) — parte do módulo t20-acoes-hud
 * Foundry VTT v13 • Tormenta20
 *
 * Painel só do Mestre, aberto por um botão na barra lateral esquerda (grupo de Controles de Token).
 * Lista os efeitos dos tokens da cena, separados por token, como tags de texto.
 * Passar o mouse numa tag mostra descrição, duração e outros dados. Filtros: tipo de ficha e disposição.
 */

const ID = "t20-acoes-hud"; // mesmo módulo da HUD de ações

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) =>
  String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/** Disposições do token (CONST.TOKEN_DISPOSITIONS), na ordem de exibição. */
const DISPOSICOES = [
  { v: -1, nome: "Hostil", cor: "#e05555" },
  { v: 0, nome: "Neutro", cor: "#e0b85c" },
  { v: 1, nome: "Amigável", cor: "#4caf6a" },
  { v: -2, nome: "Secreto", cor: "#a98ae6" }
];
const infoDisp = (v) => DISPOSICOES.find((d) => d.v === v) ?? { v, nome: "—", cor: "#888" };

/** Nome legível do tipo de ficha (character, npc...). */
function rotuloTipo(tipo) {
  const chave = CONFIG.Actor?.typeLabels?.[tipo];
  const loc = chave ? game.i18n.localize(chave) : null;
  if (loc && loc !== chave) return loc;
  const base = { character: "Personagem", npc: "NPC", simple: "Simples", vehicle: "Veículo", group: "Grupo" };
  return base[tipo] ?? tipo;
}

/** Texto puro (sem HTML) limitado a `max` caracteres. */
function textoPuro(html, max = 500) {
  if (typeof html !== "string" || !html.trim()) return "";
  const txt = new DOMParser().parseFromString(html, "text/html").body.textContent.replace(/\s+/g, " ").trim();
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
}

function origemDoEfeito(e) {
  try {
    const o = e.origin ? fromUuidSync(e.origin, { strict: false }) : null;
    if (o?.name) return o.name;
  } catch (err) { /* ignora */ }
  return e.parent?.documentName === "Item" ? e.parent.name : "";
}

function descricaoDoEfeito(e) {
  const flags = e.flags?.tormenta20 ?? {};
  const candidatos = [e.description, e.system?.description, flags.description, flags.descricao];
  let texto = candidatos.map((c) => textoPuro(typeof c === "string" ? c : c?.value)).find(Boolean);
  if (texto) return texto;
  // Plano B: descrição do item de origem
  let item = e.parent?.documentName === "Item" ? e.parent : null;
  try {
    if (!item && e.origin) {
      const o = fromUuidSync(e.origin, { strict: false });
      if (o?.documentName === "Item") item = o;
    }
  } catch (err) { /* ignora */ }
  const d = item?.system?.description;
  return textoPuro(typeof d === "string" ? d : d?.value);
}

function duracaoDoEfeito(e) {
  const d = e.duration ?? {};
  if (!d.type || d.type === "none") return { texto: "Permanente", restante: null };
  let restante = null;
  if (Number.isFinite(d.remaining)) {
    const r = Math.max(0, d.remaining);
    restante = d.type === "seconds" ? `${Math.round(r)} s` : `${Math.ceil(r)} ${d.type === "turns" ? "turno(s)" : "rodada(s)"}`;
  }
  return { texto: d.label || (d.type === "seconds" ? "Por tempo" : "Por turnos"), restante };
}

class PainelEfeitos {
  static el = null;
  static tip = null;
  static aberto = false;
  static mapa = new Map(); // uuid do efeito -> efeito (para tooltip e clique)
  static _t = null;
  static _tagAtual = null;

  /* ---------- filtros ---------- */

  static filtros() {
    const f = game.settings.get(ID, "efeitosFiltros") ?? {};
    return {
      dispOff: Array.isArray(f.dispOff) ? f.dispOff : [],
      tiposOff: Array.isArray(f.tiposOff) ? f.tiposOff : [],
      itens: !!f.itens,
      desativados: !!f.desativados,
      vazios: !!f.vazios,
      busca: typeof f.busca === "string" ? f.busca : ""
    };
  }

  static salvarFiltros(f) {
    game.settings.set(ID, "efeitosFiltros", f);
  }

  /* ---------- dados ---------- */

  static coletar(f) {
    const tipos = new Map();
    const lista = [];
    let total = 0;
    const cena = canvas?.scene;
    if (!cena) return { lista, tipos, total };
    const q = norm(f.busca);

    for (const t of cena.tokens) {
      const actor = t.actor;
      if (!actor) continue;
      tipos.set(actor.type, rotuloTipo(actor.type));
      if (f.dispOff.includes(t.disposition)) continue;
      if (f.tiposOff.includes(actor.type)) continue;

      const casaToken = !!q && norm(t.name).includes(q);
      const fonte = typeof actor.allApplicableEffects === "function" ? Array.from(actor.allApplicableEffects()) : Array.from(actor.effects);
      const efeitos = [];
      for (const e of fonte) {
        const deItem = e.parent?.documentName === "Item";
        const inativo = !!e.disabled || !!e.isSuppressed;
        if (deItem && !f.itens) continue;
        if (inativo && !f.desativados) continue;
        if (q && !casaToken && !norm(e.name ?? e.label).includes(q)) continue;
        efeitos.push({ e, deItem, inativo });
      }
      if (!efeitos.length && (!f.vazios || (q && !casaToken))) continue;
      total += efeitos.length;
      lista.push({ t, actor, efeitos });
    }
    const ordem = DISPOSICOES.map((d) => d.v);
    lista.sort((a, b) => ordem.indexOf(a.t.disposition) - ordem.indexOf(b.t.disposition) || a.t.name.localeCompare(b.t.name, "pt-BR"));
    return { lista, tipos, total };
  }

  /* ---------- interface ---------- */

  static garantirEl() {
    if (this.el?.isConnected) return this.el;
    const el = document.createElement("section");
    el.id = "t20pe";
    el.classList.add("oculto");
    el.innerHTML = `
      <header class="pe-cabeca" title="Arraste para mover">
        <i class="fa-solid fa-wand-sparkles pe-logo"></i>
        <div class="pe-titulo"><span>Efeitos na cena</span><small class="pe-resumo"></small></div>
        <button type="button" class="pe-mini" data-acao="atualizar" title="Atualizar"><i class="fa-solid fa-rotate"></i></button>
        <button type="button" class="pe-mini" data-acao="fechar" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="pe-filtros"></div>
      <div class="pe-busca-linha">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" class="pe-busca" placeholder="Buscar token ou efeito..." autocomplete="off">
      </div>
      <div class="pe-lista"></div>`;
    document.body.appendChild(el);

    el.addEventListener("click", (ev) => {
      const chip = ev.target.closest("[data-chip]");
      if (chip) return this.alternarChip(chip.dataset.chip, chip.dataset.valor);
      const acao = ev.target.closest("[data-acao]")?.dataset.acao;
      if (acao === "fechar") return this.fechar();
      if (acao === "atualizar") return this.render();
      const nome = ev.target.closest("[data-token]");
      if (nome) return this.focarToken(nome.dataset.token);
      const tag = ev.target.closest(".pe-tag");
      if (tag) this.mapa.get(tag.dataset.uid)?.sheet?.render(true);
    });
    el.querySelector(".pe-busca").addEventListener("input", (ev) => {
      const f = this.filtros();
      f.busca = ev.target.value;
      this.salvarFiltros(f);
      clearTimeout(this._tb);
      this._tb = setTimeout(() => this.renderLista(), 120);
    });
    // tooltip ao passar o mouse nas tags
    el.addEventListener("mousemove", (ev) => {
      const tag = ev.target.closest?.(".pe-tag");
      if (!tag) return this.esconderTip();
      if (tag !== this._tagAtual) {
        this._tagAtual = tag;
        this.mostrarTip(tag.dataset.uid);
      }
      this.posicionarTip(ev.clientX, ev.clientY);
    });
    el.addEventListener("mouseleave", () => this.esconderTip());
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button === 0 && ev.target.closest(".pe-cabeca") && !ev.target.closest("button")) this.iniciarArraste(ev);
    });

    // guarda o tamanho escolhido
    new ResizeObserver(() => {
      if (!this.aberto || !el.offsetWidth) return;
      clearTimeout(this._tr);
      this._tr = setTimeout(() => game.settings.set(ID, "efeitosJanela", { ...game.settings.get(ID, "efeitosJanela"), w: el.offsetWidth, h: el.offsetHeight }), 500);
    }).observe(el);

    const tip = document.createElement("div");
    tip.id = "t20pe-tip";
    tip.classList.add("oculto");
    document.body.appendChild(tip);

    this.el = el;
    this.tip = tip;
    this.aplicarJanela();
    return el;
  }

  static aplicarJanela() {
    const j = game.settings.get(ID, "efeitosJanela") ?? {};
    const el = this.el;
    if (Number.isFinite(j.w)) el.style.width = `${clamp(j.w, 340, window.innerWidth - 20)}px`;
    if (Number.isFinite(j.h)) el.style.height = `${clamp(j.h, 260, window.innerHeight - 20)}px`;
    if (Number.isFinite(j.x) && Number.isFinite(j.y)) {
      el.style.left = `${clamp(j.x, 0, window.innerWidth - 120)}px`;
      el.style.top = `${clamp(j.y, 0, window.innerHeight - 60)}px`;
    }
  }

  static iniciarArraste(ev) {
    const el = this.el;
    const r = el.getBoundingClientRect();
    const dx = ev.clientX - r.left;
    const dy = ev.clientY - r.top;
    let pos = null;
    el.classList.add("arrastando");
    const mover = (e) => {
      pos = { x: clamp(e.clientX - dx, 0, window.innerWidth - 120), y: clamp(e.clientY - dy, 0, window.innerHeight - 60) };
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      el.classList.remove("arrastando");
      if (pos) game.settings.set(ID, "efeitosJanela", { ...game.settings.get(ID, "efeitosJanela"), ...pos });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
  }

  static alternarChip(grupo, valor) {
    const f = this.filtros();
    const alterna = (lista, v) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
    if (grupo === "disp") f.dispOff = alterna(f.dispOff, Number(valor));
    else if (grupo === "tipo") f.tiposOff = alterna(f.tiposOff, valor);
    else if (grupo === "mostrar") f[valor] = !f[valor];
    this.salvarFiltros(f);
    this.render();
  }

  static focarToken(id) {
    const t = canvas.scene?.tokens.get(id);
    const obj = t?.object;
    if (!obj) return;
    obj.control({ releaseOthers: true });
    canvas.animatePan({ x: obj.center.x, y: obj.center.y });
  }

  /* ---------- abrir / fechar ---------- */

  static alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  static abrir() {
    if (!game.user.isGM) return;
    const el = this.garantirEl();
    this.aberto = true;
    el.classList.remove("oculto");
    el.querySelector(".pe-busca").value = this.filtros().busca;
    document.getElementById("t20pe-botao")?.classList.add("ativo");
    this.render();
  }

  static fechar() {
    this.aberto = false;
    this.el?.classList.add("oculto");
    document.getElementById("t20pe-botao")?.classList.remove("ativo");
    this.esconderTip();
  }

  static renderSoon() {
    if (!this.aberto) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.render(), 80);
  }

  /* ---------- renderização ---------- */

  static chip(grupo, valor, texto, ativo, extra = "", estilo = "") {
    return `<button type="button" class="pe-chip" data-chip="${grupo}" data-valor="${esc(valor)}" aria-pressed="${ativo}" ${estilo ? `style="${estilo}"` : ""}>${extra}${esc(texto)}</button>`;
  }

  static render() {
    if (!this.aberto) return;
    const f = this.filtros();
    const { lista, tipos, total } = this.coletar(f);

    const disp = DISPOSICOES.map((d) =>
      this.chip("disp", d.v, d.nome, !f.dispOff.includes(d.v), `<span class="pe-pt" style="background:${d.cor}"></span>`, `--c:${d.cor}`)
    ).join("");
    const fichas = [...tipos.entries()].map(([t, nome]) => this.chip("tipo", t, nome, !f.tiposOff.includes(t))).join("");
    const mostrar = [
      this.chip("mostrar", "itens", "Efeitos de itens", f.itens),
      this.chip("mostrar", "desativados", "Desativados", f.desativados),
      this.chip("mostrar", "vazios", "Sem efeitos", f.vazios)
    ].join("");
    this.el.querySelector(".pe-filtros").innerHTML = `
      <div class="pe-grupo"><span>Disposição</span><div>${disp}</div></div>
      <div class="pe-grupo"><span>Ficha</span><div>${fichas || '<em class="pe-vazio">nenhum token na cena</em>'}</div></div>
      <div class="pe-grupo"><span>Mostrar</span><div>${mostrar}</div></div>`;

    this.renderLista(lista, total);
  }

  static renderLista(dados = null, totalDado = null) {
    if (!this.aberto) return;
    const { lista, total } = dados ? { lista: dados, total: totalDado } : this.coletar(this.filtros());
    this.mapa.clear();
    this.esconderTip();

    const cards = lista.map(({ t, actor, efeitos }) => {
      const d = infoDisp(t.disposition);
      const tags = efeitos
        .map(({ e, deItem, inativo }) => {
          this.mapa.set(e.uuid, e);
          const cls = [inativo ? "inativo" : "", deItem ? "item" : "", e.statuses?.size ? "condicao" : "", e.isTemporary ? "temp" : ""].join(" ");
          return `<button type="button" class="pe-tag ${cls}" data-uid="${esc(e.uuid)}">${esc(e.name ?? e.label)}</button>`;
        })
        .join("");
      return `
        <section class="pe-token">
          <header>
            <span class="pe-pt" style="background:${d.cor}" title="${d.nome}"></span>
            <button type="button" class="pe-nome" data-token="${t.id}" title="Selecionar e centralizar o token">${esc(t.name)}</button>
            <span class="pe-tipo">${esc(rotuloTipo(actor.type))}</span>
            ${t.hidden ? '<i class="fa-solid fa-eye-slash pe-oculto" title="Token oculto"></i>' : ""}
            <span class="pe-cont" title="Efeitos">${efeitos.length}</span>
          </header>
          <div class="pe-tags">${tags || '<span class="pe-vazio">Sem efeitos</span>'}</div>
        </section>`;
    });

    this.el.querySelector(".pe-lista").innerHTML = cards.length
      ? cards.join("")
      : '<div class="pe-nada"><i class="fa-regular fa-face-smile"></i> Nenhum token com efeitos para esses filtros.</div>';
    this.el.querySelector(".pe-resumo").textContent = `${lista.length} token(s) • ${total} efeito(s)`;
  }

  /* ---------- tooltip ---------- */

  static mostrarTip(uid) {
    const e = this.mapa.get(uid);
    if (!e) return this.esconderTip();
    const dur = duracaoDoEfeito(e);
    const desc = descricaoDoEfeito(e);
    const origem = origemDoEfeito(e);
    const estados = [...(e.statuses ?? [])];
    const mudancas = (e.changes ?? []).slice(0, 6).map((c) => `${String(c.key).replace(/^system\./, "")} → ${c.value}`);
    const mais = (e.changes?.length ?? 0) - mudancas.length;
    const linhas = [
      ["Duração", esc(dur.texto)],
      dur.restante ? ["Restante", esc(dur.restante)] : null,
      origem ? ["Origem", esc(origem)] : null,
      estados.length ? ["Condição", esc(estados.join(", "))] : null,
      e.disabled ? ["Estado", "Desativado"] : e.isSuppressed ? ["Estado", "Suprimido"] : null
    ].filter(Boolean);

    this.tip.innerHTML = `
      <div class="tip-nome">${esc(e.name ?? e.label)}</div>
      ${desc ? `<div class="tip-desc">${esc(desc)}</div>` : '<div class="tip-desc semdesc">Sem descrição.</div>'}
      <dl>${linhas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      ${mudancas.length ? `<div class="tip-mud"><b>Mudanças</b>${mudancas.map((m) => `<code>${esc(m)}</code>`).join("")}${mais > 0 ? `<em>+${mais}</em>` : ""}</div>` : ""}
      <div class="tip-dica">Clique para abrir o efeito</div>`;
    this.tip.classList.remove("oculto");
  }

  static posicionarTip(x, y) {
    const tip = this.tip;
    if (!tip || tip.classList.contains("oculto")) return;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = x + 16;
    let top = y + 18;
    if (left + w > window.innerWidth - 8) left = x - w - 16;
    if (top + h > window.innerHeight - 8) top = y - h - 12;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  static esconderTip() {
    this._tagAtual = null;
    this.tip?.classList.add("oculto");
  }
}

/* ---------- configurações ---------- */

Hooks.once("init", () => {
  for (const chave of ["efeitosFiltros", "efeitosJanela"]) {
    game.settings.register(ID, chave, { scope: "client", config: false, type: Object, default: {} });
  }
  game.settings.register(ID, "painelEfeitos", {
    name: "Ativar o Painel de Efeitos (Mestre)",
    hint: "Mostra, só para o Mestre, o botão que abre o painel com os efeitos dos tokens da cena.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
});

/* ---------- botão na barra lateral esquerda (só o Mestre) ---------- */

let _ultimoAcionamento = 0;
const painelAtivo = () => game.user.isGM && game.settings.get(ID, "painelEfeitos");

/** Abre/fecha o painel, com proteção contra clique duplo e erro visível. */
function acionar() {
  const agora = Date.now();
  if (agora - _ultimoAcionamento < 300) return;
  _ultimoAcionamento = agora;
  try {
    PainelEfeitos.alternar();
  } catch (err) {
    console.error(`${ID} | erro ao abrir o Painel de Efeitos`, err);
    ui.notifications.error("Painel de Efeitos: erro ao abrir. Veja o console (F12).");
  }
}

/** Botão fixo na lateral esquerda, logo abaixo da barra de controles da cena. */
function posicionarBotao() {
  const b = document.getElementById("t20pe-botao");
  if (!b) return;
  const ref = document.querySelector("#scene-controls-layers") ?? document.querySelector("#scene-controls");
  const r = ref?.getBoundingClientRect();
  b.style.left = `${r && r.width ? r.left + (r.width - 36) / 2 : 12}px`;
  b.style.top = `${r && r.height ? r.bottom + 10 : 460}px`;
}

function criarBotao() {
  if (!painelAtivo()) return document.getElementById("t20pe-botao")?.remove();
  let b = document.getElementById("t20pe-botao");
  if (!b) {
    b = document.createElement("button");
    b.id = "t20pe-botao";
    b.type = "button";
    b.title = "Painel de Efeitos (T20)";
    b.innerHTML = '<i class="fa-solid fa-wand-sparkles"></i>';
    b.addEventListener("click", acionar);
    document.body.appendChild(b);
  }
  b.classList.toggle("ativo", PainelEfeitos.aberto);
  posicionarBotao();
}

/* ---------- atualização automática ---------- */

Hooks.once("ready", () => {
  if (!painelAtivo()) return;
  console.log(`${ID} | Painel de Efeitos pronto (botão na lateral esquerda)`);
  criarBotao();
  for (const h of ["renderSceneControls", "canvasReady", "collapseSidebar", "changeSidebarTab"]) {
    Hooks.on(h, () => setTimeout(posicionarBotao, 50));
  }
  window.addEventListener("resize", posicionarBotao);
  setTimeout(posicionarBotao, 600); // depois que a barra de controles terminar de desenhar

  for (const h of [
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
    "createToken", "updateToken", "deleteToken", "updateActor",
    "createItem", "updateItem", "deleteItem",
    "updateCombat", "updateWorldTime", "canvasReady"
  ]) {
    Hooks.on(h, () => PainelEfeitos.renderSoon());
  }
  // também abre digitando /efeitos no chat
  Hooks.on("chatMessage", (log, mensagem) => {
    if (!/^\/efeitos\b/i.test(String(mensagem).trim())) return;
    acionar();
    return false;
  });
  const mod = game.modules.get(ID);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { painelEfeitos: { abrir: () => PainelEfeitos.abrir(), fechar: () => PainelEfeitos.fechar(), alternar: acionar } });
});
