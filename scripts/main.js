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

import { CATEGORIAS_ACOES } from "./acoes-t20.js";

const ID = "t20-acoes-hud";
const FLAG = "acoes";
const ANIM_MS = 1600; // duração das animações de perda e ganho de PV/PM

const VAZIO = { std: false, mov: false, conv: false, full: false, ext: null, corrida: null, movAtividade: 0, dist: 0, hist: [] };
// std  = ação padrão gasta
// mov  = ação de movimento gasta
// conv = a ação padrão foi gasta como 2º movimento
// full = ação completa usada
// corrida = { max: quadrados do grid que ainda podem ser corridos neste turno, dir: direção da corrida } ou null
// ext  = ação extra (efeito Velocidade) já gasta: null | "padrao" | "movimento"
// dist = distância já percorrida no turno (em quadrados)
// hist = passos de movimento do turno [{ d: distância, m: gastou movimento, c: gastou 2º movimento, x: gastou a ação extra }] (usado pelo Ctrl+Z)

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

/**
 * O ator tem um efeito ativo "Velocidade" ou "Poção de Velocidade"?
 * Ele concede uma ação extra por turno: uma ação padrão OU uma ação de movimento.
 */
const EFEITOS_EXTRA = /^(pocao de )?velocidade$/;
function temExtra(actor) {
  if (!actor) return false;
  let lista;
  try {
    lista = typeof actor.allApplicableEffects === "function" ? Array.from(actor.allApplicableEffects()) : Array.from(actor.effects ?? []);
  } catch (err) {
    lista = Array.from(actor.effects ?? []);
  }
  return lista.some((ef) => !ef.disabled && ef.isSuppressed !== true && EFEITOS_EXTRA.test(normalizar(ef.name ?? ef.label)));
}

