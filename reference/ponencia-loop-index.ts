// PONENCIA LOOP · Sala de Análisis Legislativo — JRCH Fiducia LLC
// Pipeline: resolver → cruce_sutra → cruce_ratio → cruce_federal → analisis → ponencia (T-01)
// Cada invocación "avanzar" corre UNA etapa (máquina de estados persistida en ponencia_jobs).
// GATES: citas PR solo si EXISTEN en el corpus Ratio (14,227 TSPR); federal solo de CourtListener live;
// post-gate mecánico marca toda cita fuera del arsenal. Output SIEMPRE = BORRADOR — NO SOMETER.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("PONENCIA_MODEL") ?? Deno.env.get("LEXINTEL_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const CL_TOKEN = Deno.env.get("CL_API_TOKEN") ?? "";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ETAPAS = ["resolver", "cruce_sutra", "cruce_ratio", "cruce_federal", "analisis", "ponencia"] as const;

const POSTURAS: Record<string, string> = {
  favor: "A FAVOR de la aprobación de la medida: endoso con fundamentos de política pública y beneficios concretos.",
  contra: "EN CONTRA de la aprobación: oposición fundamentada en los defectos, riesgos o costos de la medida.",
  deferencia: "DEFERENCIA AL FIN LOABLE: se reconoce y apoya el propósito de la medida, PERO se señala respetuosamente que la encomienda corresponde a otra entidad, agencia o instrumentalidad distinta a la designada en la medida, explicando por qué.",
  fuente_fondos: "FUENTE DE FONDOS / PROMESA: se reconoce el fin loable, PERO la medida tiene impacto económico y requiere la identificación clara de la fuente de fondos y el informe de efecto fiscal (OPAL, Ley 1-2023) — sin ello enfrenta riesgo real en el proceso de revisión de la Junta de Supervisión Fiscal bajo PROMESA §204 (planteado como riesgo anticipatorio de cumplimiento, no como requisito procesal interno de la Asamblea).",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ─── LLM helpers ───────────────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens: number): Promise<{ text: string; stop: string }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
  const out = await resp.json();
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(out.content) ? out.content : [];
  const text = blocks.filter((b) => b?.type === "text" && b.text).map((b) => b.text).join("\n").trim();
  if (!text) throw new Error(`El motor no devolvió texto (stop=${out.stop_reason})`);
  return { text, stop: out.stop_reason };
}

function parseJsonLoose(text: string): any {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("respuesta sin JSON");
  return JSON.parse(text.slice(a, b + 1));
}

// parse con pase de reparación: si el JSON del modelo viene malformado (p.ej. comillas
// sin escapar de títulos legislativos), un segundo modelo lo repara antes de rendirse.
async function parseJsonConReparacion(text: string): Promise<any> {
  try { return parseJsonLoose(text); } catch (_e) { /* reparar */ }
  const { text: fixed } = await callClaude(
    `Eres un reparador de JSON. Recibes un JSON malformado (típicamente comillas sin escapar dentro de strings). Devuelves SOLO el JSON corregido y válido, sin markdown, sin comentarios, preservando todo el contenido.`,
    text.slice(0, 20_000),
    4000,
  );
  return parseJsonLoose(fixed);
}

// Llamada larga con auto-continuación: si corta por max_tokens, una segunda llamada
// continúa exactamente donde quedó (máx 1 continuación; si aún corta, se declara).
async function callClaudeLong(system: string, user: string, maxTokens: number): Promise<string> {
  const first = await callClaude(system, user, maxTokens);
  let text = first.text;
  if (first.stop === "max_tokens") {
    const cont = await callClaude(
      system,
      `${user}\n\n---\nEl documento quedó CORTADO a mitad. Este es el final de lo ya escrito:\n\u{2026}${text.slice(-2500)}\n\nCONTINÚA EXACTAMENTE donde quedó cortado (sin repetir nada, sin re-empezar secciones) hasta terminar el documento completo.`,
      maxTokens,
    );
    text = text + cont.text;
    if (cont.stop === "max_tokens") text += "\n\n> ⚠️ **TRUNCADO tras continuación** — completar en revisión.";
  }
  return text;
}

async function embed(text: string): Promise<number[] | null> {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000), dimensions: 1536 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()).data[0].embedding;
  } catch { return null; }
}

// ─── util ──────────────────────────────────────────────────────────────────
function normalizeCodigo(raw: string): { padded: string; compacto: string } | null {
  const m = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^([A-Z]{2,3})0*(\d{1,4})$/);
  if (!m) return null;
  return { padded: m[1] + m[2].padStart(4, "0"), compacto: m[1] + String(parseInt(m[2], 10)) };
}

