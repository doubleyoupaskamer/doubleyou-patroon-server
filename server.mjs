import { createServer } from 'http';
import { Titan } from '@freesewing/titan';
import { Aaron } from '@freesewing/aaron';
import { pluginTheme } from '@freesewing/plugin-theme';

const PORT = process.env.PORT || 3001;
const TOEGESTANE_ORIGINS = [
  'https://paskamer-praat.pages.dev',
  'http://localhost:3000',
  'http://localhost:8080',
];

// ── MATEN BEREKENING ──────────────────────────────────────────────
function berekenMaten(L, B, T, H, been) {
  return {
    // Broek (Titan)
    crossSeam:       Math.round(H * 10 * 0.57),
    crossSeamFront:  Math.round(H * 10 * 0.28),
    knee:            Math.round(B * 10 * 0.38),
    seat:            Math.round(H * 10),
    seatBack:        Math.round(H * 10 * 0.52),
    waist:           Math.round(T * 10),
    waistBack:       Math.round(T * 10 * 0.5),
    waistToFloor:    Math.round(L * 10 * 0.62),
    waistToKnee:     Math.round(L * 10 * 0.35),
    waistToHips:     Math.round(((L - 160) * 1.8 + 18) * 10),
    waistToSeat:     Math.round(((L - 160) * 1.2 + 12) * 10),
    waistToUpperLeg: Math.round(((L - 160) * 0.9 + 9) * 10),
    // Bovenlichaam (Aaron)
    chest:           Math.round(B * 10),
    hips:            Math.round(H * 10),
    neck:            Math.round(B * 10 * 0.38),
    shoulderToShoulder: Math.round(B * 10 * 0.44),
    hpsToWaistBack:  Math.round(L * 10 * 0.26),
    shoulderSlope:   13,
    biceps:          Math.round(B * 10 * 0.34),
    wrist:           Math.round(B * 10 * 0.17),
    highBust:        Math.round(B * 10 * 0.93),
    hpsToBust:       Math.round(L * 10 * 0.15),
    waistToArmpit:   Math.round(L * 10 * 0.09),
  };
}