/** Quantas ações de movimento o combatente ainda pode ter no total (já gastas + obteníveis). */
function maxMovimentos(e, extra = false) {
  // A ação extra (Velocidade) soma 1 movimento, a menos que já tenha sido gasta como ação padrão.
  const bonus = extra && e.ext !== "padrao" ? 1 : 0;
  if (e.full) return bonus && !e.ext ? 1 : 0;
  // Ações de movimento gastas por poderes/itens/ações da HUD não podem virar deslocamento.
  // A ação padrão só conta como segundo movimento quando foi convertida (conv).
  const gastasPorAtividade = Math.max(0, Number(e.movAtividade) || 0);
  const acaoPadraoNaoConvertida = e.std && !e.conv ? 1 : 0;
  return Math.max(0, 2 + bonus - gastasPorAtividade - acaoPadraoNaoConvertida);
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
/** O personagem usa magias? (tem ao menos uma magia na ficha) */
function usaMagias(actor) {
  try {
    return !!actor?.items?.some?.((i) => ["magia", "spell"].includes(i.type));
  } catch (err) {
    return false;
  }
}

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
/** Bônus de defesa colocado na HUD (guardado como flag do ator; não altera a ficha). */
const defBonus = (actor) => Math.round(Number(actor?.getFlag?.(ID, "defBonus")) || 0);

const TIPOS_DANO = [
  { id: "", nome: "Sem tipo (só RD geral)" },
  { id: "corte", nome: "Corte" },
  { id: "impacto", nome: "Impacto" },
  { id: "perfuracao", nome: "Perfuração" },
  { id: "acido", nome: "Ácido" },
  { id: "eletricidade", nome: "Eletricidade" },
  { id: "essencia", nome: "Essência" },
  { id: "fogo", nome: "Fogo" },
  { id: "frio", nome: "Frio" },
  { id: "luz", nome: "Luz" },
  { id: "mental", nome: "Mental" },
  { id: "psiquico", nome: "Psíquico" },
  { id: "perda", nome: "Perda de PV" },
  { id: "trevas", nome: "Trevas" },
  { id: "veneno", nome: "Veneno" }
];

/**
 * Redução de dano da ficha. Procura em system.tracos.resistencias (e alguns caminhos alternativos).
 * Retorna { achou, geral, tipos: { chave: valor } } ; `achou` = a ficha expõe alguma RD (mesmo zerada).
 */
function lerRD(actor) {
  const s = actor?.system ?? {};
  const fontes = [s.tracos?.resistencias, s.resistencias, s.attributes?.resistencias, s.attributes?.rd, s.rd];
  const tipos = {};
  let achou = false;
  let geralDireto = null;
  for (const f of fontes) {
    if (f === null || f === undefined) continue;
    if (typeof f !== "object") {
      const n = numOuNulo(f);
      if (n !== null) { achou = true; geralDireto = n; }
      continue;
    }
    const direto = numOuNulo(f.value ?? f.total);
    if (direto !== null && !("dano" in f)) { achou = true; geralDireto = direto; }
    for (const [k, v] of Object.entries(f)) {
      const n = numOuNulo(v && typeof v === "object" ? (v.value ?? v.total ?? v.valor) : v);
      if (n === null) continue;
      achou = true;
      const chave = normalizar(k);
      if (!["value", "total", "base", "bonus"].includes(chave) && (tipos[chave] === undefined || n > tipos[chave])) tipos[chave] = n;
    }
  }
  const geral = Math.max(0, tipos.dano ?? tipos.geral ?? tipos.rd ?? tipos.todos ?? geralDireto ?? 0);
  for (const k of ["dano", "geral", "rd", "todos"]) delete tipos[k];
  for (const k of Object.keys(tipos)) if (!(tipos[k] > 0)) delete tipos[k];
  return { achou, geral, tipos };
}

const maiuscula1 = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Extrai nomes de qualquer formato comum de lista (texto, array, Set, { value, custom } ou { chave: true }). */
function nomesDe(v, nivel = 0) {
  if (v === null || v === undefined || nivel > 3) return [];
  if (typeof v === "string") return v.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
  if (Array.isArray(v) || v instanceof Set) return [...v].flatMap((x) => nomesDe(x, nivel + 1));
  if (typeof v === "object") {
    if ("value" in v && (typeof v.value !== "boolean" && typeof v.value !== "number")) {
      return [...nomesDe(v.value, nivel + 1), ...nomesDe(v.custom, nivel + 1)];
    }
    return Object.entries(v)
      .filter(([k, x]) => k !== "custom" && (x === true || (x && typeof x === "object" && x.value === true)))
      .map(([k]) => k)
      .concat(nomesDe(v.custom, nivel + 1));
  }
  return [];
}

/** Imunidades da ficha (a tipos de dano), uma por item. Retorna [{ chave, nome }]. */
function lerImunidades(actor) {
  const s = actor?.system ?? {};
  const fontes = [s.tracos?.imunidades, s.tracos?.di, s.imunidades, s.attributes?.imunidades];
  const vistos = new Map();
  for (const f of fontes) {
    for (const bruto of nomesDe(f)) {
      let nome = String(bruto);
      try { if (/^[\w-]+(\.[\w-]+)+$/.test(nome)) nome = game.i18n.localize(nome); } catch (err) { /* ignora */ }
      const chave = normalizar(nome);
      if (!chave || vistos.has(chave)) continue;
      const tipo = TIPOS_DANO.find((x) => x.id && x.id === chave);
      vistos.set(chave, { chave, nome: tipo?.nome ?? maiuscula1(nome) });
    }
  }
  // formato do sistema T20: system.tracos.resistencias.<tipo>.imunidade
  for (const f of [s.tracos?.resistencias, s.resistencias]) {
    if (!f || typeof f !== "object") continue;
    for (const [k, v] of Object.entries(f)) {
      if (!v || typeof v !== "object") continue;
      const im = v.imunidade ?? v.imune ?? v.immunity;
      if (im !== true && im !== "true" && im !== 1) continue;
      const chave = normalizar(k);
      if (!chave || vistos.has(chave)) continue;
      const tipo = TIPOS_DANO.find((x) => x.id && x.id === chave);
      vistos.set(chave, { chave, nome: tipo?.nome ?? maiuscula1(k) });
    }
  }
  return [...vistos.values()];
}

/** Vulnerabilidades a tipos de dano: system.tracos.resistencias.<tipo>.vulnerabilidade. Retorna [{ chave, nome }]. */
function lerVulnerabilidades(actor) {
  const s = actor?.system ?? {};
  const achados = new Map();
  for (const f of [s.tracos?.resistencias, s.resistencias]) {
    if (!f || typeof f !== "object") continue;
    for (const [k, v] of Object.entries(f)) {
      if (!v || typeof v !== "object") continue;
      const vu = v.vulnerabilidade ?? v.vulneravel ?? v.vulnerability;
      if (vu !== true && vu !== "true" && vu !== 1) continue;
      const chave = normalizar(k);
      if (!chave || achados.has(chave)) continue;
      achados.set(chave, { chave, nome: TIPOS_DANO.find((x) => x.id && x.id === chave)?.nome ?? maiuscula1(k) });
    }
  }
  return [...achados.values()];
}

/** Dano final depois da RD (geral + do tipo), ou sem RD se `ignorar`. */
function calcularDano(actor, bruto, tipo, ignorar = false) {
  const rd = lerRD(actor);
  const rdTipo = tipo ? rd.tipos[tipo] ?? 0 : 0;
  const reducao = ignorar ? 0 : rd.geral + rdTipo;
  // imunidade ao tipo de dano: não é RD, então "ignorar RD" não a anula
  const imune = !!tipo && lerImunidades(actor).some((x) => x.chave === tipo);
  return { bruto, geral: rd.geral, rdTipo, reducao, imune, final: imune ? 0 : Math.max(0, bruto - reducao) };
}

function confirmar(titulo, texto) {
  const D = foundry.applications?.api?.DialogV2;
  if (D?.confirm) return D.confirm({ window: { title: titulo }, content: `<p>${texto}</p>`, rejectClose: false, modal: true });
  return new Promise((res) => Dialog.confirm({ title: titulo, content: `<p>${texto}</p>`, yes: () => res(true), no: () => res(false), close: () => res(false) }));
}

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
  static _foto = null; // PV/PM do último desenho (para detectar perdas e ganhos)
  static _anims = []; // animações de perda/ganho ainda em andamento
  static _dano = { aberto: false, valor: "", tipo: "", ignora: false }; // menu de dano (sobrevive aos redesenhos)

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
  static aplicar(tipo, acao, estado, extra = false) {
    const e = { ...estado };
    if (acao === "gastar") {
      const extraLivre = extra && !e.ext;
      if (tipo === "padrao") {
        if (e.std) {
          if (!extraLivre) return null;
          e.ext = "padrao"; // a ação extra (Velocidade) vale como ação padrão
          return e;
        }
        e.std = true;
        e.conv = false;
      } else if (tipo === "movimento") {
        if (!e.mov) e.mov = true;
        else if (!e.std) {
          e.std = true;
          e.conv = true; // padrão trocada por movimento
        } else if (extraLivre) {
          e.ext = "movimento"; // a ação extra (Velocidade) vale como ação de movimento
        } else return null;
        e.movAtividade = (Number(e.movAtividade) || 0) + 1;
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
      if (e.ext === "padrao") {
        e.ext = null;
        return e;
      }
      if (!e.std || e.conv) return null;
      e.std = false;
    } else if (tipo === "movimento") {
      if (e.ext === "movimento") {
        e.ext = null;
        e.movAtividade = Math.max(0, (Number(e.movAtividade) || 0) - 1);
        return e;
      }
      if (e.conv) {
        e.conv = false;
        e.std = false;
      } else if (e.mov) e.mov = false;
      else return null;
      e.movAtividade = Math.max(0, (Number(e.movAtividade) || 0) - 1);
    } else return null;
    return e;
  }

  static async usar(tipo, acao, nomeItem = null, anunciar = true) {
    const c = this.combatenteAtual();
    if (!c) return false;
    const antes = getEstado(c);
    const extra = temExtra(c.actor);
    let novo;
    let plano = null;
    let ajustaHist = false;
    const capSemExtra = antes.full ? 0 : ((antes.mov ? 1 : 0) + (antes.conv ? 1 : 0)) * quadradosPorAcao(c.actor);
    if (acao === "devolver" && tipo === "movimento" && seguirRegras() && antes.ext === "movimento" &&
        (antes.dist ?? 0) > capSemExtra + 0.001) {
      // A ação extra (Velocidade) foi usada andando: o token volta até onde chegaria sem ela.
      plano = planejarVolta(c.token, antes, capSemExtra);
      novo = { ...antes, ext: null, dist: capSemExtra, hist: plano?.histAndando ?? antes.hist };
      ajustaHist = true;
    } else if (acao === "devolver" && tipo === "movimento" && seguirRegras() && !antes.full &&
        (antes.dist ?? 0) > 0.001 && (antes.mov || antes.conv) &&
        !((Number(antes.movAtividade) || 0) > 0 && (antes.dist ?? 0) <= quadradosPorAcao(c.actor) + 0.001)) {
      // Jogador devolveu uma ação de movimento depois de andar: o token volta pelo caminho percorrido.
      // 2 movimentos usados -> volta até o máximo da 1ª movimentação; 1 movimento -> volta ao início.
      if (antes.conv) {
        const alvoS = Math.min(quadradosPorAcao(c.actor), antes.dist ?? 0);
        plano = planejarVolta(c.token, antes, alvoS);
        novo = { ...antes, conv: false, std: false, dist: alvoS, hist: plano?.histAndando ?? antes.hist };
      } else {
        plano = planejarVolta(c.token, antes, 0);
        novo = { ...antes, mov: false, movAtividade: 0, dist: 0, hist: [] };
      }
    } else {
      novo = this.aplicar(tipo, acao, antes, extra);
    }
    if (!novo) {
      if (acao === "gastar") ui.notifications.warn(`${c.name} não tem ${NOMES[tipo]} disponível.`);
      return false;
    }
    if (acao === "devolver") USO_ITEM.itens.clear();
    if (acao === "devolver" && tipo !== "padrao") {
      const gastas = (novo.mov ? 1 : 0) + (novo.conv ? 1 : 0) + (novo.ext === "movimento" ? 1 : 0);
      novo.dist = Math.min(novo.dist ?? 0, gastas * quadradosPorAcao(c.actor));
    }
    try {
      ESTADO_RECENTE.delete(c.id);
      if (!plano && acao === "devolver" && tipo === "movimento") {
        dbg(seguirRegras() ? "devolver movimento: sem plano de volta" : "devolver movimento: Mestre (token não se move; ative o modo de teste para ver a volta)", { dist: antes.dist, hist: antes.hist });
      }
      if (plano) {
        const modo = await executarVolta(c.token, plano);
        if (antes.conv || ajustaHist) novo.hist = modo === "nativo" ? plano.histNativo : plano.histAndando;
      }
      await c.setFlag(ID, FLAG, novo);
      if (acao === "gastar" && anunciar && game.settings.get(ID, "anunciarChat")) {
        const usouExtra = novo.ext && !antes.ext;
        const usada = usouExtra
          ? `a ação extra da Velocidade (como ${NOMES[novo.ext]})`
          : tipo === "movimento" && novo.conv ? "uma 2ª ação de movimento (no lugar da padrão)" : `uma ${NOMES[tipo]}`;
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

    const novo = this.aplicar(tipo, "gastar", getEstado(c), temExtra(c.actor));
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
      const des = ev.target.closest("[data-desfazer]");
      if (des && el.contains(des)) {
        ev.preventDefault();
        ev.stopPropagation();
        this.usar(des.dataset.desfazer, "devolver");
        return;
      }
      const b = ev.target.closest("button");
      if (!b || !el.contains(b)) return;
      if (b.dataset.defstep) return void this.passoDefBonus(Number(b.dataset.defstep));
      if (b.dataset.i !== undefined) MenuAcoes.executar(b.dataset.cat, Number(b.dataset.i));
      else if (b.dataset.aa) MenuAcoes.alternarCategoria(b.dataset.aa);
      else if (b.dataset.tipo) this.usar(b.dataset.tipo, "gastar");
      else if (b.dataset.acao === "reset") this.reiniciar();
      else if (b.dataset.acao === "passar") this.passarTurno();
      else if (b.dataset.acao === "visual") abrirVisualHud(b);
      else if (b.dataset.acao === "tempo") this.definirTempo();
      else if (b.dataset.acao === "limitarMov") {
        if (game.user.isGM) game.settings.set(ID, "gastoMovimentoMestre", !cfg("gastoMovimentoMestre"));
      }
      else if (b.dataset.acao === "som") this.alternarVolume(b);
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
      const db = ev.target.closest?.("input[data-defbonus]");
      if (db) this.editarDefBonus(db);
    });
    el.addEventListener("keydown", (ev) => {
      if (!ev.target.matches?.("input[data-rec], input[data-defbonus]")) return;
      if (ev.key === "Enter") ev.target.blur();
      else if (ev.key === "Escape") {
        ev.target.value = ev.target.defaultValue;
        ev.target.blur();
      }
    });
    el.addEventListener("focusin", (ev) => {
      if (ev.target.matches?.("input[data-rec], input[data-defbonus]")) ev.target.select();
    });
    el.addEventListener("focusout", () => {
      if (this._pendente) {
        this._pendente = false;
        setTimeout(() => this.render(), 80);
      }
    });
    // regra da ação ao passar o mouse (painel de ações do layout largo)
    el.addEventListener("mousemove", (ev) => {
      const a = ev.target.closest?.("[data-i]");
      if (!a) return MenuAcoes.esconderTip();
      MenuAcoes.dicaPara(a, ev);
    });
    el.addEventListener("mouseleave", () => MenuAcoes.esconderTip());
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button === 0 && ev.target.closest(".t20ah-cabeca")) this.iniciarArraste(ev);
    });
    el.addEventListener("dblclick", (ev) => {
      if (ev.target.closest(".t20ah-cabeca") && !ev.target.closest("button")) {
        game.settings.set(ID, "posicao", {});
      }
    });

    this.el = el;
    new ResizeObserver(() => MenuAcoes.posicionar()).observe(el); // acompanha recolher/expandir
    return el;
  }

  static pip(classe) {
    return `<span class="pip ${classe}"></span>`;
  }

  static tile(tipo, icone, rotulo, dica, { gasto, ativa = false, pips, semDesfazer = false }) {
    // a Completa mostra pips das outras ações; só ganha o botão se ela mesma foi gasta
    const desfazer = !semDesfazer && (tipo === "completa" ? !!ativa : gasto || String(pips).includes("pip on"));
    // o botão de desfazer fica FORA do <button> do tile (controle dentro de botão perde o clique em alguns navegadores)
    return `
      <div class="t20ah-celula">
        <button type="button" class="t20ah-tile ${tipo} ${gasto ? "gasto" : ""} ${ativa ? "ativa" : ""}"
                data-tipo="${tipo}" title="${dica}" aria-disabled="${gasto}">
          <i class="fa-solid ${icone}"></i>
          <span class="t20ah-rotulo">${rotulo}</span>
          <span class="t20ah-pips">${pips}</span>
        </button>
        ${desfazer ? `<button type="button" class="t20ah-desfazer" data-desfazer="${tipo}" title="Devolver esta ação (desfazer o gasto)"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
      </div>`;
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

  static linhaRecurso(actor, chave, icone, rotulo, anims = []) {
    const r = lerRecurso(actor, chave);
    if (!r) return "";
    const pct = r.max > 0 ? clamp((r.value / r.max) * 100, 0, 100) : 0;
    const campo = (nome, valor, dica) =>
      `<input type="text" inputmode="numeric" autocomplete="off" data-rec="${chave}" data-campo="${nome}" value="${valor}" title="${dica}">`;

    // animações de perda e ganho (continuam de onde pararam se a HUD for redesenhada no meio delas)
    const agora = Date.now();
    const doValor = anims.filter((x) => x.rec === chave && x.campo === "value");
    const doTemp = anims.filter((x) => x.rec === chave && x.campo === "temp");
    const flutua = (lista) =>
      lista
        .map((x) => {
          const ganho = x.tipo === "ganho";
          return `<span class="rec-flutua ${x.campo}${ganho ? " ganho" : ""}" style="--atraso:-${Math.max(0, agora - x.t0)}ms">${ganho ? "+" : "−"}${x.delta}</span>`;
        })
        .join("");
    const maisRecente = (lista) => [...lista].sort((a, b) => b.t0 - a.t0)[0];
    const aV = maisRecente(doValor);
    const aT = maisRecente(doTemp);
    const perdaValor = aV?.tipo === "perda";
    const ganhoValor = aV?.tipo === "ganho";
    const ghost = perdaValor
      ? `<div class="ghost" style="--de:${r.max > 0 ? clamp((aV.de / r.max) * 100, 0, 100) : 0}%;--para:${pct}%;--atraso:-${Math.max(0, agora - aV.t0)}ms"></div>`
      : "";
    // ganho: a barra enche do valor antigo até o novo
    const estiloFill = ganhoValor
      ? ` style="width:${pct}%;--de:${r.max > 0 ? clamp((aV.de / r.max) * 100, 0, 100) : 0}%;--para:${pct}%;--atraso:-${Math.max(0, agora - aV.t0)}ms"`
      : ` style="width:${pct}%"`;
    const recente = maisRecente([...doValor, ...doTemp]);
    const classes = [
      perdaValor ? "dano-valor" : "",
      ganhoValor ? "cura-valor" : "",
      aT?.tipo === "perda" ? "dano-temp" : "",
      aT?.tipo === "ganho" ? "cura-temp" : ""
    ].join(" ");
    const estiloLinha = recente ? ` style="--atraso-linha:-${Math.max(0, agora - recente.t0)}ms"` : "";

    return `
      <div class="t20ah-rec ${chave} ${classes}"${estiloLinha}>
        <i class="fa-solid ${icone} rec-ico" title="${rotulo}"></i>
        <div class="trilho" title="${rotulo}: ${r.value} / ${r.max}">${ghost}<div class="fill"${estiloFill}></div></div>
        <span class="rec-val">${campo("value", r.value, `${rotulo} atual — digite um número, ou +5 / -5 para somar ou subtrair`)}<span class="max">/ ${r.max}</span>${flutua(doValor)}</span>
        <span class="rec-temp" title="${rotulo} temporário"><span class="temp-ico"><i class="fa-solid ${icone}"></i><i class="fa-solid fa-hourglass-half badge"></i></span>${campo("temp", r.temp, `${rotulo} temporário`)}${flutua(doTemp)}</span>
      </div>`;
  }

  /* ---------- Gaveta de dano (painel que desliza da esquerda da HUD) ---------- */

  static garantirGaveta() {
    if (this.gaveta?.isConnected) return this.gaveta;
    const g = document.createElement("aside");
    g.id = "t20ah-gaveta";
    g.classList.add("oculto");
    document.body.appendChild(g);
    this.gaveta = g;

    g.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b || !g.contains(b)) return;
      const a = b.dataset.acao;
      if (a === "dano-menu") {
        this._dano.aberto = !this._dano.aberto;
        g.classList.toggle("aberta", this._dano.aberto);
        this.posicionarGaveta();
      } else if (a === "dano-aplicar") this.aplicarDano();
      else if (a === "vida-curar") this.ajustarPeloValor("curar");
      else if (a === "pm-gastar") this.ajustarPeloValor("gastar-pm");
      else if (a === "pm-receber") this.ajustarPeloValor("receber-pm");
      else if (a === "dano-zerar") this.vidaTotal("zerar");
      else if (a === "dano-curar-tudo") this.vidaTotal("curar");
    });
    const ler = (ev) => {
      const dn = ev.target.closest?.("[data-dano]");
      if (dn) this.lerCampoDano(dn);
    };
    g.addEventListener("input", ler);
    g.addEventListener("change", ler);
    g.addEventListener("keydown", (ev) => {
      if (!ev.target.matches?.('input[data-dano="valor"]')) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.aplicarDano();
      } else if (ev.key === "Escape") ev.target.blur();
    });
    g.addEventListener("focusin", (ev) => {
      if (ev.target.matches?.('input[data-dano="valor"]')) ev.target.select();
    });
    window.addEventListener("resize", () => this.posicionarGaveta());
    return g;
  }

  /** Mostra/esconde a gaveta junto com a HUD e refaz o conteúdo só quando troca o personagem. */
  static renderGaveta() {
    const g = this.garantirGaveta();
    const t = this.alvo();
    const hud = this.el;
    const visivel = !!t && !!hud && !hud.classList.contains("oculto") && !hud.classList.contains("recolhido");
    hud?.classList.toggle("com-gaveta", visivel);
    if (!visivel) {
      g.classList.add("oculto");
      return;
    }
    g.classList.remove("oculto");
    g.classList.toggle("aberta", !!this._dano.aberto);
    const id = `${t.actor.uuid ?? t.actor.id}:${game.user.isGM}:${!!lerRecurso(t.actor, "pm")}`;
    if (this._gavetaAtor !== id || !g.querySelector(".gv-corpo")) {
      this._gavetaAtor = id;
      g.innerHTML = `
        <button type="button" class="gv-aba" data-acao="dano-menu" title="Gaveta: dano, cura e mana">
          <i class="fa-solid fa-burst"></i><span class="gv-txt">Dano</span><i class="fa-solid fa-chevron-left gv-seta"></i>
        </button>
        <div class="gv-corpo"><div class="gv-interno">${this.htmlDano(t.actor)}</div></div>`;
    } else {
      // mantém o que está sendo digitado; só sincroniza o valor quando o campo não está em foco
      const campo = g.querySelector('[data-dano="valor"]');
      if (campo && document.activeElement !== campo && campo.value !== String(this._dano.valor)) campo.value = this._dano.valor;
      this.atualizarPreviaDano();
    }
    this.posicionarGaveta();
    this.seguirGaveta();
  }

  /**
   * Ao trocar a seleção a HUD muda de altura/posição depois do render (imagens, fontes, animações). A gaveta
   * acompanha: observa o tamanho da HUD e reposiciona a cada quadro por um instante.
   */
  static seguirGaveta() {
    const hud = this.el;
    if (hud && this._roHud !== hud && typeof ResizeObserver !== "undefined") {
      this._roHud?.disconnect?.();
      this._roObs?.disconnect?.();
      this._roObs = new ResizeObserver(() => this.posicionarGaveta());
      this._roObs.observe(hud);
      this._roHud = hud;
    }
    // vigia enquanto a gaveta estiver visível: qualquer mudança de posição/tamanho da HUD (animações, imagens, fontes)
    // é acompanhada no quadro seguinte. Só escreve no DOM quando algo mudou.
    if (this._vigiaGaveta) return;
    this._vigiaGaveta = true;
    const passo = () => {
      if (!this.gaveta || this.gaveta.classList.contains("oculto") || !this.gaveta.isConnected) {
        this._vigiaGaveta = false;
        return;
      }
      this.posicionarGaveta();
      this._rafGaveta = requestAnimationFrame(passo);
    };
    this._rafGaveta = requestAnimationFrame(passo);
  }

  /** Cola a gaveta na borda esquerda da HUD, com a mesma altura (e acompanha o arraste e o tamanho). */
  static posicionarGaveta() {
    const g = this.gaveta;
    const hud = this.el;
    if (!g || !hud || g.classList.contains("oculto")) return;
    const r = hud.getBoundingClientRect();
    const esc = hud.style.getPropertyValue("--esc") || 1;
    const top = `${r.top}px`;
    const height = `${r.height}px`;
    const right = `${document.documentElement.clientWidth - r.left - 1}px`; // 1px por baixo da HUD: sem vão
    if (g.style.getPropertyValue("--esc") !== String(esc)) g.style.setProperty("--esc", esc);
    if (g.style.top !== top) g.style.top = top;
    if (g.style.height !== height) g.style.height = height;
    if (g.style.right !== right) g.style.right = right;
  }

  static lerCampoDano(campo) {
    const k = campo.dataset.dano;
    if (k === "ignora") this._dano.ignora = campo.checked;
    else this._dano[k] = campo.value;
    this.atualizarPreviaDano();
  }

  /** Botões − / + do bônus de defesa: soma ou subtrai 1. */
  static async passoDefBonus(passo) {
    const t = this.alvo();
    if (!t) return;
    const novo = defBonus(t.actor) + passo;
    try {
      if (novo === 0) await t.actor.unsetFlag(ID, "defBonus");
      else await t.actor.setFlag(ID, "defBonus", novo);
    } catch (err) {
      console.error(`${ID} | erro ao salvar o bônus de defesa`, err);
      ui.notifications.error("Sem permissão para alterar este personagem.");
    }
    this.render();
  }

  /** Edita o bônus de defesa da HUD. Aceita "2", "+1" ou "-1". */
  static async editarDefBonus(inp) {
    const t = this.alvo();
    if (!t) return;
    const txt = inp.value.trim().replace(",", ".").replace("−", "-");
    const atual = defBonus(t.actor);
    let novo;
    if (txt === "") novo = 0; // campo apagado volta a 0
    else if (/^[+-]\d+(\.\d+)?$/.test(txt)) novo = atual + Number(txt);
    else if (/^-?\d+(\.\d+)?$/.test(txt)) novo = Number(txt);
    else return this.render();
    novo = Math.round(novo);
    if (novo === atual) return this.render();
    try {
      if (novo === 0) await t.actor.unsetFlag(ID, "defBonus");
      else await t.actor.setFlag(ID, "defBonus", novo);
    } catch (err) {
      console.error(`${ID} | erro ao salvar o bônus de defesa`, err);
      ui.notifications.error("Sem permissão para alterar este personagem.");
    }
    this.render();
  }

  /** Menu de dano (expansível): valor, tipo e, só para o Mestre, zerar PV e curar tudo. */
  static htmlDano(actor) {
    const d = this._dano;
    const gm = game.user.isGM;
    const pm = lerRecurso(actor, "pm");
    return `
      <div class="t20ah-dano">
        <div class="dn-titulo"><i class="fa-solid fa-burst"></i> Dano, cura e mana</div>
        <div class="dn-linha">
          <input type="text" inputmode="numeric" autocomplete="off" data-dano="valor" placeholder="Valor" value="${esc(d.valor)}" title="Valor usado em todos os botões abaixo (dano, cura e mana)">
          <select data-dano="tipo" title="Tipo do dano (usado só em Causar dano)">${TIPOS_DANO.map((x) => `<option value="${x.id}" ${x.id === d.tipo ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>
        </div>
        <label class="dn-ign"><input type="checkbox" data-dano="ignora" ${d.ignora ? "checked" : ""}> Ignorar a redução de dano</label>
        <div class="dn-previa js-dn-previa">${this.textoPreviaDano(actor)}</div>
        <div class="dn-botoes">
          <button type="button" class="dn-aplicar" data-acao="dano-aplicar" title="Causa o dano (descontando a RD) nos PV temporários e depois nos PV"><i class="fa-solid fa-burst"></i> Causar dano</button>
          <button type="button" class="dn-cura" data-acao="vida-curar" title="Recupera esta quantidade de PV (até o máximo)"><i class="fa-solid fa-heart-pulse"></i> Curar</button>
          ${pm ? `
          <button type="button" class="dn-pm-gasta" data-acao="pm-gastar" title="Gasta esta quantidade de PM (primeiro os temporários)"><i class="fa-solid fa-hand-sparkles"></i> Gastar PM</button>
          <button type="button" class="dn-pm-ganha" data-acao="pm-receber" title="Recupera esta quantidade de PM (até o máximo)"><i class="fa-solid fa-wand-sparkles"></i> Receber PM</button>` : ""}
        </div>
        ${gm ? `
        <div class="dn-botoes dn-mestre">
          <button type="button" class="dn-gm dn-zerar" data-acao="dano-zerar" title="Mestre: zera os PV e os PV temporários"><i class="fa-solid fa-skull"></i> Zerar vida</button>
          <button type="button" class="dn-gm dn-curar" data-acao="dano-curar-tudo" title="Mestre: devolve todos os PV"><i class="fa-solid fa-heart-circle-check"></i> Curar tudo</button>
        </div>` : ""}
      </div>`;
  }

  static textoPreviaDano(actor) {
    const d = this._dano;
    const n = Math.round(Number(String(d.valor).replace(",", ".")));
    if (!Number.isFinite(n) || n <= 0) return "Informe o valor do dano.";
    const c = calcularDano(actor, n, d.tipo, d.ignora);
    if (c.imune) return `Imune a <b>${esc(TIPOS_DANO.find((x) => x.id === d.tipo)?.nome ?? d.tipo)}</b>: dano final <b>0</b>`;
    if (!c.reducao) return `Dano final: <b>${c.final}</b>${d.ignora ? " (RD ignorada)" : ""}`;
    return `Dano final: <b>${c.final}</b> <small>(${n} − RD ${c.reducao}${c.rdTipo ? `: ${c.geral} geral + ${c.rdTipo} do tipo` : ""})</small>`;
  }

  static atualizarPreviaDano() {
    const t = this.alvo();
    const el = this.el?.querySelector(".js-dn-previa");
    if (t && el) el.innerHTML = this.textoPreviaDano(t.actor);
  }

  /** Aplica dano: desconta a RD, tira primeiro dos PV temporários e depois dos PV. */
  static async aplicarDano() {
    const t = this.alvo();
    if (!t) return;
    const d = this._dano;
    const bruto = Math.round(Number(String(d.valor).replace(",", ".")));
    if (!Number.isFinite(bruto) || bruto <= 0) return ui.notifications.warn("Informe um valor de dano maior que zero.");
    const pv = lerRecurso(t.actor, "pv");
    if (!pv) return ui.notifications.warn("Não encontrei os PV deste personagem.");
    const c = calcularDano(t.actor, bruto, d.tipo, d.ignora);
    const absorvido = Math.min(pv.temp, c.final);
    const noPv = c.final - absorvido;
    try {
      await t.actor.update({
        [`${pv.caminho}.temp`]: pv.temp - absorvido,
        [`${pv.caminho}.value`]: pv.value - noPv
      });
    } catch (err) {
      console.error(`${ID} | erro ao causar dano`, err);
      return ui.notifications.error("Sem permissão para alterar este personagem.");
    }
    this._dano.valor = "";
    const campoValor = this.gaveta?.querySelector('[data-dano="valor"]');
    if (campoValor) campoValor.value = "";
    this.render();
  }

  /** Valor positivo digitado na gaveta (ou null, com aviso). */
  static valorDaGaveta() {
    const n = Math.round(Number(String(this._dano.valor).replace(",", ".")));
    if (!Number.isFinite(n) || n <= 0) {
      ui.notifications.warn("Informe um valor maior que zero.");
      return null;
    }
    return n;
  }

  /** Cura PV, gasta PM ou recupera PM pelo valor digitado. modo: "curar" | "gastar-pm" | "receber-pm". */
  static async ajustarPeloValor(modo) {
    const t = this.alvo();
    if (!t) return;
    const v = this.valorDaGaveta();
    if (v === null) return;
    const chave = modo === "curar" ? "pv" : "pm";
    const r = lerRecurso(t.actor, chave);
    if (!r) return ui.notifications.warn(`Não encontrei ${chave === "pv" ? "os PV" : "os PM"} deste personagem.`);
    const rot = chave === "pv" ? "PV" : "PM";
    const up = {};
    if (modo === "gastar-pm") {
      const total = r.value + r.temp;
      if (v > total) return ui.notifications.warn(`PM insuficientes: ${t.doc.name ?? t.actor.name} tem ${total}.`);
      const doTemp = Math.min(r.temp, v);
      up[`${r.caminho}.temp`] = r.temp - doTemp;
      up[`${r.caminho}.value`] = r.value - (v - doTemp);
    } else {
      const novo = r.max > 0 ? Math.min(r.max, r.value + v) : r.value + v;
      if (novo === r.value) return ui.notifications.info(`${rot} já estão no máximo.`);
      up[`${r.caminho}.value`] = novo;
    }
    try {
      await t.actor.update(up);
    } catch (err) {
      console.error(`${ID} | erro ao ajustar ${rot}`, err);
      return ui.notifications.error("Sem permissão para alterar este personagem.");
    }
    this._dano.valor = "";
    const campoValor = this.gaveta?.querySelector('[data-dano="valor"]');
    if (campoValor) campoValor.value = "";
    this.render();
  }

  /** Mestre: zera os PV (e os temporários) ou devolve todos os PV. */
  static async vidaTotal(modo) {
    if (!game.user.isGM) return;
    const t = this.alvo();
    if (!t) return;
    const pv = lerRecurso(t.actor, "pv");
    if (!pv) return ui.notifications.warn("Não encontrei os PV deste personagem.");
    const nome = t.doc.name ?? t.actor.name;
    const zerar = modo === "zerar";
    const ok = await confirmar(zerar ? "Zerar vida" : "Curar tudo", zerar ? `Zerar os PV e os PV temporários de <b>${esc(nome)}</b>?` : `Devolver todos os PV de <b>${esc(nome)}</b> (${pv.max})?`);
    if (!ok) return;
    try {
      await t.actor.update(zerar ? { [`${pv.caminho}.value`]: 0, [`${pv.caminho}.temp`]: 0 } : { [`${pv.caminho}.value`]: pv.max });
    } catch (err) {
      console.error(`${ID} | erro ao alterar a vida`, err);
      return ui.notifications.error("Não foi possível alterar a vida.");
    }
    this.render();
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
    if (txt === "") novo = 0; // campo apagado = 0
    else if (/^[+-]\d+(\.\d+)?$/.test(txt)) novo = atual + Number(txt);
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
      this._foto = null;
      this._anims = [];
      this.renderGaveta();
      MenuAcoes.sincronizar();
      return;
    }
    // não reconstrói a HUD enquanto o jogador digita
    if (el.contains(document.activeElement) && document.activeElement?.matches?.("input")) {
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
    const defBase = defesaTotal(actor);
    const bonusDef = defBonus(actor);
    const def = defBase != null ? defBase + bonusDef : null;
    const rd = lerRD(actor);
    const imunes = lerImunidades(actor);
    const nomeTipo = (k) => TIPOS_DANO.find((x) => x.id === k)?.nome ?? maiuscula1(k);
    const tipoRD = Object.entries(rd.tipos);
    const chipsRD = [];
    const ICONE_DANO = {
      corte: "fa-slash", impacto: "fa-hammer", perfuracao: "fa-arrow-up", acido: "fa-flask", eletricidade: "fa-bolt",
      essencia: "fa-wand-magic-sparkles", fogo: "fa-fire", frio: "fa-snowflake", luz: "fa-sun", mental: "fa-brain", psiquico: "fa-brain", perda: "fa-heart-crack",
      trevas: "fa-moon", veneno: "fa-skull-crossbones"
    };
    const PATH_ESCUDO = "M12 1.2 22 4.6V13c0 6.6-4.3 11.2-10 13.8C6.3 24.2 2 19.6 2 13V4.6z";
    /** Escudo com o ícone do tipo de dano em cima e o valor da RD dentro (ou um bloqueio, se for imune). */
    const escudoRD = ({ tipo, icone, valor, imune, vulneravel, titulo }) =>
      `<span class="rd-escudo ${imune ? "imune" : ""} ${vulneravel ? "vulneravel" : ""} ${tipo ? "t-" + esc(tipo) : "geral"}" title="${esc(titulo)}">` +
      `<i class="rd-tipo fa-solid ${icone}"></i>` +
      `<span class="rd-corpo"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="${PATH_ESCUDO}"/></svg>` +
      (vulneravel ? `<svg class="rd-rachadura" viewBox="0 0 24 28" aria-hidden="true"><path d="M13.5 3 10 10.5l4 3-4.5 5L12 25"/></svg><i class="rd-frac fa-solid fa-angles-down"></i>` : "") +
      (vulneravel ? "" : imune ? `<i class="rd-ban fa-solid fa-ban"></i>` : `<b class="n${String(valor).length}">${valor}</b>`) +
      `</span></span>`;
    const imunesMap = new Map(imunes.map((x) => [x.chave, x]));
    if (rd.geral) chipsRD.push(escudoRD({ icone: "fa-shield-halved", valor: rd.geral, titulo: `Redução de dano geral: ${rd.geral}` }));
    for (const [k, v] of tipoRD) {
      const imune = imunesMap.has(k);
      imunesMap.delete(k);
      chipsRD.push(escudoRD({
        tipo: k, icone: ICONE_DANO[k] ?? "fa-droplet", valor: v, imune,
        titulo: imune ? `Imune a dano de ${nomeTipo(k)}` : `Redução de dano de ${nomeTipo(k)}: ${v}`
      }));
    }
    // imunidades sem RD do mesmo tipo
    for (const [k, x] of imunesMap) {
      chipsRD.push(escudoRD({
        tipo: ICONE_DANO[k] ? k : "", icone: ICONE_DANO[k] ?? "fa-ban", imune: true, titulo: `Imunidade a dano de ${x.nome}`
      }));
    }
    // vulnerabilidades (a imunidade ao mesmo tipo prevalece)
    const imunesChaves = new Set(imunes.map((x) => x.chave));
    for (const x of lerVulnerabilidades(actor)) {
      if (imunesChaves.has(x.chave)) continue;
      chipsRD.push(escudoRD({
        tipo: ICONE_DANO[x.chave] ? x.chave : "", icone: ICONE_DANO[x.chave] ?? "fa-droplet", vulneravel: true,
        titulo: `Vulnerável a dano de ${x.nome}`
      }));
    }
    if (rd.achou && !chipsRD.length) chipsRD.push(escudoRD({ icone: "fa-shield-halved", valor: 0, titulo: "Redução de dano da ficha: nenhuma" }));
    const chips = [
      def != null
        ? `<span class="def-grupo" title="Defesa e bônus de defesa"><span class="def-escudo n${String(def).length}" title="Defesa total: ${defBase} da ficha${bonusDef ? ` ${bonusDef > 0 ? "+" : "−"} ${Math.abs(bonusDef)} de bônus da HUD` : ""}"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.2 22 4.6V13c0 6.6-4.3 11.2-10 13.8C6.3 24.2 2 19.6 2 13V4.6z"/></svg><b>${def}</b></span>` +
          `<span class="chip defb ${bonusDef ? "ativo" : ""}" title="Bônus de defesa (só na HUD, não altera a ficha). Digite um valor, ou +2 / -2 para somar."><button type="button" class="defstep" data-defstep="-1" title="Diminuir 1">−</button><input type="text" inputmode="numeric" autocomplete="off" data-defbonus value="${bonusDef}"><button type="button" class="defstep" data-defstep="1" title="Aumentar 1">+</button></span></span>`
        : "",
      ...chipsRD,
      cd != null && usaMagias(actor)
        ? `<span class="rd-escudo cd-selo" title="CD das magias: ${cd}"><i class="rd-tipo fa-solid fa-wand-sparkles"></i>` +
          `<span class="rd-corpo"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1 22.5 7v14L12 27 1.5 21V7z"/></svg><b class="n${String(cd).length}">${cd}</b></span></span>`
        : ""
    ].join("");
    // ----- perdas e ganhos de PV/PM (e temporários): comparam com o último desenho do mesmo personagem -----
    const agoraAnim = Date.now();
    const foto = {
      pv: pv ? { v: pv.value, t: pv.temp, max: pv.max } : null,
      pm: pm ? { v: pm.value, t: pm.temp, max: pm.max } : null
    };
    const idAtor = actor.uuid ?? actor.id ?? actor.name;
    if (this._foto && this._foto.ator === idAtor) {
      for (const k of ["pv", "pm"]) {
        const antes = this._foto[k];
        const agoraV = foto[k];
        if (!antes || !agoraV) continue;
        for (const [campo, a, b] of [["value", antes.v, agoraV.v], ["temp", antes.t, agoraV.t]]) {
          if (a === b) continue;
          const tipo = b < a ? "perda" : "ganho";
          // uma mudança no sentido contrário substitui a animação anterior do mesmo campo
          this._anims = this._anims.filter((x) => !(x.rec === k && x.campo === campo && x.tipo !== tipo));
          this._anims.push({ rec: k, campo, tipo, delta: Math.abs(b - a), de: a, para: b, t0: agoraAnim });
        }
      }
    } else {
      this._anims = [];
    }
    this._foto = { ator: idAtor, ...foto };
    this._anims = this._anims.filter((x) => agoraAnim - x.t0 < ANIM_MS);
    const danoResumo = (k) => {
      const recente = this._anims.filter((x) => x.rec === k).sort((a, b) => b.t0 - a.t0)[0];
      return recente ? ` ${recente.tipo === "ganho" ? "cura" : "dano"}" style="--atraso:-${Math.max(0, agoraAnim - recente.t0)}ms` : "";
    };

    const recursos =
      this.linhaRecurso(actor, "pv", "fa-heart", "PV", this._anims) +
      this.linhaRecurso(actor, "pm", "fa-wand-sparkles", "PM", this._anims);
    const resumoRec = [
      pv ? `<span class="pv${danoResumo("pv")}"><i class="fa-solid fa-heart"></i> ${pv.value}${pv.temp ? `+${pv.temp}` : ""}/${pv.max}</span>` : "",
      pm ? `<span class="pm${danoResumo("pm")}"><i class="fa-solid fa-wand-sparkles"></i> ${pm.value}${pm.temp ? `+${pm.temp}` : ""}/${pm.max}</span>` : "",
      def != null ? `<span class="def"><i class="fa-solid fa-shield"></i> ${def}</span>` : ""
    ].join("");

    // ----- ações (só no turno do token) -----
    // Em combate (no turno ou não): layout largo, com o painel de ações ao lado, tudo numa HUD só.
    const largo = !!c && MenuAcoes.habilitado() && cfg("layoutCombate") === "largo";
    if (largo) MenuAcoes.catAberta = null; // o menu flutuante não é usado neste layout
    const menuLinha = MenuAcoes.habilitado() && !largo
      ? `<div class="t20ah-livro">${CATEGORIAS_ACOES.map(
          (cat) => `
          <button type="button" class="lv-btn ${MenuAcoes.catAberta === cat.id ? "ativo" : ""}" data-aa="${cat.id}"
                  style="--cor:${cat.cor}" title="${esc(cat.nome)}: consultar e usar">
            <i class="fa-solid ${cat.icone}"></i><span>${esc(cat.curto)}</span>
          </button>`
        ).join("")}</div>`
      : "";
    let acoes = "";
    let resumoAcoes = "";
    let btnsTurno = "";
    if (turno) {
      const e = getEstado(c);
      const limitar = cfg("limitarMovimento") && (!game.user.isGM || cfg("gastoMovimentoMestre") || cfg("regrasParaMestre"));
      const porAcao = quadradosPorAcao(actor);
      const extra = temExtra(actor);
      const capQuad = e.corrida ? e.corrida.max : maxMovimentos(e, extra) * porAcao;
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
      const semLimite = !(Number(cfg("tempoMaximo")) > 0);
      const tempoHtml = semLimite
        ? ""
        : `
        <div class="t20ah-tempo">
          <div class="trilho"><div class="fill"></div></div>
          <span class="js-tempo-txt">00:00</span>
          <button type="button" class="t20ah-mini" data-acao="som" title="Volume do alerta (clique para ajustar)"><i class="fa-solid ${cfg("somVolume") <= 0 ? "fa-volume-xmark" : cfg("somVolume") < 0.5 ? "fa-volume-low" : "fa-volume-high"}"></i></button>
        </div>`;
      const tiles = [
        this.tile("padrao", "fa-hand-fist", "Padrão", "Clique: gastar • Botão direito: devolver", {
          gasto: e.std,
          semDesfazer: !!e.full, // com a Completa gasta, o desfazer é o dela
          pips: this.pip(e.std ? "on" : "")
        }),
        this.tile("movimento", "fa-person-running", "Movimento", "Clique: gastar (2ª vez troca a padrão) • Botão direito: devolver", {
          gasto: e.mov && e.std,
          semDesfazer: !!e.full,
          pips: this.pip(e.mov ? "on" : "") + this.pip(e.conv ? "on" : e.std ? "bloq" : "")
        }),
        this.tile("completa", "fa-burst", "Completa", "Gasta padrão + movimento • Botão direito: devolver", {
          gasto: e.std || e.mov,
          ativa: e.full,
          pips: this.pip(e.full ? "on" : "") + this.pip(e.full ? "on" : "")
        })
      ].join("");
      const tileExtra = extra
        ? `<div class="t20ah-tile extra ${e.ext ? "gasto" : ""}" title="Velocidade: uma ação padrão ou de movimento extra. Gasta sozinha quando a padrão ou o movimento acabam.">
             <i class="fa-solid fa-bolt"></i>
             <span class="t20ah-rotulo">Extra${e.ext ? ` (${e.ext === "padrao" ? "padrão" : "mov."})` : ""}</span>
             <span class="t20ah-pips">${this.pip(e.ext ? "on" : "")}</span>
           </div>`
        : "";
      acoes = `
        <div class="t20ah-sep"></div>
        <div class="t20ah-botoes ${extra ? "com-extra" : ""}">${tiles}${tileExtra}</div>
        ${tempoHtml}
        ${barra}
        ${menuLinha}
        <button type="button" class="t20ah-passar" data-acao="passar" title="Passa a vez para o próximo combatente">
          <i class="fa-solid fa-forward-step"></i> Encerrar turno
        </button>
        <footer class="t20ah-rodape"><i class="fa-solid fa-bolt"></i> Ações livres e reações: sem limite</footer>`;
      resumoAcoes = `
        <i class="fa-solid fa-hand-fist ico-acao padrao ${!e.std ? "livre" : ""}" title="Ação padrão"></i>
        <i class="fa-solid fa-person-running ico-acao movimento ${!e.mov || !e.std ? "livre" : ""}" title="Ação de movimento"></i>
        ${extra ? `<i class="fa-solid fa-bolt ico-acao extra ${!e.ext ? "livre" : ""}" title="Ação extra (Velocidade)"></i>` : ""}
        <span class="t20ah-tempo-mini js-tempo-txt"></span>`;
      btnsTurno = `
        <button type="button" class="t20ah-mini passar-mini" data-acao="passar" title="Encerrar turno"><i class="fa-solid fa-forward-step"></i></button>
        <button type="button" class="t20ah-mini" data-acao="reset" title="Reiniciar ações"><i class="fa-solid fa-rotate-left"></i></button>`;
    } else if (c) {
      acoes = `<div class="t20ah-espera"><i class="fa-solid fa-hourglass-start"></i> Aguardando o turno</div>${menuLinha}`;
    } else if (menuLinha) {
      acoes = `<div class="t20ah-sep"></div>${menuLinha}`;
    }

    const sub = turno ? "Turno de" : c ? "Em combate" : "Selecionado";
    el.style.setProperty("--esc", escala);
    el.classList.toggle("recolhido", recolhido);
    el.classList.toggle("em-turno", turno);
    el.classList.toggle("largo", largo);
    const minis = `
        ${game.user.isGM ? `<button type="button" class="t20ah-mini" data-acao="tempo" title="Definir o limite de tempo do turno${Number(cfg("tempoMaximo")) > 0 ? ` (atual: ${Number(cfg("tempoMaximo"))} s)` : " (atual: sem limite)"}"><i class="fa-solid fa-stopwatch"></i></button>` : ""}
        ${game.user.isGM ? `<button type="button" class="t20ah-mini ${cfg("gastoMovimentoMestre") ? "" : "desligado"}" data-acao="limitarMov" title="${cfg("gastoMovimentoMestre") ? "Seu movimento GASTA ações (como o dos jogadores). Clique para mover livremente." : "Você move livremente (sem gasto de movimento). Clique para passar a gastar ações."}"><i class="fa-solid fa-shoe-prints"></i></button>` : ""}
        <button type="button" class="t20ah-mini" data-acao="visual" title="Editar o visual da HUD"><i class="fa-solid fa-sliders"></i></button>
        <button type="button" class="t20ah-mini recolher" data-acao="recolher" title="Recolher / expandir"><i class="fa-solid fa-chevron-up"></i></button>
      `;
    const cabecalho = `
      <header class="t20ah-cabeca" title="Arraste para mover • Duplo clique para recentralizar">
        <img class="t20ah-retrato" src="${esc(img || "icons/svg/mystery-man.svg")}" alt="" draggable="false">
        <div class="t20ah-titulo">
          <span class="t20ah-sub">${sub}</span>
          <span class="t20ah-nome">${esc(doc.name ?? actor.name)}</span>
        </div>
        <span class="t20ah-resumo"><span class="t20ah-resumo-rec">${resumoRec}</span>${resumoAcoes}</span>
        ${btnsTurno}
        ${minis}
      </header>`;
    const esq = `
        <div class="t20ah-recursos">${recursos}</div>
        ${chips ? `<div class="t20ah-chips">${chips}</div>` : ""}
        ${acoes}`;
    el.innerHTML = largo
      ? `${cabecalho}<div class="t20ah-corpo grade"><div class="t20ah-esq">${esq}</div><aside class="t20ah-dir">${MenuAcoes.htmlPainel()}</aside></div>`
      : `${cabecalho}<div class="t20ah-corpo">${esq}</div>`;

    const chaveVisual = `${doc.id}:${turno}`;
    const estavaOculto = el.classList.contains("oculto");
    el.classList.remove("oculto");
    if (estavaOculto || this._ultimo !== chaveVisual) {
      el.classList.remove("entra");
      void el.offsetWidth; // reinicia a animação
      el.classList.add("entra");
    }
    this._ultimo = chaveVisual;
    el.querySelectorAll?.(".rec-flutua").forEach((n) => n.addEventListener("animationend", () => n.remove(), { once: true }));
    this.aplicarPosicao();
    this.atualizarTempo();
    MenuAcoes.sincronizar();
    this.renderGaveta();
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

  static iconeVolume(v) {
    const i = this.el?.querySelector('[data-acao="som"] i');
    if (i) i.className = `fa-solid ${v <= 0 ? "fa-volume-xmark" : v < 0.5 ? "fa-volume-low" : "fa-volume-high"}`;
  }

  /** Clique no ícone: abre/fecha o controle de volume vertical por cima da HUD. */
  static alternarVolume(btn) {
    const ja = document.getElementById("t20ah-vol-pop");
    if (ja) return this.fecharVolume();
    const v = cfg("somVolume");
    const pop = document.createElement("div");
    pop.id = "t20ah-vol-pop";
    pop.innerHTML = `<button type="button" class="vp-mudo" title="Silenciar / ativar"><i class="fa-solid ${v <= 0 ? "fa-volume-xmark" : "fa-volume-high"}"></i></button>
      <input type="range" min="0" max="1" step="0.05" value="${v}" title="Volume do alerta de tempo">
      <span class="vp-val">${Math.round(v * 100)}%</span>`;
    document.body.appendChild(pop);
    const rb = btn.getBoundingClientRect();
    const rh = (this.el ?? btn).getBoundingClientRect();
    pop.style.left = `${Math.min(Math.max(rb.left + rb.width / 2, 110), window.innerWidth - 110)}px`;
    pop.style.top = `${rh.top - 8}px`; // logo acima da HUD
    const rng = pop.querySelector("input");
    const val = pop.querySelector(".vp-val");
    const ico = pop.querySelector("i");
    const aplicar = (n) => {
      game.settings.set(ID, "somVolume", n);
      val.textContent = `${Math.round(n * 100)}%`;
      ico.className = `fa-solid ${n <= 0 ? "fa-volume-xmark" : "fa-volume-high"}`;
      this.iconeVolume(n);
    };
    rng.addEventListener("input", () => aplicar(Number(rng.value)));
    rng.addEventListener("change", () => this.tocarSom());
    pop.querySelector(".vp-mudo").addEventListener("click", () => {
      const atual = cfg("somVolume");
      let novo;
      if (atual > 0) { this._volAntes = atual; novo = 0; } else novo = this._volAntes || 0.8;
      rng.value = novo;
      aplicar(novo);
      if (novo > 0) this.tocarSom();
    });
    this._fechaFora = (ev) => {
      if (!pop.contains(ev.target) && !ev.target.closest?.('[data-acao="som"]')) this.fecharVolume();
    };
    setTimeout(() => document.addEventListener("pointerdown", this._fechaFora, true), 0);
  }

  static fecharVolume() {
    document.getElementById("t20ah-vol-pop")?.remove();
    if (this._fechaFora) document.removeEventListener("pointerdown", this._fechaFora, true);
    this._fechaFora = null;
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
    MenuAcoes.posicionar();
    this.posicionarGaveta();
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
      MenuAcoes.posicionar();
      this.posicionarGaveta();
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

/* ---------- Botões de Ações (dentro da HUD): regras, gasto e card no chat ---------- */

const paragrafos = (txt) =>
  String(txt ?? "").split("\n").filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");

/** Texto da regra (parágrafos + tópicos) em HTML, usado no tooltip e no card. */
const htmlRegra = (a) =>
  paragrafos(a.desc) +
  (a.topicos?.length
    ? `<ul class="rg-topicos">${a.topicos.map((t) => `<li><b>${esc(t.t)}.</b> ${esc(t.d)}</li>`).join("")}</ul>`
    : "");

/* ---------- Condições (Caído) e armas (Golpe de Misericórdia) ---------- */

const CONDICOES = { caido: /caid|prone/, fatigado: /fatigad|fatigue/, exausto: /exaust/, desprevenido: /desprevenid|flat-?footed|unaware/ };

/** Id da condição nos efeitos de status do Foundry (procura pelo id e pelo nome). */
function acharCondicao(chave) {
  const re = CONDICOES[chave];
  if (!re) return null;
  for (const e of CONFIG.statusEffects ?? []) {
    let nome = "";
    try {
      nome = game.i18n.localize(e.name ?? e.label ?? "");
    } catch (err) { /* ignora */ }
    if (re.test(normalizar(e.id)) || re.test(normalizar(nome))) return e.id;
  }
  return null;
}

/** Aplica ou remove a condição no ator. Retorna { id, tinha } (id = null se a condição não existe no sistema). */
function estadoCondicao(actor, chave) {
  const id = acharCondicao(chave);
  return { id, tinha: !!id && !!actor.statuses?.has?.(id) };
}

async function definirCondicao(actor, id, ativo) {
  await actor.toggleStatusEffect(id, { active: ativo });
}

/** A arma está equipada? Aceita os formatos mais comuns de campo "equipado". */
function estaEquipada(item) {
  const s = item.system ?? {};
  return [s.equipado, s.equipado2?.equipado, s.equipado?.value, s.equipped].some(
    (v) => v === true || v === 1 || (typeof v === "string" && /^(true|sim|1|equipad|mao|maos)/i.test(normalizar(v)))
  );
}

/** "corpo" | "distancia" | "desconhecido" */
function tipoDeArma(item) {
  const s = item.system ?? {};
  const prop = normalizar(s.proposito ?? s.tipoUso ?? "");
  if (/corpo|melee|cac|^mel/.test(prop)) return "corpo";
  if (/dist|ranged|dispar/.test(prop)) return "distancia";
  const alc = normalizar(typeof s.alcance === "object" ? s.alcance?.value : s.alcance ?? "");
  if (alc && !/(^0|adjac|corpo|toque|pessoal)/.test(alc)) return "distancia";
  return "desconhecido";
}

/** Armas equipadas que podem dar o Golpe de Misericórdia (corpo a corpo, ou de tipo não identificado). */
function armasCorpoACorpo(actor) {
  const armas = actor.items.filter((i) => normalizar(i.type) === "arma" && estaEquipada(i));
  dbg("armas equipadas", armas.map((a) => [a.name, tipoDeArma(a)]));
  return armas.filter((a) => tipoDeArma(a) !== "distancia");
}

/* ---------- Corrida ---------- */

/** Bônus total de uma perícia da ficha (Tormenta20: system.pericias.<chave>), ou null se não achar. */
function bonusPericia(actor, chave, nome) {
  const per = actor?.system?.pericias;
  if (!per) return null;
  let p = per[chave];
  if (!p) p = Object.values(per).find((v) => normalizar(v?.label ?? v?.nome) === normalizar(nome));
  if (!p) return null;
  for (const v of [p.value, p.total, p.bonus, p.mod]) {
    const n = numOuNulo(v);
    if (n !== null) return n;
  }
  return null;
}

/** Modificador de um atributo (ex.: "con"). */
function modAtributo(actor, chave) {
  let rd = {};
  try { rd = actor.getRollData?.() ?? {}; } catch (err) { /* ignora */ }
  const at = actor?.system?.atributos?.[chave];
  for (const v of [rd?.[chave], rd?.atributos?.[chave]?.value, at?.value, at?.mod, at?.total, at?.final]) {
    const n = numOuNulo(v);
    if (n !== null) return n;
  }
  return 0;
}

/** Os pontos formam uma linha reta, sem voltar atrás e (se já houver) na mesma direção da corrida? */
function corridaEmLinhaReta(pts, dir) {
  if (!pts || pts.length < 2) return true;
  const o = pts[0];
  const f = pts.at(-1);
  const L = Math.hypot(f.x - o.x, f.y - o.y);
  if (L < 1) return true;
  const u = { x: (f.x - o.x) / L, y: (f.y - o.y) / L };
  const tol = (canvas?.grid?.size || 100) * 0.35;
  for (const q of pts) if (Math.abs((q.x - o.x) * u.y - (q.y - o.y) * u.x) > tol) return false;
  for (let i = 1; i < pts.length; i++) if ((pts[i].x - pts[i - 1].x) * u.x + (pts[i].y - pts[i - 1].y) * u.y < -1) return false;
  if (dir && u.x * dir.x + u.y * dir.y < 0.9) return false;
  return true;
}

const NOMES_PERICIAS = {
  acro: "Acrobacia", ades: "Adestramento", atle: "Atletismo", atua: "Atuação", cava: "Cavalgar", conh: "Conhecimento",
  cura: "Cura", dipl: "Diplomacia", enga: "Enganação", fort: "Fortitude", furt: "Furtividade", guer: "Guerra",
  inic: "Iniciativa", inti: "Intimidação", intu: "Intuição", inve: "Investigação", joga: "Jogatina", ladi: "Ladinagem",
  luta: "Luta", mist: "Misticismo", nobr: "Nobreza", ocul: "Ocultismo", perc: "Percepção", pilo: "Pilotagem",
  pont: "Pontaria", refl: "Reflexos", reli: "Religião", sobr: "Sobrevivência", vont: "Vontade"
};

/** Perícias da ficha: [{ chave, nome, bonus }] em ordem alfabética (usa a lista padrão se a ficha não expuser nenhuma). */
function listarPericias(actor) {
  const per = actor?.system?.pericias;
  const lista = [];
  const entradas = per && typeof per === "object" ? Object.entries(per).filter(([, v]) => v && typeof v === "object") : [];
  for (const [chave, v] of entradas) {
    let nome = v.label ?? v.nome ?? "";
    try { if (/^[\w-]+(\.[\w-]+)+$/.test(nome)) nome = game.i18n.localize(nome); } catch (err) { /* ignora */ }
    nome = String(nome || NOMES_PERICIAS[chave] || chave);
    lista.push({ chave, nome, bonus: bonusPericia(actor, chave, nome) });
  }
  if (!lista.length) for (const [chave, nome] of Object.entries(NOMES_PERICIAS)) lista.push({ chave, nome, bonus: null });
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Rola a perícia pela rotina da própria ficha do Tormenta20 (com o diálogo e os efeitos de uso do sistema).
 * Retorna { roll, mensagem } ou null se o teste foi cancelado ou não pôde ser lido.
 */
async function rolarPericiaNativa(actor, chave, { privada = false } = {}) {
  // privada: a rolagem da ficha sai só para o Mestre (modo "cega"), como o teste de morte do Golpe de Misericórdia
  let modoAntes = null;
  if (privada) {
    try {
      modoAntes = game.settings.get("core", "rollMode");
      await game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES?.BLIND ?? "blindroll");
    } catch (err) {
      modoAntes = null;
    }
  }
  try {
    return await rolarPericiaNativaInterna(actor, chave);
  } finally {
    if (modoAntes !== null) {
      try { await game.settings.set("core", "rollMode", modoAntes); } catch (err) { /* ignora */ }
    }
  }
}
async function rolarPericiaNativaInterna(actor, chave) {
  const fn = ["rollPericia", "rollSkill"].map((m) => actor?.[m]).find((f) => typeof f === "function");
  if (!fn) {
    ui.notifications.error("Não encontrei a rolagem de perícias na ficha deste personagem.");
    return null;
  }
  let capturada = null;
  const hookId = Hooks.on("createChatMessage", (msg) => {
    if (capturada || !msg.rolls?.length) return;
    if ((msg.author?.id ?? msg.user?.id) !== game.user.id) return;
    capturada = msg;
  });
  let retorno;
  try {
    retorno = await fn.call(actor, chave);
    // a mensagem pode chegar um instante depois do fim da rotina
    for (let i = 0; i < 15 && !capturada && !(retorno?.total !== undefined || retorno?.rolls?.length); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (err) {
    console.error(`${ID} | erro ao rolar a perícia`, err);
    ui.notifications.error("Não foi possível rolar a perícia. Veja o console (F12).");
    return null;
  } finally {
    Hooks.off("createChatMessage", hookId);
  }
  const candidatos = [retorno, retorno?.[0], retorno?.roll, capturada?.rolls?.[0], retorno?.rolls?.[0]];
  const roll = candidatos.find((r) => r && Number.isFinite(Number(r.total)));
  if (!roll) return null;
  return { roll, mensagem: capturada ?? (retorno?.rolls ? retorno : null) };
}

/* ---------- Fintar ---------- */

const ALCANCE_CURTO_M = 9;
const PEDIDOS = new Map(); // reqId -> resolve (pedidos de teste feitos ao Mestre pelo socket)

/** Tokens da cena em alcance curto (9 m) do token indicado. `todos` ignora o alcance. */
function tokensParaFinta(feinterDoc, { todos = false } = {}) {
  const origem = feinterDoc?.object;
  const mQuad = cfg("metrosPorQuadrado");
  const lista = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.actor || t.document.id === feinterDoc?.id) continue;
    if (t.document.hidden && !game.user.isGM) continue;
    let metros = null;
    try {
      if (origem) {
        const unidades = canvas.grid.measurePath([origem.center, t.center]).distance ?? 0;
        const centro = unidades / (canvas.grid.distance || 1); // quadrados, de centro a centro
        const borda = Math.max(1, centro - ((origem.document.width ?? 1) + (t.document.width ?? 1)) / 2 + 1);
        metros = borda * mQuad;
      }
    } catch (err) { /* ignora */ }
    if (!todos && (metros === null || metros > ALCANCE_CURTO_M + 0.01)) continue;
    lista.push({ token: t, metros });
  }
  return lista.sort((a, b) => (a.metros ?? 999) - (b.metros ?? 999) || a.token.name.localeCompare(b.token.name, "pt-BR"));
}

/**
 * Faz o teste oposto de Reflexos do alvo e resolve a finta. Roda no cliente de quem pode rolar pelo alvo
 * (o próprio usuário, se for dono ou Mestre; senão, o Mestre ativo, por socket). Só passa dados simples.
 * d: { tokenUuid?, escolher?, feinterTokenUuid, nomeFeinter, meuTotal, meuBonus }
 */
async function resolverFinta(d) {
  // o alvo pode ser um token da cena ou (escolha do Mestre) qualquer ator, mesmo fora de cena
  let alvoDoc = d.tokenUuid ? await fromUuid(d.tokenUuid) : null;
  if (!alvoDoc && d.escolher) {
    const feinterDoc = d.feinterTokenUuid ? await fromUuid(d.feinterTokenUuid) : null;
    const sel = await MenuAcoes.escolherAlvoFinta(feinterDoc, { todos: true, gm: true, nomeFeinter: d.nomeFeinter });
    alvoDoc = sel?.tokenDoc ?? sel?.actor ?? null;
  }
  const ator = alvoDoc?.documentName === "Actor" ? alvoDoc : alvoDoc?.actor;
  if (!ator) return { cancelado: true };

  const k = await MenuAcoes.escolherPericia(ator, {
    cor: "#ff6b6b",
    padrao: "refl",
    titulo: `Reflexos · ${ator.name}`,
    subtitulo: `Teste oposto à finta de ${d.nomeFeinter}`,
    texto: `<b>${esc(ator.name)}</b> faz um teste de <b>Reflexos</b> oposto ao teste de Enganação de ${esc(d.nomeFeinter)}.`,
    icone: "fa-hand",
    obrigatorio: true
  });
  const chave = k ?? "refl";
  const rf = await rolarPericiaNativa(ator, chave, { privada: true });
  if (!rf) return { cancelado: true };

  const alvoTotal = Number(rf.roll.total);
  const alvoBonus = bonusPericia(ator, chave, "Reflexos");
  let veredito = "empate";
  if (d.meuTotal > alvoTotal) veredito = "passou";
  else if (d.meuTotal < alvoTotal) veredito = "falhou";
  else if (d.meuBonus !== null && alvoBonus !== null && d.meuBonus !== alvoBonus) veredito = d.meuBonus > alvoBonus ? "passou" : "falhou";

  let condicao = "nenhuma";
  let statusId = null;
  if (veredito === "passou") {
    const est = estadoCondicao(ator, "desprevenido");
    statusId = est.id;
    if (!est.id) condicao = "inexistente";
    else if (est.tinha) condicao = "ja";
    else {
      try {
        await definirCondicao(ator, est.id, true);
        condicao = "aplicada";
      } catch (err) {
        console.error(`${ID} | não foi possível aplicar Desprevenido`, err);
        condicao = "erro";
      }
    }
  }
  return {
    cancelado: false, veredito, condicao, statusId, alvoTotal, alvoBonus,
    alvoNat: rf.roll.dice?.find?.((x) => x.faces === 20)?.total ?? null,
    nomeAlvo: ator.name, nomePericia: NOMES_PERICIAS[chave] ?? chave, tokenUuid: alvoDoc.uuid
  };
}

/** Pede ao Mestre ativo que resolva a finta (escolhendo o ator e rolando por ele). */
function pedirFintaAoMestre(dados) {
  return new Promise((resolve) => {
    if (!game.users.activeGM) {
      ui.notifications.warn("Não há Mestre conectado para fazer o teste de Reflexos.");
      return resolve(null);
    }
    const reqId = foundry.utils.randomID();
    const t = setTimeout(() => {
      PEDIDOS.delete(reqId);
      ui.notifications.warn("O Mestre não respondeu ao teste de Reflexos a tempo.");
      resolve(null);
    }, 300000);
    PEDIDOS.set(reqId, (r) => {
      clearTimeout(t);
      PEDIDOS.delete(reqId);
      resolve(r);
    });
    ui.notifications.info("Aguardando o Mestre fazer o teste de Reflexos…");
    game.socket.emit(`module.${ID}`, { tipo: "finta-pedir", reqId, dados });
  });
}

/** Fim do próximo turno de quem fintou: remove o Desprevenido que a finta aplicou (Mestre ativo). */
async function expirarFintas(combat, ant) {
  const c = combat.combatants.get(ant?.combatantId);
  const f = c?.getFlag(ID, "finta");
  if (!f || !(ant.round > f.rodada)) return;
  try {
    const doc = await fromUuid(f.alvoUuid);
    const ator = doc?.actor ?? doc;
    if (ator && f.statusId) await ator.toggleStatusEffect(f.statusId, { active: false });
  } catch (err) {
    console.warn(`${ID} | não foi possível remover o Desprevenido da finta`, err);
  }
  await c.unsetFlag(ID, "finta").catch(() => {});
}
const ULTIMO_TURNO = new Map(); // combatId -> { round, combatantId } (turno visto por último)

class MenuAcoes {
  static el = null; // menu flutuante com as ações da categoria escolhida
  static tip = null;
  static catAberta = null;

  static habilitado() {
    return game.settings.get(ID, "menuAcoes");
  }

  static garantir() {
    if (this.el?.isConnected) return this.el;
    const el = document.createElement("div");
    el.id = "t20ah-acoes";
    el.classList.add("oculto");
    document.body.appendChild(el);

    el.addEventListener("click", (ev) => {
      const acao = ev.target.closest("[data-i]");
      if (acao) this.executar(acao.dataset.cat, Number(acao.dataset.i));
    });
    // tooltip com a descrição ao passar o mouse
    el.addEventListener("mousemove", (ev) => {
      const alvo = ev.target.closest?.("[data-i]");
      if (!alvo) return this.esconderTip();
      if (alvo !== this._alvoTip) {
        this._alvoTip = alvo;
        this.mostrarTip(alvo.dataset.cat, Number(alvo.dataset.i));
      }
      this.posicionarTip(ev.clientX, ev.clientY);
    });
    el.addEventListener("mouseleave", () => this.esconderTip());
    document.addEventListener("pointerdown", (ev) => {
      if (!this.catAberta) return;
      if (this.el.contains(ev.target) || ev.target.closest?.("[data-aa]")) return;
      this.fechar();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.catAberta) this.fechar();
    });

    const tip = document.createElement("div");
    tip.id = "t20ah-acoes-tip";
    tip.classList.add("oculto");
    document.body.appendChild(tip);

    this.el = el;
    this.tip = tip;
    return el;
  }

  static atualizarBotoes() {
    AcoesHUD.el?.querySelectorAll?.("[data-aa]").forEach((b) => b.classList.toggle("ativo", b.dataset.aa === this.catAberta));
  }

  static alternarCategoria(id) {
    this.catAberta = this.catAberta === id ? null : id;
    this.esconderTip();
    this.atualizarBotoes();
    this.renderPainel();
    this.posicionar();
  }

  static fechar() {
    this.catAberta = null;
    this.esconderTip();
    this.atualizarBotoes();
    this.renderPainel();
    this.posicionar();
  }

  /** Lista de ações da categoria aberta. */
  static renderPainel() {
    const el = this.el;
    if (!el) return;
    const cat = CATEGORIAS_ACOES.find((c) => c.id === this.catAberta) ?? null;
    if (!cat) {
      el.innerHTML = "";
      return;
    }
    el.style.setProperty("--cor", cat.cor);
    el.innerHTML = this.htmlCategoria(cat);
  }

  /** Botões das ações de uma categoria. */
  static htmlAcoes(cat) {
    return cat.acoes
      .map(
        (a, i) => `
        <button type="button" class="aa-acao ${a.auto ? "auto" : ""}" data-cat="${cat.id}" data-i="${i}">
          <span>${esc(a.nome)}</span>${a.auto ? '<em class="aa-auto" title="O módulo já gasta esta ação sozinho">auto</em>' : ""}
        </button>`
      )
      .join("");
  }

  /** Título + lista de ações + dica de uma categoria (menu flutuante do layout compacto). */
  static htmlCategoria(cat) {
    const temAuto = cat.acoes.some((a) => a.auto);
    return `
      <div class="aa-cab"><i class="fa-solid ${cat.icone}"></i> ${esc(cat.nome)}</div>
      <div class="aa-lista">${this.htmlAcoes(cat)}</div>
      <div class="aa-dica">${
        cat.gasta ? `Clique para usar: gasta a ${NOMES[cat.gasta]} e envia ao chat.` : "Clique para usar: sem custo, envia ao chat."
      }${temAuto ? "<br>Ações com <em>auto</em> já são gastas pelo módulo; o clique só consulta a regra." : ""}</div>`;
  }

  /** Painel do layout largo: as quatro categorias, uma abaixo da outra, separadas por uma linha. */
  static htmlPainel() {
    const secoes = CATEGORIAS_ACOES.map(
      (cat) => `
      <section class="aa-sec ${cat.id}" style="--cor:${cat.cor}">
        <div class="aa-cab"><i class="fa-solid ${cat.icone}"></i> ${esc(cat.nome)}</div>
        <div class="aa-lista">${this.htmlAcoes(cat)}</div>
      </section>`
    ).join("");
    return `${secoes}<div class="aa-dica">Clique numa ação para usá-la: ela gasta a ação do tipo e envia um card ao chat. Ações com <em>auto</em> já são gastas pelo módulo; o clique só consulta a regra.</div>`;
  }

  /** Mostra a regra da ação sob o mouse (botões que ficam dentro da HUD). */
  static dicaPara(alvo, ev) {
    this.garantir();
    if (alvo !== this._alvoTip) {
      this._alvoTip = alvo;
      this.mostrarTip(alvo.dataset.cat, Number(alvo.dataset.i));
    }
    this.posicionarTip(ev.clientX, ev.clientY);
  }

  /** Janela (no estilo da HUD) para escolher a arma do Golpe de Misericórdia. Resolve com o item ou null. */
  /** Largar um item: janela para escolher o item (e a quantidade) da ficha. Retorna { item, qtd } ou null. */
  static escolherItemLargar(actor, itens) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.id = "t20ah-escolha";
      const qtdDe = (i) => Math.max(1, Math.floor(Number(i.system?.qtd ?? 1)) || 1);
      ov.innerHTML = `
        <div class="ec-fundo"></div>
        <div class="ec-janela" style="--cor:#6fd08c">
          <header>
            <i class="fa-solid fa-hand-holding-hand"></i>
            <div><small>Ação Livre</small><strong>Largar um Item</strong></div>
            <button type="button" class="ec-x" data-ec="cancelar" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <p>Escolha o item que cai no chão. Ele vira um token (Item Piles) na casa do seu personagem.</p>
          <div class="ec-lista">${itens
            .map((a, i) => {
              const q = qtdDe(a);
              return `
            <div class="ec-linha-item">
              <button type="button" class="ec-arma" data-ec-i="${i}">
                <img src="${esc(a.img || "icons/svg/item-bag.svg")}" alt="" draggable="false">
                <span class="ec-n">${esc(a.name)}</span>
                <span class="ec-d">${esc(a.type)}${q > 1 ? ` · ×${q}` : ""}</span>
              </button>
              ${q > 1 ? `<input type="number" class="ec-qtd" data-ec-q="${i}" min="1" max="${q}" value="1" title="Quantidade a largar">` : ""}
            </div>`;
            })
            .join("")}</div>
          <footer><button type="button" class="ec-cancelar" data-ec="cancelar">Cancelar</button></footer>
        </div>`;
      const fim = (r) => {
        document.removeEventListener("keydown", tecla, true);
        ov.remove();
        resolve(r);
      };
      const tecla = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          fim(null);
        }
      };
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-ec-i]");
        if (b) {
          const i = Number(b.dataset.ecI);
          const campo = ov.querySelector(`[data-ec-q="${i}"]`);
          const max = qtdDe(itens[i]);
          const qtd = campo ? clamp(Math.floor(Number(campo.value)) || 1, 1, max) : 1;
          return fim({ item: itens[i], qtd });
        }
        if (ev.target.closest("[data-ec]") || ev.target.classList.contains("ec-fundo")) fim(null);
      });
      document.addEventListener("keydown", tecla, true);
      document.body.appendChild(ov);
    });
  }

  /** Cria (ou completa) uma pilha do Item Piles sob o token e tira o item da ficha. Retorna o HTML do resultado. */
  static async largarItem(alvo, { item, qtd }) {
    const API = game.itempiles?.API;
    const tokenDoc = alvo.doc;
    const cena = tokenDoc.parent ?? canvas.scene;
    const dados = item.toObject();
    delete dados._id;
    const total = Math.max(1, Math.floor(Number(item.system?.qtd ?? 1)) || 1);
    try {
      const existente = cena.tokens.find(
        (t) => t.id !== tokenDoc.id && t.x === tokenDoc.x && t.y === tokenDoc.y && API.isValidItemPile?.(t)
      );
      if (existente) {
        await API.addItems(existente, [{ item: dados, quantity: qtd }]);
      } else {
        await API.createItemPile({
          sceneId: cena.id,
          position: { x: tokenDoc.x, y: tokenDoc.y },
          items: [{ item: dados, quantity: qtd }],
          tokenOverrides: { sort: (Number(tokenDoc.sort) || 0) - 1 }
        });
      }
      if (qtd >= total) await item.delete();
      else await item.update({ "system.qtd": total - qtd });
    } catch (err) {
      console.error(`${ID} | não foi possível largar o item`, err);
      ui.notifications.error("Não foi possível largar o item (Item Piles). Veja o console (F12).");
      return "";
    }
    return `<div class="tc-bloco"><div class="tc-linha"><i class="fa-solid fa-hand-holding-hand"></i><span>Larga <b>${esc(item.name)}</b>${qtd > 1 ? ` (×${qtd})` : ""} no chão, sob o token.</span></div></div>`;
  }

  static escolherArma(actor, armas) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.id = "t20ah-escolha";
      const info = (a) => {
        const m = Number(a.system?.criticoM);
        const x = Number(a.system?.criticoX);
        const crit = Number.isFinite(m) && Number.isFinite(x) ? `Crítico ${m >= 20 ? "20" : `${m}–20`} ×${x}` : "";
        const tipo = tipoDeArma(a) === "desconhecido" ? "tipo não identificado" : "";
        return [crit, a.system?.empunhadura, tipo].filter(Boolean).join(" · ");
      };
      ov.innerHTML = `
        <div class="ec-fundo"></div>
        <div class="ec-janela" style="--cor:#e0b85c">
          <header>
            <i class="fa-solid fa-burst"></i>
            <div><small>Ação Completa</small><strong>Golpe de Misericórdia</strong></div>
            <button type="button" class="ec-x" data-ec="cancelar" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <p>Escolha a arma corpo a corpo do golpe. O ataque é um <b>20 natural automático</b> (acerto crítico).</p>
          <div class="ec-lista">${armas
            .map(
              (a, i) => `
            <button type="button" class="ec-arma" data-ec-i="${i}">
              <img src="${esc(a.img || "icons/svg/sword.svg")}" alt="" draggable="false">
              <span class="ec-n">${esc(a.name)}</span>
              <span class="ec-d">${esc(info(a))}</span>
            </button>`
            )
            .join("")}</div>
          <footer><button type="button" class="ec-cancelar" data-ec="cancelar">Cancelar</button></footer>
        </div>`;
      const fim = (item) => {
        document.removeEventListener("keydown", tecla, true);
        ov.remove();
        resolve(item);
      };
      const tecla = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          fim(null);
        }
      };
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-ec-i]");
        if (b) return fim(armas[Number(b.dataset.ecI)]);
        if (ev.target.closest("[data-ec]") || ev.target.classList.contains("ec-fundo")) fim(null);
      });
      document.addEventListener("keydown", tecla, true);
      document.body.appendChild(ov);
    });
  }

  /** Golpe de Misericórdia: rolagem de morte privada ao Mestre e ataque automático em 20 natural. */
  static async golpeDeMisericordia(alvo, arma) {
    const morte = await new Roll("1d4").evaluate();
    const v = morte.total;
    const importante = v <= 1; // 25%: personagens e NPCs importantes
    const secundario = v <= 3; // 75%: NPCs secundários
    const x = Number(arma.system?.criticoX);
    const alvoSelecionado = [...(game.user.targets ?? [])];
    const alvoNome = alvoSelecionado.length === 1 ? alvoSelecionado[0].name : "Alvo não especificado";
    // Nunca enviar o resultado como mensagem pública: resolve explicitamente
    // os usuários com permissão de Mestre. Uma lista vazia em `whisper`
    // pode fazer a mensagem ser publicada para todos.
    const destinatarios = game.users.filter((u) => u.isGM).map((u) => u.id);
    if (!destinatarios.length) {
      console.warn(`${ID} | nenhum Mestre conectado; resultado privado não enviado.`);
      ui.notifications.warn("Não há nenhum Mestre disponível para receber o resultado privado do Golpe de Misericórdia.");
    }

    const veredito = (titulo, morre) =>
      `<div class="tc-vd ${morre ? "morre" : "vive"}"><em>${titulo}</em><b><i class="fa-solid ${morre ? "fa-skull" : "fa-heart"}"></i> ${morre ? "MORRE" : "SOBREVIVE"}</b></div>`;

    const cardMestre = `
      <div class="t20ah-card t20ah-misericordia-gm" style="--cor:#e0b85c">
        <div class="tc-topo">
          <i class="fa-solid fa-skull-crossbones tc-ico"></i>
          <div class="tc-tit"><small>Golpe de Misericórdia · Privado</small><strong>Teste de morte instantânea</strong></div>
        </div>
        <div class="tc-desc">
          <p><b>Ator:</b> ${esc(alvo.actor.name)} · <b>Alvo:</b> ${esc(alvoNome)}</p>
          <p><b>Arma:</b> ${esc(arma.name)}</p>
          <p><b>Morte instantânea (1d4):</b> <b class="tc-dado">${v}</b></p>
          <div class="tc-vereditos">
            ${veredito("Personagens e NPCs importantes (1 em 1d4)", importante)}
            ${veredito("NPCs secundários (1 a 3 em 1d4)", secundario)}
          </div>
        </div>
      </div>`;

    if (destinatarios.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: alvo.doc }),
        content: cardMestre,
        rolls: [morte],
        whisper: destinatarios,
        blind: true,
        flags: { [ID]: { card: true, misericordiaGM: true } }
      });
    }

    // Usa a rotina nativa de uso da arma do Tormenta20 (ItemT20.roll),
    // preservando o diálogo de efeitos de uso e todos os cálculos do sistema.
    // ItemT20.roll() cria uma cópia interna do item; por isso, interceptamos
    // clone() para aplicar o 20 natural na cópia que realmente fará o ataque.
    const armaParaRolar = arma.clone({ keepId: true });
    const rolagemAtaque = armaParaRolar.system.rolls?.find((r) => r.type === "ataque");
    if (!rolagemAtaque) {
      ui.notifications.error(`A arma ${arma.name} não possui uma rolagem de ataque configurada.`);
      return { morte, ataque: null };
    }

    const clonarOriginal = armaParaRolar.clone.bind(armaParaRolar);
    armaParaRolar.clone = (...args) => {
      const copia = clonarOriginal(...args);
      const rolarAtaqueOriginal = copia.rollAttack.bind(copia);
      copia.rollAttack = async (opcoes = {}) => {
        await rolarAtaqueOriginal(opcoes);

        for (const rolagem of Object.values(copia.system.rolled ?? {})) {
          if (rolagem?.options?.type !== "attack") continue;

          // A rolagem nativa do T20 usa o primeiro termo como d20.
          const dadoD20 = rolagem.terms?.find((termo) => termo.faces === 20);
          if (!dadoD20) continue;

          const totalAnterior = Number(rolagem.total ?? 0);
          const resultadoAnterior = Number(dadoD20.total ?? 0);
          const diferenca = 20 - resultadoAnterior;

          // Altera o resultado do próprio dado, não apenas o total do ataque.
          dadoD20.results = (dadoD20.results ?? []).map((resultado, indice) => ({
            ...resultado,
            result: indice === 0 ? 20 : resultado.result,
            active: indice === 0 ? true : resultado.active
          }));
          dadoD20._total = 20;
          rolagem._total = totalAnterior + diferenca;
          rolagem._critical = true;
          rolagem._fumble = false;
        }
      };
      return copia;
    };
    // A ação completa do Golpe já foi gasta: marca a arma como "já cobrada neste turno" para que o card nativo
    // do ataque não tente gastar (nem avise sobre) a ação padrão de novo.
    if (game.combat?.started) {
      const chaveTurno = AcoesHUD.chaveTurno(game.combat);
      if (USO_ITEM.chave !== chaveTurno) {
        USO_ITEM.chave = chaveTurno;
        USO_ITEM.itens = new Set();
      }
      USO_ITEM.itens.add(arma.uuid);
    }
    await armaParaRolar.roll({ configureDialog: true });
    return { morte, ataque: armaParaRolar.system.rolled };
  }

  /**
   * Janela para escolher o alvo da finta: criaturas em alcance curto (9 m). O Mestre pode listar todos os tokens da
   * cena; o jogador pode deixar o Mestre escolher. Retorna { tokenDoc } | { mestre: true } | null (cancelou).
   */
  static escolherAlvoFinta(feinterDoc, { todos = false, gm = game.user.isGM, nomeFeinter = "" } = {}) {
    return new Promise((resolve) => {
      let mostrarTodos = todos;
      const fmt = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
      const ov = document.createElement("div");
      ov.id = "t20ah-escolha";
      // Mestre: a janela deixa a barra lateral clicável para arrastar um ator da lista de Atores
      if (gm) ov.classList.add("ec-arrastavel");
      const corpo = () => {
        const lista = tokensParaFinta(feinterDoc, { todos: mostrarTodos });
        ov._lista = lista;
        const itens = lista.length
          ? lista
              .map(
                (x, i) => `
            <button type="button" class="ec-arma" data-ec-i="${i}">
              <img src="${esc(x.token.document.texture?.src && !/\.(webm|mp4|m4v)$/i.test(x.token.document.texture.src) ? x.token.document.texture.src : x.token.actor?.img || "icons/svg/mystery-man.svg")}" alt="" draggable="false">
              <span class="ec-n">${esc(x.token.name)}</span>
              <span class="ec-d">${x.metros !== null ? `${esc(fmt(x.metros))} m` : "distância desconhecida"}${x.token.isTargeted ? " · marcado como alvo" : ""}</span>
            </button>`
              )
              .join("")
          : `<p class="ec-nota">${mostrarTodos ? "Não há outros tokens na cena." : "Ninguém em alcance curto (9 m)."}</p>`;
        ov.querySelector(".ec-lista").innerHTML = itens;
      };
      ov.innerHTML = `
        <div class="ec-fundo"></div>
        <div class="ec-janela" style="--cor:#ff6b6b">
          <header>
            <i class="fa-solid fa-masks-theater"></i>
            <div><small>${gm && nomeFeinter ? `Finta de ${esc(nomeFeinter)}` : "Ação Padrão"}</small><strong>Fintar</strong></div>
            <button type="button" class="ec-x" data-ec="cancelar" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <p>${gm && nomeFeinter ? `Escolha <b>quem faz o teste de Reflexos</b> contra a finta de ${esc(nomeFeinter)}.` : "Escolha a criatura em <b>alcance curto</b> (9 m) que será alvo da finta."}</p>
          <div class="ec-lista"></div>
          ${gm ? '<div class="ec-drop"><i class="fa-solid fa-user-plus"></i><span>Ou <b>arraste aqui um ator</b> da lista de Atores (ou de um compêndio), mesmo que não esteja em cena.</span></div>' : ""}
          <div class="ec-valor">
            ${gm ? `<label class="ec-todos"><input type="checkbox" ${mostrarTodos ? "checked" : ""}> Mostrar todos os tokens da cena</label>` : ""}
            ${!gm ? '<button type="button" class="ec-cancelar" data-ec="mestre">Deixar o Mestre escolher</button>' : ""}
          </div>
          <footer><button type="button" class="ec-cancelar" data-ec="cancelar">Cancelar</button></footer>
        </div>`;
      const fim = (v) => {
        document.removeEventListener("keydown", tecla, true);
        ov.remove();
        resolve(v);
      };
      const tecla = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          fim(null);
        }
      };
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-ec-i]");
        if (b) return fim({ tokenDoc: ov._lista[Number(b.dataset.ecI)].token.document });
        if (ev.target.closest('[data-ec="mestre"]')) return fim({ mestre: true });
        if (ev.target.closest('[data-ec="cancelar"]') || ev.target.classList.contains("ec-fundo")) fim(null);
      });
      if (gm) {
        const zona = ov.querySelector(".ec-drop");
        const lerArrasto = (ev) => {
          try {
            const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
            return TE.getDragEventData(ev);
          } catch (err) {
            try { return JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) { return null; }
          }
        };
        const aceita = (ev) => {
          ev.preventDefault();
          zona.classList.add("sobre");
        };
        ov.querySelector(".ec-janela").addEventListener("dragover", aceita);
        ov.querySelector(".ec-janela").addEventListener("dragenter", aceita);
        ov.querySelector(".ec-janela").addEventListener("dragleave", (ev) => {
          if (!ev.relatedTarget || !ev.currentTarget.contains(ev.relatedTarget)) zona.classList.remove("sobre");
        });
        ov.querySelector(".ec-janela").addEventListener("drop", async (ev) => {
          ev.preventDefault();
          zona.classList.remove("sobre");
          const dados = lerArrasto(ev);
          let ator = null;
          try {
            if (dados?.type === "Actor") ator = dados.uuid ? await fromUuid(dados.uuid) : game.actors.get(dados.id);
            else if (dados?.type === "Token" && dados.uuid) ator = (await fromUuid(dados.uuid))?.actor;
          } catch (err) {
            console.warn(`${ID} | não foi possível ler o ator arrastado`, err);
          }
          if (!ator || ator.documentName !== "Actor") return ui.notifications.warn("Arraste um ator da lista de Atores.");
          fim({ actor: ator });
        });
      }
      ov.addEventListener("change", (ev) => {
        if (ev.target.matches(".ec-todos input")) {
          mostrarTodos = ev.target.checked;
          corpo();
        }
      });
      document.addEventListener("keydown", tecla, true);
      document.body.appendChild(ov);
      corpo();
    });
  }

  /**
   * Fintar: teste de Enganação (pela ficha) oposto ao de Reflexos do alvo. Retorna { html, rolls } ou null se foi cancelado.
   */
  static async fintar(alvo, escolha, chave) {
    const actor = alvo.actor;
    const nome = alvo.doc.name ?? actor.name;
    const teste = await rolarPericiaNativa(actor, chave, { privada: true });
    if (!teste) return null;
    const meuTotal = Number(teste.roll.total);
    const meuNomePericia = listarPericias(actor).find((p) => p.chave === chave)?.nome ?? NOMES_PERICIAS[chave] ?? chave;
    const meuBonus = bonusPericia(actor, chave, meuNomePericia);

    const dados = {
      tokenUuid: escolha.tokenDoc?.uuid ?? escolha.actor?.uuid ?? null,
      escolher: !!escolha.mestre,
      feinterTokenUuid: alvo.doc.uuid,
      nomeFeinter: nome,
      meuTotal,
      meuBonus
    };
    const podeLocal = game.user.isGM || (escolha.tokenDoc?.actor?.isOwner ?? false);
    let r;
    if (escolha.mestre && game.user.isGM) r = await resolverFinta({ ...dados, escolher: true });
    else if ((escolha.tokenDoc || escolha.actor) && podeLocal) r = await resolverFinta(dados);
    else r = await pedirFintaAoMestre(dados);
    if (!r || r.cancelado) return null;

    // registra a finta no combatente para remover o Desprevenido no fim do próximo turno
    if (r.condicao === "aplicada" && alvo.c && game.combat?.started) {
      try {
        await alvo.c.setFlag(ID, "finta", { alvoUuid: r.tokenUuid, statusId: r.statusId, rodada: game.combat.round });
      } catch (err) {
        console.warn(`${ID} | não foi possível registrar a finta`, err);
      }
    }

    const nat = teste.roll.dice?.find?.((x) => x.faces === 20)?.total;
    const natAlvo = r.alvoNat;
    const classe = r.veredito === "passou" ? "vive" : r.veredito === "falhou" ? "morre" : "";
    const rotulo = r.veredito === "passou" ? "PASSOU" : r.veredito === "falhou" ? "FALHOU" : "EMPATE";
    const icone = r.veredito === "passou" ? "fa-masks-theater" : r.veredito === "falhou" ? "fa-ban" : "fa-scale-balanced";
    const linhas = [
      `<div class="tc-linha"><i class="fa-solid fa-dice-d20"></i><span><b>${esc(meuNomePericia)}</b> de ${esc(nome)}: ${nat !== undefined ? `<b class="tc-dado">${nat}</b> ` : ""}<small>(total</small> <b>${meuTotal}</b><small>)</small></span></div>`,
      `<div class="tc-linha"><i class="fa-solid fa-hand"></i><span><b>${esc(r.nomePericia)}</b> de ${esc(r.nomeAlvo)}: ${natAlvo !== null && natAlvo !== undefined ? `<b class="tc-dado">${natAlvo}</b> ` : ""}<small>(total</small> <b>${r.alvoTotal}</b><small>)</small></span></div>`,
      `<div class="tc-vereditos"><div class="tc-vd ${classe}"><em>Enganação ${meuTotal} × Reflexos ${r.alvoTotal}</em><b><i class="fa-solid ${icone}"></i> ${rotulo}</b></div></div>`
    ];
    if (r.veredito === "passou") {
      const msg = {
        aplicada: `<b>${esc(r.nomeAlvo)}</b> fica <b>desprevenido</b> contra o próximo ataque de ${esc(nome)}, até o fim do próximo turno dele.`,
        ja: `<b>${esc(r.nomeAlvo)}</b> já estava desprevenido.`,
        inexistente: `A condição Desprevenido não foi encontrada no sistema: aplique-a em <b>${esc(r.nomeAlvo)}</b> manualmente (até o fim do próximo turno de ${esc(nome)}).`,
        erro: `Sem permissão para aplicar a condição: aplique Desprevenido em <b>${esc(r.nomeAlvo)}</b> manualmente.`
      }[r.condicao];
      if (msg) linhas.push(`<div class="tc-linha"><i class="fa-solid fa-eye-slash"></i><span>${msg}</span></div>`);
    } else if (r.veredito === "empate") {
      linhas.push(`<div class="tc-nota">Empate nos totais e nos bônus: o Mestre decide ou os dois rolam de novo.</div>`);
    }
    // o resultado vai só para o Mestre (mensagem privada, como o teste de morte do Golpe de Misericórdia)
    const destinatarios = game.users.filter((u) => u.isGM).map((u) => u.id);
    if (destinatarios.length) {
      const cardMestre = `
        <div class="t20ah-card t20ah-misericordia-gm" style="--cor:#ff6b6b">
          <div class="tc-topo">
            <i class="fa-solid fa-masks-theater tc-ico"></i>
            <div class="tc-tit"><small>Fintar · Privado</small><strong>Enganação × Reflexos</strong></div>
          </div>
          <div class="tc-desc"><div class="tc-bloco">${linhas.join("")}</div></div>
        </div>`;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: alvo.doc }),
        content: cardMestre,
        whisper: destinatarios,
        blind: true,
        flags: { [ID]: { card: true, fintaGM: true } }
      });
    } else {
      ui.notifications.warn("Não há nenhum Mestre disponível para receber o resultado privado da Finta.");
    }
    return {
      html: `<div class="tc-bloco"><div class="tc-linha"><i class="fa-solid fa-eye-slash"></i><span>O resultado da Finta foi enviado em privado ao Mestre.</span></div></div>`,
      rolls: []
    };
  }

  /**
   * Janela do Atrasar: escolha depois de quem agir ou digite uma Iniciativa.
   * Retorna { nova, rotulo } ou null se cancelou.
   */
  static escolherAtraso(alvo, combat) {
    return new Promise((resolve) => {
      const c = alvo.c;
      const atual = Number(c.initiative);
      const bonusInic = bonusPericia(alvo.actor, "inic", "Iniciativa") ?? 0;
      const limite = -10 - bonusInic;
      const apos = combat.turns.slice(combat.turn + 1).filter((x) => x.id !== c.id && (game.user.isGM || !x.hidden));
      const fmt = (n) => (Math.round(n * 100) / 100).toString().replace(".", ",");
      const ov = document.createElement("div");
      ov.id = "t20ah-escolha";
      ov.innerHTML = `
        <div class="ec-fundo"></div>
        <div class="ec-janela" style="--cor:#6fd08c">
          <header>
            <i class="fa-solid fa-hourglass-half"></i>
            <div><small>Ação Livre</small><strong>Atrasar</strong></div>
            <button type="button" class="ec-x" data-ec="cancelar" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <p>Sua Iniciativa atual é <b>${fmt(atual)}</b> (limite para atrasar: <b>${fmt(limite)}</b>). Escolha <b>depois de quem</b> você vai agir ou informe uma Iniciativa. Ela vale pelo resto do combate.</p>
          ${apos.length ? `<div class="ec-lista">${apos
            .map(
              (x, i) => `
            <button type="button" class="ec-arma" data-ec-i="${i}">
              <img src="${esc(x.img || x.actor?.img || "icons/svg/mystery-man.svg")}" alt="" draggable="false">
              <span class="ec-n">Depois de ${esc(x.name)}</span>
              <span class="ec-d">Iniciativa ${esc(fmt(Number(x.initiative)))}</span>
            </button>`
            )
            .join("")}</div>` : '<p class="ec-nota">Ninguém age depois de você nesta rodada.</p>'}
          <div class="ec-valor">
            <label>Iniciativa específica <input type="number" step="1" min="${limite}" max="${fmt(atual - 1)}" placeholder="${fmt(Math.max(limite, atual - 5))}"></label>
            <button type="button" class="ec-rolar" data-ec="valor">Atrasar</button>
          </div>
          <footer><button type="button" class="ec-cancelar" data-ec="cancelar">Cancelar</button></footer>
        </div>`;
      const fim = (v) => {
        document.removeEventListener("keydown", tecla, true);
        ov.remove();
        resolve(v);
      };
      const tecla = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          fim(null);
        }
      };
      const usarValor = () => {
        const inp = ov.querySelector(".ec-valor input");
        const n = Number(inp.value);
        if (inp.value === "" || !Number.isFinite(n)) return ui.notifications.warn("Informe uma Iniciativa.");
        if (n >= atual) return ui.notifications.warn(`A nova Iniciativa precisa ser menor que ${fmt(atual)}.`);
        if (n < limite) return ui.notifications.warn(`O limite para atrasar é ${fmt(limite)}.`);
        fim({ nova: n, rotulo: `Iniciativa ${fmt(n)}` });
      };
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-ec-i]");
        if (b) {
          const x = apos[Number(b.dataset.ecI)];
          const nova = Math.max(limite, Number(x.initiative) - 0.01);
          return fim({ nova, rotulo: `depois de ${x.name}` });
        }
        if (ev.target.closest('[data-ec="valor"]')) return usarValor();
        if (ev.target.closest('[data-ec="cancelar"]') || ev.target.classList.contains("ec-fundo")) fim(null);
      });
      ov.querySelector(".ec-valor input").addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          usarValor();
        }
      });
      document.addEventListener("keydown", tecla, true);
      document.body.appendChild(ov);
    });
  }

  /**
   * Janela para escolher a perícia de um teste. A perícia padrão fica marcada (e selecionada de início).
   * Retorna a chave da perícia ou null se cancelou (não cancela se `obrigatorio`).
   */
  static escolherPericia(actor, { padrao, titulo, subtitulo = "Teste", texto = "", icone = "fa-dice-d20", obrigatorio = false, cor = "" }) {
    return new Promise((resolve) => {
      const lista = listarPericias(actor);
      let sel = lista.some((p) => p.chave === padrao) ? padrao : lista[0]?.chave;
      const ov = document.createElement("div");
      ov.id = "t20ah-escolha";
      const fmtB = (n) => (n === null ? "" : `${n < 0 ? "−" : "+"}${Math.abs(n)}`);
      ov.innerHTML = `
        <div class="ec-fundo"></div>
        <div class="ec-janela ec-larga"${cor ? ` style="--cor:${cor}"` : ""}>
          <header>
            <i class="fa-solid ${icone}"></i>
            <div><small>${esc(subtitulo)}</small><strong>${esc(titulo)}</strong></div>
            ${obrigatorio ? "" : '<button type="button" class="ec-x" data-ec="cancelar" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>'}
          </header>
          ${texto ? `<p>${texto}</p>` : ""}
          <div class="ec-pericias">${lista
            .map(
              (p) => `
            <button type="button" class="ec-per ${p.chave === sel ? "sel" : ""} ${p.chave === padrao ? "padrao" : ""}" data-ec-p="${esc(p.chave)}">
              <span class="ec-pn">${esc(p.nome)}</span>
              <span class="ec-pb">${esc(fmtB(p.bonus))}</span>
              ${p.chave === padrao ? '<span class="ec-badge" title="Perícia padrão deste teste"><i class="fa-solid fa-star"></i> padrão</span>' : ""}
            </button>`
            )
            .join("")}</div>
          <footer>
            ${obrigatorio ? "" : '<button type="button" class="ec-cancelar" data-ec="cancelar">Cancelar</button>'}
            <button type="button" class="ec-rolar" data-ec="rolar"><i class="fa-solid fa-dice-d20"></i> Rolar</button>
          </footer>
        </div>`;
      const fim = (v) => {
        document.removeEventListener("keydown", tecla, true);
        ov.remove();
        resolve(v);
      };
      const marcar = (chave) => {
        sel = chave;
        ov.querySelectorAll(".ec-per").forEach((b) => b.classList.toggle("sel", b.dataset.ecP === chave));
      };
      const tecla = (ev) => {
        if (ev.key === "Escape" && !obrigatorio) {
          ev.stopPropagation();
          fim(null);
        } else if (ev.key === "Enter") {
          ev.stopPropagation();
          ev.preventDefault();
          fim(sel ?? null);
        }
      };
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-ec-p]");
        if (b) return marcar(b.dataset.ecP);
        if (ev.target.closest('[data-ec="rolar"]')) return fim(sel ?? null);
        if (!obrigatorio && (ev.target.closest('[data-ec="cancelar"]') || ev.target.classList.contains("ec-fundo"))) fim(null);
      });
      ov.addEventListener("dblclick", (ev) => {
        const b = ev.target.closest("[data-ec-p]");
        if (b) fim(b.dataset.ecP);
      });
      document.addEventListener("keydown", tecla, true);
      document.body.appendChild(ov);
      ov.querySelector(".ec-per.sel")?.scrollIntoView?.({ block: "center" });
    });
  }

  /**
   * Investida: avança até o dobro do deslocamento (no mínimo 3 m) em linha reta, sem terreno difícil, e ataca no fim.
   * +2 no ataque e –2 na Defesa até o início do próximo turno (a Defesa vai para o "bônus de defesa" da HUD).
   * Retorna { html, max } (max em quadrados do grid).
   */
  static investida(alvo) {
    const desloc = deslocamentoMetros(alvo.actor);
    const metros = Math.max(3, desloc * 2);
    const fmt = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
    const html =
      `<div class="tc-bloco">` +
      `<div class="tc-linha"><i class="fa-solid fa-person-running"></i><span>Avança até <b>${fmt(metros)} m</b> em linha reta, sem terreno difícil, e faz um ataque corpo a corpo no fim do movimento.</span></div>` +
      `<div class="tc-linha"><i class="fa-solid fa-khanda"></i><span><b>+2</b> no teste de ataque. <b>−2</b> na Defesa até o início do próximo turno.</span></div>` +
      `<div class="tc-linha"><i class="fa-solid fa-person-falling"></i><span>Pode fazer <b>Atropelar</b> como ação livre (sem atropelar e atacar o mesmo alvo).</span></div>` +
      `</div>`;
    return { html, max: metros / cfg("metrosPorQuadrado") };
  }

  /**
   * Corrida: teste de Atletismo (rolado pela ficha, com os efeitos de uso do sistema) + 2 por 1,5m de deslocamento
   * acima de 9m (–2 abaixo); avança tantos quadrados de 1,5m quanto o resultado. Controla o fôlego
   * (1 + Constituição rodadas; depois, Fortitude CD 15 +1 por teste, falha = fatigado).
   * Retorna { html, rolls, max } (max em quadrados do grid) ou null se o teste foi cancelado.
   */
  static async corrida(alvo, chave) {
    const actor = alvo.actor;
    const nomeDe = (k) => listarPericias(actor).find((p) => p.chave === k)?.nome ?? NOMES_PERICIAS[k] ?? k;
    const desloc = deslocamentoMetros(actor);
    const modDesloc = 2 * Math.round((desloc - 9) / 1.5);
    const teste = await rolarPericiaNativa(actor, chave);
    if (!teste) return null;
    const total = Number(teste.roll.total) + modDesloc;
    const nat = teste.roll.dice?.find?.((d) => d.faces === 20)?.total ?? teste.roll.dice?.[0]?.total;
    const sinal = (n) => `${n < 0 ? "−" : "+"} ${Math.abs(n)}`;
    const quadrados = Math.max(0, Math.floor(total));
    const metros = quadrados * 1.5;
    const fmt = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
    const max = metros / cfg("metrosPorQuadrado");

    const linhas = [];
    linhas.push(
      `<div class="tc-linha"><i class="fa-solid fa-dice-d20"></i><span><b>${esc(nomeDe(chave))}:</b> ` +
        `${nat !== undefined ? `<b class="tc-dado">${nat}</b> ` : ""}<small>(rolagem da ficha = ${teste.roll.total})</small>` +
        `${modDesloc ? ` ${sinal(modDesloc)} <small>(deslocamento ${fmt(desloc)} m)</small>` : ""}` +
        ` = <b>${total}</b></span></div>`
    );
    linhas.push(
      `<div class="tc-linha"><i class="fa-solid fa-person-running"></i><span>Avança <b>${quadrados} ${quadrados === 1 ? "quadrado" : "quadrados"}</b> de 1,5 m (<b>${fmt(metros)} m</b>) em linha reta.</span></div>`
    );

    // fôlego: rodadas seguidas correndo
    const combat = game.combat;
    const c = alvo.c;
    if (c && combat?.started) {
      const ctl = c.getFlag(ID, "corridaCtl") ?? {};
      const seguida = ctl.rodada === combat.round - 1 || ctl.rodada === combat.round;
      const seq = seguida ? (ctl.seq ?? 0) + (ctl.rodada === combat.round ? 0 : 1) : 1;
      let testes = seguida ? ctl.testes ?? 0 : 0;
      const limite = Math.max(0, 1 + modAtributo(actor, "con"));
      linhas.push(
        `<div class="tc-linha"><i class="fa-solid fa-lungs"></i><span>Fôlego: rodada <b>${seq}</b> de corrida (aguenta <b>${limite}</b> sem teste).</span></div>`
      );
      if (seq > limite) {
        const cd = 15 + testes;
        const k = await this.escolherPericia(actor, {
          padrao: "fort",
          titulo: `Fortitude · CD ${cd}`,
          subtitulo: "Fôlego da corrida",
          texto: `${esc(alvo.actor.name)} correu além do fôlego: faça um teste de <b>Fortitude contra CD ${cd}</b>. Se falhar, fica fatigado.`,
          icone: "fa-lungs",
          obrigatorio: true
        });
        const rf = await rolarPericiaNativa(actor, k ?? "fort");
        if (!rf) {
          linhas.push(`<div class="tc-nota">O teste de Fortitude (CD ${cd}) foi cancelado e não foi contado. O Mestre decide como resolver.</div>`);
        } else {
          const falhou = Number(rf.roll.total) < cd;
          testes += 1;
          let resultado = "";
          if (falhou) {
            try {
              const jaFatigado = !!estadoCondicao(actor, "fatigado").tinha;
              const id = acharCondicao(jaFatigado ? "exausto" : "fatigado");
              if (id) {
                await definirCondicao(actor, id, true);
                resultado = `Condição <b>${jaFatigado ? "Exausto" : "Fatigado"}</b> aplicada${jaFatigado ? " (fadiga cumulativa)" : ""}.`;
              } else resultado = "A condição Fatigado não foi encontrada no sistema; aplique-a manualmente.";
            } catch (err) {
              console.error(`${ID} | não foi possível aplicar a fadiga`, err);
              resultado = "Sem permissão para aplicar a condição; aplique-a manualmente.";
            }
          }
          linhas.push(
            `<div class="tc-vereditos"><div class="tc-vd ${falhou ? "morre" : "vive"}"><em>${esc(nomeDe(k ?? "fort"))} CD ${cd}: <b class="tc-dado">${rf.roll.total}</b></em>` +
              `<b><i class="fa-solid ${falhou ? "fa-face-tired" : "fa-shield-heart"}"></i> ${falhou ? "FALHOU" : "PASSOU"}</b></div></div>` +
              (resultado ? `<div class="tc-linha"><i class="fa-solid fa-battery-quarter"></i><span>${resultado}</span></div>` : "")
          );
        }
      }
      try {
        await c.setFlag(ID, "corridaCtl", { rodada: combat.round, seq, testes });
      } catch (err) {
        console.warn(`${ID} | não foi possível registrar o fôlego`, err);
      }
    }
    return { html: `<div class="tc-bloco">${linhas.join("")}</div>`, rolls: [], max };
  }

  /** Usa a ação: gasta o tipo correspondente na HUD (se estiver no turno), aplica efeitos e manda o card ao chat. */
  static async executar(catId, i) {
    const cat = CATEGORIAS_ACOES.find((c) => c.id === catId);
    const acao = cat?.acoes[i];
    const alvo = AcoesHUD.alvo();
    if (!acao || !alvo) return;
    const nome = alvo.doc.name ?? alvo.actor.name;

    // 1) pode usar? (turno e ação disponível) -- nada é gasto ainda
    let gastar = false;
    let custo = "Ação livre: sem custo";
    if (acao.auto) {
      custo = "Já é gasta automaticamente ao usar a arma, a magia ou o item pela ficha";
    } else if (cat.gasta) {
      if (alvo.c && alvo.turno) {
        if (!AcoesHUD.aplicar(cat.gasta, "gastar", getEstado(alvo.c), temExtra(alvo.actor))) {
          ui.notifications.warn(`${nome} não tem ${NOMES[cat.gasta]} disponível.`);
          return;
        }
        gastar = true;
      } else if (alvo.c) {
        ui.notifications.warn(`${nome} só pode usar ${acao.nome} no próprio turno.`);
        return;
      } else {
        custo = "Fora de combate: nenhuma ação foi gasta";
      }
    }

    // 2) regras da própria ação
    let condicao = null; // { id, aplicar }
    if (acao.efeito) {
      const est = estadoCondicao(alvo.actor, acao.efeito.condicao);
      if (est.id && acao.efeito.aplicar && est.tinha) return ui.notifications.warn(`${nome} já está caído.`);
      if (est.id && !acao.efeito.aplicar && !est.tinha) return ui.notifications.warn(`${nome} não está caído.`);
      if (!est.id) ui.notifications.warn("A condição Caído não foi encontrada no sistema; a ação será registrada sem o efeito.");
      else condicao = { id: est.id, aplicar: acao.efeito.aplicar };
    }
    let arma = null;
    if (acao.especial === "misericordia") {
      const armas = armasCorpoACorpo(alvo.actor);
      if (!armas.length) return ui.notifications.warn(`${nome} precisa ter uma arma corpo a corpo equipada para o Golpe de Misericórdia.`);
      arma = await this.escolherArma(alvo.actor, armas);
      if (!arma) return; // cancelou: nada é gasto
    }

    let escolhaFinta = null;
    let periciaFinta = null;
    if (acao.especial === "fintar") {
      const marcados = [...(game.user.targets ?? [])];
      if (marcados.length === 1 && marcados[0].actor) escolhaFinta = { tokenDoc: marcados[0].document };
      else escolhaFinta = await this.escolherAlvoFinta(alvo.doc);
      if (!escolhaFinta) return; // cancelou: nada é gasto
      periciaFinta = await this.escolherPericia(alvo.actor, {
        cor: "#ff6b6b",
        padrao: "enga",
        titulo: "Fintar",
        subtitulo: "Ação Padrão · escolha a perícia",
        texto: "O teste é rolado pela ficha e oposto ao de <b>Reflexos</b> do alvo. <b>Enganação</b> é a perícia padrão da finta.",
        icone: "fa-masks-theater"
      });
      if (!periciaFinta) return;
    }
    let atraso = null;
    if (acao.especial === "atrasar") {
      const combat = game.combat;
      if (!alvo.c || !alvo.turno || !combat?.started) return ui.notifications.warn(`${nome} só pode atrasar no próprio turno, em combate.`);
      if (!Number.isFinite(Number(alvo.c.initiative))) return ui.notifications.warn(`${nome} ainda não tem Iniciativa rolada.`);
      atraso = await this.escolherAtraso(alvo, combat);
      if (!atraso) return; // cancelou
    }
    let largar = null;
    if (acao.especial === "largar") {
      if (!game.modules.get("item-piles")?.active || !game.itempiles?.API) return ui.notifications.warn("Largar um item cria um token pelo módulo Item Piles, que não está ativo.");
      if (!alvo.doc?.parent) return ui.notifications.warn("O token precisa estar em uma cena.");
      const TIPOS = ["arma", "equipamento", "consumivel", "tesouro", "ferramenta"];
      const itens = alvo.actor.items.filter((i) => TIPOS.includes(normalizar(i.type)));
      if (!itens.length) return ui.notifications.warn(`${nome} não tem itens para largar.`);
      largar = await this.escolherItemLargar(alvo.actor, itens);
      if (!largar) return;
    }
    let periciaCorrida = null;
    if (acao.especial === "corrida") {
      periciaCorrida = await this.escolherPericia(alvo.actor, {
        padrao: "atle",
        titulo: "Corrida",
        subtitulo: "Ação Completa · escolha a perícia",
        texto: "O teste é rolado pela ficha, como de costume. <b>Atletismo</b> é a perícia padrão da corrida."
      });
      if (!periciaCorrida) return; // cancelou: nada é gasto
    }

    // 3) gasta a ação
    let restam = null;
    let estadoAntes = null;
    if (gastar) {
      const antes = getEstado(alvo.c);
      estadoAntes = antes;
      const depois = AcoesHUD.aplicar(cat.gasta, "gastar", antes, temExtra(alvo.actor));
      const ok = await AcoesHUD.usar(cat.gasta, "gastar", acao.nome, false);
      if (!ok) return;
      const extraAtivo = temExtra(alvo.actor);
      custo = depois?.ext && !antes.ext
        ? `Gastou a ação extra (Velocidade) como ${NOMES[depois.ext]}`
        : cat.gasta === "movimento" && antes.mov ? "Gastou a ação padrão (2º movimento)" : `Gastou a ${NOMES[cat.gasta]}`;
      if (depois) {
        const extraLivre = extraAtivo && !depois.ext;
        restam = { padrao: !depois.std || extraLivre, movimento: !depois.mov || !depois.std || extraLivre };
      }
    }

    // 4) efeitos da ação
    let extra = "";
    let rolls = [];
    if (acao.especial === "fintar") {
      try {
        const r = await this.fintar(alvo, escolhaFinta, periciaFinta);
        if (!r) {
          if (gastar && alvo.c && estadoAntes) {
            ESTADO_RECENTE.delete(alvo.c.id);
            await alvo.c.setFlag(ID, FLAG, estadoAntes);
          }
          ui.notifications.warn("Finta cancelada: o teste não foi concluído e a ação padrão foi devolvida.");
          return;
        }
        extra += r.html;
        rolls = r.rolls;
      } catch (err) {
        console.error(`${ID} | erro na Finta`, err);
        ui.notifications.error("Não foi possível concluir a Finta. Veja o console (F12).");
      }
    }
    if (acao.especial === "corrida") {
      try {
        const r = await this.corrida(alvo, periciaCorrida);
        if (!r) {
          // teste cancelado: devolve a ação completa
          if (gastar && alvo.c && estadoAntes) {
            ESTADO_RECENTE.delete(alvo.c.id);
            await alvo.c.setFlag(ID, FLAG, estadoAntes);
          }
          ui.notifications.warn("Corrida cancelada: o teste não foi realizado e a ação completa foi devolvida.");
          return;
        }
        extra += r.html;
        rolls = r.rolls;
        if (gastar && alvo.c) {
          // libera o deslocamento da corrida (em linha reta) pelo resto do turno
          ESTADO_RECENTE.delete(alvo.c.id);
          await alvo.c.setFlag(ID, FLAG, { ...getEstado(alvo.c), corrida: { max: r.max, dir: null } });
        }
      } catch (err) {
        console.error(`${ID} | erro na Corrida`, err);
        ui.notifications.error("Não foi possível concluir a Corrida. Veja o console (F12).");
      }
    }
    if (largar) extra += await this.largarItem(alvo, largar);
    if (acao.especial === "investida") {
      const r = this.investida(alvo);
      extra += r.html;
      if (gastar && alvo.c) {
        try {
          ESTADO_RECENTE.delete(alvo.c.id);
          await alvo.c.setFlag(ID, FLAG, { ...getEstado(alvo.c), corrida: { max: r.max, dir: null, investida: true } });
          await aplicarDefesaInvestida(alvo.c);
        } catch (err) {
          console.error(`${ID} | erro na Investida`, err);
          ui.notifications.error("Não foi possível concluir a Investida. Veja o console (F12).");
        }
      }
    }
    if (condicao) {
      try {
        await definirCondicao(alvo.actor, condicao.id, condicao.aplicar);
        extra = `<div class="tc-bloco"><div class="tc-linha"><i class="fa-solid fa-person-falling"></i><span>${
          condicao.aplicar ? "Condição <b>Caído</b> aplicada" : "Condição <b>Caído</b> removida"
        }.</span></div></div>`;
      } catch (err) {
        console.error(`${ID} | não foi possível alterar a condição`, err);
        ui.notifications.error("Sem permissão para alterar a condição deste personagem.");
      }
    }
    if (arma) {
      // O card público contém somente o texto da ação. As rolagens seguem separadas.
      if (game.settings.get(ID, "cardAcoes")) {
        await this.enviarCard(alvo, cat, acao, custo, restam, "", []);
      }
      await this.golpeDeMisericordia(alvo, arma);
    } else {
      if (atraso) {
        const de = Number(alvo.c.initiative);
        const fmt = (n) => (Math.round(n * 100) / 100).toString().replace(".", ",");
        extra += `<div class="tc-bloco"><div class="tc-linha"><i class="fa-solid fa-hourglass-half"></i><span>Atrasa a ação ${esc(atraso.rotulo)}. Iniciativa <b>${fmt(de)}</b> → <b>${fmt(atraso.nova)}</b> pelo resto do combate.</span></div></div>`;
      }
      if (game.settings.get(ID, "cardAcoes")) await this.enviarCard(alvo, cat, acao, custo, restam, extra, rolls);
    }
    if (atraso) {
      try {
        if (game.user.isGM) await executarAtraso(game.combat, alvo.c, atraso.nova);
        else game.socket.emit(`module.${ID}`, { tipo: "atrasar", combatId: game.combat.id, combatenteId: alvo.c.id, nova: atraso.nova });
      } catch (err) {
        console.error(`${ID} | não foi possível atrasar`, err);
        ui.notifications.error("Não foi possível alterar a Iniciativa. Peça ao Mestre.");
      }
    }
    this.fechar();
  }

  static async enviarCard(alvo, cat, acao, custo, restam, extra = "", rolls = []) {
    const ico = (classe, livre) => `<i class="fa-solid ${classe} tc-disp ${livre ? "livre" : ""}"></i>`;
    const restantes = restam
      ? `<span class="tc-restam">Restam ${ico("fa-hand-fist", restam.padrao)}${ico("fa-person-running", restam.movimento)}</span>`
      : "";
    // Identificação do personagem e do jogador dentro do próprio card.
    const actor = alvo.actor;
    const actorNome = actor?.name ?? alvo.doc?.name ?? "Personagem";
    const jogadorDesignado = game.users?.find((u) => u.character?.id === actor?.id);
    const jogadoresProprietarios = actor
      ? [...game.users].filter((u) => !u.isGM && actor.testUserPermission?.(u, "OWNER"))
      : [];
    const jogador = jogadorDesignado
      ?? jogadoresProprietarios[0]
      ?? (game.user?.isGM ? null : game.user);
    const jogadorNome = jogador?.name ?? "Mestre";
    const retrato = actor?.img ?? alvo.doc?.texture?.src ?? "";
    const retratoHtml = retrato
      ? `<img class="tc-retrato" src="${esc(retrato)}" alt="">`
      : `<span class="tc-retrato tc-retrato-vazio"><i class="fa-solid fa-user"></i></span>`;

    const content = `
      <div class="t20ah-card" style="--cor:${cat.cor}">
        <div class="tc-identidade">
          ${retratoHtml}
          <div class="tc-identidade-texto">
            <strong>${esc(actorNome)}</strong>
            <small>Jogador: ${esc(jogadorNome)}</small>
          </div>
        </div>
        <div class="tc-topo">
          <i class="fa-solid ${cat.icone} tc-ico"></i>
          <div class="tc-tit"><small>${esc(cat.singular)}</small><strong>${esc(acao.nome)}</strong></div>
        </div>
        <div class="tc-desc">${htmlRegra(acao)}</div>
        ${extra}
        <div class="tc-rodape"><span>${esc(custo)}</span>${restantes}</div>
      </div>`;
    let speaker;
    try {
      speaker = ChatMessage.getSpeaker({ token: alvo.doc });
    } catch (err) {
      speaker = { alias: alvo.doc.name };
    }
    try {
      await ChatMessage.create({ speaker, content, rolls, flags: { [ID]: { card: true } } });
    } catch (err) {
      console.error(`${ID} | não foi possível enviar o card ao chat`, err);
    }
  }

  /* tooltip */
  static mostrarTip(cat, i) {
    const c = CATEGORIAS_ACOES.find((x) => x.id === cat);
    const a = c?.acoes[i];
    if (!a) return this.esconderTip();
    this.tip.style.setProperty("--cor", c.cor);
    this.tip.innerHTML = `
      <div class="tp-nome">${esc(a.nome)}</div>
      <div class="tp-cat">${esc(c.singular)}</div>
      <div class="tp-desc">${htmlRegra(a)}</div>`;
    this.tip.classList.remove("oculto");
  }

  static posicionarTip(x, y) {
    const tip = this.tip;
    if (!tip || tip.classList.contains("oculto")) return;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = x + 18;
    let top = y - h / 2;
    if (left + w > window.innerWidth - 8) left = x - w - 18;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${clamp(top, 8, window.innerHeight - h - 8)}px`;
  }

  static esconderTip() {
    this._alvoTip = null;
    this.tip?.classList.add("oculto");
  }

  /** O menu abre colado ao botão da categoria (acima dele; se não couber, abaixo). */
  static posicionar() {
    const el = this.el;
    if (!el) return;
    const hud = AcoesHUD.el;
    const visivel = !!this.catAberta && this.habilitado() && !!hud?.isConnected && !hud.classList.contains("oculto");
    const btn = visivel ? hud.querySelector(`[data-aa="${this.catAberta}"]`) : null;
    const r = btn?.getBoundingClientRect();
    if (!btn || !r || (r.width === 0 && r.height === 0)) {
      // HUD escondida ou recolhida: fecha o menu
      if (this.catAberta && (!btn || !r || (r.width === 0 && r.height === 0))) this.catAberta = null;
      el.classList.add("oculto");
      this.esconderTip();
      return;
    }
    el.classList.remove("oculto");
    el.style.setProperty("--esc", hud.style.getPropertyValue("--esc") || 1);
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 200;
    const left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8);
    const top = r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10;
    el.style.left = `${left}px`;
    el.style.top = `${clamp(top, 8, window.innerHeight - h - 8)}px`;
  }

  static sincronizar() {
    if (!this.habilitado()) {
      this.catAberta = null;
      this.el?.classList.add("oculto");
      return;
    }
    this.garantir();
    this.renderPainel();
    this.posicionar();
  }
}

/* ---------- Configurações ---------- */

/** Liga/desliga o estilo do módulo nas mensagens padrão do chat (classe no <body>). */
function aplicarEstiloChat() {
  let ligado = false;
  // ligado para todos pelo Mestre (configuração do mundo); cada jogador ainda pode desligar só para si
  try { ligado = !!game.settings.get(ID, "estiloChat") && !!game.settings.get(ID, "estiloChatLocal"); } catch (err) { /* ainda não registrada */ }
  document.body.classList.toggle("t20ah-chat-estilo", ligado);
}

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
    hint: "A HUD mostra a imagem do token ou o retrato (portrait) do personagem.",
    scope: "client",
    config: true,
    type: String,
    choices: { token: "Token", portrait: "Retrato (portrait)" },
    default: "token",
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "menuAcoes", {
    name: "Mostrar os botões de Ações (regras rápidas)",
    hint: "Quatro botões acima da HUD (padrão, movimento, completa e livre) que listam as ações de combate, mostram o que cada uma faz e, ao clicar, gastam a ação e enviam um card ao chat.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => MenuAcoes.sincronizar()
  });
  game.settings.register(ID, "layoutCombate", {
    name: "Layout da HUD em combate",
    hint: "Largo: em combate, o painel com as ações (Padrão, Movimento, Completa e Livre) fica ao lado da HUD. Compacto: a HUD fica estreita e as ações abrem num menu flutuante.",
    scope: "client",
    config: true,
    type: String,
    choices: { largo: "Largo, com painel de ações ao lado", compacto: "Compacto, com menu flutuante" },
    default: "largo",
    onChange: () => AcoesHUD.render()
  });
  game.settings.register(ID, "cardAcoes", {
    name: "Enviar o card da ação ao chat",
    hint: "Ao usar uma ação pelos botões de Ações, envia ao chat um card com o nome, a descrição e o custo da ação.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(ID, "estiloChat", {
    name: "Estilo do módulo no chat",
    hint: "Aplica o visual do módulo a todas as mensagens do chat de todos os jogadores: cards de itens, magias e poderes, rolagens, condições, sussurros e mensagens digitadas. Todas as informações são mantidas; só muda o estilo. As cores seguem a cor de cada usuário.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => aplicarEstiloChat()
  });
  game.settings.register(ID, "ignorarTerceiros", {
    name: "Ignorar alterações de outros módulos no chat",
    hint: "Desfaz no chat tudo o que outros módulos acrescentam aos cards e mensagens (inclusive o resumo de encantos, a descrição recolhível e o selo de privacidade do t20-hayd-ui). Deixe desligado para usar os dois módulos juntos (padrão); o visual é sempre o deste módulo. Vale só para você. O chat é redesenhado ao mudar",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => ui.chat?.render?.(true)
  });
  game.settings.register(ID, "prefixosTerceiros", {
    name: "Prefixos de classes a ignorar",
    hint: "Prefixos (separados por vírgula) das classes dos módulos de terceiros. Elementos cujas classes são todas desse prefixo são removidos; nos demais, só as classes e variáveis com o prefixo saem. Padrão: t20a- (módulo t20a-chat).",
    scope: "client",
    config: true,
    type: String,
    default: "t20a-",
    onChange: () => ui.chat?.render?.(true)
  });
  game.settings.register(ID, "estiloChatLocal", {
    name: "Ver o estilo do módulo no meu chat",
    hint: "Desmarque para ver o chat com o visual original só no seu computador, mesmo com o estilo ligado pelo Mestre.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => aplicarEstiloChat()
  });
  game.settings.register(ID, "animacoesDano", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(ID, "animacoesVariante", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  class MenuAnimacoesDano extends foundry.applications.api.ApplicationV2 {
    async render() {
      abrirAnimacoesDano();
      return this;
    }
  }
  game.settings.registerMenu(ID, "menuAnimacoesDano", {
    name: "Animações do dano e da cura",
    label: "Escolher animações",
    hint: "Abre a lista de efeitos animados atrás do valor do dano e da cura nos cards: ative um por um, ou todos de uma vez. Vale só para você.",
    icon: "fa-solid fa-fire",
    type: MenuAnimacoesDano,
    restricted: false
  });
  game.settings.register(ID, "animarDanoTodos", {
    name: "Animar todos os tipos de dano do card",
    hint: "Quando a rolagem mistura tipos de dano (ex.: corte + fogo), mostra o efeito de cada tipo lado a lado atrás do valor. Desligado, só anima rolagens de um único tipo. Vale só para você.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(ID, "visualHud", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: () => aplicarVisualHud()
  });
  game.settings.register(ID, "escala", {
    name: "Tamanho da HUD",
    hint: "Ajusta a escala da HUD.",
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
  game.settings.register(ID, "gastoMovimentoMestre", {
    name: "Gastar movimento também do Mestre",
    hint: "Só vale para o Mestre (cada Mestre escolhe o seu): quando ligado, o movimento dos tokens movidos por você em combate é medido e gasta ações de movimento, como o dos jogadores. Desligado, você move livremente. Também pode ser alternado pelo botão de pegadas no topo da HUD.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => AcoesHUD.render()
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
    // v13/v14: campo de arquivo de áudio; se o campo moderno não existir, usa o seletor antigo
    ...(foundry.data?.fields?.FilePathField
      ? { type: new foundry.data.fields.FilePathField({ categories: ["AUDIO"], blank: true, initial: "" }) }
      : { type: String, filePicker: "audio" }),
    default: ""
  });
  game.settings.register(ID, "somVolume", {
    name: "Volume do som",
    hint: "Volume do alerta de tempo esgotado.",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8
  });
  game.settings.register(ID, "somQuemOuve", {
    name: "Quem ouve o som",
    hint: "Quem recebe o alerta quando o tempo do turno acaba.",
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

/* ---------- Organização da janela de configurações ---------- */

const GRUPOS_CONFIG = [
  ["Chat e cards", "fa-comments", ["estiloChat", "estiloChatLocal", "ignorarTerceiros", "prefixosTerceiros", "animarDanoTodos", "cardAcoes", "anunciarChat"]],
  ["HUD", "fa-id-card", ["mostrarGM", "imagem", "layoutCombate", "menuAcoes", "escala"]],
  ["Combate e regras", "fa-swords", ["limitarMovimento", "gastoMovimentoMestre", "bloquearForaDoTurno", "gastarPorItem", "deslocamentoPadrao", "metrosPorQuadrado", "regrasParaMestre"]],
  ["Tempo do turno e som", "fa-hourglass-half", ["tempoMaximo", "passarAoFim", "somArquivo", "somVolume", "somQuemOuve"]],
  ["Painel de Efeitos (Mestre)", "fa-wand-sparkles", ["painelEfeitos"]],
  ["Avançado", "fa-gear", ["debug"]]
];

/** Agrupa as opções do módulo em seções com título e marca cada uma como "Todos" (mundo) ou "Só você" (cliente). */
function organizarConfiguracoes(_app, html) {
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  if (!raiz?.querySelector || raiz.querySelector(".t20ah-sec")) return;
  const achar = (k) =>
    raiz.querySelector(`[data-setting-id="${ID}.${k}"]`) ?? raiz.querySelector(`[name="${ID}.${k}"]`)?.closest(".form-group");
  for (const [titulo, icone, chaves] of GRUPOS_CONFIG) {
    const itens = chaves.map((k) => [k, achar(k)]).filter(([, el]) => el);
    if (!itens.length) continue;
    const cab = document.createElement("h4");
    cab.className = "t20ah-sec";
    cab.innerHTML = `<i class="fa-solid ${icone}"></i> ${titulo}`;
    itens[0][1].before(cab);
    let ancora = cab;
    for (const [k, el] of itens) {
      ancora.after(el);
      ancora = el;
      const esc = game.settings.settings.get(`${ID}.${k}`)?.scope;
      const rotulo = el.querySelector("label");
      if (rotulo && esc && !rotulo.querySelector(".t20ah-esc")) {
        const b = document.createElement("span");
        b.className = `t20ah-esc ${esc === "world" ? "mundo" : "cliente"}`;
        b.textContent = esc === "world" ? "Todos" : "Só você";
        b.title = esc === "world" ? "Vale para todos os jogadores (definido pelo Mestre)" : "Vale só para você, neste navegador";
        rotulo.append(" ", b);
      }
    }
  }
}
Hooks.on("renderSettingsConfig", organizarConfiguracoes);

/* ---------- Hooks de combate ---------- */

Hooks.once("ready", () => {
  aplicarEstiloChat();
  const mod = game.modules.get(ID);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { gastarPorItem: (item) => AcoesHUD.aoUsarItem(item), tipoDeAcao });
  AcoesHUD.render();
  setInterval(() => AcoesHUD.tick(), 250);

  // Jogador sem permissão para avançar o combate pede ao Mestre
  if (game.combat?.started) ULTIMO_TURNO.set(game.combat.id, { round: game.combat.round, combatantId: game.combat.combatant?.id });
  game.socket.on(`module.${ID}`, async (data, userId) => {
    if (data?.tipo === "finta-resposta") {
      if (data.para === game.user.id) PEDIDOS.get(data.reqId)?.(data.resultado);
      return;
    }
    if (data?.tipo === "finta-pedir") {
      if (!game.user.isActiveGM) return;
      let resultado;
      try {
        resultado = await resolverFinta(data.dados);
      } catch (err) {
        console.error(`${ID} | erro ao resolver a finta`, err);
        resultado = { cancelado: true };
      }
      game.socket.emit(`module.${ID}`, { tipo: "finta-resposta", reqId: data.reqId, para: userId, resultado });
      return;
    }
    if (!["passar", "atrasar"].includes(data?.tipo) || !game.user.isActiveGM) return;
    const combat = game.combats.get(data.combatId);
    const atual = combat?.combatant;
    const quem = game.users.get(userId);
    if (!(atual?.id === data.combatenteId && quem && atual.testUserPermission(quem, "OWNER"))) return;
    if (data.tipo === "passar") combat.nextTurn();
    else if (Number.isFinite(Number(data.nova)) && Number(data.nova) < Number(atual.initiative)) executarAtraso(combat, atual, Number(data.nova));
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

/** Investida: –2 na Defesa (bônus de defesa da HUD) até o início do próximo turno do combatente. */
async function aplicarDefesaInvestida(c) {
  const actor = c?.actor;
  if (!actor || c.getFlag(ID, "investida")) return; // já aplicada neste turno
  const novo = defBonus(actor) - 2;
  if (novo === 0) await actor.unsetFlag(ID, "defBonus");
  else await actor.setFlag(ID, "defBonus", novo);
  await c.setFlag(ID, "investida", { aplicada: true });
}

/** Desfaz o –2 de Defesa da Investida. */
async function removerDefesaInvestida(c) {
  if (!c?.getFlag(ID, "investida")) return;
  const actor = c.actor;
  if (actor) {
    const novo = defBonus(actor) + 2;
    if (novo === 0) await actor.unsetFlag(ID, "defBonus");
    else await actor.setFlag(ID, "defBonus", novo);
  }
  await c.unsetFlag(ID, "investida");
}

/** Início de turno (só o Mestre ativo chama): reinicia o timer e renova as ações do combatente da vez. */
async function renovarAcoesDoTurno(combat) {
  combat.setFlag(ID, "turno", { chave: AcoesHUD.chaveTurno(combat), inicio: Date.now() }).catch(() => {});
  const c = combat.combatant;
  if (c) await removerDefesaInvestida(c).catch((err) => console.error(`${ID} |`, err));
  if (c && (() => { const x = getEstado(c); return x.std || x.mov || x.conv || x.full || x.ext || x.corrida || x.dist || x.hist?.length; })()) {
    try {
      await c.setFlag(ID, FLAG, { ...VAZIO });
    } catch (err) {
      console.error(`${ID} |`, err);
    }
  }
}

/**
 * Atrasar (Mestre ativo executa): baixa a Iniciativa do combatente da vez e mantém o turno no ponto em que estava,
 * de modo que quem vinha depois dele passa a agir agora e ele age quando a nova Iniciativa chegar.
 */
async function executarAtraso(combat, c, nova) {
  if (!combat?.started || combat.combatant?.id !== c?.id) return false;
  const t = combat.turn;
  await combat.setInitiative(c.id, nova);
  if (combat.turn !== t) await combat.update({ turn: t });
  if (combat.combatant?.id !== c.id) await renovarAcoesDoTurno(combat);
  return true;
}

Hooks.on("updateCombat", async (combat, changes) => {
  const anterior = ULTIMO_TURNO.get(combat.id);
  if (combat.started) ULTIMO_TURNO.set(combat.id, { round: combat.round, combatantId: combat.combatant?.id });
  // Só o Mestre ativo renova as ações no início de cada turno.
  if (game.user.isActiveGM && combat.started && ("turn" in changes || "round" in changes)) {
    if (anterior && anterior.combatantId !== combat.combatant?.id) await expirarFintas(combat, anterior);
    await renovarAcoesDoTurno(combat);
  }
  AcoesHUD.render();
});

Hooks.on("deleteCombat", async (combat) => {
  ULTIMO_TURNO.delete(combat.id);
  if (!game.user.isActiveGM) return;
  for (const c of combat.combatants) {
    await removerDefesaInvestida(c).catch(() => {});
    const f = c.getFlag(ID, "finta");
    if (!f) continue;
    try {
      const doc = await fromUuid(f.alvoUuid);
      await (doc?.actor ?? doc)?.toggleStatusEffect?.(f.statusId, { active: false });
    } catch (err) { /* ignora */ }
  }
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
  if (game.user.isGM && !cfg("regrasParaMestre") && !cfg("gastoMovimentoMestre")) return null;
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
    // v14: movement.animation.ended; v13: Token#movementAnimationPromise
    const pr = doc.movement?.animation?.ended ?? doc.object?.movementAnimationPromise;
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
    if (h.x) novo.ext = null;
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
  const maximo = maxMovimentos(e, temExtra(c.actor));
  dbg({ continuacao, pend, porAcao, total, necessarias, maximo, estado: e, deslocamentoM: deslocamentoMetros(c.actor) });

  // trechos seguintes da mesma jogada já foram validados no primeiro trecho
  const jaValidado = continuacao && TETO.has(doc.id);
  if (e.corrida) {
    // Corrida: só em linha reta, sem terreno difícil, até a distância tirada no teste de Atletismo
    if (!jaValidado) {
      if (!corridaEmLinhaReta(pontosDoMovimento(doc, movement), e.corrida.dir)) {
        ui.notifications.warn(`${c.name} só pode ${e.corrida.investida ? "investir" : "correr"} em linha reta.`);
        return false;
      }
      const custo = Number(movement?.pending?.cost);
      const geom = Number(movement?.pending?.distance);
      if (Number.isFinite(custo) && Number.isFinite(geom) && custo > geom + 0.01) {
        ui.notifications.warn(`${c.name} não pode ${e.corrida.investida ? "investir" : "correr"} através de terreno difícil.`);
        return false;
      }
      if (total > e.corrida.max + 0.01) {
        const resta = Math.max(0, e.corrida.max - (e.dist ?? 0)) * cfg("metrosPorQuadrado");
        ui.notifications.warn(`${e.corrida.investida ? "Investida" : "Corrida"}: ${c.name} só pode avançar mais ${(Math.round(resta * 10) / 10).toString().replace(".", ",")} m.`);
        return false;
      }
    }
  } else if (!jaValidado && necessarias > maximo) {
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
  // Ações de movimento já gastas por atividades (poderes, itens, Levantar-se...) contam como movimentos usados:
  // o deslocamento andado só pode usar as ações de movimento que sobraram (inclusive a padrão convertida).
  const usadas = necessarias + Math.max(0, Number(e.movAtividade) || 0);
  const extra = temExtra(c.actor);
  if (e.corrida) {
    // Corrida: o deslocamento sai do resultado do teste, não das ações de movimento
    const q = movement?.destination;
    const o = p.a;
    const L = q && o ? Math.hypot(q.x - o.x, q.y - o.y) : 0;
    if (!e.corrida.dir && L > 1) novo.corrida = { ...e.corrida, dir: { x: (q.x - o.x) / L, y: (q.y - o.y) / L } };
  } else if (e.full) {
    // completa já gastou padrão + movimento: andar só é possível com a ação extra (Velocidade)
    if (extra && !novo.ext) novo.ext = "movimento";
  } else {
    if (usadas >= 1) novo.mov = true;
    const stdLivre = !e.std || e.conv; // a ação padrão ainda pode virar movimento?
    if (usadas >= 2 && !novo.conv && !e.std) {
      novo.conv = true; // 2º movimento usa a ação padrão
      novo.std = true;
    }
    // 3º movimento (ou 2º, se a padrão já foi usada em outra coisa) usa a ação extra (Velocidade)
    if (extra && !novo.ext && (usadas >= 3 || (usadas >= 2 && !stdLivre))) novo.ext = "movimento";
  }
  const b = { x: doc.x, y: doc.y };
  const pts = pontosReais(doc, movement?.id, p.a, b);
  novo.hist = [
    ...(e.hist ?? []),
    { d: real, m: !e.mov && novo.mov, c: !e.conv && novo.conv, x: !e.ext && !!novo.ext, a: p.a, b, p: pts, mid: movement?.id ?? null }
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
  if (message.flags?.[ID]?.anuncio || message.flags?.[ID]?.card) return;
  const item = itemDaMensagem(message);
  dbg("chat", message.id, item?.name ?? "(sem item)");
  if (item) AcoesHUD.aoUsarItem(item);
});

window.addEventListener("resize", () => AcoesHUD.el?.isConnected && AcoesHUD.aplicarPosicao());

// Os ajustes deste módulo no chat são registrados no "setup", depois de todos os outros módulos terem registrado os seus:
// assim rodam por último e enxergam o HTML já alterado por eles (ex.: t20-hayd-ui, que reagrupa ataque e dano em blocos).
const filaChat = [];
const hookChat = { on(hook, fn) { filaChat.push([hook, fn]); }, primeiro(hook, fn) { filaChat.unshift([hook, fn]); } };
Hooks.once("setup", () => {
  for (const [hook, fn] of filaChat) Hooks.on(hook, fn);
  filaChat.length = 0;
});

// Ignorar alterações de módulos de terceiros no chat (opção do usuário). Para cada elemento marcado com um dos prefixos:
//  - invólucros (ex.: blocos que agrupam o título e a rolagem) são desfeitos: o conteúdo original volta ao lugar;
//  - elementos acrescentados pelo outro módulo (selos, etiquetas, fichas duplicadas, avatar) são removidos;
//  - elementos do sistema que só ganharam uma classe (ex.: o parágrafo escondido) apenas perdem a classe.
const ESTRUTURA_SISTEMA = new Set(["H2", "H3", "H4", "P", "LI", "UL", "OL", "B", "TIME", "A"]);
const MANTER_CLASSE = /^t20a-(descricao|recolhida)/; // o outro módulo controla a descrição por estas classes
function limparTerceiros(raiz) {
  let prefixos = [];
  try {
    if (!game.settings.get(ID, "ignorarTerceiros")) return;
    prefixos = String(game.settings.get(ID, "prefixosTerceiros") || "").split(",").map((x) => x.trim()).filter(Boolean);
  } catch (err) { return; }
  if (!prefixos.length) return;
  const eh = (c) => prefixos.some((p) => c.startsWith(p)) && !MANTER_CLASSE.test(c);
  const proprios = (el) => el.matches?.("[class*='t20ah']");
  const elementos = [raiz, ...raiz.querySelectorAll("*")].reverse(); // de dentro para fora
  for (const el of elementos) {
    if (!el.isConnected && el !== raiz) continue;
    const classes = [...el.classList];
    const deles = classes.filter(eh);
    if (deles.length && el !== raiz && deles.length === classes.length && !proprios(el)) {
      const temConteudoDoSistema = !!el.querySelector(".roll, .row, .dice-roll, .card-content, .card-upgrades, li, p, h4, h3, img:not([class]), button:not([class*='t20a'])");
      if (temConteudoDoSistema) { el.replaceWith(...el.childNodes); continue; } // desfaz o invólucro
      if (!ESTRUTURA_SISTEMA.has(el.tagName)) { el.remove(); continue; }       // acréscimo do outro módulo
    }
    if (deles.length) el.classList.remove(...deles);
    if (el.style?.length) {
      for (const prop of [...el.style]) if (prop.startsWith("--") && prefixos.some((p) => prop.slice(2).startsWith(p.replace(/-$/, "")))) el.style.removeProperty(prop);
    }
    for (const a of [...el.attributes]) if (a.name.startsWith("data-") && prefixos.some((p) => a.name.slice(5).startsWith(p))) el.removeAttribute(a.name);
  }
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.primeiro(hook, (message, html) => {
    const element = html?.[0] ?? html;
    if (element?.querySelectorAll) limparTerceiros(element);
  });
}

// Compatibilidade com o t20-hayd-ui (estilo "novo" do chat dele): ele reagrupa título e rolagem em blocos de grade e cria
// etiqueta do tipo e ficha própria, escondendo os originais. Aqui o card volta à estrutura que o visual deste módulo
// espera (título e rolagem como filhos diretos, tipo e ficha originais à vista); o que é função do outro módulo continua:
// descrição com três estados, resumo "Encantos e melhorias" com popover, listas de aprimoramentos, "mostrar mais" e o selo
// de privacidade. Roda depois dele (os ajustes são registrados no "setup") e antes dos demais ajustes deste módulo.
function adaptarHayd(raiz) {
  for (const card of raiz.querySelectorAll(".message-content .chat-card.t20a-cartao")) {
    for (const w of [...card.querySelectorAll(".t20a-rolagem")]) w.replaceWith(...w.childNodes);
    for (const w of [...card.querySelectorAll(".t20a-cartao-rolagens")]) w.replaceWith(...w.childNodes);
    card.querySelectorAll(".t20a-rolagem-titulo").forEach((r) => r.classList.remove("t20a-rolagem-titulo"));
    card.querySelectorAll(".t20a-cartao-ficha, .t20a-cartao-tipo").forEach((x) => x.remove());
    card.querySelectorAll(":scope > .card-item-header > .t20a-oculto").forEach((x) => x.classList.remove("t20a-oculto"));
    for (const c of [...card.classList]) if (c === "t20a-cartao" || /^t20a-cartao--(?!com-descricao)/.test(c)) card.classList.remove(c);
  }
  raiz.querySelectorAll(".t20a-rolagem-titulo").forEach((r) => r.classList.remove("t20a-rolagem-titulo"));
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.primeiro(hook, (message, html) => {
    const element = html?.[0] ?? html;
    if (element?.querySelectorAll) adaptarHayd(element);
  });
}

// Cards de ação: a identificação já está dentro do HTML do card; oculta o cabeçalho padrão do chat.
// "renderChatMessage" existe no v13 (antigo); "renderChatMessageHTML" é o atual (v13 em diante). Os dois são seguros juntos.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    if (!message.flags?.[ID]?.card) return;
    const element = html?.[0] ?? html;
    element?.classList?.add("t20ah-card-message");
  });
}

// Card de condição do sistema (título + ícone + tipo + descrição): reorganiza em topo / corpo e define a cor pelo TIPO da condição.
// Nenhum texto é removido; o visual vem do CSS (opção de estilo ligada).
const CORES_TIPO = [
  [/fisic/, "#c0392b"],      // física: vermelho-sangue
  [/mental/, "#8b5cf6"],       // mental: violeta
  [/sentid|sensor/, "#2fa8c9"], // sentidos: ciano
  [/moviment/, "#2f9e6a"],   // movimento: verde
  [/medo|pavor|terror/, "#5c6bc0"], // medo: azul-índigo
  [/fadiga|cansa|exaust/, "#c98a2b"], // fadiga: âmbar
  [/veneno|doenca|enferm/, "#7cb342"], // veneno/doença: verde-limão
  [/magi|arcan|mistic/, "#d05bc2"], // magia: magenta
  [/dano|sangr|fogo|queim/, "#e2672b"], // dano contínuo: laranja
  [/espirit|divin|sagrad/, "#e0c15c"], // espiritual: dourado claro
  [/ambient|clima|terreno/, "#3e8f9c"] // ambiente: verde-água
];
function corDoTipo(tipo, fallback) {
  const t = String(tipo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [re, cor] of CORES_TIPO) if (re.test(t)) return cor;
  if (t.trim()) {
    // tipo desconhecido: cor estável gerada pelo nome
    let h = 0;
    for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 52%)`;
  }
  return fallback || "#e0b85c";
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    // reconhece pelo título (label.titulo) ou, nas versões sem ele, pelo ícone em .../conditions/
    const conteudo = element?.querySelector?.(".message-content");
    if (!conteudo) return;
    const titulo = conteudo.querySelector("label.titulo");
    const bloco = titulo
      ? titulo.closest(".message-content > div")
      : [...conteudo.children].find((x) => x.tagName === "DIV" && x.querySelector("img[src*='/conditions/']"));
    if (!bloco || bloco.dataset.t20ahCond) return;
    bloco.dataset.t20ahCond = "1";
    bloco.classList.add("t20ah-cond");
    element.classList.add("t20ah-cond-message");
    const filhos = [...bloco.children];
    const pTitulo = titulo ? titulo.closest("p") ?? titulo : filhos.find((x) => x.tagName === "P");
    if (!pTitulo) return;
    (titulo ?? pTitulo).classList.add("cd-titulo");
    pTitulo.classList.add("cd-titulo-p");
    const canto = filhos.find((x) => x.tagName === "DIV" && x.querySelector("img")) ?? null;
    canto?.classList.add("cd-canto");
    const pTipo = filhos.find((x) => x.tagName === "P" && x !== pTitulo);
    pTipo?.classList.add("cd-tipo");
    const barra = filhos.find((x) => x.tagName === "DIV" && x !== canto);
    barra?.classList.add("cd-barra");
    // topo (ícone + tipo + título + barra) e corpo (descrição, listas, o que mais houver)
    const topo = document.createElement("div");
    topo.className = "cd-topo";
    const corpo = document.createElement("div");
    corpo.className = "cd-corpo";
    const doTopo = new Set([pTitulo, canto, pTipo, barra].filter(Boolean));
    for (const f of filhos) (doTopo.has(f) ? topo : corpo).append(f);
    corpo.querySelector("p")?.classList.add("cd-desc");
    bloco.replaceChildren(topo, corpo);
    // cor: pelo tipo; se o tipo for desconhecido, pela cor da barra do sistema
    const corBarra = /#[0-9a-f]{6}/i.exec(barra?.getAttribute?.("style") ?? "")?.[0];
    bloco.style.setProperty("--cor-cond", corDoTipo(pTipo?.textContent, corBarra));
  });
}

