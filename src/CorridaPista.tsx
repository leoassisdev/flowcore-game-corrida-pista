// CorridaPista · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Corrida em pista vertical no estilo dos clássicos de fliperama: desvie do trânsito,
// pegue galões de combustível e vá o mais longe possível antes do tanque secar.
// Controles: setas ou A/D desviam · seta para cima ou W acelera · seta para baixo ou S
// freia · Espaço começa · P pausa · no celular, segure os botões na tela ou arraste o
// dedo sobre a pista para guiar o carro.
// Props:
//   tema?: "claro" | "escuro"   tema inicial (padrão "claro"); o botão sol/lua do HUD alterna
//   onTemaChange?: (tema) => void   avisa quando o jogador troca o tema
//   accent?: string             cor do seu carro e de destaque (padrão "#0057FF")
//   variacao?: "Clássico" | "Turbo" | "Caos"   preset inicial
//   velocidade?: number         multiplicador da velocidade máxima (padrão 1)
//   densidadeTrafego?: number   multiplicador da quantidade de carros (padrão 1)
//   consumoCombustivel?: number unidades de combustível por segundo a toda (padrão 2.4)
//   obstaculosExtras?: number   manchas de óleo e cones por trecho (0 = nenhum)
// Batida = rodopio e perda de combustível. Acaba quando o combustível zera.
// O seletor "Variações" troca o preset ao vivo. Recorde salvo no localStorage.
// Requisitos: React 18+ e Tailwind CSS 3+. Zero dependências.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/* ----------------------------- lógica pura ----------------------------- */

type Ret = { x: number; y: number; w: number; h: number };