function normCita(s: string): string {
  return String(s ?? "").toUpperCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

async function throttle(): Promise<boolean> {
  const { count } = await sb.from("lexintel_log").select("id", { count: "exact", head: true })
    .eq("fn", "loop").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  return (count ?? 0) < 60;
}

// ═══ ETAPA 1 · RESOLVER ═════════════════════════════════════════════════════
async function etapaResolver(job: any) {
  let contexto = "", tramite: any = null, titulo = job.titulo ?? "";
  if (job.fuente === "sutra") {
    const codes = normalizeCodigo(job.codigo);
    if (!codes) throw new Error("código de medida inválido");
    const { data } = await sb.rpc("ponencia_medida_detalle", { p_codigo: codes.padded });
    const med = data?.[0];
    if (!med) throw new Error(`La medida ${codes.padded} no está en el hub SUTRA (término vigente).`);
    titulo = med.titulo;
    tramite = {
      codigo: med.codigo, tipo: med.tipo, fecha_radicacion: med.fecha_radicacion,
      estatus_aprox: med.estatus_aprox, autor_principal: med.autor_principal,
      comision_actual: med.comision_actual, estatus: med.estatus, ultima_accion: med.ultima_accion,
      iea_resumen: med.iea_resumen, iea_banda: med.iea_banda, materia_tags: med.materia_tags,
      en_catalogo: med.en_catalogo,
      fuente_datos: med.en_catalogo ? "hub SUTRA + catálogo radar enriquecido" : "hub SUTRA (solo título y trámite aproximado)",
    };
    contexto = `TÍTULO OFICIAL (SUTRA):\n${String(med.titulo).slice(0, 9000)}`;
  } else {
    const texto = String(job.texto_medida ?? "").slice(0, 55_000);
    if (texto.length < 200) throw new Error("El texto de la medida es muy corto (mínimo 200 caracteres).");
    contexto = `TEXTO DE LA MEDIDA (provisto por el usuario):\n${texto}`;
  }

  const system = `Eres analista legislativo de Puerto Rico. Extraes estructura de proyectos de ley. Devuelves SOLO JSON válido, sin markdown.`;
  const user = `Analiza esta medida legislativa de Puerto Rico y devuelve JSON con EXACTAMENTE estas llaves:
{
 "titulo_corto": "título abreviado ≤120 chars",
 "resumen": "3-4 oraciones, qué hace la medida",
 "materia": "área(s) de derecho",
 "conceptos": ["4 a 6 conceptos jurídicos buscables en jurisprudencia PR, en español, 2-5 palabras c/u"],
 "conceptos_en": ["los mismos conceptos en inglés jurídico para búsqueda federal"],
 "leyes_citadas": [{"nombre":"nombre común","numero":"75","ano":1975,"accion":"enmienda|deroga|refiere"}],
 "impacto_fiscal": {"tiene": true/false, "razon": "por qué"}
}
Reglas: leyes_citadas = SOLO leyes que el texto menciona expresamente (máx 10, prioriza derogaciones y enmiendas estructurales; nombre ≤60 chars). Si no constan, []. En "nombre" NO uses comillas — escribe el nombre común sin comillas tipográficas ni dobles. Sé CONCISO: el JSON completo debe caber sin cortarse.
${job.codigo ? `MEDIDA: ${job.codigo}` : ""}
${contexto}`;
  const valido = (x: any) => Array.isArray(x?.conceptos) && x.conceptos.length >= 2 && Array.isArray(x?.conceptos_en) && x.conceptos_en.length >= 2;
  let r: any = null;
  try {
    const { text } = await callClaude(system, user, 4000);
    r = await parseJsonConReparacion(text);
  } catch (_e) { /* reintento abajo */ }
  if (!valido(r)) {
    // reintento único más estricto — un resolver degradado envenena todo el loop
    const { text } = await callClaude(system, user + `\n\nIMPORTANTE: la respuesta anterior salió incompleta. Devuelve el JSON COMPLETO con TODAS las llaves (conceptos y conceptos_en son obligatorios), leyes_citadas máx 8 y razon fiscal ≤200 chars.`, 4000);
    r = await parseJsonConReparacion(text);
  }
  if (!valido(r)) throw new Error("el resolver no produjo conceptos completos — reintenta la etapa");
  return { ...r, titulo_oficial: titulo ? String(titulo).slice(0, 2000) : null, tramite };
}

// ═══ ETAPA 2 · CRUCE SUTRA (término vigente + leyes vigentes) ══════════════
const FC_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";

function extraerPartido(autor: string | null): string | null {
  const m = String(autor ?? "").match(/\((PNP|PPD|PIP|MVC|PD|IND[A-ZÁÉÍÓÚ]*)\)/i);
  if (!m) return null;
  const p = m[1].toUpperCase();
  return p.startsWith("IND") ? "IND" : p;
}

// autor de una medida fuera del catálogo: caché permanente → Firecrawl al detalle SUTRA
// (composición legislativa estable hasta 2028: un scrape por medida sirve todo el cuatrienio)
const AUTOR_BASURA = /no\s*(encontrado|especificado|disponible)|desconocido|not\s*found|n\/a|unknown|sin\s*autor|autor\s*principal/i;
const PARTIDOS_VALIDOS = new Set(["PNP", "PPD", "PIP", "MVC", "PD", "IND"]);

async function scrapeAutor(codigo: string, detailId: number | null): Promise<{ autor: string | null; partido: string | null }> {
  if (!FC_KEY || !detailId) return { autor: null, partido: null };
  try {
    const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FC_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://sutra.oslpr.org/medidas/${detailId}`,
        formats: ["json"], onlyMainContent: true, waitFor: 5000,
        jsonOptions: {
          prompt: "De la sección de autores de esta medida legislativa: autor_principal = nombre del primer autor EXACTAMENTE como aparece (ej. 'Méndez Núñez, Carlos J.'); partido = las siglas del partido que aparecen junto a ese autor (PNP, PPD, PIP, MVC, PD o IND). Si el dato NO aparece en la página, devuelve null en ese campo — NUNCA inventes ni escribas 'desconocido' o 'no encontrado'.",
          schema: { type: "object", properties: { autor_principal: { type: ["string", "null"] }, partido: { type: ["string", "null"] } } },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { autor: null, partido: null };
    const d = await r.json();
    let autor = d?.data?.json?.autor_principal ? String(d.data.json.autor_principal).slice(0, 160).trim() : null;
    // gate anti-basura: placeholders del extractor NO son autores
    if (autor && (AUTOR_BASURA.test(autor) || autor.length < 5 || !/\s/.test(autor))) autor = null;
    let partido = String(d?.data?.json?.partido ?? "").toUpperCase().replace(/[^A-Z]/g, "") || null;
    if (partido && partido.startsWith("IND")) partido = "IND";
    if (partido && !PARTIDOS_VALIDOS.has(partido)) partido = null;
    if (!partido) partido = extraerPartido(autor);
    if (autor) {
      await sb.from("sutra_autores_cache").upsert({ codigo, autor: partido && !autor.includes("(") ? `${autor} (${partido})` : autor, partido, fuente: "firecrawl-detalle-sutra", scraped_at: new Date().toISOString() });
    }
    return { autor, partido };
  } catch { return { autor: null, partido: null }; }
}

async function etapaCruceSutra(job: any, resolver: any) {
  const conceptos: string[] = (resolver.conceptos ?? []).slice(0, 6);
  const q = conceptos.join(" OR ");
  const excluir = job.fuente === "sutra" ? (normalizeCodigo(job.codigo)?.padded ?? "") : "";
  const { data: rel } = await sb.rpc("ponencia_medidas_relacionadas", { p_q: q, p_excluir: excluir, p_limit: 8 });

  // enriquecer proyectos familia con el catálogo radar + autor/partido
  const relCodes = (rel ?? []).map((r: any) => r.codigo);
  let enriquecidas: any[] = [], cacheAutores: any[] = [];
  if (relCodes.length) {
    const [{ data: enr }, { data: cache }] = await Promise.all([
      sb.from("normativa_medidas")
        .select("numero_padded,numero_compacto,estatus,iea_banda,comision_actual,vista_publica_proxima,autor_principal")
        .or(relCodes.map((c: string) => `numero_padded.eq.${c}`).join(",")),
      sb.from("sutra_autores_cache").select("codigo,autor,partido").in("codigo", relCodes),
    ]);
    enriquecidas = enr ?? [];
    cacheAutores = cache ?? [];
  }
  let relacionadas = (rel ?? []).map((r: any) => {
    const e = enriquecidas.find((x) => x.numero_padded === r.codigo || x.numero_compacto === r.codigo);
    const c = cacheAutores.find((x) => x.codigo === r.codigo);
    const autor = e?.autor_principal ?? c?.autor ?? null;
    return {
      ...r,
      autor,
      partido: c?.partido ?? extraerPartido(autor),
      radar: e ? { estatus: e.estatus, iea_banda: e.iea_banda, comision: e.comision_actual, vista_proxima: e.vista_publica_proxima } : null,
    };
  });

  // scrape del autor para las que faltan (máx 6 por corrida; queda cacheado para siempre)
  const sinAutor = relacionadas.filter((r: any) => !r.autor && r.detail_id).slice(0, 6);
  if (sinAutor.length) {
    const scraped = await Promise.all(sinAutor.map((r: any) => scrapeAutor(r.codigo, r.detail_id)));
    relacionadas = relacionadas.map((r: any) => {
      const i = sinAutor.findIndex((s: any) => s.codigo === r.codigo);
      if (i < 0 || !scraped[i].autor) return r;
      return { ...r, autor: scraped[i].autor, partido: scraped[i].partido };
    });
  }

  // leyes citadas × registro de vigencia (statutes curadas LexWatch)
  const leyes = (resolver.leyes_citadas ?? []).slice(0, 15);
  const cruces: any[] = [];
  for (const l of leyes) {
    let hit = null;
    if (l.numero != null) {
      const { data } = await sb.from("statutes")
        .select("law_number,law_year,short_name,title,status,status_date,repealed_by,replaced_by,corpus_citation_count,area_practica")
        .eq("law_number", String(l.numero)).limit(2);
      hit = (data ?? []).find((s: any) => !l.ano || s.law_year === l.ano) ?? (data ?? [])[0] ?? null;
    }
    cruces.push({
      ley: l,
      registro: hit ? {
        short_name: hit.short_name, status: hit.status, status_date: hit.status_date,
        repealed_by: hit.repealed_by, replaced_by: hit.replaced_by,
        veces_citada_en_corpus_tspr: hit.corpus_citation_count, area: hit.area_practica,
      } : null,
      nota: hit ? "en registro de vigencia LexWatch" : "no está en el registro curado — verificar vigencia manualmente",
    });
  }
  return {
    medidas_relacionadas_termino_vigente: relacionadas,
    leyes_citadas_cruce: cruces,
    fuentes: "hub SUTRA 2025-2028 (4,978 medidas, sync diario) + registro de vigencia statutes (curado)",
  };
}

// ═══ ETAPA 3 · CRUCE RATIO BORICUA (jurisprudencia TSPR verificada) ════════
function limpiaSnippet(s: string): string {
  return String(s ?? "").replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim().slice(0, 260);
}
// citas con "____" = pendientes de foliar → NO citables en el borrador
function citaUtilizable(c: string | null): string | null {
  return c && !/_{2,}/.test(c) ? c : null;
}

async function etapaCruceRatio(_job: any, resolver: any) {
  const conceptos: string[] = (resolver.conceptos ?? []).slice(0, 4);
  const hits = new Map<string, { n: number; via: Set<string>; snippet?: string }>();

  for (const c of conceptos) {
    const { data } = await sb.rpc("search_opinions_keyword", { search_query: c.slice(0, 200), match_count: 6 });
    for (const r of data ?? []) {
      const h = hits.get(r.opinion_id) ?? { n: 0, via: new Set<string>() };
      h.n++; h.via.add(`keyword:${c}`);
      if (!h.snippet && r.headline) h.snippet = limpiaSnippet(r.headline);
      hits.set(r.opinion_id, h);
    }
  }
  const emb = await embed(`${resolver.titulo_corto ?? ""}. ${resolver.resumen ?? ""} ${conceptos.join(", ")}`);
  let semanticaOn = false;
  if (emb) {
    const { data } = await sb.rpc("search_opinions_semantic", {
      query_embedding: JSON.stringify(emb), match_threshold: 0.25, match_count: 12,
    });
    if (data?.length) semanticaOn = true;
    for (const r of data ?? []) {
      const h = hits.get(r.opinion_id) ?? { n: 0, via: new Set<string>() };
      h.n++; h.via.add("semántica");
      if (!h.snippet && r.chunk_text) h.snippet = limpiaSnippet(r.chunk_text);
      hits.set(r.opinion_id, h);
    }
  }
  const ids = [...hits.keys()];
  if (!ids.length) return { arsenal: [], semantica: semanticaOn, nota: "sin resultados en el corpus para estos conceptos" };

  const [{ data: ops }, { data: alerts }, authRes] = await Promise.all([
    sb.from("opinions").select("id,case_name,case_name_short,citation_dpr,citation_tspr,decision_date,matter").in("id", ids),
    sb.from("opinion_alert_summary").select("opinion_id,risk_level,total_refs,obsoleto_count,vigente_count").in("opinion_id", ids),
    sb.rpc("arsenal_authority_strength", { p_opinion_ids: ids }),
  ]);
  const alertMap = new Map((alerts ?? []).map((a: any) => [a.opinion_id, a]));
  const authMap = new Map(((authRes.data as any[]) ?? []).map((a: any) => [a.opinion_id, a]));

  const arsenal = (ops ?? []).map((o: any) => {
    const h = hits.get(o.id)!, al = alertMap.get(o.id), au = authMap.get(o.id);
    const cited = Number(au?.cited_by_count ?? 0);
    const cDpr = citaUtilizable(o.citation_dpr), cTspr = citaUtilizable(o.citation_tspr);
    const citable = !!(cDpr || cTspr);
    // nombre completo con partes; el short solo si el largo no existe
    const caso = String(o.case_name || o.case_name_short || "").slice(0, 90);
    return {
      opinion_id: o.id,
      caso,
      cita_oficial: cDpr || cTspr,
      cita_dpr: cDpr, cita_tspr: cTspr,
      citable,
      nota_cita: citable ? null : "sin cita oficial utilizable (pendiente de foliar) — NO citable en el borrador",
      fecha: o.decision_date, materia: o.matter,
      pertinencia: h.snippet ?? null,
      autoridad: { veces_citado: cited, ultima_cita: au?.last_cited ?? null },
      vigencia: al ? { risk_level: al.risk_level, refs_obsoletas: al.obsoleto_count } : { risk_level: "NOT_SCANNED" },
      encontrado_via: [...h.via],
      score: h.n * 10 + Math.min(cited, 40) + (citable ? 0 : -30),
      verificacion: "EXISTE en corpus Ratio Boricua (verificación mecánica de existencia; holding y pincite = revisión de abogado)",
    };
  }).sort((a: any, b: any) => b.score - a.score);

  // dedup: el corpus tiene el mismo caso como récord DPR y récord TSPR
  // (misma fecha + partes solapadas) — se fusionan prefiriendo la cita DPR
  const tokens = (s: string) => new Set(
    String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !["pueblo", "puerto", "rico", "otros", "otra", "inc", "llc", "corp", "los", "las", "del"].includes(w)),
  );
  const mismoCaso = (a: any, b: any): boolean => {
    if (!a.fecha || a.fecha !== b.fecha) return false;
    const ta = tokens(a.caso), tb = tokens(b.caso);
    if (!ta.size || !tb.size) return false;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / Math.min(ta.size, tb.size) >= 0.5;
  };
  const dedup: any[] = [];
  for (const a of arsenal) {
    const dup = dedup.find((d) => mismoCaso(d, a));
    if (!dup) { dedup.push(a); continue; }
    // fusionar: preferir el récord con cita DPR y nombre más corto/limpio
    const ganador = dup.cita_dpr ? dup : (a.cita_dpr ? a : dup);
    const perdedor = ganador === dup ? a : dup;
    ganador.cita_dpr = ganador.cita_dpr ?? perdedor.cita_dpr;
    ganador.cita_tspr = ganador.cita_tspr ?? perdedor.cita_tspr;
    ganador.cita_oficial = ganador.cita_dpr ?? ganador.cita_tspr;
    ganador.citable = !!(ganador.cita_dpr || ganador.cita_tspr);
    ganador.nota_cita = ganador.citable ? null : ganador.nota_cita;
    ganador.materia = ganador.materia ?? perdedor.materia;
    ganador.pertinencia = ganador.pertinencia ?? perdedor.pertinencia;
    ganador.encontrado_via = [...new Set([...ganador.encontrado_via, ...perdedor.encontrado_via])];
    ganador.autoridad.veces_citado = Math.max(ganador.autoridad.veces_citado, perdedor.autoridad.veces_citado);
    ganador.score = Math.max(ganador.score, perdedor.score) + 5;
    if (ganador !== dup) dedup[dedup.indexOf(dup)] = ganador;
  }
  const arsenalFinal = dedup.sort((a, b) => b.score - a.score).slice(0, 10);

  return {
    arsenal: arsenalFinal, semantica: semanticaOn,
    duplicados_fusionados: arsenal.length - dedup.length,
    corpus: "Ratio Boricua — 14,227 opiniones TSPR 1960-2025",
    gate: "solo opiniones que EXISTEN en el corpus; ninguna cita fue generada por el modelo",
  };
}

// ═══ ETAPA 4 · CRUCE FEDERAL (CourtListener live) ══════════════════════════
async function etapaCruceFederal(_job: any, resolver: any) {
  const notaMidpage = "Verificación federal profunda (Midpage analyzeOpinion caso-por-caso) = paso HITL del abogado responsable antes de someter.";
  if (!CL_TOKEN) return { resultados: [], nota: "CL_API_TOKEN no configurado — capa federal omitida honestamente.", nota_midpage: notaMidpage };

  // frases entrecomilladas + 3 niveles de fallback (todos los conceptos → 2 → 1)
  const conceptosEn: string[] = (resolver.conceptos_en ?? []).slice(0, 4)
    .map((c: string) => String(c).trim()).filter(Boolean)
    .map((c: string) => (c.includes(" ") ? `"${c}"` : c));
  const tiers = [
    conceptosEn.join(" OR "),
    conceptosEn.slice(0, 2).join(" OR "),
    conceptosEn[0] ?? "",
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);
  if (!tiers.length) tiers.push(String(resolver.titulo_corto ?? "").slice(0, 100));

  try {
    let ultimo = "";
    for (const q of tiers) {
      ultimo = q;
      const url = `https://www.courtlistener.com/api/rest/v4/search/?type=o&court=scotus%20ca1%20prd&order_by=score%20desc&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Authorization: `Token ${CL_TOKEN}` }, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return { resultados: [], nota: `CourtListener ${res.status} — capa federal no disponible en esta corrida.`, nota_midpage: notaMidpage };
      const data = await res.json();
      const resultados = (data.results ?? []).slice(0, 8).map((r: any) => {
        const court = String(r.court ?? r.court_id ?? "");
        const esScotus = /scotus|supreme court of the united states/i.test(court);
        return {
          caso: r.caseName ?? r.case_name ?? null,
          cita: Array.isArray(r.citation) ? r.citation.filter(Boolean).join("; ") : (r.citation ?? null),
          tribunal: court,
          jerarquia: esScotus ? "BINDING (SCOTUS)" : "PERSUASIVA (1er Cir. / D.P.R.)",
          fecha: r.dateFiled ?? r.date_filed ?? null,
          pertinencia: r.snippet ? limpiaSnippet(String(r.snippet).replace(/<[^>]+>/g, "")) : null,
          url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : null,
          verificacion: "existe en CourtListener (búsqueda live); pertinencia y holding = revisión de abogado",
        };
      });
      if (resultados.length) {
        return { query_en: q, nivel_busqueda: tiers.indexOf(q) + 1, resultados, fuente: "CourtListener v4 (SCOTUS + 1er Cir. + D.P.R.)", nota_midpage: notaMidpage };
      }
    }
    return { resultados: [], query_en: ultimo, nota: `CourtListener devolvió 0 resultados en ${tiers.length} niveles de búsqueda (amplia incluida) — genuinamente sin capa federal indexada para estos conceptos.`, intentos: tiers, nota_midpage: notaMidpage };
  } catch (e) {
    return { resultados: [], nota: `capa federal falló: ${String((e as Error).message).slice(0, 120)}`, nota_midpage: notaMidpage };
  }
}

// ═══ ETAPA 5 · ANÁLISIS ESTRATÉGICO ════════════════════════════════════════
function digest(job: any): string {
  const e = job.etapas ?? {};
  const r = e.resolver ?? {}, s = e.cruce_sutra ?? {}, ra = e.cruce_ratio ?? {}, f = e.cruce_federal ?? {};
  return JSON.stringify({
    medida: {
      codigo: job.codigo, titulo_corto: r.titulo_corto, resumen: r.resumen, materia: r.materia,
      impacto_fiscal: r.impacto_fiscal, tramite: r.tramite,
    },
    cruce_legislativo: {
      proyectos_familia: (s.medidas_relacionadas_termino_vigente ?? []).map((m: any) => ({ codigo: m.codigo, titulo: String(m.titulo).slice(0, 200), autor: m.autor, partido: m.partido, estatus: m.estatus_aprox, radar: m.radar })),
      leyes: (s.leyes_citadas_cruce ?? []).map((l: any) => ({ ley: l.ley, registro: l.registro, nota: l.nota })),
    },
    arsenal_pr: (ra.arsenal ?? []).map((a: any) => ({ caso: a.caso, cita: a.cita_oficial ?? a.cita_tspr, citable: a.citable, fecha: a.fecha, materia: a.materia, veces_citado: a.autoridad?.veces_citado, vigencia: a.vigencia?.risk_level, contexto: a.pertinencia ? String(a.pertinencia).slice(0, 160) : null })),
    capa_federal: (f.resultados ?? []).map((x: any) => ({ caso: x.caso, cita: x.cita, tribunal: x.tribunal, jerarquia: x.jerarquia, fecha: x.fecha, contexto: x.pertinencia ?? null })),
  }).slice(0, 28_000);
}

async function etapaAnalisis(job: any) {
  const fiscalHint = job.etapas?.resolver?.impacto_fiscal?.tiene
    ? "; incluye el riesgo anticipatorio PROMESA §204 por impacto fiscal"
    : "";
  const system = `Eres estratega legislativo senior de JRCH Fiducia LLC (Puerto Rico). Redactas en español puertorriqueño profesional, directo y accionable. REGLAS INVIOLABLES: (1) SOLO puedes citar los casos y leyes que aparecen en el JSON adjunto, con su cita EXACTA tal como aparece — cualquier otra autoridad que quieras invocar se escribe [AUTORIDAD — pendiente de verificación por el abogado responsable]. (2) PROHIBIDO inventar cifras, datos fiscales o hechos del trámite. (3) Distingue SIEMPRE autoridad binding (TSPR, SCOTUS) de persuasiva (1er Cir., D.P.R.). (4) Los holdings los describes como "línea a verificar", nunca como afirmación categórica — la verificación caso-por-caso es del abogado. (5) Devuelve SOLO markdown.`;
  const user = `Redacta el ANÁLISIS ESTRATÉGICO de esta medida con estas secciones:
# Análisis Estratégico — ${job.etapas?.resolver?.titulo_corto ?? job.codigo ?? "Medida"}
## 1. Resumen ejecutivo (≤150 palabras)
## 2. Marco legislativo (leyes que toca la medida y su estado de vigencia según el cruce; medidas hermanas del término vigente y qué señalan)
## 3. Arsenal jurisprudencial PR (tabla: caso · cita · por qué es pertinente · fuerza [veces citado] · riesgo de vigencia)
## 4. Capa federal (qué hay en SCOTUS/1er Cir./D.P.R. y su jerarquía; si vacía, dilo)
## 5. Tensiones y riesgos (constitucionales, administrativos, operacionales${fiscalHint})
## 6. Pattern Layer (Señal → Patrón → Hipótesis → Prueba → Alerta)
## 7. Recomendaciones de enmienda (máx 5, concretas y redactables)

Extensión total: 800-1,100 palabras. DATA VERIFICADA (única fuente citable):
${digest(job)}`;
  const md = await callClaudeLong(system, user, 7000);
  return { md };
}

// ═══ ETAPA 6 · PONENCIA T-01 con citas verificadas + post-gate ═════════════
const CITA_PATTERNS = [
  /\b\d{1,3}\s+D\.?\s?P\.?\s?R\.?\s+\d{1,4}\b/gi,
  /\b(?:19|20)\d{2}\s+T\.?\s?S\.?\s?P\.?\s?R\.?\s+\d{1,4}\b/gi,
  /\b\d{1,3}\s+U\.?\s?S\.?\s+\d{1,4}\b/gi,
  /\b\d{1,4}\s+F\.\s?(?:2d|3d|4th)\s+\d{1,4}\b/gi,
  /\b\d{1,4}\s+F\.\s?Supp\.?\s?(?:2d|3d)?\s+\d{1,4}\b/gi,
];

function gateCitas(md: string, permitidas: Set<string>): { md: string; marcadas: string[] } {
  const marcadas: string[] = [];
  let out = md;
  for (const pat of CITA_PATTERNS) {
    out = out.replace(pat, (m) => {
      if (permitidas.has(normCita(m))) return m;
      marcadas.push(m);
      return `[⚠️ CITA NO VERIFICADA — remover o verificar: ${m}]`;
    });
  }
  return { md: out, marcadas: [...new Set(marcadas)] };
}

async function etapaPonencia(job: any) {
  const r = job.etapas?.resolver ?? {};
  // solo entradas CITABLES entran al arsenal de la ponencia (sin foliar = fuera)
  const arsenal = (job.etapas?.cruce_ratio?.arsenal ?? []).filter((a: any) => a.citable !== false && (a.cita_dpr || a.cita_tspr));
  const federal = (job.etapas?.cruce_federal?.resultados ?? []).filter((x: any) => x.cita);
  const analisis = job.etapas?.analisis?.md ?? "";

  const permitidas = new Set<string>();
  for (const a of arsenal) for (const c of [a.cita_dpr, a.cita_tspr]) if (c) permitidas.add(normCita(c));
  for (const f of federal) for (const c of String(f.cita).split(";")) if (c.trim()) permitidas.add(normCita(c));

  const arsenalTxt = arsenal.map((a: any) =>
    `- ${a.caso}, ${a.cita_oficial ?? a.cita_tspr} (${a.fecha?.slice(0, 4) ?? "s.f."}) · ${a.materia ?? ""} · citado ${a.autoridad?.veces_citado ?? 0}× · vigencia ${a.vigencia?.risk_level}${a.pertinencia ? ` · contexto: ${a.pertinencia.slice(0, 150)}` : ""}`).join("\n");
  const federalTxt = federal.map((f: any) => `- ${f.caso}, ${f.cita} (${f.tribunal}) [${f.jerarquia}]`).join("\n");

  const system = `Redactas BORRADORES de ponencias para vistas públicas legislativas de Puerto Rico (formato T-01 de JRCH Fiducia LLC), en español puertorriqueño profesional. REGLAS INVIOLABLES: (1) SOLO puedes citar los casos del ARSENAL VERIFICADO adjunto, usando la cita EXACTA provista; los describes como apoyo pertinente sin inventar holdings específicos (frase segura: "línea jurisprudencial a desarrollar en la vista"). Cualquier OTRA autoridad → escribe exactamente: [AUTORIDAD — pendiente de verificación por el abogado responsable]. (2) PROHIBIDO inventar cifras o datos fiscales — si no constan: "no consta informe de efecto fiscal (OPAL) al momento de este borrador". (3) Tono respetuoso e institucional. (4) Extensión 1,000-1,400 palabras, COMPLETA las 7 secciones (concisas I-III, desarrollada IV). (5) Devuelve SOLO el markdown.`;
  const user = `Redacta el BORRADOR de ponencia (markdown) con las 7 secciones del template T-01:
# [PONENCIA ANTE ${r.tramite?.comision_actual ?? "LA COMISIÓN"} · ${job.codigo ?? r.titulo_corto ?? ""}]
I. Introducción y comparecencia (quién comparece: ${job.entidad || "[ENTIDAD COMPARECIENTE]"})
II. Resumen de la medida
III. Interés del compareciente
IV. Análisis y fundamentos (la sección más desarrollada — integra el arsenal verificado donde fortalezca el argumento)
V. Señalamientos específicos y recomendaciones de enmienda (máx 4)
VI. Posición (clara y directa)
VII. Conclusión

POSTURA ASIGNADA: ${POSTURAS[job.postura]}
${job.notas ? `NOTAS DEL ANALISTA (incorporar): ${String(job.notas).slice(0, 500)}` : ""}

MEDIDA: ${job.codigo ?? ""} — ${r.titulo_corto ?? ""}
RESUMEN: ${r.resumen ?? ""}
TRÁMITE: ${r.tramite ? `${r.tramite.estatus ?? r.tramite.estatus_aprox ?? ""} · ${r.tramite.ultima_accion ?? ""}` : "no consta"}

ARSENAL VERIFICADO PR (únicas citas TSPR permitidas, existencia confirmada en corpus):
${arsenalTxt || "(vacío — no cites jurisprudencia PR)"}

CAPA FEDERAL (únicas citas federales permitidas, existencia confirmada en CourtListener):
${federalTxt || "(vacía — no cites autoridad federal)"}

ANÁLISIS ESTRATÉGICO PREVIO (para argumentos, NO para citas nuevas):
${analisis.slice(0, 12_000)}`;

  const md = await callClaudeLong(system, user, 7000);

  const gated = gateCitas(md, permitidas);
  const fecha = new Date().toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico" });
  const banner = `> 🟡 **BORRADOR — NO SOMETER** · Generado por PONENCIA LOOP (JRCH Fiducia, LLC) el ${fecha}.\n> Citas incluidas = verificadas mecánicamente por EXISTENCIA en corpus Ratio Boricua / CourtListener. Holding, pincite y pertinencia final = revisión del abogado responsable (incl. verificación Midpage caso-por-caso). Requiere revisión y firma de abogado antes de cualquier uso.\n\n`;
  const footer = `\n\n---\n*Borrador de trabajo · no constituye opinión legal ni comparecencia autorizada · PONENCIA LOOP · powered by JRCH Fiducia, LLC*`;
  return { md: banner + gated.md + footer, citas_marcadas: gated.marcadas, citas_permitidas: permitidas.size };
}

// ═══ RUNNER ═════════════════════════════════════════════════════════════════
const jobCols = "id,created_at,updated_at,fuente,codigo,titulo,postura,entidad,notas,etapa_actual,status,error,etapas,ponencia_md,analisis_md";

async function avanzar(jobId: string) {
  const { data: job, error } = await sb.from("ponencia_jobs").select(jobCols + ",texto_medida").eq("id", jobId).maybeSingle();
  if (error || !job) throw new Error("job no encontrado");
  if (job.status === "done") return job;
  if (job.etapa_actual >= ETAPAS.length) return job;

  const etapa = ETAPAS[job.etapa_actual];
  await sb.from("ponencia_jobs").update({ status: "running", error: null, updated_at: new Date().toISOString() }).eq("id", jobId);

  try {
    let resultado: any;
    const r = job.etapas?.resolver;
    switch (etapa) {
      case "resolver":      resultado = await etapaResolver(job); break;
      case "cruce_sutra":   resultado = await etapaCruceSutra(job, r); break;
      case "cruce_ratio":   resultado = await etapaCruceRatio(job, r); break;
      case "cruce_federal": resultado = await etapaCruceFederal(job, r); break;
      case "analisis":      resultado = await etapaAnalisis(job); break;
      case "ponencia":      resultado = await etapaPonencia(job); break;
    }
    const etapas = { ...(job.etapas ?? {}), [etapa]: resultado };
    const next = job.etapa_actual + 1;
    const patch: any = {
      etapas, etapa_actual: next,
      status: next >= ETAPAS.length ? "done" : "pending",
      updated_at: new Date().toISOString(),
    };
    if (etapa === "analisis") patch.analisis_md = resultado.md;
    if (etapa === "ponencia") patch.ponencia_md = resultado.md;
    if (etapa === "resolver" && resultado.titulo_corto) patch.titulo = resultado.titulo_corto;
    await sb.from("ponencia_jobs").update(patch).eq("id", jobId);
    await sb.from("lexintel_log").insert({ fn: "loop", codigo: `${job.codigo ?? "texto"}:${etapa}` });
    const { data: fresh } = await sb.from("ponencia_jobs").select(jobCols).eq("id", jobId).maybeSingle();
    return fresh;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    await sb.from("ponencia_jobs").update({ status: "error", error: msg, updated_at: new Date().toISOString() }).eq("id", jobId);
    throw new Error(`etapa ${etapa}: ${msg}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY no configurada" }, 503);
    const body = await req.json();
    const action = body.action;

    if (action === "buscar") {
      const q = String(body.q ?? "").slice(0, 80);
      if (q.length < 2) return json({ resultados: [] });
      const { data } = await sb.rpc("ponencia_buscar_medida", { p_q: q, p_limit: 8 });
      return json({ resultados: data ?? [] });
    }

    if (action === "crear") {
      if (!(await throttle())) return json({ error: "Límite horario del loop alcanzado — intenta más tarde." }, 429);
      const fuente = body.fuente === "texto" ? "texto" : "sutra";
      const postura = POSTURAS[body.postura] ? body.postura : "contra";
      const ins: any = { fuente, postura, entidad: String(body.entidad ?? "").slice(0, 200) || null, notas: String(body.notas ?? "").slice(0, 1000) || null };
      if (fuente === "sutra") {
        const codes = normalizeCodigo(body.codigo);
        if (!codes) return json({ error: "código inválido (ej. PC1213, PS0708)" }, 400);
        ins.codigo = codes.padded;
      } else {
        const texto = String(body.texto ?? "");
        if (texto.length < 200) return json({ error: "texto muy corto (mínimo 200 caracteres)" }, 400);
        if (texto.length > 300_000) return json({ error: "texto excede 300,000 caracteres" }, 400);
        ins.texto_medida = texto;
        ins.codigo = body.codigo ? (normalizeCodigo(body.codigo)?.padded ?? null) : null;
      }
      const { data, error } = await sb.from("ponencia_jobs").insert(ins).select(jobCols).single();
      if (error) return json({ error: error.message }, 500);
      return json({ job: data });
    }

    if (action === "avanzar") {
      if (!body.job_id) return json({ error: "falta job_id" }, 400);
      if (!(await throttle())) return json({ error: "Límite horario del loop alcanzado — intenta más tarde." }, 429);
      const job = await avanzar(String(body.job_id));
      return json({ job });
    }

    if (action === "editar") {
      // edición manual de la ponencia antes de descargar/copiar — se persiste en el job
      if (!body.job_id) return json({ error: "falta job_id" }, 400);
      const md = String(body.ponencia_md ?? "");
      if (md.length < 100) return json({ error: "el texto editado es muy corto" }, 400);
      if (md.length > 200_000) return json({ error: "el texto excede 200,000 caracteres" }, 400);
      const { data: cur } = await sb.from("ponencia_jobs").select("id,etapas").eq("id", String(body.job_id)).maybeSingle();
      if (!cur) return json({ error: "job no encontrado" }, 404);
      const etapas = { ...(cur.etapas ?? {}) };
      etapas.ponencia = { ...(etapas.ponencia ?? {}), editado_manual: new Date().toISOString() };
      const { error } = await sb.from("ponencia_jobs")
        .update({ ponencia_md: md, etapas, updated_at: new Date().toISOString() })
        .eq("id", String(body.job_id));
      if (error) return json({ error: error.message }, 500);
      const { data } = await sb.from("ponencia_jobs").select(jobCols).eq("id", String(body.job_id)).maybeSingle();
      return json({ job: data });
    }

    if (action === "estado") {
      const { data } = await sb.from("ponencia_jobs").select(jobCols).eq("id", String(body.job_id ?? "")).maybeSingle();
      if (!data) return json({ error: "job no encontrado" }, 404);
      return json({ job: data });
    }

    if (action === "listar") {
      const { data } = await sb.from("ponencia_jobs")
        .select("id,created_at,codigo,titulo,fuente,postura,etapa_actual,status")
        .order("created_at", { ascending: false }).limit(12);
      return json({ jobs: data ?? [] });
    }

    return json({ error: "action inválida (buscar|crear|avanzar|estado|listar)" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