// Linha "Encantos e melhorias" que o módulo do chat (t20a-chat) acrescenta ao card: vira uma ficha discreta dentro do bloco
// de melhorias (o gatilho original, com o clique, é mantido). Observa o card porque o outro módulo pode inseri-la depois.
function ajustarResumoEfeitos(card) {
  const mover = () => {
    for (const r of card.querySelectorAll(":scope > .t20a-efeitos-resumo")) {
      for (const n of [...r.childNodes]) if (n.nodeType === 3) n.remove(); // "de <nome do item>"
      const custo = r.querySelector(".t20a-efeitos-custo");
      if (custo && /^\s*0\s*PM/i.test(custo.textContent)) custo.remove();
      let alvo = card.querySelector(":scope > .card-upgrades");
      if (!alvo) {
        alvo = document.createElement("div");
        alvo.className = "card-upgrades";
        card.querySelector(":scope > .card-header")?.after(alvo);
      }
      alvo.classList.remove("t20a-oculto"); // o bloco só tinha linhas resumidas (cada <li> continua escondido): o resumo mora nele
      alvo.prepend(r);
    }
  };
  mover();
  new MutationObserver(mover).observe(card, { childList: true });
}

// Card de item rolado (ataque, magia, poder): só reagrupa o que já existe (os botões e os eventos do sistema continuam
// nos mesmos elementos). Transforma a linha "Execução: ...; Alcance: ...;" em fichas e marca o card para o novo visual (CSS).
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const card = element?.querySelector?.(".message-content .chat-card");
    if (!card || card.dataset.t20ahItem) return;
    card.dataset.t20ahItem = "1";
    card.classList.add("t20ah-item");
    ajustarResumoEfeitos(card);
    const p = card.querySelector(".card-item-header p");
    if (!p) return;
    const fichas = [];
    let atual = null;
    const fecha = () => {
      if (atual && (atual.k || atual.v.length)) fichas.push(atual);
      atual = null;
    };
    for (const n of [...p.childNodes]) {
      if (n.nodeType === 1 && n.tagName === "B") {
        fecha();
        atual = { k: n.textContent.replace(/:\s*$/, "").trim(), v: [] };
      } else {
        atual ??= { k: "", v: [] };
        if (n.nodeType === 3) {
          const t = n.textContent.replace(/;\s*$/, "").replace(/^\s+/, "");
          if (t.trim()) atual.v.push(document.createTextNode(t.replace(/\s+$/, "")));
        } else atual.v.push(n);
      }
    }
    fecha();
    if (!fichas.length) return;
    const grade = document.createElement("div");
    grade.className = "it-stats";
    for (const f of fichas) {
      const d = document.createElement("div");
      d.className = "it-stat";
      if (f.k) {
        const k = document.createElement("span");
        k.className = "k";
        k.textContent = f.k;
        d.append(k);
      }
      const v = document.createElement("span");
      v.className = "v";
      v.append(...f.v);
      d.append(v);
      grade.append(d);
    }
    p.replaceChildren(grade);
  });
}

