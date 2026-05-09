import { createServer } from 'node:http';

const PORT = process.env.PORT || 3000;

const TOEGESTANE_ORIGINS = [
  'https://doubleyoufashion.nl',
  'https://doubleyousmallandtall.nl',
  'https://kvizz0-g.myshopify.com',
  'http://localhost:3000',
];

// ─── Maatberekening ───────────────────────────────────────────────────────────

function berekenMaten(lengte, borst, taille, heup, been) {
  const schaal = lengte / 185;
  return {
    lengte,
    borst,
    taille: taille || borst * 0.85,
    heup:   heup   || borst * 1.05,
    been:   been   || (lengte - 85),
    schouder: (borst / 5.2) * schaal,
    mouwlengte: (65 * schaal),
    kruisdiepte: (28 + (borst - 106) * 0.08) * schaal,
    pijpbreedte: (26 + (heup || borst * 1.05) * 0.12),
    rugbreedte: borst * 0.38,
  };
}

// ─── SVG Patroon generatoren ──────────────────────────────────────────────────

function broekPatroon(m, pasvorm) {
  const schaal = pasvorm === 'Slim' ? 0.96 : pasvorm === 'Relaxed' ? 1.06 : 1.0;
  const W = 500, H = 700;
  const tw = (m.taille / 4) * schaal;
  const hw = (m.heup / 4) * schaal;
  const kd = m.kruisdiepte;
  const bl = m.been;
  const pw = m.pijpbreedte * schaal;

  // Schaal naar SVG canvas (pixels per cm ≈ 3.5)
  const px = v => v * 3.5;
  const marginL = 40;

  const voorpand = `
    M ${marginL} 20
    L ${marginL + px(tw)} 20
    Q ${marginL + px(tw) + 10} ${px(kd) / 2} ${marginL + px(hw)} ${px(kd)}
    L ${marginL + px(hw) - px(pw) / 2 + px(pw)} ${px(bl)}
    L ${marginL + px(pw) / 2} ${px(bl)}
    L ${marginL} ${px(kd)}
    Q ${marginL - 8} ${px(kd) / 2} ${marginL} 20
    Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <style>
      text { font-family: sans-serif; font-size: 12px; fill: #1e1a0f; }
      .titel { font-size: 16px; font-weight: bold; fill: #c67d06; }
      .lijn { stroke: #1e1a0f; stroke-width: 1.5; fill: none; }
      .hulplijn { stroke: #aaa; stroke-width: 0.8; stroke-dasharray: 4,3; fill: none; }
      .maat { stroke: #c67d06; stroke-width: 1; fill: none; }
      .bg { fill: #fcf8ef; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" class="bg"/>

  <!-- Titel -->
  <text x="20" y="30" class="titel">DoubleYou Broekpatroon — ${pasvorm}</text>
  <text x="20" y="48">Lengte ${m.lengte}cm · Borst ${m.borst}cm · Heup ${Math.round(m.heup)}cm · Been ${Math.round(m.been)}cm</text>

  <!-- Voorpand -->
  <path d="${voorpand}" class="lijn"/>
  <text x="${marginL + px(tw) / 2 - 20}" y="${px(kd) / 2 + 20}">Voorpand</text>

  <!-- Hulplijnen -->
  <line x1="${marginL}" y1="${px(kd)}" x2="${marginL + px(hw)}" y2="${px(kd)}" class="hulplijn"/>
  <text x="${marginL + px(hw) + 5}" y="${px(kd) + 4}">Heuplijn</text>

  <line x1="${marginL}" y1="20" x2="${marginL + px(tw)}" y2="20" class="hulplijn"/>
  <text x="${marginL + px(tw) + 5}" y="24">Taillijn</text>

  <!-- Maataanduidingen -->
  <line x1="${W - 60}" y1="60" x2="${W - 60}" y2="${px(bl) + 60}" class="maat" marker-start="url(#pijl)" marker-end="url(#pijl)"/>
  <text x="${W - 55}" y="${(px(bl) + 60) / 2 + 50}" transform="rotate(-90,${W - 55},${(px(bl) + 60) / 2 + 50})">Beenlengte ${Math.round(m.been)}cm</text>

  <!-- Logo / merk -->
  <text x="${W - 20}" y="${H - 10}" text-anchor="end" style="font-size:10px;fill:#c67d06;">doubleyoufashion.nl</text>
  <text x="20" y="${H - 10}" style="font-size:10px;fill:#888;">Patroon gegenereerd op maat — niet voor commercieel gebruik</text>
</svg>`;
}

