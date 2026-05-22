import { createServer } from 'node:http';
import { spawn }        from 'node:child_process';
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'node:fs';
import { tmpdir }       from 'node:os';
import { join }         from 'node:path';
import { randomUUID }   from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';

const PORT = process.env.PORT || 3000;

const TOEGESTANE_ORIGINS = [
  'https://doubleyoufashion.nl',
  'https://doubleyousmallandtall.nl',
  'https://kvizz0-g.myshopify.com',
  'https://paskamer-praat.pages.dev',
  'https://paskamerpraat.nl',
  'http://localhost:3000',
];

// ─── Multipart parser ─────────────────────────────────────────────────────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const match = ct.match(/boundary=(.+)$/);
    if (!match) return reject(new Error('Geen boundary in Content-Type'));
    const boundary = match[1].trim();
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const sep = Buffer.from('\r\n--' + boundary);
      const parts = [];
      let pos = buf.indexOf('--' + boundary);
      while (pos !== -1) {
        const next = buf.indexOf(sep, pos + 1);
        const chunk = next === -1 ? buf.slice(pos) : buf.slice(pos, next);
        const headerEnd = chunk.indexOf('\r\n\r\n');
        if (headerEnd === -1) { pos = next; continue; }
        const headerStr = chunk.slice(0, headerEnd).toString();
        const body = chunk.slice(headerEnd + 4);
        const data = body.slice(-2).equals(Buffer.from('\r\n')) ? body.slice(0, -2) : body;
        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const fileMatch = headerStr.match(/filename="([^"]+)"/);
        if (nameMatch) parts.push({ name: nameMatch[1], filename: fileMatch ? fileMatch[1] : null, data });
        pos = next;
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

// ─── FFmpeg transcoding: HEVC/MOV → H.264 MP4 ────────────────────────────────
function transcodeToH264(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-maxrate', '4M', '-bufsize', '8M',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-f', 'mp4', outputPath
    ];
    const ff = spawn(ffmpegPath, args);
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error('FFmpeg fout (code ' + code + '): ' + stderr.slice(-300)));
    });
    ff.on('error', reject);
  });
}

// ─── EASE tabellen (Winifred Aldrich, Metric Pattern Cutting) ────────────────
const EASE = {
  'Slim':      { b: 4,  t: 2,  h: 3  },
  'Regular':   { b: 8,  t: 4,  h: 6  },
  'Relaxed':   { b: 14, t: 8,  h: 10 },
  'Plus Size': { b: 18, t: 10, h: 14 },
};

function berekenMaten(lengte, borstRaw, tailleRaw, heupRaw, been, pasvorm) {
  const e   = EASE[pasvorm] || EASE['Regular'];
  const B   = borstRaw + e.b;
  const T   = (tailleRaw || borstRaw * 0.85) + e.t;
  const H   = (heupRaw   || borstRaw * 1.05) + e.h;
  const bl  = been || (lengte - 85);
  const sc  = lengte / 185;
  return {
    lengte, borstRaw, pasvorm,
    borst:B, taille:T, heup:H, been:bl,
    schouderbreedte: B/5.2, armscyeDiepte: B/8+3,
    ruglengte: lengte*0.245, hoodielengte: lengte*0.42,
    jasjelengte: lengte*0.52, shirtlengte: lengte*0.40,
    mouwlengte: lengte*0.34, mouwbreedte: B/8+5,
    kruisdiepteVoor: H/4+3, kruisdiepteRug: H/4+7,
    heupBreedte: H/4, tailleBreedte: T/4,
    taillering: (H-T)/4, pijpbreedte: H/8+4,
    kniebreedte: H/8+6,
    capuchonHoogte: 34*sc, capuchonBreedte: 22*sc,
  };
}

const px = v => Math.round(v * 3.78);

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

function defs(W,H){const gH=[],gV=[];for(let x=0;x<W;x+=px(5))gV.push(`M${x} 0 L${x} ${H}`);for(let y=0;y<H;y+=px(5))gH.push(`M0 ${y} L${W} ${y}`);return `<defs><style>${CSS}</style><marker id="pijl" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#1e1a0f"/></marker><marker id="pijlR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse"><path d="M0,0 L0,6 L6,3 z" fill="#888"/></marker></defs><rect width="${W}" height="${H}" class="bg"/><path d="${[...gV,...gH].join(' ')}" class="grid"/>`;}

function header(W,titel,sub1,sub2){return `<rect x="0" y="0" width="${W}" height="56" fill="#1e1a0f"/><text x="18" y="22" class="titel-h">${titel}</text><text x="18" y="38" class="header-txt" fill="#fcf8ef">${sub1}</text><text x="18" y="52" class="header-txt" fill="rgba(252,248,239,0.55)" font-size="9">${sub2}</text><text x="${W-14}" y="38" text-anchor="end" class="merk-txt" fill="#c67d06">doubleyoufashion.nl</text>`;}