// Título "Dano" da rolagem: acrescenta o tipo de dano (Corte, Essência...); se for cura, o título vira só "Cura".
function tiposDaRolagem(roll) {
  const set = new Set();
  for (const f of roll.querySelectorAll(".part-flavor")) {
    const t = f.textContent.replace(/\s+/g, " ").trim();
    if (t) set.add(t);
  }
  if (!set.size) {
    const dica = roll.querySelector(".dice-formula")?.getAttribute("data-tooltip-html") ?? "";
    for (const m of dica.matchAll(/\[([^\]]+)\]/g)) {
      const t = m[1].trim();
      if (t) set.add(t.charAt(0).toUpperCase() + t.slice(1));
    }
  }
  return [...set];
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    for (const card of element?.querySelectorAll?.(".message-content .chat-card") ?? []) {
      for (const row of card.querySelectorAll(":scope > .row")) {
        const roll = row.nextElementSibling;
        if (!roll?.classList?.contains("roll") || row.dataset.t20ahTipo) continue;
        const titulo = row.textContent.replace(/\s+/g, " ").trim();
        if (!/^dano/i.test(titulo) && !/dano/i.test(roll.dataset.rollTitle ?? "")) continue;
        row.dataset.t20ahTipo = "1";
        const tipos = tiposDaRolagem(roll);
        if (tipos.some((t) => /(cura|recupera\w*)\s*(de\s*)?-?\s*(pm|mana)/i.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) row.textContent = "Recuperação de mana";
        else if (tipos.some((t) => /cura|recupera/i.test(t)) || /cura/i.test(titulo)) row.textContent = "Cura";
      }
    }
  });
}

