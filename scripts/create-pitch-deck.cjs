/**
 * Luxor AI — 3-Slide Pitch Deck
 * Run: node scripts/create-pitch-deck.cjs
 * Output: public/Luxor-AI-Pitch.pptx
 */

const PptxGenJS = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const OUT = path.join(__dirname, "../public/Luxor-AI-Pitch.pptx");
const LOGO = path.join(__dirname, "../public/logo.png");

// ── Palette ──────────────────────────────────────────────────────────────────
const BG      = "07090E";  // near-black
const CARD    = "0F1420";  // card dark
const CARD2   = "131A27";  // slightly lighter card
const BLUE    = "3B82F6";  // primary blue
const BLUE_D  = "1D4ED8";  // darker blue (Roofus bubble)
const AMBER   = "F59E0B";  // accent amber
const TEXT    = "F1F5F9";  // white-ish text
const MUTED   = "8896A9";  // muted slate
const GREEN   = "10B981";  // confirmation green (tinted)
const USER_BG = "1E293B";  // user chat bubble bg

// ── Helpers ──────────────────────────────────────────────────────────────────
function shadow() {
  return { type: "outer", angle: 90, blur: 12, offset: 4, color: "000000", opacity: 0.4 };
}

function slide1(pptx) {
  const sl = pptx.addSlide();
  sl.background = { color: BG };

  // Left accent bar
  sl.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: 5.625, fill: { color: BLUE },
  });

  // Logo
  if (fs.existsSync(LOGO)) {
    sl.addImage({ path: LOGO, x: 0.28, y: 0.28, w: 1.1, h: 0.5 });
  }

  // "AI RECEPTIONIST" pill
  sl.addShape(pptx.ShapeType.roundRect, {
    x: 0.28, y: 0.88, w: 1.85, h: 0.26, fill: { color: "1D3461" },
    line: { color: BLUE, width: 1 }, rectRadius: 0.13,
  });
  sl.addText("AI RECEPTIONIST", {
    x: 0.28, y: 0.88, w: 1.85, h: 0.26,
    fontSize: 7.5, bold: true, color: BLUE, align: "center", valign: "middle",
    charSpacing: 2,
  });

  // Hero headline
  sl.addText("40% of Roofing Calls\nGo Unanswered.", {
    x: 0.28, y: 1.3, w: 5.8, h: 1.35,
    fontSize: 42, bold: true, color: TEXT,
    fontFace: "Georgia", lineSpacingMultiple: 1.05,
  });

  // Sub-headline
  sl.addText("Every missed call is a job lost to a competitor.\nRoofus answers every call, every time — and books the job.", {
    x: 0.28, y: 2.72, w: 5.8, h: 0.7,
    fontSize: 14, color: MUTED, fontFace: "Calibri", lineSpacingMultiple: 1.4,
  });

  // ── 6 stat cards (2 rows × 3) ────────────────────────────────────────────
  const stats = [
    { num: "40%",    label: "Calls Missed" },
    { num: "$8,500", label: "Avg. Job Value" },
    { num: "3×",     label: "More Bookings" },
    { num: "24/7",   label: "Always On" },
    { num: "< 2 s",  label: "Avg. Answer Time" },
    { num: "90 Day", label: "ROI Payback" },
  ];

  const cardW = 1.95;
  const cardH = 0.88;
  const startX = 0.28;
  const row1Y = 3.56;
  const row2Y = row1Y + cardH + 0.1;

  stats.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = startX + col * (cardW + 0.1);
    const y = row === 0 ? row1Y : row2Y;

    sl.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH,
      fill: { color: CARD }, line: { color: "1E3A5F", width: 1 },
      rectRadius: 0.1, shadow: shadow(),
    });
    sl.addText(s.num, {
      x, y: y + 0.1, w: cardW, h: 0.48,
      fontSize: 26, bold: true, color: BLUE, align: "center", valign: "middle",
      fontFace: "Georgia",
    });
    sl.addText(s.label, {
      x, y: y + 0.52, w: cardW, h: 0.3,
      fontSize: 10, color: MUTED, align: "center", valign: "middle",
      fontFace: "Calibri", bold: false,
    });
  });

  // ROI band at bottom
  sl.addShape(pptx.ShapeType.rect, {
    x: 0, y: 5.25, w: 10, h: 0.375,
    fill: { color: "0B1120" }, line: { color: "1E3A5F", width: 1 },
  });
  sl.addText("Clients average 3× more booked appointments in the first 30 days — or we extend free.", {
    x: 0.28, y: 5.25, w: 9.5, h: 0.375,
    fontSize: 10.5, color: MUTED, align: "center", valign: "middle",
    fontFace: "Calibri", italic: true,
  });
}