function shirtPatroon(m, pasvorm) {
  const schaal = pasvorm === 'Slim' ? 0.96 : pasvorm === 'Relaxed' ? 1.06 : 1.0;
  const W = 500, H = 650;
  const bw = (m.borst / 4) * schaal;
  const sw = (m.schouder) * schaal;
  const ml = m.mouwlengte;
  const px = v => v * 3.5;
  const marginL = 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <style>
      text { font-family: sans-serif; font-size: 12px; fill: #1e1a0f; }
      .titel { font-size: 16px; font-weight: bold; fill: #c67d06; }
      .lijn { stroke: #1e1a0f; stroke-width: 1.5; fill: none; }
      .hulplijn { stroke: #aaa; stroke-width: 0.8; stroke-dasharray: 4,3; fill: none; }
      .bg { fill: #fcf8ef; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" class="bg"/>

  <text x="20" y="30" class="titel">DoubleYou Shirtpatroon — ${pasvorm}</text>
  <text x="20" y="48">Lengte ${m.lengte}cm · Borst ${m.borst}cm · Schouder ${Math.round(m.schouder)}cm</text>

  <!-- Achterpand silhouet -->
  <path d="
    M ${marginL + px(bw) / 2 - px(sw) / 2} 60
    L ${marginL} 60
    L ${marginL} ${px(70)}
    L ${marginL + px(bw)} ${px(70)}
    L ${marginL + px(bw)} 60
    L ${marginL + px(bw) / 2 + px(sw) / 2} 60
    Q ${marginL + px(bw) / 2} 20 ${marginL + px(bw) / 2 - px(sw) / 2} 60
    Z" class="lijn"/>
  <text x="${marginL + px(bw) / 2 - 25}" y="${px(35)}">Achterpand</text>

  <!-- Mouw -->
  <path d="
    M ${marginL + 20} ${px(80)}
    L ${marginL + px(ml)} ${px(80)}
    L ${marginL + px(ml)} ${px(95)}
    L ${marginL + 20} ${px(95)}
    Z" class="lijn"/>
  <text x="${marginL + px(ml) / 2 - 15}" y="${px(89)}">Mouw ${Math.round(ml)}cm</text>

  <text x="${W - 20}" y="${H - 10}" text-anchor="end" style="font-size:10px;fill:#c67d06;">doubleyoufashion.nl</text>
  <text x="20" y="${H - 10}" style="font-size:10px;fill:#888;">Patroon gegenereerd op maat — niet voor commercieel gebruik</text>
</svg>`;
}

function genereerPatroon(kledingstuk, maten, pasvorm) {
  switch (kledingstuk.toLowerCase()) {
    case 'broek':
    case 'tracksuit':
      return broekPatroon(maten, pasvorm);
    case 'shirt':
    case 'blouse':
    case 'hoodie':
    case 'jasje':
      return shirtPatroon(maten, pasvorm);
    default:
      return broekPatroon(maten, pasvorm);
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const origin = req.headers.origin || '';
  const corsOrigin = TOEGESTANE_ORIGINS.includes(origin)
    ? origin
    : TOEGESTANE_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'DoubleYou Patroon Server', version: '2.0.0' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/patroon') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { kledingstuk = 'broek', lengte, borst, taille, heup, been, pasvorm = 'Regular' } = data;

        const L = parseFloat(lengte);
        const B = parseFloat(borst);
        const T = parseFloat(taille) || null;
        const H = parseFloat(heup)   || null;
        const E = parseFloat(been)   || null;

        if (!L || L < 185) throw new Error('Lengte minimaal 185 cm (DoubleYou is voor 1.85m+)');
        if (!B || B < 106) throw new Error('Borstmaat minimaal 106 cm (DoubleYou is XL t/m 5XL)');

        const maten = berekenMaten(L, B, T, H, E);
        const svg   = genereerPatroon(kledingstuk, maten, pasvorm);

        res.writeHead(200, {
          'Content-Type':  'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(svg);

      } catch (e) {
        console.error('Fout:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Niet gevonden' }));
});

server.listen(PORT, () => {
  console.log(`DoubleYou Patroon Server draait op poort ${PORT}`);
});