function footer(W,H){return `<text x="${W/2}" y="${H-6}" text-anchor="middle" class="disc-txt">Technisch patroon op maat — maak altijd een toile voor het definitieve stuk · Naadtoeslag inbegrepen · Schaal 1:5</text>`;}

function deelKader(x,y,w,h,nr,naam,knip,extra=''){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="kader" rx="2"/><text x="${x+8}" y="${y+16}" class="deel-lbl">${nr}. ${naam}</text><text x="${x+8}" y="${y+28}" class="info-lbl">${knip}</text>${extra}`;}

function grainLine(x1,y1,x2,y2){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="grain"/><text x="${(x1+x2)/2+4}" y="${(y1+y2)/2}" class="info-lbl" transform="rotate(-90,${(x1+x2)/2+4},${(y1+y2)/2})">draadrichting</text>`;}

function kerf(x,y,hoek=0){const len=6,rad=hoek*Math.PI/180;return `<line x1="${x}" y1="${y}" x2="${x+len*Math.sin(rad)}" y2="${y-len*Math.cos(rad)}" class="kerf"/>`;}

function maatLijn(x1,y1,x2,y2,label,offset=12){const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy),nx=-dy/len*offset,ny=dx/len*offset;return `<line x1="${x1+nx}" y1="${y1+ny}" x2="${x2+nx}" y2="${y2+ny}" class="maat-lijn" marker-start="url(#pijlR)" marker-end="url(#pijlR)"/><text x="${(x1+x2)/2+nx+2}" y="${(y1+y2)/2+ny}" class="maat-txt">${label}</text>`;}

function naadlijn(path){return `<path d="${path}" class="naad-stip"/>`;}