function slide2(pptx) {
  const sl = pptx.addSlide();
  sl.background = { color: BG };

  // Left accent bar
  sl.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: 5.625, fill: { color: BLUE },
  });

  // Section label
  sl.addText("THE SOLUTION", {
    x: 0.28, y: 0.28, w: 3, h: 0.25,
    fontSize: 8, bold: true, color: AMBER, charSpacing: 2.5,
    fontFace: "Calibri",
  });

  // Headline
  sl.addText("Meet Roofus.\nYour AI Receptionist.", {
    x: 0.28, y: 0.58, w: 4.5, h: 1.1,
    fontSize: 32, bold: true, color: TEXT, fontFace: "Georgia",
    lineSpacingMultiple: 1.08,
  });

  // ── How it works: 4 steps stacked left side ─────────────────────────────
  const steps = [
    { n: "1", title: "Caller rings your number",   desc: "Roofus picks up instantly, 24/7" },
    { n: "2", title: "Qualifies & books the job",  desc: "Gathers address, service, urgency" },
    { n: "3", title: "Confirms via SMS & email",   desc: "Client gets confirmation instantly" },
    { n: "4", title: "You get a full lead report", desc: "See every call in your dashboard" },
  ];

  steps.forEach((step, i) => {
    const y = 1.78 + i * 0.78;

    // Circle number
    sl.addShape(pptx.ShapeType.ellipse, {
      x: 0.28, y: y, w: 0.35, h: 0.35,
      fill: { color: BLUE }, line: { color: BLUE, width: 0 },
    });
    sl.addText(step.n, {
      x: 0.28, y: y, w: 0.35, h: 0.35,
      fontSize: 11, bold: true, color: TEXT, align: "center", valign: "middle",
      fontFace: "Calibri",
    });

    // Step title
    sl.addText(step.title, {
      x: 0.72, y: y - 0.02, w: 3.8, h: 0.24,
      fontSize: 12, bold: true, color: TEXT, valign: "middle",
      fontFace: "Calibri",
    });
    sl.addText(step.desc, {
      x: 0.72, y: y + 0.2, w: 3.8, h: 0.22,
      fontSize: 9.5, color: MUTED, valign: "middle",
      fontFace: "Calibri",
    });
  });

  // Demo number badge
  sl.addShape(pptx.ShapeType.roundRect, {
    x: 0.28, y: 5.08, w: 3.5, h: 0.36,
    fill: { color: "0A2240" }, line: { color: BLUE, width: 1.2 }, rectRadius: 0.08,
  });
  sl.addText("📞  Try now: +1 (754) 283-7658", {
    x: 0.28, y: 5.08, w: 3.5, h: 0.36,
    fontSize: 10.5, bold: true, color: BLUE, align: "center", valign: "middle",
    fontFace: "Calibri",
  });

  // ── ChatGPT-esque chat panel (right side) ────────────────────────────────
  const panX = 4.85;
  const panY = 0.22;
  const panW = 4.9;
  const panH = 5.2;

  // Panel background
  sl.addShape(pptx.ShapeType.roundRect, {
    x: panX, y: panY, w: panW, h: panH,
    fill: { color: "0D1117" }, line: { color: "1C2A3A", width: 1.2 },
    rectRadius: 0.16, shadow: shadow(),
  });

  // Chat header bar
  sl.addShape(pptx.ShapeType.rect, {
    x: panX, y: panY, w: panW, h: 0.44,
    fill: { color: "111827" }, line: { color: "1C2A3A", width: 0 },
  });
  // Header rounded top corners via overlay
  sl.addShape(pptx.ShapeType.roundRect, {
    x: panX, y: panY, w: panW, h: 0.44,
    fill: { color: "111827" }, line: { color: "1C2A3A", width: 0 }, rectRadius: 0.16,
  });
  // Green dot
  sl.addShape(pptx.ShapeType.ellipse, {
    x: panX + 0.18, y: panY + 0.15, w: 0.14, h: 0.14,
    fill: { color: "22C55E" }, line: { width: 0 },
  });
  sl.addText("Roofus · AI Receptionist", {
    x: panX + 0.38, y: panY + 0.05, w: 3.8, h: 0.35,
    fontSize: 10, bold: true, color: TEXT, valign: "middle",
    fontFace: "Calibri",
  });

  // ── Messages ─────────────────────────────────────────────────────────────
  const msgs = [
    { from: "user",   text: "Hi, I need my roof inspected after the storm." },
    { from: "roofus", text: "Of course! I can get you scheduled right away.\nWhat's the property address?" },
    { from: "user",   text: "4821 SW 108th Ave, Miami FL." },
    { from: "roofus", text: "Perfect — we service that area. What time works\nbest for you: morning or afternoon?" },
    { from: "user",   text: "Morning, tomorrow if possible." },
    { from: "confirm",text: "✓  Booked: Thu 9 AM · Apex Roofing · Confirmation sent" },
  ];

  let msgY = panY + 0.56;
  msgs.forEach((msg) => {
    const isUser    = msg.from === "user";
    const isConfirm = msg.from === "confirm";
    const bubW = isConfirm ? 4.3 : 3.35;
    const bubX = isConfirm
      ? panX + (panW - bubW) / 2
      : isUser
      ? panX + panW - bubW - 0.18
      : panX + 0.18;

    const lineCount = (msg.text.match(/\n/g) || []).length + 1;
    const bubH = lineCount <= 1 ? 0.32 : lineCount === 2 ? 0.52 : 0.68;

    sl.addShape(pptx.ShapeType.roundRect, {
      x: bubX, y: msgY, w: bubW, h: bubH,
      fill: {
        color: isConfirm ? "064E3B" : isUser ? USER_BG : BLUE_D,
      },
      line: isConfirm ? { color: GREEN, width: 1 } : { width: 0 },
      rectRadius: 0.1,
    });
    sl.addText(msg.text, {
      x: bubX + 0.12, y: msgY + 0.02, w: bubW - 0.24, h: bubH - 0.04,
      fontSize: isConfirm ? 9 : 9.5,
      color: isConfirm ? "6EE7B7" : TEXT,
      valign: "middle",
      align: isConfirm ? "center" : "left",
      fontFace: "Calibri",
      lineSpacingMultiple: 1.25,
    });
    msgY += bubH + 0.1;
  });
}