/** true se dois retângulos (x, y no canto superior esquerdo) se sobrepõem. */
export function colideRetangulos(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Centro x da faixa `faixa` (0 = mais à esquerda) numa pista que começa em xEsq. */
export function faixaX(faixa: number, totalFaixas: number, xEsq: number, largura: number): number {
  return xEsq + (largura * (faixa + 0.5)) / totalFaixas;
}

/* ------------------------------ variações ------------------------------ */

type NomeVariacao = "Clássico" | "Turbo" | "Caos";
type Config = { velocidade: number; densidadeTrafego: number; consumoCombustivel: number; obstaculosExtras: number };

const VARIACOES: Record<NomeVariacao, Config> = {
  Clássico: { velocidade: 1, densidadeTrafego: 1, consumoCombustivel: 2.4, obstaculosExtras: 0 },
  Turbo: { velocidade: 1.35, densidadeTrafego: 1.2, consumoCombustivel: 2.8, obstaculosExtras: 0 },
  Caos: { velocidade: 1.15, densidadeTrafego: 1.45, consumoCombustivel: 2.6, obstaculosExtras: 3 },
};

/* --------------------------------- tema --------------------------------- */

export type Tema = "claro" | "escuro";
// Paleta do tema: vira CSS vars na raiz (classes) e é lida pelo canvas.
const TEMAS: Record<Tema, Record<string, string>> = {
  claro: {
    "--fc-bg": "#F7F8FB", "--fc-surface": "#FFFFFF", "--fc-surface-2": "#F1F4F9",
    "--fc-border": "#E3E8F0", "--fc-border-strong": "#CBD3E1",
    "--fc-text": "#0B1220", "--fc-muted": "#4B5565", "--fc-subtle": "#8A94A6",
    "--fc-pos": "#059669", "--fc-neg": "#E11D48", "--fc-warn": "#D97706",
    "--fc-shadow": "0 1px 2px rgba(16,24,40,.06), 0 12px 32px -16px rgba(16,24,40,.18)",
  },
  escuro: {
    "--fc-bg": "#0B0F17", "--fc-surface": "rgba(255,255,255,0.03)", "--fc-surface-2": "rgba(255,255,255,0.06)",
    "--fc-border": "rgba(255,255,255,0.10)", "--fc-border-strong": "rgba(255,255,255,0.25)",
    "--fc-text": "#FFFFFF", "--fc-muted": "rgba(255,255,255,0.60)", "--fc-subtle": "rgba(255,255,255,0.40)",
    "--fc-pos": "#34D399", "--fc-neg": "#FB7185", "--fc-warn": "#FBBF24",
    "--fc-shadow": "0 24px 48px -24px rgba(0,0,0,.6)",
  },
};

function BotaoTema({ tema, onClick }: { tema: Tema; onClick: () => void }) {
  const escuro = tema === "escuro";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      title={escuro ? "Modo claro" : "Modo escuro"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] transition-colors hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        {escuro ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

type Props = {
  tema?: Tema;
  onTemaChange?: (tema: Tema) => void;
  accent?: string;
  variacao?: NomeVariacao;
  velocidade?: number;
  densidadeTrafego?: number;
  consumoCombustivel?: number;
  obstaculosExtras?: number;
};

type Status = "inicio" | "jogando" | "pausado" | "fim";
type TipoCarro = "lento" | "muda" | "caminhao";

type Carro = {
  wy: number;
  u: number;
  alvoU: number;
  faixa: number;
  v: number;
  tipo: TipoCarro;
  w: number;
  h: number;
  cor: number; // índice na paleta de carros do tema (-1 = caminhão)
  timer: number;
  passou: boolean;
  batida: number;
};

type Item = { wy: number; u: number; tipo: "galao" | "oleo" | "cone"; vivo: boolean; vx: number; dx: number };

type Estado = {
  x: number;
  v: number;
  dist: number;
  comb: number;
  giro: number;
  ang: number;
  invul: number;
  tremor: number;
  carros: Carro[];
  itens: Item[];
  proxCarro: number;
  proxGalao: number;
  proxObst: number;
  bonus: number;
  acc: number;
  hudT: number;
  aviso: string;
  avisoT: number;
  t: number;
};

const W = 480;
const H = 640;
const PY = 520;
const PW = 32;
const PH = 58;
const FAIXAS = 4;
const VBASE = 560;
const PASSO = 1 / 120;
const N_CORES = 6;

/** Paleta de desenho do canvas por tema (escuro = visual original). */
type Paleta = {
  grama: [string, string]; asfalto: string; zebra: [string, string]; faixa: string;
  arvSombra: string; arv: [string, string]; arvBrilho: string;
  galao: string; galaoBlur: number; galaoTampa: string; galaoX: string;
  oleo: string; oleoBrilho: string; coneFaixa: string;
  carros: string[]; caminhao: string; batida: string; seta: string; setaOff: string;
  painel: string; rotulo: string; texto: string; trilho: string; trilhoComb: string; combBaixo: [string, string];
  carroSombra: string; roda: string; cabineVidro: string; bau: string; bauLinha: string;
  reflexo: string; listra: string; vidro: string; vidroBrilho: string; brilhoJogador: number;
};

const CORES: Record<Tema, Paleta> = {
  escuro: {
    grama: ["#0F2A1C", "#0C2318"], asfalto: "#1A202C", zebra: ["#E5484D", "#F1F5F9"], faixa: "rgba(255,255,255,0.32)",
    arvSombra: "rgba(0,0,0,0.3)", arv: ["#17472E", "#1D5A39"], arvBrilho: "rgba(255,255,255,0.07)",
    galao: "#FFC23D", galaoBlur: 12, galaoTampa: "#B37A10", galaoX: "#7A4F05",
    oleo: "rgba(5,7,12,0.85)", oleoBrilho: "rgba(167,139,250,0.25)", coneFaixa: "#fff",
    carros: ["#E5484D", "#F5B83D", "#2BB673", "#C9CED8", "#A78BFA", "#38BDF8"], caminhao: "#8A94A6",
    batida: "#ffffff", seta: "#FFC23D", setaOff: "rgba(255,194,61,0.2)",
    painel: "rgba(11,15,23,0.72)", rotulo: "rgba(255,255,255,0.45)", texto: "#fff",
    trilho: "rgba(255,255,255,0.12)", trilhoComb: "rgba(255,255,255,0.1)", combBaixo: ["#E5484D", "#7F1D1D"],
    carroSombra: "rgba(0,0,0,0.35)", roda: "#0A0C10", cabineVidro: "#0F172A", bau: "#D7DCE5", bauLinha: "rgba(0,0,0,0.15)",
    reflexo: "rgba(255,255,255,0.18)", listra: "rgba(255,255,255,0.85)", vidro: "#0B1220", vidroBrilho: "rgba(255,255,255,0.22)",
    brilhoJogador: 16,
  },
  claro: {
    grama: ["#B4E3A0", "#A8DC92"], asfalto: "#AEB7C4", zebra: ["#F04E5A", "#FFFFFF"], faixa: "rgba(255,255,255,0.95)",
    arvSombra: "rgba(15,23,42,0.14)", arv: ["#3FAE68", "#58C27D"], arvBrilho: "rgba(255,255,255,0.3)",
    galao: "#FFB81F", galaoBlur: 6, galaoTampa: "#B37A10", galaoX: "#7A4F05",
    oleo: "rgba(31,38,52,0.82)", oleoBrilho: "rgba(167,139,250,0.45)", coneFaixa: "#fff",
    carros: ["#7C3AED", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#E5484D"], caminhao: "#64748B",
    batida: "#ffffff", seta: "#F59E0B", setaOff: "rgba(245,158,11,0.25)",
    painel: "rgba(255,255,255,0.9)", rotulo: "#4B5565", texto: "#0B1220",
    trilho: "rgba(15,23,42,0.1)", trilhoComb: "rgba(15,23,42,0.1)", combBaixo: ["#E11D48", "#FDA4AF"],
    carroSombra: "rgba(15,23,42,0.22)", roda: "#1F2937", cabineVidro: "#1E293B", bau: "#F8FAFC", bauLinha: "rgba(15,23,42,0.14)",
    reflexo: "rgba(255,255,255,0.3)", listra: "rgba(255,255,255,0.9)", vidro: "#1E293B", vidroBrilho: "rgba(255,255,255,0.35)",
    brilhoJogador: 0,
  },
};

const CHAVE = "flowcore-corrida-pista-recorde";
const LINK = "https://flowcoresolucoes.com.br/codigos";

function lerRecorde(): number {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
}

function salvarRecorde(v: number) {
  try {
    localStorage.setItem(CHAVE, String(v));
  } catch {
    /* localStorage indisponível (modo privado, iframe sandbox) */
  }
}

function hash(i: number) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Geometria da pista numa distância do mundo: curvas suaves e trechos estreitos. */
function pistaEm(wy: number): { xEsq: number; largura: number } {
  const L = 4200;
  const i = Math.floor(wy / L);
  const f = wy - i * L;
  let n = 0;
  if (i > 0 && hash(i) % 3 === 0) {
    const r = 500;
    const a = Math.min(1, f / r, (L - f) / r);
    n = a * a * (3 - 2 * a);
  }
  const largura = 300 - 104 * n;
  const centro = W / 2 + Math.sin(wy / 1700) * 46 + Math.sin(wy / 640) * 12;
  return { xEsq: centro - largura / 2, largura };
}

function vMax(cfg: Config, dist: number) {
  return VBASE * cfg.velocidade * (1 + Math.min(0.5, dist / 70000));
}

function novoEstado(): Estado {
  const p = pistaEm(0);
  return {
    x: faixaX(1, FAIXAS, p.xEsq, p.largura),
    v: 0,
    dist: 0,
    comb: 100,
    giro: 0,
    ang: 0,
    invul: 0,
    tremor: 0,
    carros: [],
    itens: [],
    proxCarro: 500,
    proxGalao: 1800,
    proxObst: 1400,
    bonus: 0,
    acc: 0,
    hudT: 0,
    aviso: "",
    avisoT: 0,
    t: 0,
  };
}

/** Retângulo do carro em coordenadas de tela, dada a distância percorrida pelo jogador. */
function retCarro(c: Carro, dist: number): Ret {
  const p = pistaEm(c.wy);
  const x = p.xEsq + c.u * p.largura;
  const y = PY - (c.wy - dist);
  return { x: x - c.w / 2, y: y - c.h / 2, w: c.w, h: c.h };
}

/* ------------------------------ componente ----------------------------- */

/* ------------------------------ como jogar ------------------------------ */

// Teclas mostradas na tela inicial e na pausa ("ou" vira separador).
const TECLAS: [string[], string][] = [
  [["←", "→", "ou", "A", "D"], "desviar"],
  [["↑", "ou", "W"], "acelerar"],
  [["↓", "ou", "S"], "frear"],
  [["Espaço"], "começar"],
  [["P"], "pausar"],
];
// Versão de toque, mostrada no celular (abaixo do jogo, onde sempre cabe).
const TOQUE = [
  "Segure os botões abaixo do jogo: ◀ ▶ desviam, ▲ acelera, ▼ freia",
  "ou arraste o dedo sobre a pista para guiar o carro",
];
const RESUMO_TECLADO = "Setas ou A/D desviam · ↑/W acelera · ↓/S freia · P pausa";
const RESUMO_TOQUE = "Segure os botões abaixo ou arraste na pista";

function ComoJogar({ className = "" }: { className?: string }) {
  return (
    <div className={`w-fit max-w-full text-xs text-[var(--fc-muted)] ${className}`}>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Como jogar</p>
      <div className="hidden grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 sm:grid">
        {TECLAS.map(([teclas, acao]) => (
          <div key={acao} className="contents">
            <span className="flex flex-wrap items-center justify-end gap-1">
              {teclas.map((t, i) =>
                t === "ou" ? (
                  <span key={i} className="text-[10px] text-[var(--fc-subtle)]">
                    ou
                  </span>
                ) : (
                  <kbd key={i} className="rounded-md border border-[var(--fc-border)] bg-[var(--fc-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fc-text)]">
                    {t}
                  </kbd>
                ),
              )}
            </span>
            <span className="text-left">{acao}</span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-center sm:hidden">
        {TOQUE.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CorridaPista({
  accent = "#0057FF",
  tema = "claro",
  onTemaChange,
  variacao = "Clássico",
  velocidade,
  densidadeTrafego,
  consumoCombustivel,
  obstaculosExtras,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [temaAtual, setTemaAtual] = useState<Tema>(tema);
  useEffect(() => setTemaAtual(tema), [tema]);
  const temaRef = useRef<Tema>(tema);
  temaRef.current = temaAtual;
  const alternarTema = () => {
    const novo: Tema = temaAtual === "claro" ? "escuro" : "claro";
    setTemaAtual(novo);
    onTemaChange?.(novo);
    rootRef.current?.focus();
  };
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const inicial: Config = {
    ...VARIACOES[variacao],
    ...(velocidade !== undefined && { velocidade }),
    ...(densidadeTrafego !== undefined && { densidadeTrafego }),
    ...(consumoCombustivel !== undefined && { consumoCombustivel }),
    ...(obstaculosExtras !== undefined && { obstaculosExtras }),
  };

  const [nomeVar, setNomeVar] = useState<NomeVariacao>(variacao);
  const [status, setStatus] = useState<Status>("inicio");
  const [hud, setHud] = useState({ pontos: 0, nivel: 1 });
  const [recorde, setRecorde] = useState(0);
  const [largura, setLargura] = useState(640);

  const cfgRef = useRef<Config>(inicial);
  const statusRef = useRef<Status>("inicio");
  const estRef = useRef<Estado>(novoEstado());
  const accentRef = useRef(accent);
  const visivelRef = useRef(true);
  const teclasRef = useRef({ esq: false, dir: false, acel: false, freio: false });
  const arrasteRef = useRef<number | null>(null);

  accentRef.current = accent;

  useEffect(() => setRecorde(lerRecorde()), []);

  const mudarStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setLargura(w);
    });
    ro.observe(el);
    if (el.clientWidth) setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const esc = Math.max(0.4, Math.min(largura / W, 540 / H));
  const cssW = Math.floor(W * esc);
  const cssH = Math.floor(H * esc);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      visivelRef.current = e.isIntersecting;
      if (!e.isIntersecting && statusRef.current === "jogando") mudarStatus("pausado");
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mudarStatus]);

  const soltarTudo = () => {
    teclasRef.current = { esq: false, dir: false, acel: false, freio: false };
    arrasteRef.current = null;
  };

  const iniciar = useCallback(() => {
    estRef.current = novoEstado();
    setHud({ pontos: 0, nivel: 1 });
    mudarStatus("jogando");
    rootRef.current?.focus();
  }, [mudarStatus]);

  const fim = useCallback(() => {
    const e = estRef.current;
    const p = Math.floor(e.dist / 10) + e.bonus;
    setHud({ pontos: p, nivel: 1 + Math.floor(e.dist / 8000) });
    mudarStatus("fim");
    setRecorde((r) => {
      if (p > r) {
        salvarRecorde(p);
        return p;
      }
      return r;
    });
  }, [mudarStatus]);

  const passo = useCallback(
    (dt: number) => {
      const e = estRef.current;
      const c = cfgRef.current;
      const k = teclasRef.current;
      e.t += dt;
      e.avisoT = Math.max(0, e.avisoT - dt);
      if (statusRef.current !== "jogando") {
        if (statusRef.current === "inicio") e.dist += 90 * dt;
        return;
      }

      const vm = vMax(c, e.dist);
      const semComb = e.comb <= 0;
      const pista = pistaEm(e.dist);
      const fora = e.x - PW / 2 < pista.xEsq - 3 || e.x + PW / 2 > pista.xEsq + pista.largura + 3;

      // Velocidade
      let alvo = k.acel ? vm : k.freio ? vm * 0.22 : vm * 0.64;
      if (fora) alvo = Math.min(alvo, vm * 0.3);
      if (e.giro > 0 || semComb) alvo = 0;
      const taxa = alvo > e.v ? 320 : semComb ? 260 : 760;
      e.v += Math.sign(alvo - e.v) * Math.min(Math.abs(alvo - e.v), taxa * dt);
      e.dist += e.v * dt;
      e.tremor = fora && e.v > 40 ? 1 : Math.max(0, e.tremor - dt * 6);

      // Direção
      e.invul = Math.max(0, e.invul - dt);
      if (e.giro > 0) {
        e.giro -= dt;
        e.ang += dt * 15;
        if (e.giro <= 0) e.ang = 0;
      } else if (!semComb) {
        const lat = 300 * (0.45 + 0.55 * Math.min(1, e.v / vm));
        let dx = 0;
        if (arrasteRef.current !== null) {
          const d = arrasteRef.current - e.x;
          dx = Math.sign(d) * Math.min(Math.abs(d), lat * dt);
        } else dx = ((k.dir ? 1 : 0) - (k.esq ? 1 : 0)) * lat * dt;
        e.x += dx;
      }
      e.x = Math.max(PW / 2 + 4, Math.min(W - PW / 2 - 4, e.x));

      // Combustível
      if (!semComb) {
        e.comb -= c.consumoCombustivel * (0.3 + 0.7 * (e.v / vm)) * (fora ? 1.6 : 1) * dt;
        if (e.comb <= 0) {
          e.comb = 0;
          e.aviso = "Sem combustível";
          e.avisoT = 3;
        }
      } else if (e.v < 8) {
        fim();
        return;
      }

      // Geração de trânsito (por distância percorrida)
      while (e.dist + PY + 140 > e.proxCarro) {
        const wy = e.proxCarro;
        const intervalo = Math.max(110, (300 - Math.min(140, e.dist / 400)) / c.densidadeTrafego);
        e.proxCarro += intervalo * (0.6 + Math.random() * 0.8);
        const naFaixa = e.carros.filter((o) => Math.abs(o.wy - wy) < 170);
        if (naFaixa.length >= FAIXAS - 2) continue;
        const livres = [0, 1, 2, 3].filter((f) => !e.carros.some((o) => (o.faixa === f || Math.round(o.alvoU * FAIXAS - 0.5) === f) && Math.abs(o.wy - wy) < 230));
        if (!livres.length) continue;
        const faixa = livres[Math.floor(Math.random() * livres.length)];
        const r = Math.random();
        const pMuda = Math.min(0.35, 0.12 + e.dist / 60000);
        const tipo: TipoCarro = r < 0.16 ? "caminhao" : r < 0.16 + pMuda ? "muda" : "lento";
        const vb = VBASE * c.velocidade;
        const u = (faixa + 0.5) / FAIXAS;
        e.carros.push({
          wy: wy + (tipo === "caminhao" ? 30 : 0),
          u,
          alvoU: u,
          faixa,
          v: vb * (tipo === "caminhao" ? 0.2 : tipo === "muda" ? 0.36 : 0.26 + Math.random() * 0.08),
          tipo,
          w: tipo === "caminhao" ? 36 : 30,
          h: tipo === "caminhao" ? 104 : 54,
          cor: tipo === "caminhao" ? -1 : Math.floor(Math.random() * N_CORES),
          timer: 0.6 + Math.random() * 1.6,
          passou: false,
          batida: 0,
        });
      }
      while (e.dist + PY + 140 > e.proxGalao) {
        const u = (Math.floor(Math.random() * FAIXAS) + 0.5) / FAIXAS;
        e.itens.push({ wy: e.proxGalao, u, tipo: "galao", vivo: true, vx: 0, dx: 0 });
        e.proxGalao += 1900 + Math.random() * 1500 + Math.min(1500, e.dist / 40);
      }
      if (c.obstaculosExtras > 0) {
        while (e.dist + PY + 140 > e.proxObst) {
          const u = 0.12 + Math.random() * 0.76;
          e.itens.push({ wy: e.proxObst, u, tipo: Math.random() < 0.5 ? "oleo" : "cone", vivo: true, vx: 0, dx: 0 });
          e.proxObst += (2600 / c.obstaculosExtras) * (0.6 + Math.random() * 0.8);
        }
      }

      // Trânsito
      for (const o of e.carros) {
        o.wy += o.v * dt;
        o.batida = Math.max(0, o.batida - dt);
        const tela = PY - (o.wy - e.dist);
        if (o.tipo === "muda" && tela > -40 && tela < PY - 60) {
          o.timer -= dt;
          if (o.timer <= 0) {
            o.timer = 1.2 + Math.random() * 1.8;
            const opc = [o.faixa - 1, o.faixa + 1].filter(
              (f) => f >= 0 && f < FAIXAS && !e.carros.some((q) => q !== o && q.faixa === f && Math.abs(q.wy - o.wy) < 150),
            );
            if (opc.length) {
              o.faixa = opc[Math.floor(Math.random() * opc.length)];
              o.alvoU = (o.faixa + 0.5) / FAIXAS;
            }
          }
        }
        const du = o.alvoU - o.u;
        o.u += Math.sign(du) * Math.min(Math.abs(du), 0.42 * dt);
        if (!o.passou && o.wy < e.dist - PH) {
          o.passou = true;
          e.bonus += 20;
        }
      }
      e.carros = e.carros.filter((o) => {
        const tela = PY - (o.wy - e.dist);
        return tela < H + 160 && tela > -900;
      });

      // Colisões
      const pr: Ret = { x: e.x - PW / 2 + 3, y: PY - PH / 2 + 4, w: PW - 6, h: PH - 8 };
      if (e.invul <= 0 && e.giro <= 0) {
        for (const o of e.carros) {
          const r = retCarro(o, e.dist);
          if (colideRetangulos(pr, { x: r.x + 2, y: r.y + 3, w: r.w - 4, h: r.h - 6 })) {
            e.giro = 1.0;
            e.v *= 0.3;
            e.comb = Math.max(0, e.comb - 12);
            e.invul = 2.2;
            e.aviso = "-12 combustível";
            e.avisoT = 1.2;
            o.v += 140;
            o.batida = 0.6;
            break;
          }
        }
      }
      for (const it of e.itens) {
        if (!it.vivo) {
          it.dx += it.vx * dt;
          continue;
        }
        const p = pistaEm(it.wy);
        const ix = p.xEsq + it.u * p.largura;
        const iy = PY - (it.wy - e.dist);
        const tam = it.tipo === "oleo" ? 34 : 22;
        if (!colideRetangulos(pr, { x: ix - tam / 2, y: iy - tam / 2, w: tam, h: tam })) continue;
        if (it.tipo === "galao") {
          it.vivo = false;
          e.comb = Math.min(100, e.comb + 25);
          e.bonus += 100;
          e.aviso = "+25 combustível";
          e.avisoT = 1.2;
        } else if (it.tipo === "oleo" && e.giro <= 0 && e.invul <= 0) {
          e.giro = 0.8;
          e.v *= 0.55;
          e.comb = Math.max(0, e.comb - 4);
          e.invul = 1.2;
          e.aviso = "Óleo na pista";
          e.avisoT = 1;
        } else if (it.tipo === "cone" && e.invul <= 0) {
          it.vivo = false;
          it.vx = (ix > e.x ? 1 : -1) * 260;
          e.v *= 0.6;
          e.comb = Math.max(0, e.comb - 5);
          e.invul = 0.6;
          e.tremor = 1;
        }
      }
      e.itens = e.itens.filter((it) => PY - (it.wy - e.dist) < H + 80);

      e.hudT -= dt;
      if (e.hudT <= 0) {
        e.hudT = 0.15;
        const pontos = Math.floor(e.dist / 10) + e.bonus;
        const nivel = 1 + Math.floor(e.dist / 8000);
        setHud((h) => (h.pontos === pontos && h.nivel === nivel ? h : { pontos, nivel }));
      }
    },
    [fim],
  );

  useEffect(() => {
    let raf = 0;
    let ultimo = performance.now();
    const loop = (agora: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (agora - ultimo) / 1000));
      ultimo = agora;
      const e = estRef.current;
      if (statusRef.current !== "pausado") {
        e.acc += dt;
        while (e.acc >= PASSO) {
          e.acc -= PASSO;
          passo(PASSO);
        }
      }
      if (visivelRef.current) desenhar();
    };
    const desenhar = () => {
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth || cssW;
      const h = cv.clientHeight || cssH;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const k = w / W;
      const e = estRef.current;
      const ac = accentRef.current;
      const c = CORES[temaRef.current];
      const tx = e.tremor > 0 ? (Math.random() - 0.5) * 3 * e.tremor : 0;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * k * tx, 0);

      // Grama e pista por faixas horizontais
      const FT = 8;
      for (let y = -8; y < H + 8; y += FT) {
        const wy = e.dist + (PY - y);
        const p = pistaEm(wy);
        ctx.fillStyle = c.grama[Math.floor(wy / 64) % 2 === 0 ? 0 : 1];
        ctx.fillRect(-6, y, W + 12, FT);
        ctx.fillStyle = c.asfalto;
        ctx.fillRect(p.xEsq, y, p.largura, FT + 0.5); // +0.5 evita frestas entre faixas
        const zebra = Math.floor(wy / 32) % 2 === 0;
        ctx.fillStyle = c.zebra[zebra ? 0 : 1];
        ctx.fillRect(p.xEsq - 10, y, 10, FT);
        ctx.fillRect(p.xEsq + p.largura, y, 10, FT);
        if (Math.floor(wy / 44) % 2 === 0) {
          ctx.fillStyle = c.faixa;
          for (let f = 1; f < FAIXAS; f++) ctx.fillRect(p.xEsq + (p.largura * f) / FAIXAS - 1.5, y, 3, FT);
        }
      }
      // Linha de borda em destaque
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = ac;
      for (let y = 0; y < H; y += FT) {
        const p = pistaEm(e.dist + (PY - y));
        ctx.fillRect(p.xEsq + 2, y, 2, FT);
        ctx.fillRect(p.xEsq + p.largura - 4, y, 2, FT);
      }
      ctx.globalAlpha = 1;
      // Árvores e arbustos na grama
      const banda = 110;
      const b0 = Math.floor((e.dist + PY - H) / banda) - 1;
      const b1 = Math.floor((e.dist + PY + 40) / banda) + 1;
      for (let b = b0; b <= b1; b++) {
        const hs = hash(b + 77);
        const wy = b * banda + (hs % 60);
        const y = PY - (wy - e.dist);
        const p = pistaEm(wy);
        for (const lado of [-1, 1]) {
          const hh = hash(b * 2 + (lado > 0 ? 1 : 0));
          if (hh % 3 === 0) continue;
          const margem = 26 + (hh % 50);
          const x = lado < 0 ? p.xEsq - margem : p.xEsq + p.largura + margem;
          if (x < -20 || x > W + 20) continue;
          const r = 10 + (hh % 9);
          ctx.fillStyle = c.arvSombra;
          ctx.beginPath();
          ctx.arc(x + 4, y + 5, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.arv[hh % 2 ? 0 : 1];
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.arvBrilho;
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Itens
      for (const it of e.itens) {
        const p = pistaEm(it.wy);
        const x = p.xEsq + it.u * p.largura + it.dx;
        const y = PY - (it.wy - e.dist);
        if (y < -40 || y > H + 40) continue;
        if (it.tipo === "galao") {
          if (!it.vivo) continue;
          ctx.save();
          ctx.shadowColor = c.galao;
          ctx.shadowBlur = c.galaoBlur + Math.sin(e.t * 6) * (c.galaoBlur / 3);
          ctx.fillStyle = c.galao;
          retangulo(ctx, x - 10, y - 11, 20, 24, 4);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = c.galaoTampa;
          ctx.fillRect(x - 6, y - 15, 9, 5);
          ctx.strokeStyle = c.galaoX;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 6, y - 4);
          ctx.lineTo(x + 6, y + 8);
          ctx.moveTo(x + 6, y - 4);
          ctx.lineTo(x - 6, y + 8);
          ctx.stroke();
        } else if (it.tipo === "oleo") {
          ctx.fillStyle = c.oleo;
          ctx.beginPath();
          ctx.ellipse(x, y, 20, 13, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.oleoBrilho;
          ctx.beginPath();
          ctx.ellipse(x - 5, y - 3, 7, 4, 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(x, y);
          if (!it.vivo) ctx.rotate(it.dx / 20);
          ctx.fillStyle = "#FF7A1A";
          ctx.beginPath();
          ctx.moveTo(0, -12);
          ctx.lineTo(9, 10);
          ctx.lineTo(-9, 10);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = c.coneFaixa;
          ctx.fillRect(-5, -1, 10, 3);
          ctx.restore();
        }
      }

      // Trânsito
      for (const o of e.carros) {
        const r = retCarro(o, e.dist);
        const y = r.y;
        if (y > H + 20 || y + r.h < -20) continue;
        carro(ctx, r.x + r.w / 2, y + r.h / 2, r.w, r.h, o.batida > 0 && Math.floor(e.t * 20) % 2 ? c.batida : o.cor < 0 ? c.caminhao : c.carros[o.cor % c.carros.length], o.tipo, 0, false, c);
        if (o.tipo === "muda" && Math.abs(o.alvoU - o.u) > 0.01) {
          ctx.fillStyle = Math.floor(e.t * 8) % 2 ? c.seta : c.setaOff;
          const lado = o.alvoU > o.u ? 1 : -1;
          ctx.fillRect(r.x + r.w / 2 + lado * (r.w / 2) - 2, y + r.h - 6, 4, 4);
          ctx.fillRect(r.x + r.w / 2 + lado * (r.w / 2) - 2, y + 2, 4, 4);
        }
      }

      // Jogador
      const pisca = e.invul > 0 && e.giro <= 0 && Math.floor(e.t * 14) % 2 === 0;
      if (!pisca) carro(ctx, e.x, PY, PW, PH, ac, "jogador", e.ang, true, c);

      // Painel: velocímetro e combustível
      const vm = vMax(cfgRef.current, e.dist);
      ctx.fillStyle = c.painel;
      retangulo(ctx, 12, 12, 118, 46, 10);
      ctx.fill();
      ctx.fillStyle = c.rotulo;
      ctx.font = "600 10px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("VELOCIDADE", 22, 28);
      ctx.fillStyle = c.texto;
      ctx.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`${Math.round(e.v * 0.42)}`, 22, 50);
      ctx.fillStyle = c.rotulo;
      ctx.font = "600 10px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("km/h", 80, 50);
      ctx.fillStyle = c.trilho;
      ctx.fillRect(22, 53, 96, 2);
      ctx.fillStyle = ac;
      ctx.fillRect(22, 53, 96 * Math.min(1, e.v / vm), 2);

      ctx.fillStyle = c.painel;
      retangulo(ctx, W - 150, 12, 138, 46, 10);
      ctx.fill();
      ctx.fillStyle = c.rotulo;
      ctx.fillText("COMBUSTÍVEL", W - 140, 28);
      ctx.fillStyle = c.trilhoComb;
      retangulo(ctx, W - 140, 36, 118, 12, 6);
      ctx.fill();
      const baixo = e.comb < 22;
      ctx.fillStyle = baixo ? c.combBaixo[Math.floor(e.t * 5) % 2 ? 0 : 1] : c.galao;
      retangulo(ctx, W - 140, 36, Math.max(6, 118 * (e.comb / 100)), 12, 6);
      ctx.fill();

      if (e.avisoT > 0 && e.aviso) {
        ctx.globalAlpha = Math.min(1, e.avisoT * 2);
        ctx.textAlign = "center";
        ctx.font = "700 16px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillStyle = c.painel;
        retangulo(ctx, W / 2 - 90, 74, 180, 30, 15);
        ctx.fill();
        ctx.fillStyle = c.texto;
        ctx.fillText(e.aviso, W / 2, 95);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cssW, cssH, passo]);

  const trocarVariacao = (n: NomeVariacao) => {
    setNomeVar(n);
    cfgRef.current = VARIACOES[n];
    estRef.current = novoEstado();
    soltarTudo();
    setHud({ pontos: 0, nivel: 1 });
    mudarStatus("inicio");
    rootRef.current?.focus();
  };

  const tecla = (k: string, valor: boolean) => {
    const t = teclasRef.current;
    if (k === "ArrowLeft" || k === "a" || k === "A") t.esq = valor;
    else if (k === "ArrowRight" || k === "d" || k === "D") t.dir = valor;
    else if (k === "ArrowUp" || k === "w" || k === "W") t.acel = valor;
    else if (k === "ArrowDown" || k === "s" || k === "S") t.freio = valor;
    else return false;
    if (valor) arrasteRef.current = null;
    return true;
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const k = ev.key;
    if (k.startsWith("Arrow") || k === " ") ev.preventDefault();
    const s = statusRef.current;
    if (k === " " || k === "Enter") {
      if (s === "inicio" || s === "fim") iniciar();
      else if (s === "pausado") mudarStatus("jogando");
      return;
    }
    if (k === "p" || k === "P") {
      if (s === "jogando") mudarStatus("pausado");
      else if (s === "pausado") mudarStatus("jogando");
      return;
    }
    tecla(k, true);
  };

  const onKeyUp = (ev: KeyboardEvent<HTMLDivElement>) => {
    tecla(ev.key, false);
  };

  const onBlur = (ev: FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(ev.relatedTarget as Node)) return;
    soltarTudo();
    if (statusRef.current === "jogando") mudarStatus("pausado");
  };

  const xVirtual = (ev: PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    if (!r.width) return null;
    return ((ev.clientX - r.left) / r.width) * W;
  };

  const botao = (campo: "esq" | "dir" | "acel" | "freio", rotulo: string, d: string, cls = "") => {
    const solta = (ev: PointerEvent<HTMLButtonElement>) => {
      ev.preventDefault();
      teclasRef.current[campo] = false;
    };
    return (
      <button
        type="button"
        aria-label={rotulo}
        onPointerDown={(ev) => {
          ev.preventDefault();
          const s = statusRef.current;
          if (s !== "jogando" && s !== "pausado") iniciar();
          arrasteRef.current = null;
          teclasRef.current[campo] = true;
        }}
        onPointerUp={solta}
        onPointerLeave={solta}
        onPointerCancel={solta}
        className={`${cls} flex h-14 touch-none select-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface-2)] text-[var(--fc-text)] active:bg-[var(--fc-border)]`}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
          <path d={d} />
        </svg>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      style={{ ...TEMAS[temaAtual], "--accent": accent } as CSSProperties}
      className="relative mx-auto w-full max-w-5xl select-none overflow-hidden rounded-3xl border border-[var(--fc-border)] bg-[var(--fc-bg)] p-3 shadow-[var(--fc-shadow)] text-[var(--fc-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:p-5"
    >
      {/* HUD */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
          <span className="text-sm font-semibold tracking-tight">Corrida na Pista</span>
          <BotaoTema tema={temaAtual} onClick={alternarTema} />
        </div>
        <div className="flex gap-4 text-xs text-[var(--fc-muted)]">
          <span>
            Pontos <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.pontos}</b>
          </span>
          <span>
            Recorde <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{recorde}</b>
          </span>
          <span>
            Nível <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.nivel}</b>
          </span>
        </div>
      </div>

      {/* Variações */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-[var(--fc-subtle)]">Variações</span>
        {(Object.keys(VARIACOES) as NomeVariacao[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => trocarVariacao(n)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              nomeVar === n
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Pista */}
      <div ref={areaRef} className="flex w-full justify-center">
        <div className="relative" style={{ width: cssW, height: cssH }}>
          <canvas
            ref={canvasRef}
            onPointerDown={(ev) => {
              if (statusRef.current !== "jogando") return;
              ev.preventDefault();
              try {
                ev.currentTarget.setPointerCapture?.(ev.pointerId);
              } catch {
                /* captura indisponível */
              }
              arrasteRef.current = xVirtual(ev);
            }}
            onPointerMove={(ev) => {
              if (arrasteRef.current === null) return;
              const x = xVirtual(ev);
              if (x !== null) arrasteRef.current = x;
            }}
            onPointerUp={() => (arrasteRef.current = null)}
            onPointerCancel={() => (arrasteRef.current = null)}
            className="block h-full w-full touch-none rounded-2xl"
            style={{ width: cssW, height: cssH }}
          />
          {status !== "jogando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--fc-bg)_75%,transparent)] text-center backdrop-blur-[2px]">
              {status === "fim" && (
                <>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Fim de jogo · sem combustível</p>
                  <p className="text-4xl font-semibold tabular-nums">{hud.pontos}</p>
                  <p className="text-xs text-[var(--fc-muted)]">
                    Recorde <span className="tabular-nums text-[var(--fc-text)]">{recorde}</span>
                  </p>
                </>
              )}
              {status === "pausado" && <p className="text-lg font-semibold">Pausado</p>}
              {status === "inicio" && <p className="text-lg font-semibold">Corrida na Pista</p>}
              <button
                type="button"
                onClick={() => (status === "pausado" ? (mudarStatus("jogando"), rootRef.current?.focus()) : iniciar())}
                className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_var(--accent)] transition hover:brightness-110"
              >
                {status === "fim" ? "Jogar de novo" : status === "pausado" ? "Continuar" : "Clique para jogar"}
              </button>
              {status === "inicio" || status === "pausado" ? (
                <ComoJogar className="hidden sm:block" />
              ) : (
                <p className="hidden text-[11px] text-[var(--fc-subtle)] sm:block">Clique ou aperte Espaço · P pausa</p>
              )}
              <p className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</p>
              <a href={LINK} target="_blank" rel="noopener" className="text-[10px] text-[var(--fc-subtle)] hover:text-[var(--fc-muted)]">
                Criado por FlowCore Soluções LTDA
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Controles de toque */}
      <div className="mt-4 grid grid-cols-5 gap-2 sm:hidden">
        {botao("esq", "Esquerda", "M6 12l9-7v14z")}
        {botao("dir", "Direita", "M18 12L9 19V5z")}
        <button
          type="button"
          aria-label="Pausar"
          onPointerDown={(ev) => {
            ev.preventDefault();
            const s = statusRef.current;
            if (s === "jogando") mudarStatus("pausado");
            else if (s === "pausado") mudarStatus("jogando");
            else iniciar();
          }}
          className="flex h-14 touch-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d={status === "jogando" ? "M7 5h3v14H7zM14 5h3v14h-3z" : "M8 5l11 7-11 7z"} />
          </svg>
        </button>
        {botao("freio", "Frear", "M12 18L5 9h14z")}
        {botao("acel", "Acelerar", "M12 6l7 9H5z")}
      </div>

      {/* Como jogar no celular: fica fora do canvas, que é pequeno na tela estreita */}
      {status !== "jogando" && <ComoJogar className="mx-auto mt-4 rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] px-4 py-3 sm:hidden" />}

      {/* Rodapé com assinatura */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--fc-border)] pt-3 text-center sm:justify-between sm:text-left">
        <span className="hidden text-[11px] text-[var(--fc-muted)] sm:inline">{RESUMO_TECLADO}</span>
        <span className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</span>
        <a href={LINK} target="_blank" rel="noopener" className="text-[11px] text-[var(--fc-subtle)] transition-colors hover:text-[var(--fc-muted)]">
          Criado por FlowCore Soluções LTDA
        </a>
      </div>
    </div>
  );
}

function carro(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  cor: string,
  tipo: TipoCarro | "jogador",
  ang: number,
  brilho: boolean,
  c: Paleta,
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (ang) ctx.rotate(ang);
  // sombra
  ctx.fillStyle = c.carroSombra;
  retangulo(ctx, -w / 2 + 3, -h / 2 + 5, w, h, 8);
  ctx.fill();
  // rodas
  ctx.fillStyle = c.roda;
  const ry = tipo === "caminhao" ? [-h / 2 + 12, -h / 2 + 28, h / 2 - 22] : [-h / 2 + 8, h / 2 - 20];
  for (const y of ry) {
    ctx.fillRect(-w / 2 - 3, y, 5, 13);
    ctx.fillRect(w / 2 - 2, y, 5, 13);
  }
  if (tipo === "caminhao") {
    // cabine + baú
    ctx.fillStyle = cor;
    retangulo(ctx, -w / 2, -h / 2, w, 30, 6);
    ctx.fill();
    ctx.fillStyle = c.cabineVidro;
    ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w - 10, 9);
    ctx.fillStyle = c.bau;
    retangulo(ctx, -w / 2 - 1, -h / 2 + 33, w + 2, h - 33, 4);
    ctx.fill();
    ctx.strokeStyle = c.bauLinha;
    ctx.lineWidth = 1;
    for (let y = -h / 2 + 44; y < h / 2 - 4; y += 12) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, y);
      ctx.lineTo(w / 2 - 3, y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // carroceria
  if (brilho && c.brilhoJogador) {
    ctx.shadowColor = cor;
    ctx.shadowBlur = c.brilhoJogador;
  }
  ctx.fillStyle = cor;
  retangulo(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fill();
  ctx.shadowBlur = 0;
  // faixa central e reflexo
  ctx.fillStyle = c.reflexo;
  ctx.fillRect(-w / 2 + 4, -h / 2 + 4, 4, h - 8);
  if (tipo === "jogador") {
    ctx.fillStyle = c.listra;
    ctx.fillRect(-2, -h / 2 + 2, 4, h - 4);
  }
  // para-brisas
  ctx.fillStyle = c.vidro;
  retangulo(ctx, -w / 2 + 5, -h / 2 + 12, w - 10, 12, 4);
  ctx.fill();
  retangulo(ctx, -w / 2 + 5, h / 2 - 17, w - 10, 8, 3);
  ctx.fill();
  ctx.fillStyle = c.vidroBrilho;
  ctx.fillRect(-w / 2 + 7, -h / 2 + 14, 5, 3);
  // faróis / lanternas
  ctx.fillStyle = tipo === "jogador" ? "#FFF4C2" : "#FFE8A3";
  ctx.fillRect(-w / 2 + 3, -h / 2 + 1, 6, 3);
  ctx.fillRect(w / 2 - 9, -h / 2 + 1, 6, 3);
  ctx.fillStyle = "#FF3B3B";
  ctx.fillRect(-w / 2 + 3, h / 2 - 4, 6, 3);
  ctx.fillRect(w / 2 - 9, h / 2 - 4, 6, 3);
  ctx.restore();
}

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