// ─── Patroon functies (volledig, alle types) ──────────────────────────────────
// HOODIE
function hoodiePatroon(m){const W=1400,H=980,NAAD=px(1),bw=px(m.borst/4),rl=px(m.hoodielengte),ml=px(m.mouwlengte),sd=px(m.armscyeDiepte),sw=px(m.schouderbreedte),mw=px(m.mouwbreedte),ch=px(m.capuchonHoogte),cw=px(m.capuchonBreedte),MARG=30,ax=MARG,ay=80,mkh=sd/3;const aPath=`M${ax+bw/2} ${ay} Q${ax+bw/2-10} ${ay-px(3)} ${ax} ${ay+px(2)} L${ax+sw} ${ay+px(2)} Q${ax+sw+px(3)} ${ay+sd/2} ${ax+bw} ${ay+sd} L${ax+bw} ${ay+rl} L${ax} ${ay+rl} L${ax} ${ay+px(2)} Q${ax} ${ay} ${ax+bw/2} ${ay} Z`;const vx=ax+bw+50,vy=ay,vPath=`M${vx} ${vy+px(2)} L${vx+sw} ${vy+px(2)} Q${vx+sw+px(3)} ${vy+sd/2} ${vx+bw} ${vy+sd} L${vx+bw} ${vy+rl} L${vx+bw/2} ${vy+rl} L${vx+bw/2} ${vy+px(28)} Q${vx+px(8)} ${vy+px(15)} ${vx} ${vy+px(6)} L${vx} ${vy+px(2)} Z`;const mx=vx+bw+50,myStart=ay,mPath=`M${mx+mw/2} ${myStart} Q${mx+mw*0.8} ${myStart+mkh*0.3} ${mx+mw} ${myStart+mkh} Q${mx+mw+px(2)} ${myStart+mkh*1.8} ${mx+mw-px(4)} ${myStart+sd} L${mx+mw} ${myStart+ml} L${mx+px(6)} ${myStart+ml} L${mx} ${myStart+sd} Q${mx-px(2)} ${myStart+mkh*1.8} ${mx+px(4)} ${myStart+mkh} Q${mx+mw*0.2} ${myStart+mkh*0.3} ${mx+mw/2} ${myStart} Z`;const hx=mx+mw+60,hyStart=ay,hPath=`M${hx} ${hyStart+ch} L${hx} ${hyStart+px(6)} Q${hx+cw*0.3} ${hyStart} ${hx+cw} ${hyStart} Q${hx+cw*1.4} ${hyStart+ch*0.4} ${hx+cw*1.3} ${hyStart+ch} Z`;const rx=MARG,ry=ay+rl+30;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — Hoodiepatroon (${m.pasvorm})`,`Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Taille ${Math.round(m.taille-(EASE[m.pasvorm]||EASE.Regular).t)}cm`,`Mouwlengte ${Math.round(m.mouwlengte)}cm · Naadtoeslag 1cm · ${m.pasvorm} pasvorm`)}<path d="${aPath}" class="naad-lijn"/><path d="M${ax+NAAD} ${ay+NAAD} L${ax+sw-NAAD} ${ay+px(2)+NAAD} Q${ax+sw+px(2)} ${ay+sd/2} ${ax+bw-NAAD} ${ay+sd+NAAD} L${ax+bw-NAAD} ${ay+rl-NAAD} L${ax+NAAD} ${ay+rl-NAAD} Z" class="naad-stip"/><line x1="${ax}" y1="${ay+px(m.ruglengte)}" x2="${ax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/>${grainLine(ax+bw/2-6,ay+px(15),ax+bw/2-6,ay+rl-px(10))}${kerf(ax+bw,ay+sd,90)}${kerf(ax+sw,ay+px(2),45)}${maatLijn(ax+bw,ay,ax+bw,ay+rl,`${Math.round(m.hoodielengte)}cm`,18)}${maatLijn(ax,ay+rl+8,ax+bw,ay+rl+8,`${Math.round(m.borst/4)}cm`,12)}<text x="${ax+bw/2-20}" y="${ay+sd+px(8)}" class="deel-lbl">1. Achterpand</text><text x="${ax+bw/2-18}" y="${ay+sd+px(20)}" class="info-lbl">knip 1× op vouw</text><path d="${vPath}" class="naad-lijn"/>${grainLine(vx+bw/2+12,vy+px(15),vx+bw/2+12,vy+rl-px(10))}<text x="${vx+8}" y="${vy+sd+px(8)}" class="deel-lbl">2. Voorpand</text><text x="${vx+8}" y="${vy+sd+px(20)}" class="info-lbl">knip 2× (gespiegeld)</text><path d="${mPath}" class="naad-lijn"/>${grainLine(mx+mw/2-6,myStart+mkh+px(4),mx+mw/2-6,myStart+ml-px(8))}${kerf(mx+mw/2,myStart,0)}${kerf(mx+mw,myStart+mkh,90)}${kerf(mx,myStart+mkh,270)}${maatLijn(mx+mw,myStart,mx+mw,myStart+ml,`${Math.round(m.mouwlengte)}cm`,18)}<text x="${mx+mw/2-18}" y="${myStart+sd+px(8)}" class="deel-lbl">3. Mouw</text><text x="${mx+mw/2-14}" y="${myStart+sd+px(20)}" class="info-lbl">knip 2×</text><path d="${hPath}" class="naad-lijn"/>${grainLine(hx+cw*0.7,hyStart+px(8),hx+cw*0.7,hyStart+ch-px(8))}${maatLijn(hx,hyStart,hx,hyStart+ch,`${Math.round(m.capuchonHoogte)}cm`,-18)}<text x="${hx+cw*0.35}" y="${hyStart+ch/2}" class="deel-lbl">4. Capuchon</text><rect x="${rx}" y="${ry}" width="220" height="60" class="naad-lijn"/><text x="${rx+8}" y="${ry+16}" class="deel-lbl">5. Tailleband</text><text x="${rx+8}" y="${ry+29}" class="info-lbl">${Math.round(m.taille/2+2)}cm × 8cm</text><rect x="${rx+240}" y="${ry}" width="200" height="60" class="naad-lijn"/><text x="${rx+248}" y="${ry+16}" class="deel-lbl">6. Manchet</text><text x="${rx+248}" y="${ry+29}" class="info-lbl">9cm × 8cm</text><rect x="${rx+460}" y="${ry}" width="200" height="60" class="naad-lijn"/><text x="${rx+468}" y="${ry+16}" class="deel-lbl">7. Halsboordje</text>${footer(W,H)}</svg>`;}

