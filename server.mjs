import { createServer } from 'node:http';

const PORT = process.env.PORT || 3000;

const TOEGESTANE_ORIGINS = [
  'https://doubleyoufashion.nl',
  'https://doubleyousmallandtall.nl',
  'https://kvizz0-g.myshopify.com',
  'https://paskamer-praat.pages.dev',
  'http://localhost:3000',
];

// ─── EASE tabellen (Winifred Aldrich, Metric Pattern Cutting) ────────────────
const EASE = {
  'Slim':      { b: 4,  t: 2,  h: 3  },
  'Regular':   { b: 8,  t: 4,  h: 6  },
  'Relaxed':   { b: 14, t: 8,  h: 10 },
  'Plus Size': { b: 18, t: 10, h: 14 },
};

// ─── Maatberekening ───────────────────────────────────────────────────────────
function berekenMaten(lengte, borstRaw, tailleRaw, heupRaw, been, pasvorm) {
  const e   = EASE[pasvorm] || EASE['Regular'];
  const B   = borstRaw + e.b;
  const T   = (tailleRaw || borstRaw * 0.85) + e.t;
  const H   = (heupRaw   || borstRaw * 1.05) + e.h;
  const bl  = been || (lengte - 85);
  const sc  = lengte / 185;

  return {
    lengte, borstRaw, pasvorm,
    borst:   B,  taille: T,  heup: H,  been: bl,
    // Bovenstuk
    schouderbreedte: B / 5.2,
    armscyeDiepte:   B / 8 + 3,
    ruglengte:        lengte * 0.245,
    hoodielengte:     lengte * 0.42,
    jasjelengte:      lengte * 0.52,
    shirtlengte:      lengte * 0.40,
    mouwlengte:       lengte * 0.34,
    mouwbreedte:      B / 8 + 5,
    // Broek
    kruisdiepteVoor:  H / 4 + 3,
    kruisdiepteRug:   H / 4 + 7,
    heupBreedte:      H / 4,
    tailleBreedte:    T / 4,
    taillering:       (H - T) / 4,
    pijpbreedte:      H / 8 + 4,
    kniebreedte:      H / 8 + 6,
    // Capuchon (standaard hoofdomtrek 58cm)
    capuchonHoogte:   34 * sc,
    capuchonBreedte:  22 * sc,
  };
}