// Ataque e Dano lado a lado: só posiciona os elementos numa grade de 4 colunas (nenhum elemento é movido, assim outros
// módulos que acrescentam coisas ao card continuam achando a estrutura de sempre). Os botões de aplicar dano/cura
// formam uma linha horizontal única, embaixo, com a largura toda.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const card = element?.querySelector?.(".message-content .chat-card.t20ah-item");
    if (!card || card.dataset.t20ahPares) return;
    card.dataset.t20ahPares = "1";
    const filhos = [...card.children];
    const pares = [];
    for (const row of filhos.filter((x) => x.classList.contains("row"))) {
      const roll = row.nextElementSibling;
      if (roll?.classList?.contains("roll")) pares.push([row, roll]);
    }
    if (pares.length < 2) return;
    card.classList.add("it-dois");
    const emPar = new Map();
    const botoes = [];
    pares.slice(0, 2).forEach(([row, roll], k) => {
      const col = k === 0 ? "1 / 3" : "3 / 5";
      emPar.set(row, [col, 0]);
      emPar.set(roll, [col, 1]);
      const bs = [...roll.querySelectorAll(":scope > .dice-btn button")];
      if (bs.length) {
        roll.classList.add("it-solto"); // o .roll "some" (display: contents) e seus filhos entram na grade do card
        const dr = roll.querySelector(":scope > .dice-roll");
        if (dr) emPar.set(dr, [col, 1]);
        botoes.push(...bs);
      }
    });
    const primeira = filhos.indexOf(pares[0][0]);
    let linha = 1;
    let base = null;
    const alturaPar = botoes.length ? 3 : 2;
    filhos.forEach((f, idx) => {
      if (emPar.has(f) && !f.classList.contains("dice-roll")) {
        const [col, off] = emPar.get(f);
        base ??= linha;
        f.style.gridColumn = col;
        if (!f.classList.contains("it-solto")) f.style.gridRow = String(base + off);
        if (off === 1 && col === "3 / 5") linha = base + alturaPar;
      } else {
        if (base !== null && idx > primeira && linha < base + alturaPar) linha = base + alturaPar;
        f.style.gridColumn = "1 / -1";
        f.style.gridRow = String(linha++);
      }
    });
    if (base !== null) {
      for (const [no, [col, off]] of emPar) {
        if (no.classList.contains("dice-roll")) {
          no.style.gridColumn = col;
          no.style.gridRow = String(base + off);
        }
      }
      botoes.forEach((b, n) => {
        b.style.gridColumn = String((n % 4) + 1);
        b.style.gridRow = String(base + 2);
      });
    }
  });
}