// SHIRT/BLOUSE
function shirtPatroon(m,naamLabel){const W=1200,H=900,NAAD=px(1),bw=px(m.borst/4),rl=px(m.shirtlengte),ml=px(m.mouwlengte),sd=px(m.armscyeDiepte),sw=px(m.schouderbreedte),mw=px(m.mouwbreedte),mkh=sd/3,MARG=30,ay=80,ax=MARG;const aPath=`M${ax+bw/2} ${ay} Q${ax+bw/2-8} ${ay-px(3)} ${ax} ${ay+px(2)} L${ax+sw} ${ay+px(2)} Q${ax+sw+px(3)} ${ay+sd/2} ${ax+bw} ${ay+sd} L${ax+bw} ${ay+rl} L${ax} ${ay+rl} L${ax} ${ay+px(2)} Q${ax} ${ay} ${ax+bw/2} ${ay} Z`;const vx=ax+bw+50,vPath=`M${vx} ${ay+px(2)} L${vx+sw} ${ay+px(2)} Q${vx+sw+px(3)} ${ay+sd/2} ${vx+bw} ${ay+sd} L${vx+bw} ${ay+rl} L${vx} ${ay+rl} L${vx} ${ay+px(2)} Z`,vHals=`M${vx} ${ay+px(2)} Q${vx+px(4)} ${ay+px(20)} ${vx+bw/2} ${ay+px(22)}`;const mx=vx+bw+50,mPath=`M${mx+mw/2} ${ay} Q${mx+mw*0.85} ${ay+mkh*0.3} ${mx+mw} ${ay+mkh} Q${mx+mw+px(2)} ${ay+mkh*1.8} ${mx+mw-px(4)} ${ay+sd} L${mx+mw} ${ay+ml} L${mx+px(6)} ${ay+ml} L${mx} ${ay+sd} Q${mx-px(2)} ${ay+mkh*1.8} ${mx+px(4)} ${ay+mkh} Q${mx+mw*0.15} ${ay+mkh*0.3} ${mx+mw/2} ${ay} Z`;const rx=MARG,ry=ay+rl+30;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — ${naamLabel} (${m.pasvorm})`,`Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Mouw ${Math.round(m.mouwlengte)}cm`,`Naadtoeslag 1cm · ${m.pasvorm} pasvorm`)}<path d="${aPath}" class="naad-lijn"/>${grainLine(ax+bw/2-6,ay+px(12),ax+bw/2-6,ay+rl-px(10))}${maatLijn(ax+bw+6,ay,ax+bw+6,ay+rl,`${Math.round(m.shirtlengte)}cm`,14)}<text x="${ax+8}" y="${ay+sd+px(10)}" class="deel-lbl">1. Achterpand</text><path d="${vPath}" class="naad-lijn"/><path d="${vHals}" class="naad-lijn" stroke="#c67d06" stroke-width="1.2"/>${grainLine(vx+bw/2-6,ay+px(12),vx+bw/2-6,ay+rl-px(10))}<text x="${vx+8}" y="${ay+sd+px(10)}" class="deel-lbl">2. Voorpand</text><path d="${mPath}" class="naad-lijn"/>${grainLine(mx+mw/2-6,ay+mkh+px(4),mx+mw/2-6,ay+ml-px(8))}${maatLijn(mx+mw+6,ay,mx+mw+6,ay+ml,`${Math.round(m.mouwlengte)}cm`,14)}<text x="${mx+mw/2-18}" y="${ay+sd+px(10)}" class="deel-lbl">3. Mouw</text><rect x="${rx}" y="${ry}" width="${px(m.borst/2+4)}" height="${px(5)}" class="naad-lijn"/><text x="${rx+8}" y="${ry+13}" class="deel-lbl">4. Halsboordje</text><text x="${rx+8}" y="${ry+24}" class="info-lbl">${Math.round(m.borst/2+4)}cm × 5cm</text>${footer(W,H)}</svg>`;}

// BROEK
function broekPatroon(m){const W=1100,H=980,NAAD=px(1),tw=px(m.tailleBreedte),hw=px(m.heupBreedte),kdV=px(m.kruisdiepteVoor),kdR=px(m.kruisdiepteRug),bl=px(m.been),pw=px(m.pijpbreedte),kw=px(m.kniebreedte),MARG=30,ay=80,vx=MARG;const vPath=`M${vx} ${ay} L${vx+tw} ${ay} Q${vx+tw+px(2)} ${ay+kdV*0.4} ${vx+hw+px(3)} ${ay+kdV} L${vx+hw} ${ay+kdV+bl} L${vx+hw-pw} ${ay+kdV+bl} L${vx+hw-kw} ${ay+kdV+bl*0.45} L${vx} ${ay+kdV} Q${vx-px(2)} ${ay+kdV*0.4} ${vx} ${ay} Z`;const rx=vx+hw+60,rPath=`M${rx-px(2)} ${ay} L${rx+tw+px(8)} ${ay} Q${rx+tw+px(12)} ${ay+kdR*0.3} ${rx+hw+px(12)} ${ay+kdR} L${rx+hw+px(8)} ${ay+kdR+bl} L${rx+hw+px(8)-pw} ${ay+kdR+bl} L${rx+hw+px(8)-kw} ${ay+kdR+bl*0.45} L${rx-px(10)} ${ay+kdR} Q${rx-px(14)} ${ay+kdR*0.35} ${rx-px(2)} ${ay} Z`;const tby=ay+Math.max(kdV,kdR)+bl+40;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — Broekpatroon (${m.pasvorm})`,`Lengte ${m.lengte}cm · Taille ${Math.round(m.taille-(EASE[m.pasvorm]||EASE.Regular).t)}cm · Heup ${Math.round(m.heup-(EASE[m.pasvorm]||EASE.Regular).h)}cm`,`Kruisdiepte voor ${Math.round(m.kruisdiepteVoor)}cm · rug ${Math.round(m.kruisdiepteRug)}cm · Naadtoeslag 1cm`)}<line x1="${vx}" y1="${ay+kdV}" x2="${vx+hw+px(6)}" y2="${ay+kdV}" class="hulplijn"/><line x1="${rx-px(14)}" y1="${ay+kdR}" x2="${rx+hw+px(14)}" y2="${ay+kdR}" class="hulplijn"/><path d="${vPath}" class="naad-lijn"/>${grainLine(vx+hw/2-6,ay+kdV+px(8),vx+hw/2-6,ay+kdV+bl-px(8))}${maatLijn(vx+hw+8,ay,vx+hw+8,ay+kdV+bl,`${Math.round(m.kruisdiepteVoor+m.been)}cm`,14)}${maatLijn(vx,ay-10,vx+tw,ay-10,`${Math.round(m.tailleBreedte)}cm`,-12)}<text x="${vx+8}" y="${ay+kdV+px(10)}" class="deel-lbl">1. Voorpand</text><text x="${vx+8}" y="${ay+kdV+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text><path d="${rPath}" class="naad-lijn"/>${grainLine(rx+hw/2,ay+kdR+px(8),rx+hw/2,ay+kdR+bl-px(8))}${maatLijn(rx+hw+px(20),ay,rx+hw+px(20),ay+kdR+bl,`${Math.round(m.kruisdiepteRug+m.been)}cm`,14)}<text x="${rx+8}" y="${ay+kdR+px(10)}" class="deel-lbl">2. Rugpand</text><text x="${rx+8}" y="${ay+kdR+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text><rect x="${MARG}" y="${tby}" width="260" height="68" class="naad-lijn"/><text x="${MARG+8}" y="${tby+16}" class="deel-lbl">3. Tailleband</text><text x="${MARG+8}" y="${tby+30}" class="info-lbl">${Math.round((m.taille-(EASE[m.pasvorm]||EASE.Regular).t)/2+2)}cm × 5cm</text>${footer(W,H)}</svg>`;}