// ─── SVG utilities ────────────────────────────────────────────────────────────
const px = v => Math.round(v * 3.78); // 1cm = 3.78px (standaard 96dpi)

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
  text { font-family: 'DM Sans', Arial, sans-serif; fill: #1e1a0f; }
  .bg  { fill: #fcf8ef; }
  .kader { fill: #fff; stroke: #1e1a0f; stroke-width: 1.6; }
  .naad-lijn  { fill: none; stroke: #1e1a0f; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  .naad-stip  { fill: none; stroke: #1e1a0f; stroke-width: 0.7; stroke-dasharray: 3,2; }
  .hulplijn   { fill: none; stroke: #c67d06; stroke-width: 0.6; stroke-dasharray: 6,3; }
  .maat-lijn  { fill: none; stroke: #888; stroke-width: 0.6; }
  .grain      { fill: none; stroke: #1e1a0f; stroke-width: 1.2; marker-start: url(#pijl); marker-end: url(#pijl); }
  .kerf       { fill: none; stroke: #1e1a0f; stroke-width: 1.2; }
  .titel-h    { font-size: 13px; font-weight: 500; fill: #c67d06; }
  .deel-lbl   { font-size: 10px; font-weight: 500; fill: #1e1a0f; }
  .info-lbl   { font-size: 8.5px; fill: #555; font-style: italic; }
  .maat-txt   { font-size: 8px; fill: #888; }
  .header-txt { font-size: 11px; fill: #1e1a0f; }
  .merk-txt   { font-size: 8px; fill: #c67d06; }
  .disc-txt   { font-size: 7px; fill: #aaa; }
  .grid       { fill: none; stroke: #e8dfc8; stroke-width: 0.3; }
`;

function defs(W, H) {
  // 5cm grid lijnen
  const gridH = [], gridV = [];
  for (let x = 0; x < W; x += px(5)) gridV.push(`M${x} 0 L${x} ${H}`);
  for (let y = 0; y < H; y += px(5)) gridH.push(`M0 ${y} L${W} ${y}`);
  return `<defs>
  <style>${CSS}</style>
  <marker id="pijl" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
    <path d="M0,0 L0,6 L6,3 z" fill="#1e1a0f"/>
  </marker>
  <marker id="pijlR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
    <path d="M0,0 L0,6 L6,3 z" fill="#888"/>
  </marker>
  </defs>
  <rect width="${W}" height="${H}" class="bg"/>
  <path d="${[...gridV,...gridH].join(' ')}" class="grid"/>`;
}

function header(W, titel, sub1, sub2) {
  return `
  <rect x="0" y="0" width="${W}" height="56" fill="#1e1a0f"/>
  <text x="18" y="22" class="titel-h">${titel}</text>
  <text x="18" y="38" class="header-txt" fill="#fcf8ef">${sub1}</text>
  <text x="18" y="52" class="header-txt" fill="rgba(252,248,239,0.55)" font-size="9">${sub2}</text>
  <text x="${W-14}" y="38" text-anchor="end" class="merk-txt" fill="#c67d06">doubleyoufashion.nl</text>`;
}

function footer(W, H) {
  return `<text x="${W/2}" y="${H-6}" text-anchor="middle" class="disc-txt">Technisch patroon op maat — maak altijd een toile voor het definitieve stuk · Naadtoeslag inbegrepen · Schaal 1:5</text>`;
}

// Patroondeel kader met label
function deelKader(x, y, w, h, nr, naam, knip, extra='') {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" class="kader" rx="2"/>
  <text x="${x+8}" y="${y+16}" class="deel-lbl">${nr}. ${naam}</text>
  <text x="${x+8}" y="${y+28}" class="info-lbl">${knip}</text>
  ${extra}`;
}

// Pijl voor draadrichting (grain line)
function grainLine(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="grain"/>
  <text x="${(x1+x2)/2+4}" y="${(y1+y2)/2}" class="info-lbl" transform="rotate(-90,${(x1+x2)/2+4},${(y1+y2)/2})">draadrichting</text>`;
}

// Kerf (inkeping voor naadpunt)
function kerf(x, y, hoek=0) {
  const len = 6;
  const rad = hoek * Math.PI / 180;
  return `<line x1="${x}" y1="${y}" x2="${x + len*Math.sin(rad)}" y2="${y - len*Math.cos(rad)}" class="kerf"/>`;
}

// Maataanduiding met pijlen
function maatLijn(x1, y1, x2, y2, label, offset=12) {
  const dx = x2-x1, dy = y2-y1;
  const len = Math.sqrt(dx*dx+dy*dy);
  const nx = -dy/len*offset, ny = dx/len*offset;
  return `
  <line x1="${x1+nx}" y1="${y1+ny}" x2="${x2+nx}" y2="${y2+ny}" class="maat-lijn" marker-start="url(#pijlR)" marker-end="url(#pijlR)"/>
  <text x="${(x1+x2)/2+nx+2}" y="${(y1+y2)/2+ny}" class="maat-txt">${label}</text>`;
}

// Naadlijn (gestippeld, 1cm naar binnen)
function naadlijn(path) {
  return `<path d="${path}" class="naad-stip"/>`;
}

// ─── HOODIE ───────────────────────────────────────────────────────────────────
function hoodiePatroon(m) {
  const W = 1400, H = 980;
  const NAAD = px(1); // 1cm naadtoeslag in pixels

  // Maten
  const bw  = px(m.borst / 4);       // halve borstbreedte (kwart borst)
  const rl  = px(m.hoodielengte);     // totale lengte
  const ml  = px(m.mouwlengte);       // mouwlengte
  const sd  = px(m.armscyeDiepte);    // armscye diepte
  const sw  = px(m.schouderbreedte);  // halve schouderbreedte
  const mw  = px(m.mouwbreedte);      // grootste mouwbreedte /2
  const ch  = px(m.capuchonHoogte);   // capuchon hoogte
  const cw  = px(m.capuchonBreedte);  // capuchon breedte

  const MARG = 30;

  // ── 1. ACHTERPAND ──────────────────────────────────────────────────────
  const ax = MARG, ay = 80;
  // Punten: halshoogte (3cm), schouderhelling (2cm), armscye curve, zijnaad
  const aHals = `M${ax+bw/2} ${ay} Q${ax+bw/2-10} ${ay-px(3)} ${ax} ${ay+px(2)}`;
  const aSchouder = `L${ax+sw} ${ay+px(2)}`;
  const aArmscye = `Q${ax+sw+px(3)} ${ay+sd/2} ${ax+bw} ${ay+sd}`;
  const aZij = `L${ax+bw} ${ay+rl}`;
  const aBodem = `L${ax} ${ay+rl}`;
  const aHalsSluit = `L${ax} ${ay+px(2)} Q${ax} ${ay} ${ax+bw/2} ${ay}`;
  const aPath = `${aHals} ${aSchouder} ${aArmscye} ${aZij} ${aBodem} ${aHalsSluit} Z`;

  // ── 2. VOORPAND ────────────────────────────────────────────────────────
  const vx = ax + bw + 50, vy = ay;
  const vHals = `M${vx+bw/2} ${vy} Q${vx+bw/2+px(4)} ${vy-px(8)} ${vx+bw} ${vy+px(2)}`;
  const vSchouder = `L${vx+bw+sw-sw} ${vy+px(2)}`; // spiegeling
  const vPath = `M${vx} ${vy+px(2)} L${vx+sw} ${vy+px(2)} Q${vx+sw+px(3)} ${vy+sd/2} ${vx+bw} ${vy+sd} L${vx+bw} ${vy+rl} L${vx+bw/2} ${vy+rl} L${vx+bw/2} ${vy+px(28)} Q${vx+px(8)} ${vy+px(15)} ${vx} ${vy+px(6)} L${vx} ${vy+px(2)} Z`;

  // ── 3. MOUW ────────────────────────────────────────────────────────────
  const mx = vx + bw + 50, myStart = ay;
  // Mouwkop hoogte = armscye / 3
  const mkh = sd / 3;
  const mPath = `M${mx+mw/2} ${myStart} Q${mx+mw*0.8} ${myStart+mkh*0.3} ${mx+mw} ${myStart+mkh} Q${mx+mw+px(2)} ${myStart+mkh*1.8} ${mx+mw-px(4)} ${myStart+sd} L${mx+mw} ${myStart+ml} L${mx+px(6)} ${myStart+ml} L${mx} ${myStart+sd} Q${mx-px(2)} ${myStart+mkh*1.8} ${mx+px(4)} ${myStart+mkh} Q${mx+mw*0.2} ${myStart+mkh*0.3} ${mx+mw/2} ${myStart} Z`;

  // ── 4. CAPUCHON ────────────────────────────────────────────────────────
  const hx = mx + mw + 60, hyStart = ay;
  const hPath = `M${hx} ${hyStart+ch} L${hx} ${hyStart+px(6)} Q${hx+cw*0.3} ${hyStart} ${hx+cw} ${hyStart} Q${hx+cw*1.4} ${hyStart+ch*0.4} ${hx+cw*1.3} ${hyStart+ch} Z`;

  // ── 5. RIBBOORDEN (rechthoeken) ────────────────────────────────────────
  const rx = MARG, ry = ay + rl + 30;
  const ribH = px(8), ribTaille = px(m.taille/2+2), ribManchet = px(9);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — Hoodiepatroon (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Taille ${Math.round(m.taille - (EASE[m.pasvorm]||EASE.Regular).t)}cm · Heup ${Math.round(m.heup - (EASE[m.pasvorm]||EASE.Regular).h)}cm`,
    `Mouwlengte ${Math.round(m.mouwlengte)}cm · Naadtoeslag 1cm inbegrepen · ${m.pasvorm} pasvorm · Schaal 1:5`)}

  <!-- ACHTERPAND -->
  <path d="${aPath}" class="naad-lijn"/>
  <path d="M${ax+NAAD} ${ay+NAAD} L${ax+sw-NAAD} ${ay+px(2)+NAAD} Q${ax+sw+px(2)} ${ay+sd/2} ${ax+bw-NAAD} ${ay+sd+NAAD} L${ax+bw-NAAD} ${ay+rl-NAAD} L${ax+NAAD} ${ay+rl-NAAD} Z" class="naad-stip"/>
  <line x1="${ax}" y1="${ay+px(m.ruglengte)}" x2="${ax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/>
  ${grainLine(ax+bw/2-6, ay+px(15), ax+bw/2-6, ay+rl-px(10))}
  ${kerf(ax+bw, ay+sd, 90)} ${kerf(ax+sw, ay+px(2), 45)}
  ${maatLijn(ax+bw, ay, ax+bw, ay+rl, `${Math.round(m.hoodielengte)}cm`, 18)}
  ${maatLijn(ax, ay+rl+8, ax+bw, ay+rl+8, `${Math.round(m.borst/4)}cm`, 12)}
  <text x="${ax+bw/2-20}" y="${ay+sd+px(8)}" class="deel-lbl">1. Achterpand</text>
  <text x="${ax+bw/2-18}" y="${ay+sd+px(20)}" class="info-lbl">knip 1× op vouw</text>
  <text x="${ax+2}" y="${ay+px(m.ruglengte)+10}" class="info-lbl" fill="#c67d06">taillijn</text>

  <!-- VOORPAND -->
  <path d="${vPath}" class="naad-lijn"/>
  <path d="M${vx+NAAD} ${vy+px(2)+NAAD} L${vx+sw-NAAD} ${vy+px(2)+NAAD} Q${vx+sw+px(2)} ${vy+sd/2} ${vx+bw-NAAD} ${vy+sd+NAAD} L${vx+bw-NAAD} ${vy+rl-NAAD} L${vx+bw/2+NAAD} ${vy+rl-NAAD} L${vx+bw/2+NAAD} ${vy+px(28)+NAAD} L${vx+NAAD} ${vy+px(8)} Z" class="naad-stip"/>
  <line x1="${vx+bw/2}" y1="${vy+px(28)}" x2="${vx+bw/2}" y2="${vy+rl}" stroke="#c67d06" stroke-width="1" stroke-dasharray="5,3"/>
  ${grainLine(vx+bw/2+12, vy+px(15), vx+bw/2+12, vy+rl-px(10))}
  ${kerf(vx+bw, vy+sd, 90)} ${kerf(vx+sw, vy+px(2), 45)}
  ${maatLijn(vx+bw, vy, vx+bw, vy+rl, `${Math.round(m.hoodielengte)}cm`, 18)}
  <text x="${vx+8}" y="${vy+sd+px(8)}" class="deel-lbl">2. Voorpand</text>
  <text x="${vx+8}" y="${vy+sd+px(20)}" class="info-lbl">knip 2× (gespiegeld)</text>
  <text x="${vx+bw/2+4}" y="${vy+px(50)}" class="info-lbl" fill="#c67d06">← rits/middennaad</text>

  <!-- MOUW -->
  <path d="${mPath}" class="naad-lijn"/>
  <path d="M${mx+mw/2} ${myStart+NAAD} Q${mx+mw*0.8} ${myStart+mkh*0.3+NAAD} ${mx+mw-NAAD} ${myStart+mkh+NAAD} Q${mx+mw+px(1)} ${myStart+mkh*1.8} ${mx+mw-px(5)} ${myStart+sd+NAAD} L${mx+mw-NAAD} ${myStart+ml-NAAD} L${mx+px(7)} ${myStart+ml-NAAD} L${mx+px(1)} ${myStart+sd+NAAD} Q${mx-px(1)} ${myStart+mkh*1.8} ${mx+px(5)} ${myStart+mkh+NAAD} Q${mx+mw*0.2} ${myStart+mkh*0.3+NAAD} ${mx+mw/2} ${myStart+NAAD} Z" class="naad-stip"/>
  ${grainLine(mx+mw/2-6, myStart+mkh+px(4), mx+mw/2-6, myStart+ml-px(8))}
  ${kerf(mx+mw/2, myStart, 0)}
  ${kerf(mx+mw, myStart+mkh, 90)} ${kerf(mx, myStart+mkh, 270)}
  ${maatLijn(mx+mw, myStart, mx+mw, myStart+ml, `${Math.round(m.mouwlengte)}cm`, 18)}
  ${maatLijn(mx, myStart+sd, mx+mw, myStart+sd, `${Math.round(m.mouwbreedte*2)}cm`, -14)}
  <text x="${mx+mw/2-18}" y="${myStart+sd+px(8)}" class="deel-lbl">3. Mouw</text>
  <text x="${mx+mw/2-14}" y="${myStart+sd+px(20)}" class="info-lbl">knip 2×</text>
  <text x="${mx+mw/2-24}" y="${myStart+px(10)}" class="info-lbl">mouwkop</text>

  <!-- CAPUCHON -->
  <path d="${hPath}" class="naad-lijn"/>
  <path d="M${hx+NAAD} ${hyStart+ch-NAAD} L${hx+NAAD} ${hyStart+px(8)} Q${hx+cw*0.3} ${hyStart+NAAD} ${hx+cw} ${hyStart+NAAD} Q${hx+cw*1.38} ${hyStart+ch*0.4} ${hx+cw*1.28} ${hyStart+ch-NAAD} Z" class="naad-stip"/>
  ${grainLine(hx+cw*0.7, hyStart+px(8), hx+cw*0.7, hyStart+ch-px(8))}
  ${maatLijn(hx, hyStart, hx, hyStart+ch, `${Math.round(m.capuchonHoogte)}cm`, -18)}
  ${maatLijn(hx, hyStart+ch+8, hx+cw*1.3, hyStart+ch+8, `${Math.round(m.capuchonBreedte*1.3)}cm`, 12)}
  <text x="${hx+cw*0.35}" y="${hyStart+ch/2}" class="deel-lbl">4. Capuchon</text>
  <text x="${hx+cw*0.35}" y="${hyStart+ch/2+14}" class="info-lbl">knip 2×</text>

  <!-- RIBBOORDEN — elk als apart gestapeld blok -->
  <rect x="${rx}" y="${ry}" width="220" height="60" class="naad-lijn"/>
  <text x="${rx+8}" y="${ry+16}" class="deel-lbl">5. Tailleband</text>
  <text x="${rx+8}" y="${ry+29}" class="info-lbl">knip 1× op vouw · rib/elastiek</text>
  <text x="${rx+8}" y="${ry+42}" class="info-lbl">${Math.round(m.taille/2+2)}cm × 8cm</text>

  <rect x="${rx+240}" y="${ry}" width="200" height="60" class="naad-lijn"/>
  <text x="${rx+248}" y="${ry+16}" class="deel-lbl">6. Manchet</text>
  <text x="${rx+248}" y="${ry+29}" class="info-lbl">knip 4× · rib/elastiek</text>
  <text x="${rx+248}" y="${ry+42}" class="info-lbl">9cm × 8cm</text>

  <rect x="${rx+460}" y="${ry}" width="200" height="60" class="naad-lijn"/>
  <text x="${rx+468}" y="${ry+16}" class="deel-lbl">7. Halsboordje</text>
  <text x="${rx+468}" y="${ry+29}" class="info-lbl">knip 1× op vouw · rib</text>
  <text x="${rx+468}" y="${ry+42}" class="info-lbl">halsomtrek × 6cm</text>

  ${footer(W, H)}
</svg>`;
}

// ─── SHIRT / BLOUSE ───────────────────────────────────────────────────────────
function shirtPatroon(m, naamLabel) {
  const W = 1200, H = 900;
  const NAAD = px(1);
  const bw = px(m.borst / 4);
  const rl = px(m.shirtlengte);
  const ml = px(m.mouwlengte);
  const sd = px(m.armscyeDiepte);
  const sw = px(m.schouderbreedte);
  const mw = px(m.mouwbreedte);
  const mkh = sd / 3;
  const MARG = 30;
  const ay = 80;

  const ax = MARG;
  const aPath = `M${ax+bw/2} ${ay} Q${ax+bw/2-8} ${ay-px(3)} ${ax} ${ay+px(2)} L${ax+sw} ${ay+px(2)} Q${ax+sw+px(3)} ${ay+sd/2} ${ax+bw} ${ay+sd} L${ax+bw} ${ay+rl} L${ax} ${ay+rl} L${ax} ${ay+px(2)} Q${ax} ${ay} ${ax+bw/2} ${ay} Z`;

  const vx = ax + bw + 50;
  const vPath = `M${vx} ${ay+px(2)} L${vx+sw} ${ay+px(2)} Q${vx+sw+px(3)} ${ay+sd/2} ${vx+bw} ${ay+sd} L${vx+bw} ${ay+rl} L${vx} ${ay+rl} L${vx} ${ay+px(2)} Z`;
  // V-hals curve
  const vHals = `M${vx} ${ay+px(2)} Q${vx+px(4)} ${ay+px(20)} ${vx+bw/2} ${ay+px(22)}`;

  const mx = vx + bw + 50;
  const mPath = `M${mx+mw/2} ${ay} Q${mx+mw*0.85} ${ay+mkh*0.3} ${mx+mw} ${ay+mkh} Q${mx+mw+px(2)} ${ay+mkh*1.8} ${mx+mw-px(4)} ${ay+sd} L${mx+mw} ${ay+ml} L${mx+px(6)} ${ay+ml} L${mx} ${ay+sd} Q${mx-px(2)} ${ay+mkh*1.8} ${mx+px(4)} ${ay+mkh} Q${mx+mw*0.15} ${ay+mkh*0.3} ${mx+mw/2} ${ay} Z`;

  // Boordrechthoek
  const rx = MARG, ry = ay + rl + 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — ${naamLabel} (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Schouder ${Math.round(m.schouderbreedte*2)}cm · Mouw ${Math.round(m.mouwlengte)}cm`,
    `Naadtoeslag 1cm inbegrepen · ${m.pasvorm} pasvorm · Schaal 1:5`)}

  <path d="${aPath}" class="naad-lijn"/>
  <path d="M${ax+NAAD} ${ay+px(2)+NAAD} L${ax+sw-NAAD} ${ay+px(2)+NAAD} Q${ax+sw+px(2)} ${ay+sd/2} ${ax+bw-NAAD} ${ay+sd+NAAD} L${ax+bw-NAAD} ${ay+rl-NAAD} L${ax+NAAD} ${ay+rl-NAAD} Z" class="naad-stip"/>
  <line x1="${ax}" y1="${ay+px(m.ruglengte)}" x2="${ax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/>
  ${grainLine(ax+bw/2-6, ay+px(12), ax+bw/2-6, ay+rl-px(10))}
  ${kerf(ax+bw, ay+sd, 90)} ${kerf(ax+sw, ay+px(2), 45)}
  ${maatLijn(ax+bw+6, ay, ax+bw+6, ay+rl, `${Math.round(m.shirtlengte)}cm`, 14)}
  ${maatLijn(ax, ay+rl+8, ax+bw, ay+rl+8, `${Math.round(m.borst/4)}cm`, 12)}
  <text x="${ax+8}" y="${ay+sd+px(10)}" class="deel-lbl">1. Achterpand</text>
  <text x="${ax+8}" y="${ay+sd+px(22)}" class="info-lbl">knip 1× op vouw</text>
  <text x="${ax+2}" y="${ay+px(m.ruglengte)-4}" class="info-lbl" fill="#c67d06">taillijn</text>

  <path d="${vPath}" class="naad-lijn"/>
  <path d="${vHals}" class="naad-lijn" stroke="#c67d06" stroke-width="1.2"/>
  <path d="M${vx+NAAD} ${ay+px(2)+NAAD} L${vx+sw-NAAD} ${ay+px(2)+NAAD} Q${vx+sw+px(2)} ${ay+sd/2} ${vx+bw-NAAD} ${ay+sd+NAAD} L${vx+bw-NAAD} ${ay+rl-NAAD} L${vx+NAAD} ${ay+rl-NAAD} Z" class="naad-stip"/>
  ${grainLine(vx+bw/2-6, ay+px(12), vx+bw/2-6, ay+rl-px(10))}
  ${kerf(vx+bw, ay+sd, 90)} ${kerf(vx+sw, ay+px(2), 45)}
  ${maatLijn(vx+bw+6, ay, vx+bw+6, ay+rl, `${Math.round(m.shirtlengte)}cm`, 14)}
  <text x="${vx+8}" y="${ay+sd+px(10)}" class="deel-lbl">2. Voorpand</text>
  <text x="${vx+8}" y="${ay+sd+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>

  <path d="${mPath}" class="naad-lijn"/>
  <path d="M${mx+mw/2} ${ay+NAAD} Q${mx+mw*0.85} ${ay+mkh*0.3} ${mx+mw-NAAD} ${ay+mkh} Q${mx+mw+px(1)} ${ay+mkh*1.8} ${mx+mw-px(5)} ${ay+sd+NAAD} L${mx+mw-NAAD} ${ay+ml-NAAD} L${mx+px(7)} ${ay+ml-NAAD} L${mx+px(1)} ${ay+sd+NAAD} Q${mx-px(1)} ${ay+mkh*1.8} ${mx+px(5)} ${ay+mkh} Q${mx+mw*0.15} ${ay+mkh*0.3} ${mx+mw/2} ${ay+NAAD} Z" class="naad-stip"/>
  ${grainLine(mx+mw/2-6, ay+mkh+px(4), mx+mw/2-6, ay+ml-px(8))}
  ${kerf(mx+mw/2, ay, 0)} ${kerf(mx+mw, ay+mkh, 90)} ${kerf(mx, ay+mkh, 270)}
  ${maatLijn(mx+mw+6, ay, mx+mw+6, ay+ml, `${Math.round(m.mouwlengte)}cm`, 14)}
  ${maatLijn(mx, ay+sd, mx+mw, ay+sd, `${Math.round(m.mouwbreedte*2)}cm`, -14)}
  <text x="${mx+mw/2-18}" y="${ay+sd+px(10)}" class="deel-lbl">3. Mouw</text>
  <text x="${mx+mw/2-14}" y="${ay+sd+px(22)}" class="info-lbl">knip 2×</text>

  <rect x="${rx}" y="${ry}" width="${px(m.borst/2+4)}" height="${px(5)}" class="naad-lijn"/>
  <text x="${rx+8}" y="${ry+13}" class="deel-lbl">4. Halsboordje</text>
  <text x="${rx+8}" y="${ry+24}" class="info-lbl">knip 1× op vouw · ${Math.round(m.borst/2+4)}cm × 5cm · op stofvouw knippen</text>

  ${footer(W, H)}
</svg>`;
}

// ─── BROEK ────────────────────────────────────────────────────────────────────
function broekPatroon(m) {
  const W = 1100, H = 980;
  const NAAD = px(1);
  const tw = px(m.tailleBreedte);
  const hw = px(m.heupBreedte);
  const kdV = px(m.kruisdiepteVoor);
  const kdR = px(m.kruisdiepteRug);
  const bl = px(m.been);
  const pw = px(m.pijpbreedte);
  const kw = px(m.kniebreedte);
  const tail = px(m.taillering); // taillering per naad
  const MARG = 30, ay = 80;

  // Voorpand
  const vx = MARG;
  const vPath = `
    M${vx} ${ay} L${vx+tw} ${ay}
    Q${vx+tw+px(2)} ${ay+kdV*0.4} ${vx+hw+px(3)} ${ay+kdV}
    L${vx+hw} ${ay+kdV+bl}
    L${vx+hw-pw} ${ay+kdV+bl}
    L${vx+hw-kw} ${ay+kdV+bl*0.45}
    L${vx} ${ay+kdV}
    Q${vx-px(2)} ${ay+kdV*0.4} ${vx} ${ay} Z`;

  // Rugpand (breder kruis)
  const rx = vx + hw + 60;
  const rPath = `
    M${rx-px(2)} ${ay} L${rx+tw+px(8)} ${ay}
    Q${rx+tw+px(12)} ${ay+kdR*0.3} ${rx+hw+px(12)} ${ay+kdR}
    L${rx+hw+px(8)} ${ay+kdR+bl}
    L${rx+hw+px(8)-pw} ${ay+kdR+bl}
    L${rx+hw+px(8)-kw} ${ay+kdR+bl*0.45}
    L${rx-px(10)} ${ay+kdR}
    Q${rx-px(14)} ${ay+kdR*0.35} ${rx-px(2)} ${ay} Z`;

  // Tailleband
  const tby = ay + Math.max(kdV, kdR) + bl + 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — Broekpatroon (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Taille ${Math.round(m.taille-(EASE[m.pasvorm]||EASE.Regular).t)}cm · Heup ${Math.round(m.heup-(EASE[m.pasvorm]||EASE.Regular).h)}cm · Been ${Math.round(m.been)}cm`,
    `Kruisdiepte voor ${Math.round(m.kruisdiepteVoor)}cm · rug ${Math.round(m.kruisdiepteRug)}cm · Taillering ${Math.round(m.taillering)}cm per naad · Naadtoeslag 1cm`)}

  <!-- HEUPLIJN hulp -->
  <line x1="${vx}" y1="${ay+kdV}" x2="${vx+hw+px(6)}" y2="${ay+kdV}" class="hulplijn"/>
  <text x="${vx+hw+px(8)}" y="${ay+kdV+4}" class="info-lbl" fill="#c67d06">heuplijn</text>
  <line x1="${rx-px(14)}" y1="${ay+kdR}" x2="${rx+hw+px(14)}" y2="${ay+kdR}" class="hulplijn"/>

  <!-- KNIE hulplijn -->
  <line x1="${vx}" y1="${ay+kdV+bl*0.45}" x2="${vx+hw}" y2="${ay+kdV+bl*0.45}" class="hulplijn"/>

  <!-- VOORPAND -->
  <path d="${vPath}" class="naad-lijn"/>
  <path d="M${vx+NAAD} ${ay+NAAD} L${vx+tw-NAAD} ${ay+NAAD} Q${vx+tw+px(1)} ${ay+kdV*0.4} ${vx+hw+px(2)} ${ay+kdV+NAAD} L${vx+hw-NAAD} ${ay+kdV+bl-NAAD} L${vx+hw-pw+NAAD} ${ay+kdV+bl-NAAD} L${vx+hw-kw+NAAD} ${ay+kdV+bl*0.45} L${vx+NAAD} ${ay+kdV+NAAD} Z" class="naad-stip"/>
  ${grainLine(vx+hw/2-6, ay+kdV+px(8), vx+hw/2-6, ay+kdV+bl-px(8))}
  ${kerf(vx+hw, ay+kdV, 90)} ${kerf(vx, ay+kdV, 270)}
  ${kerf(vx+tw, ay, 0)} ${kerf(vx, ay, 0)}
  ${maatLijn(vx+hw+8, ay, vx+hw+8, ay+kdV+bl, `${Math.round(m.kruisdiepteVoor+m.been)}cm`, 14)}
  ${maatLijn(vx, ay-10, vx+tw, ay-10, `${Math.round(m.tailleBreedte)}cm`, -12)}
  ${maatLijn(vx, ay+kdV-10, vx+hw, ay+kdV-10, `${Math.round(m.heupBreedte)}cm`, -12)}
  <text x="${vx+8}" y="${ay+kdV+px(10)}" class="deel-lbl">1. Voorpand</text>
  <text x="${vx+8}" y="${ay+kdV+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>

  <!-- RUGPAND -->
  <path d="${rPath}" class="naad-lijn"/>
  <path d="M${rx-px(1)} ${ay+NAAD} L${rx+tw+px(7)} ${ay+NAAD} Q${rx+tw+px(11)} ${ay+kdR*0.3} ${rx+hw+px(11)} ${ay+kdR+NAAD} L${rx+hw+px(7)} ${ay+kdR+bl-NAAD} L${rx+hw+px(8)-pw+NAAD} ${ay+kdR+bl-NAAD} L${rx+hw+px(8)-kw+NAAD} ${ay+kdR+bl*0.45} L${rx-px(9)} ${ay+kdR+NAAD} Z" class="naad-stip"/>
  ${grainLine(rx+hw/2, ay+kdR+px(8), rx+hw/2, ay+kdR+bl-px(8))}
  ${kerf(rx+hw+px(12), ay+kdR, 90)} ${kerf(rx-px(10), ay+kdR, 270)}
  ${kerf(rx+tw+px(8), ay, 0)} ${kerf(rx-px(2), ay, 0)}
  ${maatLijn(rx+hw+px(20), ay, rx+hw+px(20), ay+kdR+bl, `${Math.round(m.kruisdiepteRug+m.been)}cm`, 14)}
  ${maatLijn(rx-px(2), ay-10, rx+tw+px(8), ay-10, `${Math.round(m.tailleBreedte+px(8)/3.78)}cm`, -12)}
  <text x="${rx+8}" y="${ay+kdR+px(10)}" class="deel-lbl">2. Rugpand</text>
  <text x="${rx+8}" y="${ay+kdR+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>

  <!-- TAILLEBAND -->
  <rect x="${MARG}" y="${tby}" width="260" height="68" class="naad-lijn"/>
  <text x="${MARG+8}" y="${tby+16}" class="deel-lbl">3. Tailleband</text>
  <text x="${MARG+8}" y="${tby+30}" class="info-lbl">knip 2× · plooirichting markeren</text>
  <text x="${MARG+8}" y="${tby+44}" class="info-lbl">${Math.round((m.taille-(EASE[m.pasvorm]||EASE.Regular).t)/2+2)}cm × 5cm</text>

  ${footer(W, H)}
</svg>`;
}

// ─── JASJE ────────────────────────────────────────────────────────────────────
function jasjePatroon(m) {
  const W = 1400, H = 1020;
  const NAAD = px(1.5); // jasje heeft 1.5cm naadtoeslag
  const bw = px(m.borst / 4);
  const rl = px(m.jasjelengte);
  const ml = px(m.mouwlengte);
  const sd = px(m.armscyeDiepte + 2); // jasje iets dieper armscye
  const sw = px(m.schouderbreedte + 1); // jasje iets bredere schouder
  const mw = px(m.mouwbreedte + 2);
  const mkh = sd * 0.38;
  const MARG = 30, ay = 80;

  const ax = MARG;
  const aPath = `M${ax+bw/2} ${ay} Q${ax+bw/2-px(2)} ${ay-px(4)} ${ax} ${ay+px(3)} L${ax+sw} ${ay+px(3)} Q${ax+sw+px(4)} ${ay+sd/2} ${ax+bw} ${ay+sd} L${ax+bw+px(4)} ${ay+rl} L${ax-px(4)} ${ay+rl} L${ax} ${ay+px(3)} Q${ax} ${ay} ${ax+bw/2} ${ay} Z`;

  const vx = ax + bw + 60;
  const vPath = `M${vx} ${ay+px(3)} L${vx+sw} ${ay+px(3)} Q${vx+sw+px(4)} ${ay+sd/2} ${vx+bw} ${ay+sd} L${vx+bw+px(4)} ${ay+rl} L${vx+bw/2} ${ay+rl} L${vx+bw/2} ${ay+px(55)} Q${vx+px(12)} ${ay+px(35)} ${vx} ${ay+px(20)} Z`;

  const mx = vx + bw + 65;
  // Tweedelige mouw
  const mPath1 = `M${mx+mw*0.55} ${ay} Q${mx+mw*0.9} ${ay+mkh*0.3} ${mx+mw} ${ay+mkh} Q${mx+mw+px(3)} ${ay+mkh*1.8} ${mx+mw-px(5)} ${ay+sd} L${mx+mw+px(2)} ${ay+ml} L${mx+mw*0.55} ${ay+ml} L${mx+mw*0.55} ${ay} Z`;
  const mPath2 = `M${mx+mw*0.55} ${ay} Q${mx+mw*0.2} ${ay+mkh*0.3} ${mx} ${ay+mkh} Q${mx-px(3)} ${ay+mkh*1.8} ${mx+px(5)} ${ay+sd} L${mx-px(2)} ${ay+ml} L${mx+mw*0.55} ${ay+ml} L${mx+mw*0.55} ${ay} Z`;

  // Kraag/revers
  const kx = mx + mw + 65, ky = ay;
  const kraagPath = `M${kx} ${ky} Q${kx+px(6)} ${ky-px(4)} ${kx+px(16)} ${ky-px(2)} L${kx+px(22)} ${ky+px(8)} L${kx+px(18)} ${ky+px(24)} Q${kx+px(10)} ${ky+px(28)} ${kx} ${ky+px(24)} Q${kx-px(4)} ${ky+px(14)} ${kx} ${ky} Z`;

  // Borstzak
  const bz = px(12), bzh = px(14);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — Jasjepatroon (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Jasjelengte ${Math.round(m.jasjelengte)}cm · Mouw ${Math.round(m.mouwlengte)}cm`,
    `Naadtoeslag 1.5cm inbegrepen · Armscye verdiept +2cm · ${m.pasvorm} pasvorm · Schaal 1:5`)}

  <!-- ACHTERPAND -->
  <line x1="${ax}" y1="${ay+px(m.ruglengte)}" x2="${ax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/>
  <path d="${aPath}" class="naad-lijn"/>
  <path d="M${ax+bw/2} ${ay+NAAD} Q${ax+bw/2-px(1)} ${ay-px(3)} ${ax+NAAD} ${ay+px(3)+NAAD} L${ax+sw-NAAD} ${ay+px(3)+NAAD} Q${ax+sw+px(3)} ${ay+sd/2} ${ax+bw-NAAD} ${ay+sd+NAAD} L${ax+bw+px(3)} ${ay+rl-NAAD} L${ax-px(3)} ${ay+rl-NAAD} Z" class="naad-stip"/>
  ${grainLine(ax+bw/2-8, ay+px(14), ax+bw/2-8, ay+rl-px(12))}
  ${kerf(ax+bw, ay+sd, 90)} ${kerf(ax+sw, ay+px(3), 45)}
  ${maatLijn(ax+bw+px(6), ay, ax+bw+px(6), ay+rl, `${Math.round(m.jasjelengte)}cm`, 14)}
  ${maatLijn(ax, ay-10, ax+bw, ay-10, `${Math.round(m.borst/4)}cm`, -12)}
  <text x="${ax+8}" y="${ay+sd+px(12)}" class="deel-lbl">1. Achterpand</text>
  <text x="${ax+8}" y="${ay+sd+px(24)}" class="info-lbl">knip 1× op vouw</text>
  <text x="${ax+2}" y="${ay+px(m.ruglengte)-4}" class="info-lbl" fill="#c67d06">taillijn</text>

  <!-- VOORPAND met revers -->
  <path d="${vPath}" class="naad-lijn"/>
  <path d="M${vx+NAAD} ${ay+px(3)+NAAD} L${vx+sw-NAAD} ${ay+px(3)+NAAD} Q${vx+sw+px(3)} ${ay+sd/2} ${vx+bw-NAAD} ${ay+sd+NAAD} L${vx+bw+px(3)} ${ay+rl-NAAD} L${vx+bw/2+NAAD} ${ay+rl-NAAD} L${vx+bw/2+NAAD} ${ay+px(55)+NAAD} L${vx+NAAD} ${ay+px(22)} Z" class="naad-stip"/>
  <!-- Borstzak markering -->
  <rect x="${vx+px(6)}" y="${ay+px(m.ruglengte)-px(2)}" width="${bz}" height="${bzh}" fill="none" stroke="#c67d06" stroke-width="0.8" stroke-dasharray="4,2"/>
  <text x="${vx+px(6)}" y="${ay+px(m.ruglengte)+bzh+px(2)}" class="info-lbl" fill="#c67d06">borstzak</text>
  <line x1="${vx+bw/2}" y1="${ay+px(55)}" x2="${vx+bw/2}" y2="${ay+rl}" stroke="#c67d06" stroke-width="0.8" stroke-dasharray="5,3"/>
  ${grainLine(vx+bw*0.7, ay+px(14), vx+bw*0.7, ay+rl-px(12))}
  ${kerf(vx+bw, ay+sd, 90)} ${kerf(vx+sw, ay+px(3), 45)}
  ${maatLijn(vx+bw+px(6), ay, vx+bw+px(6), ay+rl, `${Math.round(m.jasjelengte)}cm`, 14)}
  <text x="${vx+8}" y="${ay+sd+px(12)}" class="deel-lbl">2. Voorpand</text>
  <text x="${vx+8}" y="${ay+sd+px(24)}" class="info-lbl">knip 2× (gespiegeld)</text>
  <text x="${vx+bw/2+4}" y="${ay+px(40)}" class="info-lbl" fill="#c67d06">← revers</text>

  <!-- MOUW BOVENSTUK -->
  <path d="${mPath1}" class="naad-lijn"/>
  <path d="${mPath2}" class="naad-lijn"/>
  <line x1="${mx+mw*0.55}" y1="${ay}" x2="${mx+mw*0.55}" y2="${ay+ml}" stroke="#888" stroke-width="0.8" stroke-dasharray="4,2"/>
  ${grainLine(mx+mw*0.55+8, ay+mkh+px(4), mx+mw*0.55+8, ay+ml-px(8))}
  ${kerf(mx+mw*0.55, ay, 0)} ${kerf(mx+mw, ay+mkh, 90)} ${kerf(mx, ay+mkh, 270)}
  ${maatLijn(mx+mw+px(6), ay, mx+mw+px(6), ay+ml, `${Math.round(m.mouwlengte)}cm`, 14)}
  <text x="${mx+8}" y="${ay+sd+px(12)}" class="deel-lbl">3. Mouw bovenstuk</text>
  <text x="${mx+8}" y="${ay+sd+px(24)}" class="info-lbl">knip 2×</text>
  <text x="${mx+mw*0.55+6}" y="${ay+ml/2}" class="info-lbl">ondermouw</text>
  <text x="${mx+mw*0.3}" y="${ay+ml/2}" class="info-lbl">→</text>

  <!-- KRAAG -->
  <path d="${kraagPath}" class="naad-lijn"/>
  ${grainLine(kx+px(8), ky+px(4), kx+px(14), ky+px(20))}
  <text x="${kx+px(2)}" y="${ky+px(34)}" class="deel-lbl">4. Kraag</text>
  <text x="${kx+px(2)}" y="${ky+px(46)}" class="info-lbl">knip 2× + tussenvoering</text>

  <!-- ZAKKEN -->
  <rect x="${MARG}" y="${ay+rl+30}" width="${px(16)}" height="${px(18)}" class="naad-lijn"/>
  <text x="${MARG+6}" y="${ay+rl+44}" class="deel-lbl">5. Zijzak</text>
  <text x="${MARG+6}" y="${ay+rl+56}" class="info-lbl">knip 4× · 16×18cm</text>

  ${footer(W, H)}
</svg>`;
}

// ─── TRACKSUIT ────────────────────────────────────────────────────────────────
function tracksuitPatroon(m) {
  const W = 1600, H = 1080;
  const NAAD = px(1);
  // TOP
  const bw = px(m.borst / 4);
  const rl = px(m.hoodielengte * 0.85); // tracksuit top iets korter
  const ml = px(m.mouwlengte);
  const sd = px(m.armscyeDiepte);
  const sw = px(m.schouderbreedte);
  const mw = px(m.mouwbreedte);
  const mkh = sd / 3;
  // BROEK
  const tw = px(m.tailleBreedte);
  const hw = px(m.heupBreedte);
  const kdV = px(m.kruisdiepteVoor);
  const kdR = px(m.kruisdiepteRug);
  const bl = px(m.been * 0.85); // tracksuit broek iets afgeknot
  const pw = px(m.pijpbreedte + 2); // wijder voor tracksuit
  const MARG = 20, ay = 80;

  // TOP ACHTERPAND
  const tax = MARG;
  const tAPath = `M${tax+bw/2} ${ay} Q${tax+bw/2-8} ${ay-px(3)} ${tax} ${ay+px(2)} L${tax+sw} ${ay+px(2)} Q${tax+sw+px(3)} ${ay+sd/2} ${tax+bw} ${ay+sd} L${tax+bw} ${ay+rl} L${tax} ${ay+rl} L${tax} ${ay+px(2)} Q${tax} ${ay} ${tax+bw/2} ${ay} Z`;

  // TOP VOORPAND (met rits)
  const tvx = tax + bw + 45;
  const tVPath = `M${tvx} ${ay+px(2)} L${tvx+sw} ${ay+px(2)} Q${tvx+sw+px(3)} ${ay+sd/2} ${tvx+bw} ${ay+sd} L${tvx+bw} ${ay+rl} L${tvx+bw/2} ${ay+rl} L${tvx+bw/2} ${ay+px(28)} L${tvx} ${ay+px(28)} Z`;

  // MOUW
  const tmx = tvx + bw + 45;
  const tMPath = `M${tmx+mw/2} ${ay} Q${tmx+mw*0.85} ${ay+mkh*0.3} ${tmx+mw} ${ay+mkh} Q${tmx+mw+px(2)} ${ay+mkh*1.8} ${tmx+mw-px(4)} ${ay+sd} L${tmx+mw} ${ay+ml} L${tmx+px(6)} ${ay+ml} L${tmx} ${ay+sd} Q${tmx-px(2)} ${ay+mkh*1.8} ${tmx+px(4)} ${ay+mkh} Q${tmx+mw*0.15} ${ay+mkh*0.3} ${tmx+mw/2} ${ay} Z`;

  // BROEK VOOR
  const bvx = tmx + mw + 55;
  const bVPath = `M${bvx} ${ay} L${bvx+tw} ${ay} Q${bvx+tw+px(2)} ${ay+kdV*0.4} ${bvx+hw+px(3)} ${ay+kdV} L${bvx+hw} ${ay+kdV+bl} L${bvx+hw-pw} ${ay+kdV+bl} L${bvx} ${ay+kdV} Q${bvx-px(2)} ${ay+kdV*0.4} ${bvx} ${ay} Z`;

  // BROEK RUG
  const brx = bvx + hw + 55;
  const bRPath = `M${brx-px(2)} ${ay} L${brx+tw+px(8)} ${ay} Q${brx+tw+px(12)} ${ay+kdR*0.3} ${brx+hw+px(12)} ${ay+kdR} L${brx+hw+px(8)} ${ay+kdR+bl} L${brx+hw+px(8)-pw} ${ay+kdR+bl} L${brx-px(10)} ${ay+kdR} Q${brx-px(14)} ${ay+kdR*0.35} ${brx-px(2)} ${ay} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — Tracksuitpatroon (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Taille ${Math.round(m.taille-(EASE[m.pasvorm]||EASE.Regular).t)}cm · Heup ${Math.round(m.heup-(EASE[m.pasvorm]||EASE.Regular).h)}cm · Been ${Math.round(m.been)}cm`,
    `Naadtoeslag 1cm · ${m.pasvorm} pasvorm · Top + Broek volledig patroon · Schaal 1:5`)}

  <!-- SECTIELABELS -->
  <text x="${tax}" y="${ay-12}" class="titel-h" font-size="10">── TOP ─────────────────────────────────────────────────────────────────────────────</text>
  <text x="${bvx}" y="${ay-12}" class="titel-h" font-size="10">── BROEK ──────────────────────────────────────</text>

  <!-- TOP ACHTERPAND -->
  <path d="${tAPath}" class="naad-lijn"/>
  <path d="M${tax+bw/2} ${ay+NAAD} Q${tax+NAAD} ${ay} ${tax+NAAD} ${ay+px(2)+NAAD} L${tax+sw-NAAD} ${ay+px(2)+NAAD} Q${tax+sw+px(2)} ${ay+sd/2} ${tax+bw-NAAD} ${ay+sd+NAAD} L${tax+bw-NAAD} ${ay+rl-NAAD} L${tax+NAAD} ${ay+rl-NAAD} Z" class="naad-stip"/>
  <line x1="${tax}" y1="${ay+px(m.ruglengte)}" x2="${tax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/>
  ${grainLine(tax+bw/2-6, ay+px(12), tax+bw/2-6, ay+rl-px(8))}
  ${kerf(tax+bw, ay+sd, 90)} ${kerf(tax+sw, ay+px(2), 45)}
  ${maatLijn(tax+bw+6, ay, tax+bw+6, ay+rl, `${Math.round(m.hoodielengte*0.85)}cm`, 12)}
  <text x="${tax+6}" y="${ay+sd+px(10)}" class="deel-lbl">1. Top achterpand</text>
  <text x="${tax+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 1× op vouw</text>

  <!-- TOP VOORPAND -->
  <path d="${tVPath}" class="naad-lijn"/>
  <path d="M${tvx+NAAD} ${ay+px(2)+NAAD} L${tvx+sw-NAAD} ${ay+px(2)+NAAD} Q${tvx+sw+px(2)} ${ay+sd/2} ${tvx+bw-NAAD} ${ay+sd+NAAD} L${tvx+bw-NAAD} ${ay+rl-NAAD} L${tvx+bw/2+NAAD} ${ay+rl-NAAD} L${tvx+bw/2+NAAD} ${ay+px(28)+NAAD} L${tvx+NAAD} ${ay+px(28)+NAAD} Z" class="naad-stip"/>
  <line x1="${tvx+bw/2}" y1="${ay+px(28)}" x2="${tvx+bw/2}" y2="${ay+rl}" stroke="#c67d06" stroke-width="1.2" stroke-dasharray="5,3"/>
  ${grainLine(tvx+bw/2+10, ay+px(12), tvx+bw/2+10, ay+rl-px(8))}
  ${kerf(tvx+bw, ay+sd, 90)} ${kerf(tvx+sw, ay+px(2), 45)}
  <text x="${tvx+6}" y="${ay+sd+px(10)}" class="deel-lbl">2. Top voorpand</text>
  <text x="${tvx+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>
  <text x="${tvx+bw/2+4}" y="${ay+px(50)}" class="info-lbl" fill="#c67d06">← rits</text>

  <!-- MOUW -->
  <path d="${tMPath}" class="naad-lijn"/>
  <path d="M${tmx+mw/2} ${ay+NAAD} Q${tmx+mw*0.85} ${ay+mkh*0.3+NAAD} ${tmx+mw-NAAD} ${ay+mkh+NAAD} Q${tmx+mw+px(1)} ${ay+mkh*1.8} ${tmx+mw-px(5)} ${ay+sd+NAAD} L${tmx+mw-NAAD} ${ay+ml-NAAD} L${tmx+px(7)} ${ay+ml-NAAD} L${tmx+px(1)} ${ay+sd+NAAD} Q${tmx-px(1)} ${ay+mkh*1.8} ${tmx+px(5)} ${ay+mkh+NAAD} Q${tmx+mw*0.15} ${ay+mkh*0.3+NAAD} ${tmx+mw/2} ${ay+NAAD} Z" class="naad-stip"/>
  ${grainLine(tmx+mw/2-6, ay+mkh+px(4), tmx+mw/2-6, ay+ml-px(8))}
  ${kerf(tmx+mw/2, ay, 0)} ${kerf(tmx+mw, ay+mkh, 90)} ${kerf(tmx, ay+mkh, 270)}
  ${maatLijn(tmx+mw+6, ay, tmx+mw+6, ay+ml, `${Math.round(m.mouwlengte)}cm`, 12)}
  <text x="${tmx+6}" y="${ay+sd+px(10)}" class="deel-lbl">3. Mouw</text>
  <text x="${tmx+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 2×</text>

  <!-- BROEK HULPLIJNEN -->
  <line x1="${bvx}" y1="${ay+kdV}" x2="${bvx+hw+px(6)}" y2="${ay+kdV}" class="hulplijn"/>
  <line x1="${brx-px(14)}" y1="${ay+kdR}" x2="${brx+hw+px(14)}" y2="${ay+kdR}" class="hulplijn"/>

  <!-- BROEK VOORPAND -->
  <path d="${bVPath}" class="naad-lijn"/>
  <path d="M${bvx+NAAD} ${ay+NAAD} L${bvx+tw-NAAD} ${ay+NAAD} Q${bvx+tw+px(1)} ${ay+kdV*0.4} ${bvx+hw+px(2)} ${ay+kdV+NAAD} L${bvx+hw-NAAD} ${ay+kdV+bl-NAAD} L${bvx+hw-pw+NAAD} ${ay+kdV+bl-NAAD} L${bvx+NAAD} ${ay+kdV+NAAD} Z" class="naad-stip"/>
  ${grainLine(bvx+hw/2-6, ay+kdV+px(8), bvx+hw/2-6, ay+kdV+bl-px(8))}
  ${kerf(bvx+hw, ay+kdV, 90)} ${kerf(bvx, ay+kdV, 270)}
  ${kerf(bvx+tw, ay, 0)} ${kerf(bvx, ay, 0)}
  ${maatLijn(bvx+hw+8, ay, bvx+hw+8, ay+kdV+bl, `${Math.round(m.kruisdiepteVoor+m.been*0.85)}cm`, 12)}
  <text x="${bvx+6}" y="${ay+kdV+px(10)}" class="deel-lbl">4. Broek voorpand</text>
  <text x="${bvx+6}" y="${ay+kdV+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>

  <!-- BROEK RUGPAND -->
  <path d="${bRPath}" class="naad-lijn"/>
  <path d="M${brx-px(1)} ${ay+NAAD} L${brx+tw+px(7)} ${ay+NAAD} Q${brx+tw+px(11)} ${ay+kdR*0.3} ${brx+hw+px(11)} ${ay+kdR+NAAD} L${brx+hw+px(7)} ${ay+kdR+bl-NAAD} L${brx+hw+px(8)-pw+NAAD} ${ay+kdR+bl-NAAD} L${brx-px(9)} ${ay+kdR+NAAD} Z" class="naad-stip"/>
  ${grainLine(brx+hw/2, ay+kdR+px(8), brx+hw/2, ay+kdR+bl-px(8))}
  ${kerf(brx+hw+px(12), ay+kdR, 90)} ${kerf(brx-px(10), ay+kdR, 270)}
  ${maatLijn(brx+hw+px(20), ay, brx+hw+px(20), ay+kdR+bl, `${Math.round(m.kruisdiepteRug+m.been*0.85)}cm`, 12)}
  <text x="${brx+6}" y="${ay+kdR+px(10)}" class="deel-lbl">5. Broek rugpand</text>
  <text x="${brx+6}" y="${ay+kdR+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text>

  <!-- RIBBOORDEN — gestapeld per blok voor leesbaarheid -->
  <rect x="${MARG}" y="${ay+Math.max(rl,kdV+bl)+35}" width="260" height="72" class="naad-lijn"/>
  <text x="${MARG+8}" y="${ay+Math.max(rl,kdV+bl)+51}" class="deel-lbl">6. Tailleband broek</text>
  <text x="${MARG+8}" y="${ay+Math.max(rl,kdV+bl)+64}" class="info-lbl">elastisch · knip 2× · vouw dubbel</text>
  <text x="${MARG+8}" y="${ay+Math.max(rl,kdV+bl)+77}" class="info-lbl">${Math.round(m.taille/2+2)}cm × 8cm</text>

  <rect x="${MARG+280}" y="${ay+Math.max(rl,kdV+bl)+35}" width="200" height="72" class="naad-lijn"/>
  <text x="${MARG+288}" y="${ay+Math.max(rl,kdV+bl)+51}" class="deel-lbl">7. Manchet</text>
  <text x="${MARG+288}" y="${ay+Math.max(rl,kdV+bl)+64}" class="info-lbl">knip 4× · rib/elastiek</text>
  <text x="${MARG+288}" y="${ay+Math.max(rl,kdV+bl)+77}" class="info-lbl">9cm × 8cm</text>

  <rect x="${MARG+500}" y="${ay+Math.max(rl,kdV+bl)+35}" width="260" height="72" class="naad-lijn"/>
  <text x="${MARG+508}" y="${ay+Math.max(rl,kdV+bl)+51}" class="deel-lbl">8. Tailleband top</text>
  <text x="${MARG+508}" y="${ay+Math.max(rl,kdV+bl)+64}" class="info-lbl">elastisch · knip 2× · rib</text>
  <text x="${MARG+508}" y="${ay+Math.max(rl,kdV+bl)+77}" class="info-lbl">${Math.round(m.borst/4)}cm × 6cm</text>

  ${footer(W, H)}
</svg>`;
}

// ─── BADMODE ──────────────────────────────────────────────────────────────────
function badmodePatroon(m) {
  const W = 1100, H = 900;
  const NAAD = px(1);
  const bw = px(m.borst / 4 * 0.9); // badmode iets strakker
  const rl = px(m.ruglengte * 0.55);
  const hw = px(m.heupBreedte * 0.92);
  const bl = px(m.been * 0.55);
  const MARG = 30, ay = 80;

  // Bikini top (2 stukken: cup + band)
  const cx = MARG;
  const cupH = px(14), cupW = px(16);
  const cupPath = `M${cx} ${ay+cupH} Q${cx+cupW*0.3} ${ay} ${cx+cupW} ${ay} Q${cx+cupW+px(6)} ${ay+cupH*0.5} ${cx+cupW+px(4)} ${ay+cupH+px(4)} L${cx+px(4)} ${ay+cupH+px(4)} Q${cx-px(2)} ${ay+cupH*0.8} ${cx} ${ay+cupH} Z`;
  const bandW = px(m.borst / 2 + 2), bandH = px(5);

  // Bikini broekje
  const bix = cx + cupW + px(10) + 50;
  const biTopW = px(m.heup/4 + 2);
  const biPath = `M${bix} ${ay} L${bix+biTopW} ${ay} Q${bix+biTopW+px(4)} ${ay+px(8)} ${bix+biTopW+px(2)} ${ay+px(16)} L${bix+biTopW} ${ay+bl} Q${bix+biTopW*0.8} ${ay+bl+px(10)} ${bix+biTopW/2} ${ay+bl+px(8)} Q${bix+biTopW*0.2} ${ay+bl+px(10)} ${bix} ${ay+bl} L${bix-px(2)} ${ay+px(16)} Q${bix-px(4)} ${ay+px(8)} ${bix} ${ay} Z`;

  // Badpak
  const opx = bix + biTopW + px(8) + 50;
  const opPath = `M${opx+px(4)} ${ay+px(18)} Q${opx+bw*0.5} ${ay} ${opx+bw-px(4)} ${ay+px(18)} L${opx+bw} ${ay+rl} Q${opx+bw+px(10)} ${ay+rl+px(6)} ${opx+bw+px(8)} ${ay+rl+px(18)} L${opx+bw+px(4)} ${ay+rl+bl} Q${opx+bw*0.8} ${ay+rl+bl+px(10)} ${opx+bw/2} ${ay+rl+bl+px(8)} Q${opx+bw*0.2} ${ay+rl+bl+px(10)} ${opx} ${ay+rl+bl} L${opx-px(4)} ${ay+rl+px(18)} Q${opx-px(8)} ${ay+rl+px(6)} ${opx-px(10)} ${ay+rl} Z`;

  // Band badpak
  const sbW = px(m.borst / 2 + 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs(W, H)}
  ${header(W, `DoubleYou — Badmodepatroon (${m.pasvorm})`,
    `Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Heup ${Math.round(m.heup-(EASE[m.pasvorm]||EASE.Regular).h)}cm`,
    `Naadtoeslag 1cm · Gebruik rekbare stof (lycra/elastaan) · ${m.pasvorm} pasvorm · Schaal 1:5`)}

  <!-- BIKINI TOP: CUP -->
  <path d="${cupPath}" class="naad-lijn"/>
  <path d="M${cx+NAAD} ${ay+cupH-NAAD} Q${cx+cupW*0.3} ${ay+NAAD} ${cx+cupW-NAAD} ${ay+NAAD} Q${cx+cupW+px(5)} ${ay+cupH*0.5} ${cx+cupW+px(3)} ${ay+cupH+px(3)} L${cx+px(5)} ${ay+cupH+px(3)} Z" class="naad-stip"/>
  <text x="${cx+6}" y="${ay+cupH+px(10)}" class="deel-lbl">1. Bikini cup</text>
  <text x="${cx+6}" y="${ay+cupH+px(22)}" class="info-lbl">knip 4× (2× stof + 2× voering)</text>
  <text x="${cx+6}" y="${ay+cupH+px(34)}" class="info-lbl">beugel-opening markeren indien gewenst</text>
  ${maatLijn(cx, ay, cx+cupW, ay, `${Math.round(cupW/3.78)}cm`, -12)}
  ${maatLijn(cx+cupW+px(8), ay, cx+cupW+px(8), ay+cupH, `${Math.round(cupH/3.78)}cm`, 12)}

  <!-- BIKINI BAND -->
  <rect x="${cx}" y="${ay+cupH+px(40)}" width="${bandW}" height="${bandH}" class="naad-lijn"/>
  <text x="${cx+6}" y="${ay+cupH+px(40)+13}" class="deel-lbl">2. Bikini band</text>
  <text x="${cx+6}" y="${ay+cupH+px(40)+24}" class="info-lbl">knip 2× op vouw · ${Math.round(m.borst/2+2)}cm × 5cm · rekbaar</text>

  <!-- NEKBANDJE -->
  <rect x="${cx}" y="${ay+cupH+px(55)}" width="${px(35)}" height="${px(3)}" class="naad-lijn"/>
  <text x="${cx+6}" y="${ay+cupH+px(55)+11}" class="deel-lbl">3. Nekband</text>
  <text x="${cx+6}" y="${ay+cupH+px(55)+22}" class="info-lbl">knip 2× · 35cm × 3cm (aanpasbaar)</text>

  <!-- BIKINI BROEKJE -->
  <path d="${biPath}" class="naad-lijn"/>
  <path d="M${bix+NAAD} ${ay+NAAD} L${bix+biTopW-NAAD} ${ay+NAAD} Q${bix+biTopW+px(3)} ${ay+px(8)} ${bix+biTopW+px(1)} ${ay+px(16)} L${bix+biTopW-NAAD} ${ay+bl-NAAD} Q${bix+biTopW*0.8} ${ay+bl+px(9)} ${bix+biTopW/2} ${ay+bl+px(7)} Q${bix+biTopW*0.2} ${ay+bl+px(9)} ${bix+NAAD} ${ay+bl-NAAD} L${bix-px(1)} ${ay+px(16)} Z" class="naad-stip"/>
  ${grainLine(bix+biTopW/2-6, ay+px(10), bix+biTopW/2-6, ay+bl-px(4))}
  ${kerf(bix+biTopW/2, ay, 0)} ${kerf(bix+biTopW/2, ay+bl+px(8), 180)}
  ${maatLijn(bix, ay-10, bix+biTopW, ay-10, `${Math.round(biTopW/3.78)}cm`, -12)}
  ${maatLijn(bix+biTopW+px(10), ay, bix+biTopW+px(10), ay+bl, `${Math.round(bl/3.78)}cm`, 12)}
  <text x="${bix+6}" y="${ay+bl/2+8}" class="deel-lbl">4. Bikini broekje</text>
  <text x="${bix+6}" y="${ay+bl/2+22}" class="info-lbl">knip 2× (gespiegeld)</text>

  <!-- ZIJBAND BROEKJE -->
  <rect x="${bix}" y="${ay+bl+px(25)}" width="${px(18)}" height="${px(4)}" class="naad-lijn"/>
  <text x="${bix+6}" y="${ay+bl+px(37)}" class="deel-lbl">5. Zijbandje broekje</text>
  <text x="${bix+6}" y="${ay+bl+px(48)}" class="info-lbl">knip 4× · 18cm × 4cm</text>

  <!-- BADPAK -->
  <path d="${opPath}" class="naad-lijn"/>
  <path d="M${opx+px(5)} ${ay+px(18)+NAAD} Q${opx+bw*0.5} ${ay+NAAD} ${opx+bw-px(5)} ${ay+px(18)+NAAD} L${opx+bw-NAAD} ${ay+rl-NAAD} Q${opx+bw+px(9)} ${ay+rl+px(6)} ${opx+bw+px(7)} ${ay+rl+px(18)} L${opx+bw+px(3)} ${ay+rl+bl-NAAD} Q${opx+bw*0.8} ${ay+rl+bl+px(9)} ${opx+bw/2} ${ay+rl+bl+px(7)} Q${opx+bw*0.2} ${ay+rl+bl+px(9)} ${opx} ${ay+rl+bl-NAAD} L${opx-px(3)} ${ay+rl+px(18)} Q${opx-px(7)} ${ay+rl+px(6)} ${opx-px(9)} ${ay+rl-NAAD} Z" class="naad-stip"/>
  ${grainLine(opx+bw/2-6, ay+px(20), opx+bw/2-6, ay+rl+bl-px(4))}
  <line x1="${opx-px(10)}" y1="${ay+rl}" x2="${opx+bw+px(10)}" y2="${ay+rl}" class="hulplijn"/>
  <text x="${opx-px(10)}" y="${ay+rl-4}" class="info-lbl" fill="#c67d06">taillenaad</text>
  ${maatLijn(opx+bw+px(14), ay+px(18), opx+bw+px(14), ay+rl+bl, `${Math.round((rl+bl)/3.78)}cm`, 12)}
  <text x="${opx+6}" y="${ay+rl+px(14)}" class="deel-lbl">6. Badpak</text>
  <text x="${opx+6}" y="${ay+rl+px(26)}" class="info-lbl">knip 2× (gespiegeld)</text>
  <text x="${opx+6}" y="${ay+rl+px(38)}" class="info-lbl">alternatief voor bikini</text>

  <!-- SCHOUDERBANDJE -->
  <rect x="${opx}" y="${ay+rl+bl+px(28)}" width="${px(3)}" height="${px(40)}" class="naad-lijn"/>
  <text x="${opx+px(6)}" y="${ay+rl+bl+px(40)}" class="deel-lbl">7. Schouderband</text>
  <text x="${opx+px(6)}" y="${ay+rl+bl+px(52)}" class="info-lbl">knip 4× · 3cm breed (aanpasbaar)</text>

  ${footer(W, H)}
</svg>`;
}

// ─── Router ───────────────────────────────────────────────────────────────────
function genereerPatroon(kledingstuk, maten, pasvorm) {
  switch (kledingstuk.toLowerCase()) {
    case 'hoodie':    return hoodiePatroon(maten);
    case 'shirt':     return shirtPatroon(maten, 'Shirtpatroon');
    case 'blouse':    return shirtPatroon(maten, 'Blousepatroon');
    case 'broek':     return broekPatroon(maten);
    case 'jasje':     return jasjePatroon(maten);
    case 'tracksuit': return tracksuitPatroon(maten);
    case 'badmode':   return badmodePatroon(maten);
    default:          return hoodiePatroon(maten);
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const origin = req.headers.origin || '';
  const corsOrigin = TOEGESTANE_ORIGINS.includes(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'DoubleYou Patroon Server', version: '4.0.0' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/patroon') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { kledingstuk='hoodie', lengte, borst, taille, heup, been, pasvorm='Regular' } = JSON.parse(body);
        const L = parseFloat(lengte), B = parseFloat(borst);
        if (!L || L < 185) throw new Error('Lengte minimaal 185 cm (DoubleYou is voor 1.85m+)');
        if (!B || B < 106) throw new Error('Borstmaat minimaal 106 cm (DoubleYou is XL t/m 5XL)');
        const maten = berekenMaten(L, B, parseFloat(taille)||null, parseFloat(heup)||null, parseFloat(been)||null, pasvorm);
        const svg = genereerPatroon(kledingstuk, maten, pasvorm);
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(svg);
      } catch(e) {
        console.error('Fout:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error: 'Niet gevonden' }));
});

server.listen(PORT, () => console.log(`DoubleYou Patroon Server v4.0 draait op poort ${PORT}`));