// ── SVG BRANDING ─────────────────────────────────────────────────
function branded(svg, label, maten, pasvorm) {
  const vb = svg.match(/viewBox="([^"]*)"/)?.[1]?.split(' ').map(Number);
  if (!vb || vb[2] === 0) throw new Error('Leeg patroon gegenereerd');
  const [,, w, h] = vb;

  const t = Math.round(maten.waist / 10);
  const hh = Math.round(maten.seat / 10);
  const l = Math.round(maten.waistToFloor / 6.2);
  const b = Math.round(maten.chest / 10);

  svg = svg.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/,
    `<style type="text/css"><![CDATA[
      svg.freesewing path.fabric { stroke: #1a1a2e !important; stroke-width: 2 !important; fill: rgba(210,225,255,0.25) !important; }
      svg.freesewing path.fabric.sa { stroke: #c67d06 !important; stroke-width: 1 !important; stroke-dasharray: 6,3 !important; fill: rgba(198,125,6,0.06) !important; }
      svg.freesewing path.mark { stroke: #e74c3c !important; stroke-width: 1.2 !important; fill: none !important; }
      svg.freesewing path.note { stroke: #2980b9 !important; stroke-width: 0.8 !important; fill: none !important; }
      svg.freesewing path.gridline, svg.freesewing path.grid { stroke: #ececec !important; stroke-width: 0.3 !important; }
      svg.freesewing text { font-family: Arial, sans-serif !important; fill: #1a1a2e !important; }
    ]]></style>`
  );

  svg = svg.replace(
    /<svg([^>]*)>/,
    `<svg$1>
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <rect x="0" y="0" width="${w}" height="82" fill="#1a1a2e"/>
  <text x="${w/2}" y="24" font-family="Georgia,serif" font-size="14" fill="#fcf8ef" text-anchor="middle" letter-spacing="3">DOUBLEYOU \u2014 ATELIER PATROON</text>
  <line x1="20" y1="31" x2="${w-20}" y2="31" stroke="#c67d06" stroke-width="0.5"/>
  <text x="${w/2}" y="46" font-family="Arial,sans-serif" font-size="8" fill="#c67d06" text-anchor="middle" letter-spacing="2">${label.toUpperCase()} \u00b7 TALL (1.85M+) \u00b7 XL T/M 5XL</text>
  <text x="${w/2}" y="60" font-family="Arial,sans-serif" font-size="6.5" fill="rgba(252,248,239,0.65)" text-anchor="middle">Lengte ${l}cm \u00b7 Borst ${b}cm \u00b7 Taille ${t}cm \u00b7 Heup ${hh}cm \u00b7 Naadtoeslag 1cm inbegrepen</text>
  <text x="${w/2}" y="73" font-family="Arial,sans-serif" font-size="5.5" fill="rgba(252,248,239,0.3)" text-anchor="middle">FreeSewing \u00b7 Pasvorm: ${pasvorm || 'Regular'} \u00b7 Afdrukken op A0 \u00b7 paskamer-praat.pages.dev</text>
  <g transform="translate(0,82)">`
  );

  svg = svg.replace(
    '</svg>',
    `</g>
  <rect x="0" y="${h - 24}" width="${w}" height="24" fill="#f8f8f8"/>
  <line x1="0" y1="${h - 24}" x2="${w}" y2="${h - 24}" stroke="#e0e0e0" stroke-width="0.5"/>
  <g transform="translate(16,${h - 10})">
    <line x1="0" y1="0" x2="18" y2="0" stroke="#1a1a2e" stroke-width="2"/>
    <text x="23" y="4" font-size="6.5" fill="#555" font-family="Arial">Stofpatroon</text>
    <line x1="110" y1="0" x2="128" y2="0" stroke="#c67d06" stroke-width="1" stroke-dasharray="5,3"/>
    <text x="133" y="4" font-size="6.5" fill="#555" font-family="Arial">Naadtoeslag 1cm</text>
    <line x1="235" y1="0" x2="247" y2="0" stroke="#e74c3c" stroke-width="1.5"/>
    <text x="252" y="4" font-size="6.5" fill="#555" font-family="Arial">Inkeping</text>
    <line x1="315" y1="0" x2="333" y2="0" stroke="#1a1a2e" stroke-width="0.8"/>
    <text x="338" y="4" font-size="6.5" fill="#555" font-family="Arial">Draadrichting</text>
    <text x="${w - 32}" y="4" font-size="6" fill="#c67d06" font-family="Arial" text-anchor="end">paskamer-praat.pages.dev</text>
  </g>
</svg>`
  );

  return svg;
}

// ── PATROON GENEREREN ─────────────────────────────────────────────
function genereerPatroon(kledingstuk, maten, pasvorm) {
  const isBroek = kledingstuk === 'broek' || kledingstuk === 'tracksuit';
  const Design  = isBroek ? Titan : Aaron;

  const opties = { measurements: maten, sa: 10, paperless: true };
  const p = new Design(opties).use(pluginTheme);
  p.draft();
  const svg = p.render();

  const labels = {
    hoodie: 'Hoodie', shirt: 'Shirt', broek: 'Broek',
    jasje: 'Jasje', tracksuit: 'Broek (Tracksuit)',
    blouse: 'Blouse', badmode: 'Badmode',
  };

  return branded(svg, labels[kledingstuk] || kledingstuk, maten, pasvorm);
}

// ── HTTP SERVER ───────────────────────────────────────────────────
const server = createServer((req, res) => {
  const origin = req.headers.origin || '';
  const corsOrigin = TOEGESTANE_ORIGINS.includes(origin) ? origin : TOEGESTANE_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'DoubleYou Patroon Server', version: '1.0.0' }));
    return;
  }

  // Patroon genereren
  if (req.method === 'POST' && req.url === '/patroon') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const {
          kledingstuk = 'broek',
          lengte, borst, taille, heup, been,
          pasvorm = 'Regular',
        } = data;

        // Validatie
        const L = parseFloat(lengte);
        const B = parseFloat(borst);
        const T = parseFloat(taille) || B * 0.85;
        const H = parseFloat(heup)   || B * 1.05;
        const E = parseFloat(been)   || (L - 85);

        if (!L || L < 185) throw new Error('Lengte minimaal 185 cm (DoubleYou is voor 1.85m+)');
        if (!B || B < 106) throw new Error('Borstmaat minimaal 106 cm (DoubleYou is XL t/m 5XL)');

        const maten = berekenMaten(L, B, T, H, E);
        const svg   = genereerPatroon(kledingstuk, maten, pasvorm);

        res.writeHead(200, {
          'Content-Type':  'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(svg, 'utf8'),
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