// JASJE
function jasjePatroon(m){const W=1400,H=1020,NAAD=px(1.5),bw=px(m.borst/4),rl=px(m.jasjelengte),ml=px(m.mouwlengte),sd=px(m.armscyeDiepte+2),sw=px(m.schouderbreedte+1),mw=px(m.mouwbreedte+2),mkh=sd*0.38,MARG=30,ay=80,ax=MARG;const aPath=`M${ax+bw/2} ${ay} Q${ax+bw/2-px(2)} ${ay-px(4)} ${ax} ${ay+px(3)} L${ax+sw} ${ay+px(3)} Q${ax+sw+px(4)} ${ay+sd/2} ${ax+bw} ${ay+sd} L${ax+bw+px(4)} ${ay+rl} L${ax-px(4)} ${ay+rl} L${ax} ${ay+px(3)} Q${ax} ${ay} ${ax+bw/2} ${ay} Z`;const vx=ax+bw+60,vPath=`M${vx} ${ay+px(3)} L${vx+sw} ${ay+px(3)} Q${vx+sw+px(4)} ${ay+sd/2} ${vx+bw} ${ay+sd} L${vx+bw+px(4)} ${ay+rl} L${vx+bw/2} ${ay+rl} L${vx+bw/2} ${ay+px(55)} Q${vx+px(12)} ${ay+px(35)} ${vx} ${ay+px(20)} Z`;const mx=vx+bw+65,mPath1=`M${mx+mw*0.55} ${ay} Q${mx+mw*0.9} ${ay+mkh*0.3} ${mx+mw} ${ay+mkh} Q${mx+mw+px(3)} ${ay+mkh*1.8} ${mx+mw-px(5)} ${ay+sd} L${mx+mw+px(2)} ${ay+ml} L${mx+mw*0.55} ${ay+ml} Z`,mPath2=`M${mx+mw*0.55} ${ay} Q${mx+mw*0.2} ${ay+mkh*0.3} ${mx} ${ay+mkh} Q${mx-px(3)} ${ay+mkh*1.8} ${mx+px(5)} ${ay+sd} L${mx-px(2)} ${ay+ml} L${mx+mw*0.55} ${ay+ml} Z`;const kx=mx+mw+65,ky=ay,kraagPath=`M${kx} ${ky} Q${kx+px(6)} ${ky-px(4)} ${kx+px(16)} ${ky-px(2)} L${kx+px(22)} ${ky+px(8)} L${kx+px(18)} ${ky+px(24)} Q${kx+px(10)} ${ky+px(28)} ${kx} ${ky+px(24)} Q${kx-px(4)} ${ky+px(14)} ${kx} ${ky} Z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — Jasjepatroon (${m.pasvorm})`,`Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Jasjelengte ${Math.round(m.jasjelengte)}cm`,`Naadtoeslag 1.5cm · ${m.pasvorm} pasvorm`)}<line x1="${ax}" y1="${ay+px(m.ruglengte)}" x2="${ax+bw}" y2="${ay+px(m.ruglengte)}" class="hulplijn"/><path d="${aPath}" class="naad-lijn"/>${grainLine(ax+bw/2-8,ay+px(14),ax+bw/2-8,ay+rl-px(12))}${maatLijn(ax+bw+px(6),ay,ax+bw+px(6),ay+rl,`${Math.round(m.jasjelengte)}cm`,14)}<text x="${ax+8}" y="${ay+sd+px(12)}" class="deel-lbl">1. Achterpand</text><path d="${vPath}" class="naad-lijn"/>${grainLine(vx+bw*0.7,ay+px(14),vx+bw*0.7,ay+rl-px(12))}<text x="${vx+8}" y="${ay+sd+px(12)}" class="deel-lbl">2. Voorpand</text><text x="${vx+8}" y="${ay+sd+px(24)}" class="info-lbl">knip 2× (gespiegeld)</text><path d="${mPath1}" class="naad-lijn"/><path d="${mPath2}" class="naad-lijn"/>${grainLine(mx+mw*0.55+8,ay+mkh+px(4),mx+mw*0.55+8,ay+ml-px(8))}<text x="${mx+8}" y="${ay+sd+px(12)}" class="deel-lbl">3. Mouw (boven+onderstuk)</text><path d="${kraagPath}" class="naad-lijn"/>${grainLine(kx+px(8),ky+px(4),kx+px(14),ky+px(20))}<text x="${kx+px(2)}" y="${ky+px(34)}" class="deel-lbl">4. Kraag</text><text x="${kx+px(2)}" y="${ky+px(46)}" class="info-lbl">knip 2× + tussenvoering</text><rect x="${MARG}" y="${ay+rl+30}" width="${px(16)}" height="${px(18)}" class="naad-lijn"/><text x="${MARG+6}" y="${ay+rl+44}" class="deel-lbl">5. Zijzak</text><text x="${MARG+6}" y="${ay+rl+56}" class="info-lbl">knip 4× · 16×18cm</text>${footer(W,H)}</svg>`;}

// TRACKSUIT
function tracksuitPatroon(m){const W=1600,H=1080,bw=px(m.borst/4),rl=px(m.hoodielengte*0.85),ml=px(m.mouwlengte),sd=px(m.armscyeDiepte),sw=px(m.schouderbreedte),mw=px(m.mouwbreedte),mkh=sd/3,tw=px(m.tailleBreedte),hw=px(m.heupBreedte),kdV=px(m.kruisdiepteVoor),kdR=px(m.kruisdiepteRug),bl=px(m.been*0.85),pw=px(m.pijpbreedte+2),MARG=20,ay=80;const tax=MARG,tAPath=`M${tax+bw/2} ${ay} Q${tax+bw/2-8} ${ay-px(3)} ${tax} ${ay+px(2)} L${tax+sw} ${ay+px(2)} Q${tax+sw+px(3)} ${ay+sd/2} ${tax+bw} ${ay+sd} L${tax+bw} ${ay+rl} L${tax} ${ay+rl} L${tax} ${ay+px(2)} Q${tax} ${ay} ${tax+bw/2} ${ay} Z`;const tvx=tax+bw+45,tVPath=`M${tvx} ${ay+px(2)} L${tvx+sw} ${ay+px(2)} Q${tvx+sw+px(3)} ${ay+sd/2} ${tvx+bw} ${ay+sd} L${tvx+bw} ${ay+rl} L${tvx+bw/2} ${ay+rl} L${tvx+bw/2} ${ay+px(28)} L${tvx} ${ay+px(28)} Z`;const tmx=tvx+bw+45,tMPath=`M${tmx+mw/2} ${ay} Q${tmx+mw*0.85} ${ay+mkh*0.3} ${tmx+mw} ${ay+mkh} Q${tmx+mw+px(2)} ${ay+mkh*1.8} ${tmx+mw-px(4)} ${ay+sd} L${tmx+mw} ${ay+ml} L${tmx+px(6)} ${ay+ml} L${tmx} ${ay+sd} Q${tmx-px(2)} ${ay+mkh*1.8} ${tmx+px(4)} ${ay+mkh} Q${tmx+mw*0.15} ${ay+mkh*0.3} ${tmx+mw/2} ${ay} Z`;const bvx=tmx+mw+55,bVPath=`M${bvx} ${ay} L${bvx+tw} ${ay} Q${bvx+tw+px(2)} ${ay+kdV*0.4} ${bvx+hw+px(3)} ${ay+kdV} L${bvx+hw} ${ay+kdV+bl} L${bvx+hw-pw} ${ay+kdV+bl} L${bvx} ${ay+kdV} Q${bvx-px(2)} ${ay+kdV*0.4} ${bvx} ${ay} Z`;const brx=bvx+hw+55,bRPath=`M${brx-px(2)} ${ay} L${brx+tw+px(8)} ${ay} Q${brx+tw+px(12)} ${ay+kdR*0.3} ${brx+hw+px(12)} ${ay+kdR} L${brx+hw+px(8)} ${ay+kdR+bl} L${brx+hw+px(8)-pw} ${ay+kdR+bl} L${brx-px(10)} ${ay+kdR} Q${brx-px(14)} ${ay+kdR*0.35} ${brx-px(2)} ${ay} Z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — Tracksuitpatroon (${m.pasvorm})`,`Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Top + Broek volledig patroon`,`Naadtoeslag 1cm · ${m.pasvorm} pasvorm`)}<path d="${tAPath}" class="naad-lijn"/>${grainLine(tax+bw/2-6,ay+px(12),tax+bw/2-6,ay+rl-px(8))}<text x="${tax+6}" y="${ay+sd+px(10)}" class="deel-lbl">1. Top achterpand</text><text x="${tax+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 1× op vouw</text><path d="${tVPath}" class="naad-lijn"/>${grainLine(tvx+bw/2+10,ay+px(12),tvx+bw/2+10,ay+rl-px(8))}<text x="${tvx+6}" y="${ay+sd+px(10)}" class="deel-lbl">2. Top voorpand</text><text x="${tvx+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text><path d="${tMPath}" class="naad-lijn"/>${grainLine(tmx+mw/2-6,ay+mkh+px(4),tmx+mw/2-6,ay+ml-px(8))}<text x="${tmx+6}" y="${ay+sd+px(10)}" class="deel-lbl">3. Mouw</text><text x="${tmx+6}" y="${ay+sd+px(22)}" class="info-lbl">knip 2×</text><line x1="${bvx}" y1="${ay+kdV}" x2="${bvx+hw+px(6)}" y2="${ay+kdV}" class="hulplijn"/><path d="${bVPath}" class="naad-lijn"/>${grainLine(bvx+hw/2-6,ay+kdV+px(8),bvx+hw/2-6,ay+kdV+bl-px(8))}<text x="${bvx+6}" y="${ay+kdV+px(10)}" class="deel-lbl">4. Broek voorpand</text><text x="${bvx+6}" y="${ay+kdV+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text><line x1="${brx-px(14)}" y1="${ay+kdR}" x2="${brx+hw+px(14)}" y2="${ay+kdR}" class="hulplijn"/><path d="${bRPath}" class="naad-lijn"/>${grainLine(brx+hw/2,ay+kdR+px(8),brx+hw/2,ay+kdR+bl-px(8))}<text x="${brx+6}" y="${ay+kdR+px(10)}" class="deel-lbl">5. Broek rugpand</text><text x="${brx+6}" y="${ay+kdR+px(22)}" class="info-lbl">knip 2× (gespiegeld)</text><rect x="${MARG}" y="${ay+Math.max(rl,kdV+bl)+35}" width="260" height="72" class="naad-lijn"/><text x="${MARG+8}" y="${ay+Math.max(rl,kdV+bl)+51}" class="deel-lbl">6. Tailleband broek</text><text x="${MARG+8}" y="${ay+Math.max(rl,kdV+bl)+64}" class="info-lbl">${Math.round(m.taille/2+2)}cm × 8cm</text>${footer(W,H)}</svg>`;}