// Integração com módulos de terceiros que acrescentam avisos ao card de item (munição gasta, selos de melhorias/encantos,
// "Dano maximizado"): agrupa os três numa única linha logo abaixo do título (senão cada um cairia numa célula da grade).
const SEL_EXTRAS = ".hayd-municao-nota, .hbdg-linha, .t20g-minmax-aviso";
function agruparExtras(card) {
  const soltos = [...card.children].filter((x) => x.matches?.(SEL_EXTRAS));
  if (!soltos.length) return;
  let box = card.querySelector(":scope > .t20ah-extras");
  if (!box) {
    box = document.createElement("div");
    box.className = "t20ah-extras";
    const cab = card.querySelector(":scope > .card-header");
    if (cab) cab.after(box);
    else card.prepend(box);
  }
  // ordem: munição, aviso, selos
  const peso = (el) => (el.matches(".hayd-municao-nota") ? 0 : el.matches(".t20g-minmax-aviso") ? 1 : 2);
  box.append(...[...box.children, ...soltos].sort((a, b) => peso(a) - peso(b)));
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const card = element?.querySelector?.(".message-content .chat-card.t20ah-item");
    if (!card) return;
    const aplicar = () => {
      agruparExtras(card);
    };
    aplicar();
    // outros módulos podem acrescentar seus avisos depois: observa por alguns segundos
    if (card._t20ahExtrasObs) return;
    const obs = new MutationObserver(() => aplicar());
    obs.observe(card, { childList: true, subtree: true });
    card._t20ahExtrasObs = obs;
    setTimeout(() => obs.disconnect(), 6000);
  });
}