function slide3(pptx) {
  const sl = pptx.addSlide();
  sl.background = { color: BG };

  // Left accent bar
  sl.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: 5.625, fill: { color: AMBER },
  });

  // Center content block
  const cX = 1.8;
  const cW = 6.4;

  // Logo
  if (fs.existsSync(LOGO)) {
    sl.addImage({ path: LOGO, x: cX, y: 0.5, w: 1.5, h: 0.68 });
  }

  // Headline
  sl.addText("Ready to Stop Missing Calls?", {
    x: cX, y: 1.35, w: cW, h: 0.8,
    fontSize: 36, bold: true, color: TEXT, fontFace: "Georgia",
    align: "center",
  });

  // Sub
  sl.addText("Get Roofus live for your clients in under 48 hours.", {
    x: cX, y: 2.2, w: cW, h: 0.4,
    fontSize: 15, color: MUTED, align: "center", fontFace: "Calibri",
  });

  // Divider
  sl.addShape(pptx.ShapeType.rect, {
    x: cX + 1.5, y: 2.72, w: cW - 3, h: 0.02, fill: { color: "1E3A5F" },
  });

  // ── Contact block ─────────────────────────────────────────────────────────
  const contacts = [
    { icon: "✉", value: "connect@luxordev.com" },
    { icon: "🌐", value: "luxordev.com/contact" },
  ];

  contacts.forEach((c, i) => {
    const y = 2.95 + i * 0.7;
    sl.addText(c.icon, {
      x: cX, y, w: 0.55, h: 0.58,
      fontSize: 20, align: "center", valign: "middle",
    });
    sl.addText(c.value, {
      x: cX + 0.55, y, w: cW - 0.55, h: 0.58,
      fontSize: 20, bold: true, color: BLUE, valign: "middle",
      fontFace: "Calibri",
    });
  });

  // Company name
  sl.addText("Luxor Developments LLC", {
    x: cX, y: 4.38, w: cW, h: 0.35,
    fontSize: 13, color: MUTED, align: "center", fontFace: "Calibri",
  });

  // CTA button shape
  sl.addShape(pptx.ShapeType.roundRect, {
    x: cX + 1.5, y: 4.85, w: cW - 3, h: 0.52,
    fill: { color: BLUE }, line: { color: BLUE, width: 0 },
    rectRadius: 0.1, shadow: shadow(),
  });
  sl.addText("Book a Free Demo →", {
    x: cX + 1.5, y: 4.85, w: cW - 3, h: 0.52,
    fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle",
    fontFace: "Calibri",
  });
}

// ── Build ─────────────────────────────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
pptx.author = "Luxor Developments LLC";
pptx.company = "Luxor Developments LLC";
pptx.subject = "Roofus AI Receptionist — Pitch Deck";
pptx.title   = "Luxor AI — Pitch Deck";

slide1(pptx);
slide2(pptx);
slide3(pptx);

pptx.writeFile({ fileName: OUT }).then(() => {
  console.log("✓ Written:", OUT);
}).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