// BADMODE
function badmodePatroon(m){const W=1100,H=900,bw=px(m.borst/4*0.9),rl=px(m.ruglengte*0.55),bl=px(m.been*0.55),MARG=30,ay=80,cx=MARG,cupH=px(14),cupW=px(16),cupPath=`M${cx} ${ay+cupH} Q${cx+cupW*0.3} ${ay} ${cx+cupW} ${ay} Q${cx+cupW+px(6)} ${ay+cupH*0.5} ${cx+cupW+px(4)} ${ay+cupH+px(4)} L${cx+px(4)} ${ay+cupH+px(4)} Q${cx-px(2)} ${ay+cupH*0.8} ${cx} ${ay+cupH} Z`,bandW=px(m.borst/2+2);const bix=cx+cupW+px(10)+50,biTopW=px(m.heup/4+2),biPath=`M${bix} ${ay} L${bix+biTopW} ${ay} Q${bix+biTopW+px(4)} ${ay+px(8)} ${bix+biTopW+px(2)} ${ay+px(16)} L${bix+biTopW} ${ay+bl} Q${bix+biTopW*0.8} ${ay+bl+px(10)} ${bix+biTopW/2} ${ay+bl+px(8)} Q${bix+biTopW*0.2} ${ay+bl+px(10)} ${bix} ${ay+bl} L${bix-px(2)} ${ay+px(16)} Q${bix-px(4)} ${ay+px(8)} ${bix} ${ay} Z`;const opx=bix+biTopW+px(8)+50,opPath=`M${opx+px(4)} ${ay+px(18)} Q${opx+bw*0.5} ${ay} ${opx+bw-px(4)} ${ay+px(18)} L${opx+bw} ${ay+rl} Q${opx+bw+px(10)} ${ay+rl+px(6)} ${opx+bw+px(8)} ${ay+rl+px(18)} L${opx+bw+px(4)} ${ay+rl+bl} Q${opx+bw*0.8} ${ay+rl+bl+px(10)} ${opx+bw/2} ${ay+rl+bl+px(8)} Q${opx+bw*0.2} ${ay+rl+bl+px(10)} ${opx} ${ay+rl+bl} L${opx-px(4)} ${ay+rl+px(18)} Q${opx-px(8)} ${ay+rl+px(6)} ${opx-px(10)} ${ay+rl} Z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs(W,H)}${header(W,`DoubleYou — Badmodepatroon (${m.pasvorm})`,`Lengte ${m.lengte}cm · Borst ${m.borstRaw}cm · Heup ${Math.round(m.heup-(EASE[m.pasvorm]||EASE.Regular).h)}cm`,`Naadtoeslag 1cm · Rekbare stof · ${m.pasvorm} pasvorm`)}<path d="${cupPath}" class="naad-lijn"/><text x="${cx+6}" y="${ay+cupH+px(10)}" class="deel-lbl">1. Bikini cup</text><text x="${cx+6}" y="${ay+cupH+px(22)}" class="info-lbl">knip 4× (stof + voering)</text><rect x="${cx}" y="${ay+cupH+px(40)}" width="${bandW}" height="${px(5)}" class="naad-lijn"/><text x="${cx+6}" y="${ay+cupH+px(53)}" class="deel-lbl">2. Bikini band</text><path d="${biPath}" class="naad-lijn"/>${grainLine(bix+biTopW/2-6,ay+px(10),bix+biTopW/2-6,ay+bl-px(4))}<text x="${bix+6}" y="${ay+bl/2+8}" class="deel-lbl">3. Bikini broekje</text><text x="${bix+6}" y="${ay+bl/2+22}" class="info-lbl">knip 2× (gespiegeld)</text><path d="${opPath}" class="naad-lijn"/>${grainLine(opx+bw/2-6,ay+px(20),opx+bw/2-6,ay+rl+bl-px(4))}<text x="${opx+6}" y="${ay+rl+px(14)}" class="deel-lbl">4. Badpak</text><text x="${opx+6}" y="${ay+rl+px(26)}" class="info-lbl">knip 2× (gespiegeld)</text>${footer(W,H)}</svg>`;}