// 20 natural no d20 = crítico (caixa em explosão); 1 natural = falha crítica (caixa quebrada). Só marca o total (CSS faz o resto).
function marcarNatural(roll) {
  const total = roll?.querySelector?.(".dice-total");
  if (!total) return;
  // só contam os d20 que valem (descartados, como o menor de 2d20kh, ficam de fora)
  const d20 = [...roll.querySelectorAll(".dice-tooltip li.roll.die.d20, .dice-tooltip .dice-rolls li.d20")].filter((li) => !li.classList.contains("discarded") && !li.classList.contains("dropped"));
  const unicos = [...new Set(d20)];
  let nat = null;
  if (unicos.length === 1) {
    const v = parseInt(unicos[0].textContent, 10);
    // por enquanto só a falha crítica tem visual próprio (o acerto crítico voltou ao normal)
    if (v === 1) nat = "falha";
  }
  if (nat) total.dataset.nat = nat;
  else delete total.dataset.nat;
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    if (!element?.querySelectorAll) return;
    // todo d20 que sai 1 é erro crítico, em qualquer rolagem do chat (ataque, perícia, teste, rolagem avulsa)
    for (const r of element.querySelectorAll(".message-content .dice-roll")) marcarNatural(r);
  });
}

// Resultado do ataque contra a Defesa (módulo de terceiros): o banner grande é escondido e vira um símbolo ao lado do total
// do ataque (acerto / erro / crítico / desastre); "vs Alvo (Def N)" fica na dica do símbolo. O resultado é guardado (flag da
// mensagem quando possível e localStorage) e reaplicado se, depois do F5, o outro módulo não o devolver.
const CHAVE_RES = (id) => `${ID}.res.${id}`;
function lerBannerResultado(card) {
  const b = card.querySelector(".t20-result-banner");
  if (!b) return null;
  const txt = b.textContent.replace(/\s+/g, " ").trim();
  const cls = `${b.className} ${txt}`;
  let k = "erro";
  if (/fumble|desastre|falha cr/i.test(cls)) k = "desastre";
  else if (/crit/i.test(cls)) k = "critico";
  else if (b.classList.contains("success") || /acert|✓/i.test(txt)) k = "acerto";
  const label = b.querySelector(".t20-result-label")?.textContent.replace(/\s+/g, " ").trim() ?? "";
  return { k, label };
}
function rolagemDeAtaque(card) {
  const comBanner = card.querySelector(".roll:has(.t20-defense-check)");
  if (comBanner) return comBanner;
  const porTitulo = [...card.querySelectorAll(":scope > .roll")].find((r) => /ataque/i.test(r.dataset.rollTitle ?? ""));
  if (porTitulo) return porTitulo;
  for (const row of card.querySelectorAll(":scope > .row")) {
    if (!/ataque/i.test(row.textContent)) continue;
    // outros módulos podem inserir avisos entre o título e a rolagem
    let n = row.nextElementSibling;
    while (n && !n.classList.contains("roll") && !n.classList.contains("row")) n = n.nextElementSibling;
    if (n?.classList?.contains("roll")) return n;
  }
  return null;
}
function marcarResultado(card, res) {
  const roll = rolagemDeAtaque(card);
  const total = roll?.querySelector(".dice-total");
  if (!total || !res) return;
  if (total.dataset.res !== res.k) total.dataset.res = res.k;
  // sem texto no card: o alvo e a Defesa ficam só na dica do símbolo (passar o mouse)
  if (res.label && total.title !== res.label) total.title = res.label;
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const card = element?.querySelector?.(".message-content .chat-card.t20ah-item");
    if (!card || card.dataset.t20ahRes) return;
    card.dataset.t20ahRes = "1";
    const id = message?.id;
    const guardado = () => {
      const f = message?.flags?.[ID]?.resultado;
      if (f?.k) return f;
      try {
        return JSON.parse(localStorage.getItem(CHAVE_RES(id)) ?? "null");
      } catch {
        return null;
      }
    };
    const atualizar = () => {
      const novo = lerBannerResultado(card);
      const res = novo ?? guardado();
      if (!res) return false;
      marcarResultado(card, res);
      if (novo) {
        try {
          localStorage.setItem(CHAVE_RES(id), JSON.stringify(novo));
        } catch {
          /* sem armazenamento: segue sem guardar */
        }
        const f = message?.flags?.[ID]?.resultado;
        if (id && (f?.k !== novo.k || f?.label !== novo.label) && message.canUserModify?.(game.user, "update")) {
          message.setFlag(ID, "resultado", novo).catch(() => {});
        }
      }
      return !!novo;
    };
    atualizar();
    // o outro módulo pode acrescentar o banner depois de o card ser desenhado
    const obs = new MutationObserver(() => {
      if (atualizar()) obs.disconnect();
    });
    obs.observe(card, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  });
}

// Rolagem avulsa do Foundry (/r, rolagem da ficha sem card): marca a mensagem para receber o visual dos dados do módulo.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const conteudo = element?.querySelector?.(".message-content");
    if (!conteudo || conteudo.querySelector(".chat-card, .t20ah-card, .t20ah-cond")) return;
    if (conteudo.querySelector(".dice-roll")) element.classList.add("t20ah-rolagem");
  });
}

// Cards do t20-hayd-loja (compra, venda, saldo, estoque, construção, aprimoramento): são cards próprios, como os de tipo de ação:
// a moldura e o cabeçalho da mensagem saem (o nome do personagem já está dentro do card) e o visual é o deste módulo.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    if (!element?.querySelector?.(".message-content .t20-loja-message")) return;
    element.classList.add("t20ah-card-message", "t20ah-loja-message");
  });
}

// Mensagem digitada (só texto, sem card nem rolagem): marcada para receber o visual de texto do módulo.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    const element = html?.[0] ?? html;
    const conteudo = element?.querySelector?.(".message-content");
    if (!conteudo || element.classList.contains("t20ah-card-message")) return;
    if (conteudo.querySelector(".chat-card, .dice-roll, .t20ah-card, .t20ah-cond, label.titulo, [class*='item-piles']")) return;
    if (message.flags?.["item-piles"]) return;
    element.classList.add("t20ah-texto");
  });
}

// Cards padrão do chat (opção de estilo ligada): retrato do personagem antes do nome, na cor do usuário.
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => {
    if (message.flags?.[ID]?.card) return;
    const element = html?.[0] ?? html;
    if (!element?.querySelector) return;
    // mensagens de outros módulos que montam o próprio cabeçalho (ex.: Item Piles) ficam como estão
    if (message.flags?.["item-piles"] || element.querySelector("[class*='item-piles']")) {
      element.classList.add("t20ah-externo");
      return;
    }
    const autor = message.author ?? message.user;
    const sp = message.speaker ?? {};
    const tokenDoc = sp.scene && sp.token ? game.scenes?.get(sp.scene)?.tokens?.get(sp.token) : null;
    const ator = (sp.actor && game.actors?.get(sp.actor)) || tokenDoc?.actor || null;
    // a cor é a do jogador dono da ficha (não de quem rolou, que pode ser o Mestre); sem dono jogador, a de quem rolou
    const dono = ator ? game.users?.find((u) => !u.isGM && ator.testUserPermission?.(u, "OWNER")) : null;
    const corUsuario = dono ?? autor;
    const cor = String(corUsuario?.color?.css ?? corUsuario?.color ?? "");
    if (cor) element.style.setProperty("--cor-user", cor);
    const cab = element.querySelector(".message-header");
    if (!cab || cab.querySelector(".t20ah-retrato-msg")) return;
    const img = ator?.img || tokenDoc?.texture?.src || autor?.avatar || "";
    if (!img) return;
    const el = document.createElement("img");
    el.className = "t20ah-retrato-msg";
    el.src = img;
    el.alt = "";
    if (ator) {
      el.title = `Abrir a ficha de ${ator.name}`;
      el.classList.add("clicavel");
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!ator.testUserPermission?.(game.user, "LIMITED")) return ui.notifications.warn("Você não tem acesso à ficha deste personagem.");
        ator.sheet?.render(true);
      });
    }
    cab.prepend(el);
  });
}

/* ---------- limpeza do texto das rolagens ----------
   - "[corte]" e semelhantes saem das fórmulas (o tipo continua na etiqueta ao expandir os dados);
   - melhorias do item com custo 0 PM não mostram o gasto. */
function limparRolagens(element) {
  if (!element?.querySelectorAll) return;
  for (const f of element.querySelectorAll(".dice-formula, .part-formula")) {
    if (f.dataset.t20ahLimpo) continue;
    f.dataset.t20ahLimpo = "1";
    const w = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!/\[[^\]]*\]/.test(n.nodeValue)) continue;
      n.nodeValue = n.nodeValue.replace(/\s*\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ");
    }
  }
  for (const li of element.querySelectorAll(".card-upgrades li")) {
    if (li.dataset.t20ahLimpo) continue;
    li.dataset.t20ahLimpo = "1";
    const custo = /^\s*[+-]?0\s*PM\s*:?\s*$/i;
    let tirou = false;
    for (const e of li.querySelectorAll("*")) {
      if (e.children.length === 0 && custo.test(e.textContent)) {
        const prox = e.nextSibling;
        e.remove();
        if (prox?.nodeType === Node.TEXT_NODE) prox.nodeValue = prox.nodeValue.replace(/^\s*:\s*/, "");
        tirou = true;
      }
    }
    if (!tirou) {
      const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (/^\s*[+-]?0\s*PM\s*:?\s*/i.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(/^\s*[+-]?0\s*PM\s*:?\s*/i, "");
          break;
        }
      }
    }
  }
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => limparRolagens(html?.[0] ?? html));
}

/* ---------- dados do mesmo tipo juntos ----------
   Quando uma habilidade rola mais dados do mesmo tipo de dano/cura (ex.: 1d8 + 2d8, ambos "Cura"),
   o Foundry mostra um grupo por rolagem. Aqui eles viram um grupo só: dados lado a lado e subtotal somado. */