// ─── Router ───────────────────────────────────────────────────────────────────
function genereerPatroon(kledingstuk, maten) {
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
const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const corsOrigin = TOEGESTANE_ORIGINS.includes(origin) ? origin : TOEGESTANE_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET / ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'DoubleYou Patroon Server', version: '5.0.0', ffmpeg: !!ffmpegPath }));
    return;
  }

  // ── POST /patroon — SVG patroon genereren ─────────────────────────────────
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
        const svg = genereerPatroon(kledingstuk, maten);
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(svg);
      } catch(e) {
        console.error('Patroon fout:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── POST /transcode — HEVC/MOV video → H.264 MP4 ─────────────────────────
  if (req.method === 'POST' && req.url === '/transcode') {
    const id = randomUUID();
    const tmpIn  = join(tmpdir(), id + '-input');
    const tmpOut = join(tmpdir(), id + '-output.mp4');

    try {
      const parts = await parseMultipart(req);
      const videoPart = parts.find(p => p.name === 'video');
      if (!videoPart || !videoPart.data || videoPart.data.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geen video gevonden in verzoek' }));
        return;
      }

      console.log(`[transcode] Ontvangen: ${videoPart.filename || 'video'} (${Math.round(videoPart.data.length/1024)}KB)`);

      // Schrijf naar temp bestand
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(tmpIn);
        ws.on('finish', resolve);
        ws.on('error', reject);
        ws.end(videoPart.data);
      });

      // Transcodeer naar H.264 MP4
      await transcodeToH264(tmpIn, tmpOut);

      // Stuur MP4 terug
      const { statSync } = await import('node:fs');
      const stat = statSync(tmpOut);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store'
      });
      const rs = createReadStream(tmpOut);
      rs.pipe(res);
      rs.on('end', () => {
        try { unlinkSync(tmpIn);  } catch {}
        try { unlinkSync(tmpOut); } catch {}
      });

    } catch (e) {
      console.error('[transcode] Fout:', e.message);
      try { if (existsSync(tmpIn))  unlinkSync(tmpIn);  } catch {}
      try { if (existsSync(tmpOut)) unlinkSync(tmpOut); } catch {}
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transcoding mislukt: ' + e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Niet gevonden' }));
});

server.listen(PORT, () => {
  console.log(`DoubleYou Patroon Server v5.0 draait op poort ${PORT}`);
  console.log(`FFmpeg: ${ffmpegPath || 'NIET GEVONDEN'}`);
});