function juntarGruposIguais(element) {
  if (!element?.querySelectorAll) return;
  for (const wrap of element.querySelectorAll(".dice-tooltip .wrapper")) {
    if (wrap.dataset.t20ahJunto) continue;
    wrap.dataset.t20ahJunto = "1";
    const grupos = new Map();
    for (const parte of wrap.querySelectorAll(":scope > .tooltip-part")) {
      const flavor = parte.querySelector(".part-flavor")?.textContent.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
      if (!grupos.has(flavor)) grupos.set(flavor, []);
      grupos.get(flavor).push(parte);
    }
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      const [primeira, ...resto] = lista;
      const rolls = primeira.querySelector(".dice-rolls");
      if (!rolls) continue;
      let total = 0;
      const somaTotal = (p) => {
        const n = Number((p.querySelector(".part-total")?.textContent ?? "").replace(/[^\d-]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      total += somaTotal(primeira);
      const formulas = [primeira.querySelector(".part-formula")?.textContent.trim() ?? ""];
      for (const p of resto) {
        total += somaTotal(p);
        formulas.push(p.querySelector(".part-formula")?.textContent.trim() ?? "");
        for (const li of [...(p.querySelector(".dice-rolls")?.children ?? [])]) rolls.append(li);
        p.remove();
      }
      const ms = formulas.map((f) => /^(\d+)d(\d+)$/i.exec(f));
      const fp = primeira.querySelector(".part-formula");
      if (fp) {
        fp.textContent = ms.every((m) => m && m[2] === ms[0][2])
          ? `${ms.reduce((a, m) => a + Number(m[1]), 0)}d${ms[0][2]}`
          : formulas.filter(Boolean).join(" + ");
      }
      const ft = primeira.querySelector(".part-total");
      if (ft) ft.textContent = String(total);
      // com mais de um dado, o subtotal volta a aparecer
      primeira.querySelector(".dice-roll, .dice")?.classList.remove("um-dado");
    }
  }
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => juntarGruposIguais(html?.[0] ?? html));
}


/* ---------- animação do dano e da cura nos cards ----------
   Quando todo o dano (ou cura) da rolagem é de um único tipo, uma animação em pixel art roda atrás do valor
   (o número fica por cima). Efeitos em scripts/dano-fx.js. */
const ANIM_TIPOS = [
  ["fire", "Fogo"], ["acid", "Ácido"], ["lightning", "Eletricidade"], ["force", "Essência"], ["cold", "Frio"],
  ["radiant", "Luz"], ["psychic", "Psíquico"], ["necrotic", "Trevas"], ["slashing", "Corte"], ["piercing", "Perfuração"],
  ["bludgeoning", "Impacto"], ["heal", "Cura de PV"], ["manaheal", "Recuperação de mana"], ["drain", "Perda de vida"]
];
/** Efeitos ligados para este usuário (por padrão, todos). */
function animacoesAtivas() {
  const cfgAtual = game.settings.get(ID, "animacoesDano") ?? {};
  return new Set(ANIM_TIPOS.map(([k]) => k).filter((k) => cfgAtual[k] !== false));
}
/** Versão escolhida (0 = original, 1 e 2 = alternativas) de cada efeito, para este usuário. */
function variantesAnim() {
  return game.settings.get(ID, "animacoesVariante") ?? {};
}
async function abrirAnimacoesDano() {
  const ativas = animacoesAtivas();
  const variantes = variantesAnim();
  let fx = null;
  try { fx = await import("./dano-fx.js"); } catch (err) { /* sem pré-visualização */ }
  const cartas = ANIM_TIPOS.map(([k, nome]) => {
    const vs = fx?.variantsOf ? fx.variantsOf(k) : [];
    const seletor = vs.length > 1
      ? `<select class="pv-versao" name="v_${k}" title="Versão do efeito">${vs
          .map((v, i) => `<option value="${i}" ${Number(variantes[k] ?? 0) === i ? "selected" : ""}>${esc(v.label)}</option>`)
          .join("")}</select>`
      : "";
    return `
    <label class="t20ah-anim-carta ${ativas.has(k) ? "on" : ""}">
      <span class="pv-nome"><input type="checkbox" name="${k}" ${ativas.has(k) ? "checked" : ""}> ${nome}</span>
      <span class="pv" data-fx="${k}"><b>31</b></span>
      ${seletor}
    </label>`;
  }).join("");
  const conteudo = `
    <div class="t20ah-anim-topo">
      <button type="button" data-todos="1"><i class="fa-solid fa-check-double"></i> Ativar todos</button>
      <button type="button" data-todos="0"><i class="fa-solid fa-ban"></i> Desativar todos</button>
    </div>
    <div class="t20ah-anim-lista">${cartas}</div>`;
  const montados = [];
  try {
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Animações do dano e da cura" },
      classes: ["t20ah-anim-dialogo"],
      position: { width: 640 },
      content: conteudo,
      render: (ev, dialog) => {
        const raiz = dialog.element ?? ev.target?.element ?? ev.target;
        raiz.querySelectorAll("[data-todos]").forEach((b) =>
          b.addEventListener("click", () => raiz.querySelectorAll('.t20ah-anim-lista input[type="checkbox"]').forEach((c) => {
            c.checked = b.dataset.todos === "1";
            c.closest(".t20ah-anim-carta")?.classList.toggle("on", c.checked);
          }))
        );
        raiz.querySelectorAll('.t20ah-anim-lista input[type="checkbox"]').forEach((c) =>
          c.addEventListener("change", () => c.closest(".t20ah-anim-carta")?.classList.toggle("on", c.checked))
        );
        if (!fx) return;
        // pré-visualização: o mesmo efeito do chat, numa caixa de dano de exemplo
        const montar = (pv, variant) => {
          try {
            const m = fx.mountFx(pv, pv.dataset.fx, { pixel: 2, rise: 14, intensity: 0.95, variant });
            montados.push(m);
            return m;
          } catch (err) { return null; /* ignora */ }
        };
        raiz.querySelectorAll(".pv[data-fx]").forEach((pv) => {
          let m = montar(pv, Number(variantes[pv.dataset.fx] ?? 0));
          const sel = pv.closest(".t20ah-anim-carta")?.querySelector(".pv-versao");
          sel?.addEventListener("change", () => {
            m?.destroy();
            m = montar(pv, Number(sel.value));
          });
        });
      },
      ok: {
        label: "Salvar",
        callback: (ev, btn) => ({
          ativas: Object.fromEntries(ANIM_TIPOS.map(([k]) => [k, !!btn.form.elements[k]?.checked])),
          versoes: Object.fromEntries(ANIM_TIPOS.map(([k]) => [k, Number(btn.form.elements[`v_${k}`]?.value ?? 0) || 0]))
        })
      }
    });
    if (r) {
      await game.settings.set(ID, "animacoesVariante", r.versoes);
      await game.settings.set(ID, "animacoesDano", r.ativas);
    }
  } catch (err) {
    /* cancelado */
  } finally {
    montados.forEach((m) => m.destroy());
  }
}
/** Animação escolhida na ficha do item que gerou o card desta rolagem: { efeito: "fire" | "none" | "", versao }. */
function escolhaAnimacaoDoItem(dr) {
  const card = dr.closest(".chat-card[data-item-id]");
  if (!card) return null;
  const msgId = dr.closest("[data-message-id]")?.dataset.messageId;
  const sp = msgId ? game.messages?.get(msgId)?.speaker : null;
  const tokenDoc = sp?.scene && sp?.token ? game.scenes?.get(sp.scene)?.tokens?.get(sp.token) : null;
  const ator = game.actors?.get(card.dataset.actorId) ?? tokenDoc?.actor ?? (sp?.actor ? game.actors?.get(sp.actor) : null);
  const item = ator?.items?.get(card.dataset.itemId);
  const escolha = item?.getFlag?.(ID, "animacao");
  return escolha && typeof escolha === "object" ? escolha : null;
}

/** Janela "Animação do card" de um item: escolhe o efeito (ou nenhum) e a versão, com prévia. */
async function abrirAnimacaoDoItem(item) {
  let fx = null;
  try { fx = await import("./dano-fx.js"); } catch (err) { /* sem prévia */ }
  const atual = item.getFlag(ID, "animacao") ?? {};
  const opcoes = [
    ["", "Automática (pelo tipo do dano)"],
    ["none", "Nenhuma animação"],
    ...ANIM_TIPOS
  ];
  const conteudo = `
    <div class="t20ah-anim-item">
      <p>Animação do dano no card de <b>${esc(item.name)}</b>. Só aparece se o efeito estiver ativo em Configurações → Animações do dano.</p>
      <label>Efeito
        <select name="efeito">${opcoes.map(([k, n]) => `<option value="${k}" ${String(atual.efeito ?? "") === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <label class="ai-versao">Versão <select name="versao"></select></label>
      <div class="ai-previa"><span class="pv" data-fx=""><b>31</b></span></div>
    </div>`;
  let montado = null;
  try {
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Animação do card — ${item.name}` },
      classes: ["t20ah-anim-dialogo", "t20ah-anim-item-dlg"],
      position: { width: 380 },
      content: conteudo,
      render: (ev, dialog) => {
        const raiz = dialog.element ?? ev.target?.element ?? ev.target;
        const efeito = raiz.querySelector('[name="efeito"]');
        const versao = raiz.querySelector('[name="versao"]');
        const previa = raiz.querySelector(".ai-previa .pv");
        const atualizar = (manter) => {
          montado?.destroy();
          montado = null;
          const k = efeito.value;
          const vs = fx?.variantsOf && k && k !== "none" ? fx.variantsOf(k) : [];
          versao.innerHTML = vs.map((v, i) => `<option value="${i}">${esc(v.label)}</option>`).join("");
          versao.value = String(manter ? Number(atual.versao) || 0 : 0);
          raiz.querySelector(".ai-versao").style.display = vs.length > 1 ? "" : "none";
          previa.parentElement.style.display = vs.length ? "" : "none";
          if (!vs.length || !fx) return;
          previa.dataset.fx = k;
          try { montado = fx.mountFx(previa, k, { pixel: 2, rise: 14, intensity: 0.95, variant: Number(versao.value) || 0 }); } catch (err) { /* ignora */ }
        };
        efeito.addEventListener("change", () => atualizar(false));
        versao.addEventListener("change", () => {
          montado?.destroy();
          try { montado = fx.mountFx(previa, efeito.value, { pixel: 2, rise: 14, intensity: 0.95, variant: Number(versao.value) || 0 }); } catch (err) { /* ignora */ }
        });
        atualizar(true);
      },
      ok: { label: "Salvar", callback: (ev, btn) => ({ efeito: btn.form.elements.efeito.value, versao: Number(btn.form.elements.versao.value) || 0 }) }
    });
    if (r) {
      if (!r.efeito) await item.unsetFlag(ID, "animacao");
      else await item.setFlag(ID, "animacao", r);
      ui.chat?.render?.(true);
    }
  } catch (err) {
    /* cancelado */
  } finally {
    montado?.destroy();
  }
}
// Botão "Animação" no cabeçalho da ficha do item (ficha antiga e ApplicationV2)
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (!sheet.item) return;
  buttons.unshift({ label: "Animação", class: "t20ah-anim-item", icon: "fa-solid fa-fire", onclick: () => abrirAnimacaoDoItem(sheet.item) });
});
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const doc = app.document ?? app.item;
  if (!doc || doc.documentName !== "Item") return;
  controls.push({ icon: "fa-solid fa-fire", label: "Animação do card", action: "t20ahAnimacao", onClick: () => abrirAnimacaoDoItem(doc) });
});
function chaveEfeito(tipo, resolver) {
  const k = String(tipo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  if (/^cura\s*(de\s*)?(pm|mana)|^recuperacao.*(pm|mana)|^mana$/.test(k)) return "manaheal";
  if (/^perda\s*(de\s*)?(pv|vida)/.test(k)) return "drain";
  if (/^cura/.test(k)) return "heal";
  return resolver(k);
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, async (message, html) => {
    const ativas = animacoesAtivas();
    if (!ativas.size) return;
    const element = html?.[0] ?? html;
    const rolagens = element?.querySelectorAll?.(".message-content .dice-roll") ?? [];
    if (!rolagens.length) return;
    let fx;
    for (const dr of rolagens) {
      const total = dr.querySelector(".dice-total");
      if (!total || total.dataset.t20ahAnim) continue;
      // animação escolhida na ficha do item (se houver): vale para as rolagens de dano do card desse item
      const escolhaItem = escolhaAnimacaoDoItem(dr);
      if (escolhaItem?.efeito === "none") continue;
      const sobrescrita = escolhaItem?.efeito && dr.closest(".roll--dano") && ativas.has(escolhaItem.efeito) ? escolhaItem : null;
      const tipos = sobrescrita ? [sobrescrita.efeito] : tiposDaRolagem(dr);
      if (!tipos.length) continue; // sem tipo de dano associado (ex.: perícia): nada a animar
      try {
        fx ??= await import("./dano-fx.js");
        const chaves = [...new Set(tipos.map((t) => chaveEfeito(t, fx.resolveName)))];
        const validas = chaves.filter((c) => c && ativas.has(c));
        const versoes = sobrescrita ? { [sobrescrita.efeito]: Number(sobrescrita.versao) || 0 } : variantesAnim();
        const opcoes = { pixel: 2, rise: 12, intensity: 0.95 };
        if (chaves.length === 1 && validas.length === 1) {
          total.dataset.t20ahAnim = "1";
          total.classList.add("t20ah-anim");
          fx.mountFx(total, validas[0], { ...opcoes, variant: Number(versoes[validas[0]] ?? 0) });
        } else if (chaves.length > 1 && validas.length && cfg("animarDanoTodos")) {
          // vários tipos na mesma rolagem: cada tipo ocupa uma faixa do valor, lado a lado
          total.dataset.t20ahAnim = "1";
          total.classList.add("t20ah-anim", "t20ah-anim-multi");
          if (getComputedStyle(total).position === "static") total.style.position = "relative";
          total.style.isolation = "isolate";
          const caixa = document.createElement("div");
          caixa.className = "t20ah-anim-faixas";
          validas.forEach((k) => {
            const faixa = document.createElement("div");
            faixa.className = "t20ah-anim-faixa";
            caixa.append(faixa);
            fx.mountFx(faixa, k, { ...opcoes, variant: Number(versoes[k] ?? 0) });
          });
          total.append(caixa);
        }
      } catch (err) {
        console.warn(`${ID} | animação do dano indisponível`, err);
      }
    }
  });
}

/* ---------- rolagens em linha com tipo de dano ----------
   Em textos como "sofre [1d6] pontos de dano de fogo", a rolagem em linha não leva o tipo. Aqui o tipo lido do texto
   entra na fórmula ("1d6[fogo]"), assim a rolagem sai com o tipo associado (etiqueta e animação do dano). */
const TIPOS_TEXTO = /(fogo|[aá]cido|eletricidade|ess[eê]ncia|frio|luz|ps[ií]quico|trevas|corte|perfura[cç][aã]o|impacto)/i;
function associarTipoRolagemEmLinha(element) {
  if (!element?.querySelectorAll) return;
  for (const a of element.querySelectorAll("a.inline-roll[data-formula]")) {
    if (a.dataset.t20ahTipo) continue;
    a.dataset.t20ahTipo = "1";
    const f = a.dataset.formula ?? "";
    if (f.includes("[")) continue;
    // texto logo depois da rolagem, até o fim da frase
    let depois = "";
    for (let n = a.nextSibling; n && depois.length < 160; n = n.nextSibling) depois += n.textContent ?? "";
    depois = depois.split(/[.;]/)[0];
    const m = /dano\s+(?:de\s+|do\s+|da\s+)?(\S+)/i.exec(depois) ?? null;
    const alvo = m ? TIPOS_TEXTO.exec(m[1]) : null;
    let tipo = alvo ? alvo[1].toLowerCase() : null;
    if (!tipo) {
      // perda de vida (ex.: Sangrando): "perde 1d6 PV", "perda de pontos de vida"…
      const par = (a.closest("p, li, div")?.textContent ?? "").replace(/\s+/g, " ");
      if (/perd\w*[^.]{0,40}(pv|pontos? de vida|vida)|perda de (pv|vida)/i.test(par)) tipo = "perda de vida";
    }
    if (!tipo) continue;
    a.dataset.formula = `${f}[${tipo}]`;
    a.dataset.flavor ||= "";
  }
}
for (const hook of ["renderChatMessage", "renderChatMessageHTML"]) {
  hookChat.on(hook, (message, html) => associarTipoRolagemEmLinha(html?.[0] ?? html));
}


/* ---------- Visual da HUD (por usuário) ---------- */
const TEMAS_HUD = {
  vinho: { nome: "Vinho", bg1: "#1a1013", bg2: "#2b1a1d", faixa: "#c0392b" },
  cinza: { nome: "Cinza", bg1: "#101012", bg2: "#1f1f22", faixa: "#6b6b78" },
  noite: { nome: "Azul-noite", bg1: "#0e1322", bg2: "#1b2236", faixa: "#2f6fd0" },
  floresta: { nome: "Floresta", bg1: "#0e1a14", bg2: "#1a2a22", faixa: "#2f9e5a" },
  ametista: { nome: "Ametista", bg1: "#150f20", bg2: "#2a1d3a", faixa: "#8a4fd0" }
};
const VISUAL_PADRAO = { tema: "vinho", opacidade: 100, desfoque: 6, cantos: 0.9, destaque: "#e0b85c", faixa: "", principal: "" };

/** Mistura duas cores #rrggbb (p = parte da primeira, 0 a 1). */
function misturarHex(a, b, p) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((c, i) => Math.round(c * p + y[i] * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

function visualHud() {
  let v = {};
  try { v = game.settings.get(ID, "visualHud") ?? {}; } catch (err) { /* ainda não registrada */ }
  return { ...VISUAL_PADRAO, ...v };
}

/** Aplica o visual escolhido por este usuário à HUD e à gaveta (folha de estilo própria). */
function aplicarVisualHud() {
  const v = visualHud();
  let t = TEMAS_HUD[v.tema] ?? TEMAS_HUD.vinho;
  // cor principal personalizada: o fundo e a faixa do topo derivam dela (no lugar das cores do tema)
  if (/^#[0-9a-f]{6}$/i.test(v.principal ?? "")) {
    t = { ...t, bg2: misturarHex(v.principal, "#08080a", 0.3), bg1: misturarHex(v.principal, "#050507", 0.13), faixa: v.principal };
  }
  const op = Math.min(100, Math.max(30, Number(v.opacidade) || 100));
  const faixa = /^#[0-9a-f]{6}$/i.test(v.faixa ?? "") ? v.faixa : (t.faixa ?? "#c0392b");
  let st = document.getElementById("t20ah-visual");
  if (!st) {
    st = document.createElement("style");
    st.id = "t20ah-visual";
    document.head.appendChild(st);
  }
  const fundo = `linear-gradient(165deg, color-mix(in srgb, ${t.bg2} ${op}%, transparent), color-mix(in srgb, ${t.bg1} ${op}%, transparent))`;
  st.textContent = `
    #t20ah, #t20ah-gaveta, #t20ah-vol-pop, #t20ah-acoes, #t20ah-acoes-tip { --bg1: ${t.bg1}; --bg2: ${t.bg2}; --ouro: ${v.destaque}; }
    #t20ah { background: ${fundo} !important; border-color: color-mix(in srgb, ${v.destaque} 45%, transparent) !important; border-radius: ${Number(v.cantos)}em !important; backdrop-filter: blur(${Number(v.desfoque)}px) !important; }
    #t20ah-gaveta .gv-interno { background: ${fundo} !important; border-color: color-mix(in srgb, ${v.destaque} 45%, transparent) !important; backdrop-filter: blur(${Number(v.desfoque)}px); }
    #t20ah-gaveta, #t20ah-gaveta .gv-corpo { background: none !important; border: 0 !important; backdrop-filter: none !important; box-shadow: none !important; }
    #t20ah-gaveta .dn-titulo { background: ${t.bg2} !important; }
    #t20ah-gaveta .gv-aba { background: linear-gradient(90deg, ${t.bg1}, ${t.bg2}) !important; color: ${v.destaque} !important; border-color: color-mix(in srgb, ${v.destaque} 45%, transparent) !important; }
    #t20ah-gaveta:not(.aberta) .gv-corpo, #t20ah-gaveta:not(.aberta) .gv-interno { background: none !important; border: 0 !important; box-shadow: none !important; backdrop-filter: none !important; }
    #t20ah .t20ah-cabeca { background: linear-gradient(90deg, color-mix(in srgb, ${faixa} 35%, transparent), transparent 75%) !important; border-bottom-color: color-mix(in srgb, ${v.destaque} 25%, transparent) !important; }
  `;
}
Hooks.once("ready", aplicarVisualHud);

let PAINEL_VISUAL_FECHAR = null;
function abrirVisualHud(btn) {
  if (document.getElementById("t20ah-visual-pop")) return PAINEL_VISUAL_FECHAR?.();
  const salvar = (parc) => game.settings.set(ID, "visualHud", { ...visualHud(), ...parc });
  const v = visualHud();
  const esc1 = Number(game.settings.get(ID, "escala"));
  const pop = document.createElement("div");
  pop.id = "t20ah-visual-pop";
  pop.innerHTML = `
    <header><i class="fa-solid fa-sliders"></i><strong>Visual da HUD</strong>
      <button type="button" class="vp-x" data-vp="fechar" title="Fechar"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="vp-temas">${Object.entries(TEMAS_HUD).map(([k, t]) => `
      <button type="button" class="vp-tema ${v.tema === k ? "sel" : ""}" data-tema="${k}" title="${t.nome}" style="--a:${t.bg2};--b:${t.bg1}"><span>${t.nome}</span></button>`).join("")}</div>
    <label class="vp-lin"><span>Tamanho</span><input type="range" data-k="escala" min="0.8" max="1.5" step="0.05" value="${esc1}"><output>${Math.round(esc1 * 100)}%</output></label>
    <label class="vp-lin"><span>Opacidade</span><input type="range" data-k="opacidade" min="30" max="100" step="5" value="${v.opacidade}"><output>${v.opacidade}%</output></label>
    <label class="vp-lin"><span>Desfoque</span><input type="range" data-k="desfoque" min="0" max="16" step="1" value="${v.desfoque}"><output>${v.desfoque}px</output></label>
    <label class="vp-lin"><span>Cantos</span><input type="range" data-k="cantos" min="0" max="1.6" step="0.1" value="${v.cantos}"><output>${v.cantos}</output></label>
    <label class="vp-lin"><span>Cor principal</span><input type="color" data-k="principal" value="${/^#[0-9a-f]{6}$/i.test(v.principal ?? "") ? v.principal : (TEMAS_HUD[v.tema]?.faixa ?? "#c0392b")}"></label>
    <label class="vp-lin"><span>Destaque</span><input type="color" data-k="destaque" value="${v.destaque}"></label>
    <label class="vp-lin"><span>Faixa do topo</span><input type="color" data-k="faixa" value="${/^#[0-9a-f]{6}$/i.test(v.faixa ?? "") ? v.faixa : (TEMAS_HUD[v.tema]?.faixa ?? "#c0392b")}"></label>
    <footer><button type="button" data-vp="padrao"><i class="fa-solid fa-rotate-left"></i> Restaurar padrão</button></footer>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = `${Math.min(Math.max(r.right - 150, 8), window.innerWidth - 308)}px`;
  pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 8)}px`;
  const fechar = () => {
    pop.remove();
    document.removeEventListener("pointerdown", fora, true);
    PAINEL_VISUAL_FECHAR = null;
  };
  const fora = (ev) => { if (!pop.contains(ev.target) && !ev.target.closest?.('[data-acao="visual"]')) fechar(); };
  PAINEL_VISUAL_FECHAR = fechar;
  setTimeout(() => document.addEventListener("pointerdown", fora, true), 0);
  pop.addEventListener("input", (ev) => {
    const i = ev.target.closest("input[data-k]");
    if (!i) return;
    const k = i.dataset.k;
    const val = k === "destaque" || k === "faixa" || k === "principal" ? i.value : Number(i.value);
    const out = i.parentElement.querySelector("output");
    if (out) out.textContent = k === "escala" ? `${Math.round(val * 100)}%` : k === "opacidade" ? `${val}%` : k === "desfoque" ? `${val}px` : val;
    if (k === "escala") game.settings.set(ID, "escala", val);
    else salvar({ [k]: val });
  });
  pop.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.vp === "fechar") return fechar();
    if (b.dataset.tema) {
      pop.querySelectorAll(".vp-tema").forEach((x) => x.classList.toggle("sel", x === b));
      salvar({ tema: b.dataset.tema, faixa: "", principal: "" }); // o tema traz as suas próprias cores
      const pr = pop.querySelector('input[data-k="principal"]');
      if (pr) pr.value = TEMAS_HUD[b.dataset.tema]?.faixa ?? "#c0392b";
      const fx = pop.querySelector('input[data-k="faixa"]');
      if (fx) fx.value = TEMAS_HUD[b.dataset.tema]?.faixa ?? "#c0392b";
    }
    if (b.dataset.vp === "padrao") {
      game.settings.set(ID, "visualHud", {});
      game.settings.set(ID, "escala", 1);
      fechar();
    }
  });
}

/* ---------- mensagens compactas de outros módulos (ex.: Tiny Monitor) ----------
   Elas não têm lixeira e bloqueiam o menu do botão direito. Aqui o clique direito sempre abre um menu:
   se o menu nativo do Foundry não aparecer, mostramos um com Excluir e Copiar texto. */
Hooks.once("ready", () => {
  // captura na janela (antes de qualquer outro módulo) e abre o menu na hora
  window.addEventListener("contextmenu", (ev) => {
    const li = ev.target.closest?.(".chat-message.tiny-monitor-msg, .chat-message[class*='tiny-monitor']");
    if (!li || ev.target.closest("a.content-link")) return;
    const msg = game.messages.get(li.dataset.messageId);
    if (!msg) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const x = ev.clientX, y = ev.clientY;
    document.getElementById("t20ah-menu-msg")?.remove();
    const m = document.createElement("div");
    m.id = "t20ah-menu-msg";
    const itens = [];
    itens.push(["fa-copy", "Copiar texto", async () => {
      try { await navigator.clipboard.writeText(li.querySelector(".message-content")?.innerText?.trim() ?? ""); } catch (err) { /* ignora */ }
    }]);
    if (msg.canUserModify(game.user, "delete")) itens.push(["fa-trash", "Excluir mensagem", () => msg.delete()]);
    m.innerHTML = itens.map(([ic, t], i) => `<button type="button" data-i="${i}"><i class="fa-solid ${ic}"></i> ${t}</button>`).join("");
    document.body.appendChild(m);
    m.style.left = `${Math.max(4, Math.min(x, window.innerWidth - m.offsetWidth - 8))}px`;
    m.style.top = `${Math.max(4, Math.min(y, window.innerHeight - m.offsetHeight - 8))}px`;
    const fechar = () => { m.remove(); document.removeEventListener("pointerdown", fora, true); };
    const fora = (e) => { if (!m.contains(e.target)) fechar(); };
    m.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { itens[Number(b.dataset.i)][2](); fechar(); }
    });
    setTimeout(() => document.addEventListener("pointerdown", fora, true), 0);
  }, true);
});
