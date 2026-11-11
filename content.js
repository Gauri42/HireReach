(() => {
  if (window.__hrMsgLoaded) return;
  window.__hrMsgLoaded = true;

  const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
  const CONNECTIONS_PATH = /\/mynetwork\/invite-connect\/connections/;
  const DEFAULT_CHIPS = [
    ["HR", 1], ["Human Resources", 1], ["Recruiter", 1], ["Recruitment", 1],
    ["Talent Acquisition", 1], ["Hiring", 1],
    ["Talent Partner", 0], ["Staffing", 0], ["Hiring Manager", 0],
  ];
  const DEFAULT_TPL = "Hi {firstName},\n\n";
  const DAILY_SOFT_LIMIT = 30;
  const LABELS = ["Filter", "Matches", "Message", "Send"];

  const S = {
    step: 1, min: false,
    chips: DEFAULT_CHIPS.map(([t, on]) => ({ t, on: !!on })),
    tpl: DEFAULT_TPL,
    people: new Map(), rx: [], sel: new Set(),
    scanning: false, stopScan: false, showAll: false, query: "",
    sending: false, finished: false, queue: [], idx: 0, sendState: "",
    file: null, fileErr: "", attachWarn: false, copyText: "", sentLog: {}, recentNote: "",
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- icons (inline SVG, no external fonts) ----------
  const PATHS = {
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    send: '<path d="M10 14L21 3"/><path d="M21 3l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"/>',
    loader: '<path d="M12 3a9 9 0 1 0 9 9"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
    paperclip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  };
  // Brand mark: chat bubble with a person inside (HR + message)
  const LOGO_SVG = (size) =>
    `<svg class="lg" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">` +
    `<rect width="48" height="48" rx="12" fill="url(#lgGrad)"/>` +
    `<path d="M14 15.5A5.5 5.5 0 0 1 19.5 10h9A5.5 5.5 0 0 1 34 15.5v8a5.5 5.5 0 0 1-5.5 5.5H23l-5.6 5.2a.9.9 0 0 1-1.5-.7V29h-.4A5.5 5.5 0 0 1 14 23.5z" fill="#fff"/>` +
    `<circle cx="24" cy="16.6" r="3" fill="url(#lgGrad)"/>` +
    `<path d="M18.6 24.4c.5-2.9 2.6-4.4 5.4-4.4s4.9 1.5 5.4 4.4z" fill="url(#lgGrad)"/>` +
    `<circle cx="36.5" cy="11.5" r="4.2" fill="#2fc16a" stroke="#fff" stroke-width="1.8"/></svg>`;
  const logo = (size) => h("span", { class: "i", style: `width:${size}px;height:${size}px`, html: LOGO_SVG(size) });
  const fmtSize = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB");
  const MAX_FILE = 20 * 1024 * 1024; // LinkedIn's attachment limit
  const icon = (name, size = 16, cls = "") =>
    h("span", {
      class: "i " + cls,
      style: `width:${size}px;height:${size}px`,
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`,
    });

  // ---------- tiny DOM helper ----------
  function h(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e[k] = v;
    }
    kids.flat().forEach((c) => {
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }

  // ================= Shell =================
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:70px;right:16px;z-index:2147483647;";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
  <style>
    :host{--p:#0a66c2;--pd:#004182;--pl:#e8f1fb;--pl2:#f2f7fd;--ink:#1b1f23;--mute:#5e6770;--line:#e3e7eb;--bg:#f6f8fa;--ok:#1a7a35;--okl:#e6f4ea;--warn:#b86e00;--warnl:#fff6e5}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif}
    button{font-family:inherit}
    .i{display:inline-flex;align-items:center;justify-content:center;flex:none}
    .i svg{display:block}
    .spin svg{animation:sp 1s linear infinite}
    @keyframes sp{to{transform:rotate(360deg)}}
    @keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
    .lg{display:block}

    .fab{display:none;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:28px;padding:6px 18px 6px 6px;cursor:pointer;box-shadow:0 8px 24px rgba(10,40,80,.2);font-size:14px;font-weight:600;color:var(--ink);animation:pop .2s ease;transition:box-shadow .15s,transform .15s}
    .fab:hover{box-shadow:0 10px 28px rgba(10,102,194,.32);transform:translateY(-1px)}
    .fab .ic{display:flex;align-items:center;justify-content:center;border-radius:50%}
    .fab .ic.round{width:34px;height:34px;background:var(--p);color:#fff}
    .fab.scan .ic.round{background:var(--pl);color:var(--p)}
    .fab.send .ic.round{background:var(--ok)}
    .fab .meta{font-size:12px;font-weight:500;color:var(--mute)}
    .fab .pill{font-size:12px;font-weight:600;padding:2px 9px;border-radius:10px;background:var(--okl);color:var(--ok)}

    .panel{width:430px;max-height:calc(100vh - 90px);display:flex;flex-direction:column;background:#fff;color:var(--ink);border:1px solid rgba(10,40,80,.1);border-radius:16px;box-shadow:0 20px 50px rgba(10,40,80,.22),0 2px 6px rgba(10,40,80,.08);overflow:hidden;font-size:14px;animation:pop .2s ease}
    .top{display:flex;justify-content:space-between;align-items:center;padding:14px 14px 14px 16px;cursor:move;user-select:none;background:linear-gradient(180deg,var(--pl2),#fff);border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:11px}
    .brandtxt{display:flex;flex-direction:column;line-height:1.2}
    .brandtxt b{font-size:15px;font-weight:700;letter-spacing:-.1px}
    .brandtxt span{font-size:11.5px;color:var(--mute);margin-top:1px}
    .x{background:none;border:0;color:var(--mute);width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}
    .x:hover{background:rgba(10,40,80,.07);color:var(--ink)}

    .stepper{padding:14px 18px 4px}
    .stp{display:flex;align-items:flex-start}
    .sn{display:flex;flex-direction:column;align-items:center;gap:5px;flex:none;width:54px}
    .sn.click{cursor:pointer}
    .dot{width:24px;height:24px;border-radius:50%;border:2px solid #cfd6dd;color:#8a949e;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;background:#fff;transition:all .2s}
    .sn.cur .dot{border-color:var(--p);color:var(--p);box-shadow:0 0 0 4px var(--pl)}
    .sn.done .dot{background:var(--p);border-color:var(--p);color:#fff}
    .sn.click:hover .dot{box-shadow:0 0 0 4px var(--pl)}
    .sl{font-size:11px;color:#8a949e;font-weight:500}
    .sn.cur .sl{color:var(--ink);font-weight:600}
    .sn.done .sl{color:var(--mute)}
    .ln{flex:1;height:2px;background:var(--line);margin-top:11px;border-radius:2px;transition:background .2s}
    .ln.on{background:var(--p)}

    .body{overflow:auto;padding:16px 18px;flex:1;min-height:0;animation:rise .25s ease}
    .body::-webkit-scrollbar,.list::-webkit-scrollbar{width:8px}
    .body::-webkit-scrollbar-thumb,.list::-webkit-scrollbar-thumb{background:#d5dbe1;border-radius:8px;border:2px solid #fff}
    h2{margin:0 0 5px;font-size:18px;font-weight:700;letter-spacing:-.2px}
    .sub{margin:0 0 16px;color:var(--mute);font-size:13px;line-height:1.55}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
    .chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #cfd6dd;background:#fff;color:#4a545e;border-radius:18px;padding:6px 13px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .chip:hover{border-color:var(--p);color:var(--p)}
    .chip.on{background:var(--pl);border-color:#a9cdf0;color:var(--p)}
    .addrow{display:flex;gap:8px}
    input[type=text],textarea{width:100%;padding:10px 13px;border:1px solid #cfd6dd;border-radius:10px;font-size:14px;color:var(--ink);background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}
    input[type=text]::placeholder,textarea::placeholder{color:#9aa3ac}
    input[type=text]:focus,textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px #dcebfa}
    textarea{height:130px;resize:vertical;line-height:1.55}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;background:var(--p);color:#fff;white-space:nowrap;transition:background .15s,box-shadow .15s,transform .05s}
    .btn:hover{background:#0958a8;box-shadow:0 4px 12px rgba(10,102,194,.3)}
    .btn:active{transform:translateY(1px)}
    .btn.sec{background:#fff;color:var(--ink);border-color:#cfd6dd}
    .btn.sec:hover{background:var(--bg);box-shadow:none}
    .btn.danger{background:#fff;color:#b42318;border-color:#f0c4c0}
    .btn.danger:hover{background:#fdf3f2;box-shadow:none}
    .btn:disabled{background:#eceff2;color:#9aa3ac;border-color:transparent;cursor:default;box-shadow:none;transform:none}
    .btn.grow{flex:1}
    .link{background:none;border:0;color:var(--p);font-weight:600;font-size:13px;cursor:pointer;padding:2px 4px;border-radius:4px}
    .link:hover{text-decoration:underline}
    .foot{display:flex;gap:8px;padding:14px 18px;border-top:1px solid var(--line);background:#fff}

    .note{display:flex;gap:10px;align-items:flex-start;background:var(--bg);color:#3b4650;border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.5;margin-top:16px}
    .note .i{margin-top:2px;color:var(--mute)}
    .note.warn{background:var(--warnl);color:#7a4a00}
    .note.warn .i{color:var(--warn)}
    .note.top{margin:0 0 16px}

    .sumline{display:flex;align-items:baseline;gap:8px;margin-bottom:12px}
    .big{font-size:28px;font-weight:700;line-height:1;color:var(--p)}
    .sumtxt{font-size:13px;color:var(--mute)}
    .searchw{position:relative;margin-bottom:10px}
    .searchw .i{position:absolute;left:12px;top:12px;color:#8a949e}
    .searchw input{padding-left:36px}
    .toolrow{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#4a545e;padding-bottom:8px}
    .sw{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
    .sw input{accent-color:var(--p);width:15px;height:15px}
    .list{height:300px;overflow:auto;border:1px solid var(--line);border-radius:12px}
    .empty{padding:44px 20px;text-align:center;color:#7b858f;font-size:13px;line-height:1.6}
    .item{display:flex;gap:12px;padding:10px 12px;border-bottom:1px solid #eef0f3;align-items:center;cursor:pointer;transition:background .12s}
    .item:last-child{border-bottom:0}
    .item:hover{background:#f7f9fb}
    .item.sel{background:var(--pl2)}
    .cb{width:19px;height:19px;border-radius:5px;border:1.5px solid #aab3bc;background:#fff;color:#fff;display:flex;align-items:center;justify-content:center;flex:none;transition:all .12s}
    .cb.on{background:var(--p);border-color:var(--p)}
    .av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#dcebfa,#c4dcf5);color:var(--pd);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex:none}
    .av.sm{width:26px;height:26px;font-size:10px}
    .info{min-width:0;flex:1}
    .nm{font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px}
    .nm .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hl{font-size:12px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
    .tag.warn{background:var(--warnl)!important;color:var(--warn)!important}
    .tag{background:var(--okl);color:var(--ok);font-size:11px;font-weight:600;padding:1px 8px;border-radius:10px;flex:none}

    .center{text-align:center;padding-top:10px}
    .bigspin{color:var(--p);margin:6px auto 14px}
    .metrics{display:flex;gap:10px;margin-top:16px}
    .metric{flex:1;background:var(--pl2);border:1px solid #dcebfa;border-radius:12px;padding:14px}
    .metric b{display:block;font-size:26px;font-weight:700;color:var(--p)}
    .metric span{font-size:12px;color:var(--mute)}

    .quick{display:flex;gap:8px;margin-bottom:8px;align-items:center;font-size:13px;color:var(--mute)}
    .composer{border:1px solid #cfd6dd;border-radius:12px;background:#fff;overflow:hidden;transition:border-color .15s,box-shadow .15s}
    .composer:focus-within{border-color:var(--p);box-shadow:0 0 0 3px #dcebfa}
    .composer textarea{border:0;border-radius:0;box-shadow:none!important;display:block;height:120px}
    .tools{display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid #eef0f3;background:var(--bg)}
    .tool{display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;background:none;color:#4a545e;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .12s}
    .tool:hover{background:#fff;border-color:#cfd6dd;color:var(--p)}
    .tools .sp{flex:1}
    .count{font-size:11.5px;color:#8a949e}
    .att{display:flex;align-items:center;gap:11px;border:1px solid #cfd6dd;background:#fff;border-radius:12px;padding:10px 12px;margin-top:10px;animation:rise .2s ease}
    .att .fi{width:38px;height:38px;border-radius:9px;background:var(--pl);color:var(--p);display:flex;align-items:center;justify-content:center;flex:none}
    .att .fn{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .att .fs{font-size:12px;color:var(--mute);margin-top:1px}
    .att.err{border-color:#f0c4c0;background:#fdf3f2}
    .att.err .fi{background:#fbe3e0;color:#b42318}
    .att.mini{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff}
    .att.mini .fi{width:30px;height:30px;border-radius:8px}
    .drop{display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;border:1.5px dashed #b9c4cf;background:var(--pl2);color:var(--mute);border-radius:12px;padding:12px 14px;font-size:13px;cursor:pointer;text-align:left;transition:all .15s}
    .drop:hover,.drop.over{border-color:var(--p);background:var(--pl);color:var(--p)}
    .drop b{color:var(--ink);font-weight:600}
    .drop .i{color:var(--p)}
    .prevhead{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--mute);margin:16px 0 6px}
    .bubble{background:#eef3f8;border-radius:4px 14px 14px 14px;padding:12px 14px;font-size:13px;white-space:pre-wrap;line-height:1.55;max-height:140px;overflow:auto}
    .faces{display:flex;margin-top:12px}
    .faces .av{border:2px solid #fff;margin-left:-8px}
    .faces .av:first-child{margin-left:0}
    .steps{margin:16px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px}
    .steps li{display:flex;gap:11px;align-items:flex-start;font-size:13px;line-height:1.5;color:#3b4650}
    .steps .n{width:22px;height:22px;border-radius:50%;background:var(--pl);color:var(--p);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none;margin-top:0}
    .prog{display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:var(--mute)}
    .bar{height:6px;background:var(--line);border-radius:4px;overflow:hidden;margin:8px 0 14px}
    .bar>div{height:100%;background:linear-gradient(90deg,#378fe9,var(--p));border-radius:4px;transition:width .3s}
    .card{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff;box-shadow:0 1px 3px rgba(10,40,80,.05)}
    .who{display:flex;gap:12px;align-items:center}
    .state{display:flex;gap:8px;align-items:center;font-size:13px;font-weight:600;margin-top:12px;padding-top:12px;border-top:1px solid #eef0f3}
    .state.ok{color:var(--ok)}.state.bad{color:var(--warn)}.state.wait{color:var(--mute)}
    .next{display:flex;align-items:center;gap:10px;font-size:13px;color:#4a545e;padding:4px 0}
    .upl{margin-top:18px;font-size:12px;color:var(--mute)}
    .donebox{text-align:center;padding:24px 0 8px}
    .donebox .i{color:var(--ok)}
  </style>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="lgGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#378fe9"/><stop offset="1" stop-color="#0a55a8"/></linearGradient>
  </defs></svg>
  <div class="fab" id="fab"></div>
  <div class="panel" id="panel">
    <div class="top" id="drag">
      <div class="brand"><div id="logo"></div><div class="brandtxt"><b>HireReach</b><span>Reach the right HR, faster</span></div></div>
      <button class="x" id="min" title="Minimize"></button>
    </div>
    <div class="stepper" id="stepper"></div>
    <div class="body" id="body"></div>
    <div class="foot" id="foot"></div>
  </div>`;
  const $ = (id) => root.getElementById(id);
  $("logo").append(logo(36));
  $("min").append(icon("minus", 16));

  $("min").onclick = () => { S.min = true; renderFab(); };
  $("fab").onclick = () => { S.min = false; renderFab(); };
  (() => {
    let sx, sy, ox, oy, drag = false;
    $("drag").addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      host.style.left = ox + e.clientX - sx + "px";
      host.style.top = Math.max(0, oy + e.clientY - sy) + "px";
      host.style.right = "auto";
    });
    window.addEventListener("mouseup", () => (drag = false));
  })();
  const setSide = (side) => {
    if (side === "left") { host.style.left = "16px"; host.style.right = "auto"; }
    else { host.style.left = "auto"; host.style.right = "16px"; }
  };

  // ---------- minimized button with live status ----------
  function renderFab() {
    const f = $("fab");
    f.className = "fab" + (S.scanning ? " scan" : S.sending ? " send" : "");
    f.style.display = S.min ? "inline-flex" : "none";
    $("panel").style.display = S.min ? "none" : "flex";
    f.innerHTML = "";
    if (S.scanning) {
      f.append(h("span", { class: "ic round" }, icon("loader", 16, "spin")), "Scanning", h("span", { class: "meta" }, String(S.people.size)));
    } else if (S.sending && S.queue.length) {
      f.append(h("span", { class: "ic round" }, icon("send", 15)), "Sending", h("span", { class: "pill" }, `${Math.min(S.idx + 1, S.queue.length)} / ${S.queue.length}`));
    } else {
      f.append(h("span", { class: "ic" }, logo(34)), "HireReach");
    }
  }

  // ---------- storage ----------
  const saveCfg = () => {
    try { chrome.storage.local.set({ chips2: S.chips, tpl2: S.tpl }); } catch (e) {}
  };
  const RECENT_MS = 2 * 24 * 3600 * 1000;            // "recently messaged" = within the last 2 days
  const saveLog = () => { try { chrome.storage.local.set({ sent3: S.sentLog }); } catch (e) {} };
  const markSent = (key) => { S.sentLog[key] = Date.now(); saveLog(); };
  const sentAgo = (key) => {
    const t = S.sentLog[key];
    if (!t || Date.now() - t > RECENT_MS) return "";
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 60) return "Messaged just now";
    const hr = Math.floor(m / 60);
    if (hr < 24) return `Messaged ${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `Messaged ${d} day${d > 1 ? "s" : ""} ago`;
  };
  try {
    chrome.storage.local.get(["chips2", "tpl2", "sent3"], (v) => {
      if (v && v.sent3 && typeof v.sent3 === "object") S.sentLog = v.sent3;
      if (v && Array.isArray(v.chips2) && v.chips2.length) S.chips = v.chips2;
      if (v && typeof v.tpl2 === "string") S.tpl = v.tpl2;
      renderAll();
    });
  } catch (e) {}

  // ---------- helpers ----------
  const initials = (n) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const buildRx = () =>
    S.chips.filter((c) => c.on && c.t.trim()).map(
      (c) => new RegExp("(^|[^a-z0-9])" + esc(c.t.trim()) + "([^a-z0-9]|$)", "i")
    );
  const isMatch = (headline) => S.rx.some((r) => r.test(headline));
  const all = () => [...S.people.values()];
  const matches = () => all().filter((p) => p.match);
  const selected = () => all().filter((p) => S.sel.has(p.key));
  const onConnectionsPage = () => CONNECTIONS_PATH.test(location.pathname);
  const avatar = (name, small) => h("div", { class: "av" + (small ? " sm" : "") }, initials(name));
  const note = (kind, iconName, ...content) =>
    h("div", { class: "note " + kind }, icon(iconName, 16), h("div", {}, content));

  // ================= Scanning =================
  const profileKey = (a) => {
    const m = a.href.match(/\/in\/([^/?#]+)/);
    return m ? m[1].toLowerCase() : null;
  };

  function findCard(a) {
    let el = a, card = a;
    for (let i = 0; i < 10 && el.parentElement; i++) {
      const parent = el.parentElement;
      if (parent === document.body || parent.tagName === "MAIN") break;
      const keys = new Set([...parent.querySelectorAll('a[href*="/in/"]')].map(profileKey).filter(Boolean));
      if (keys.size > 1) break;
      card = parent; el = parent;
    }
    return card;
  }

  function harvest() {
    const me = ((document.querySelector("img.global-nav__me-photo") || {}).alt || "").trim().toLowerCase();
    document.querySelectorAll('a[href*="/in/"]').forEach((a) => {
      if (a.closest("header, nav, aside")) return;
      const key = profileKey(a);
      if (!key) return;
      const ex = S.people.get(key);
      if (ex) { if (!ex.el.isConnected) ex.el = findCard(a); return; }
      const card = findCard(a);
      const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return;
      const named = [...card.querySelectorAll('a[href*="/in/"]')].find((x) => profileKey(x) === key && x.innerText.trim());
      let name = (named ? named.innerText : lines[0]).split("\n")[0].trim();
      name = name.replace(/^View\s+/i, "").replace(/[\u2019']s profile.*$/i, "");
      if (me && name.toLowerCase() === me) return;
      const headline = lines.find((l) =>
        l !== name && l.length > 3 && !/^connected\s/i.test(l) &&
        !/^(message|remove connection|connection|1st|2nd|3rd)$/i.test(l)) || "";
      S.people.set(key, { key, name, first: name.split(" ")[0], headline, el: card, match: isMatch(headline) });
    });
  }

  function updateScanUI() {
    const a = $("scanTotal"), b = $("scanMatch");
    if (a) a.textContent = all().length;
    if (b) b.textContent = matches().length;
    renderFab();
  }

  async function startScan() {
    S.rx = buildRx();
    S.people = new Map();
    S.sel = new Set();
    S.scanning = true; S.stopScan = false;
    go(2);
    let same = 0, last = -1;
    for (let i = 0; i < 400 && !S.stopScan && same < 5; i++) {
      harvest();
      const n = all().length;
      same = n === last ? same + 1 : 0;
      last = n;
      updateScanUI();
      const links = [...document.querySelectorAll('a[href*="/in/"]')].filter((a) => !a.closest("header, nav, aside"));
      const lastLink = links[links.length - 1];
      if (lastLink) lastLink.scrollIntoView({ block: "end" });
      window.scrollTo(0, document.documentElement.scrollHeight);
      const more = [...document.querySelectorAll("button")].find((b) => /show more|load more/i.test(b.innerText));
      if (more) more.click();
      await sleep(1500);
    }
    harvest();
    window.scrollTo(0, 0);
    S.scanning = false;
    matches().forEach((p) => { if (!sentAgo(p.key)) S.sel.add(p.key); });
    S.showAll = false; S.query = "";
    renderAll();
  }

  // ================= Navigation =================
  function go(step) { S.step = step; renderAll(); }

  function renderStepper() {
    const st = $("stepper");
    st.innerHTML = "";
    const segs = h("div", { class: "stp" });
    LABELS.forEach((l, i) => {
      const n = i + 1;
      const canClick = n < S.step && !S.scanning && !S.sending;
      const cls = "sn" + (n < S.step ? " done" : n === S.step ? " cur" : "") + (canClick ? " click" : "");
      const node = h("div", { class: cls, title: l },
        h("div", { class: "dot" }, n < S.step ? icon("check", 13) : String(n)),
        h("div", { class: "sl" }, l));
      if (canClick) node.onclick = () => go(n);
      if (i) segs.appendChild(h("div", { class: "ln" + (n <= S.step ? " on" : "") }));
      segs.appendChild(node);
    });
    st.append(segs);
  }

  function renderAll() {
    renderStepper();
    renderFab();
    const body = $("body"), foot = $("foot");
    body.innerHTML = ""; foot.innerHTML = "";
    if (S.step === 1) step1(body, foot);
    else if (S.step === 2) step2(body, foot);
    else if (S.step === 3) step3(body, foot);
    else step4(body, foot);
  }

  // ---------- Step 1: Filter ----------
  function step1(body, foot) {
    const chips = h("div", { class: "chips" });
    S.chips.forEach((c) =>
      chips.appendChild(h("button", {
        class: "chip" + (c.on ? " on" : ""),
        onclick: () => { c.on = !c.on; saveCfg(); renderAll(); },
      }, c.on ? icon("check", 13) : null, c.t))
    );
    const input = h("input", { type: "text", placeholder: "Talent Partner" });
    const add = () => {
      const t = input.value.trim();
      if (!t) return;
      const ex = S.chips.find((c) => c.t.toLowerCase() === t.toLowerCase());
      if (ex) ex.on = true; else S.chips.push({ t, on: true });
      saveCfg(); renderAll();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

    if (!onConnectionsPage()) {
      body.append(h("div", { class: "note warn top" }, icon("alert", 16),
        h("div", {}, "Scanning only works on your connections page. ",
          h("button", { class: "link", onclick: () => (location.href = CONNECTIONS_URL) }, "Open it now"))));
    }
    body.append(
      h("h2", {}, "Who do you want to message?"),
      h("p", { class: "sub" }, "Choose the job titles to look for. We'll scan your connections and list only people whose headline matches."),
      chips,
      h("div", { class: "addrow" }, input, h("button", { class: "btn sec", onclick: add }, "Add")),
      note("", "info", "Matching is by whole word, so \u201cHR\u201d matches \u201cHR Manager\u201d but not \u201cHrudaya\u201d.")
    );
    const active = S.chips.filter((c) => c.on).length;
    foot.append(h("button", {
      class: "btn grow", disabled: !active || !onConnectionsPage(), onclick: startScan,
    }, active ? "Scan connections" : "Select at least one title", active ? icon("right", 16) : null));
  }

  // ---------- Step 2: Scan / Matches ----------
  function step2(body, foot) {
    if (S.scanning) {
      body.append(h("div", { class: "center" },
        h("div", { class: "bigspin" }, icon("loader", 40, "spin")),
        h("h2", {}, "Scanning your connections"),
        h("p", { class: "sub" }, "Keep this tab open. LinkedIn loads more people as we scroll."),
        h("div", { class: "metrics" },
          h("div", { class: "metric" }, h("b", { id: "scanTotal" }, all().length), h("span", {}, "Scanned")),
          h("div", { class: "metric" }, h("b", { id: "scanMatch" }, matches().length), h("span", {}, "Matches")))));
      foot.append(h("button", { class: "btn sec grow", onclick: () => { S.stopScan = true; } }, "Stop and review results"));
      return;
    }

    const total = all().length, m = matches().length;
    const search = h("input", { type: "text", placeholder: "Search name or title", value: S.query });
    search.addEventListener("input", () => { S.query = search.value; refreshList(); });
    const sw = h("input", { type: "checkbox", checked: S.showAll });
    sw.addEventListener("change", () => { S.showAll = sw.checked; refreshList(); });

    body.append(
      h("div", { class: "sumline" }, h("span", { class: "big" }, m), h("span", { class: "sumtxt" }, `matches from ${total} connections`)),
      h("div", { class: "searchw" }, icon("search", 16), search),
      h("div", { class: "toolrow" },
        h("label", { class: "sw" }, sw, "Show all connections"),
        h("span", {},
          h("button", { class: "link", onclick: () => { visible().forEach((p) => S.sel.add(p.key)); refreshList(); } }, "Select all"),
          " \u00b7 ",
          h("button", { class: "link", onclick: () => { S.sel.clear(); refreshList(); } }, "Clear"))),
      h("div", { class: "list", id: "list" })
    );
    foot.append(
      h("button", { class: "btn sec", onclick: () => go(1) }, "Back"),
      h("button", { class: "btn grow", id: "cont2", onclick: () => go(3) }, "Continue")
    );
    refreshList();
  }

  function visible() {
    const q = S.query.trim().toLowerCase();
    return all().filter((p) => {
      if (!S.showAll && !p.match) return false;
      if (q && !(p.name + " " + p.headline).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function paintCb(cb, on) {
    cb.className = "cb" + (on ? " on" : "");
    cb.innerHTML = "";
    if (on) cb.append(icon("check", 13));
  }

  function refreshList() {
    const list = $("list");
    if (!list) return;
    list.innerHTML = "";
    const vis = visible();
    if (!vis.length) {
      list.append(h("div", { class: "empty" },
        all().length ? "No one to show here." : "No connections were found.",
        h("br"),
        S.showAll ? "" : "Try another search, turn on \u201cShow all connections\u201d, or go back and add job titles."));
    }
    vis.forEach((p) => {
      const on = S.sel.has(p.key);
      const row = h("div", { class: "item" + (on ? " sel" : "") });
      const cb = h("div", {});
      paintCb(cb, on);
      row.addEventListener("click", () => {
        const v = !S.sel.has(p.key);
        if (v) S.sel.add(p.key); else S.sel.delete(p.key);
        row.classList.toggle("sel", v); paintCb(cb, v); refreshCount();
      });
      row.append(cb, avatar(p.name),
        h("div", { class: "info" },
          h("div", { class: "nm" }, h("span", { class: "t" }, p.name), p.match ? h("span", { class: "tag" }, "Match") : null, sentAgo(p.key) ? h("span", { class: "tag warn" }, sentAgo(p.key)) : null),
          h("div", { class: "hl" }, p.headline || "\u2014")));
      list.appendChild(row);
    });
    refreshCount();
  }

  function refreshCount() {
    const b = $("cont2");
    if (!b) return;
    const n = S.sel.size;
    b.textContent = n ? `Continue with ${n} selected` : "Select people to continue";
    b.disabled = n === 0;
  }

  // ---------- Step 3: Message ----------
  function step3(body, foot) {
    const ta = h("textarea", { placeholder: "Write your message here", value: S.tpl });
    const prev = h("div", { class: "bubble" });
    const who = h("span", {});
    const paintPrev = () => {
      const p = selected()[0];
      who.textContent = p ? `Preview for ${p.name}` : "Preview";
      prev.textContent = S.tpl.replaceAll("{firstName}", p ? p.first : "Rahul") || " ";
      const b = $("cont3");
      if (b) b.disabled = !S.tpl.replace("{firstName}", "").trim();
    };
    ta.addEventListener("input", () => { S.tpl = ta.value; saveCfg(); paintPrev(); });
    const insert = () => {
      const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
      ta.value = ta.value.slice(0, s) + "{firstName}" + ta.value.slice(e);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + 11;
      S.tpl = ta.value; saveCfg(); paintPrev();
    };
    const first = selected()[0];

    // --- attachment ---
    const picker = h("input", { type: "file", style: "display:none" });
    const setFile = (f) => {
      if (!f) return;
      if (f.size > MAX_FILE) { S.file = null; S.fileErr = `${f.name} is ${fmtSize(f.size)}. LinkedIn allows files up to 20 MB.`; }
      else { S.file = f; S.fileErr = ""; }
      renderAll();
    };
    picker.addEventListener("change", () => setFile(picker.files[0]));
    const attBox = h("div", {});
    if (S.file) {
      attBox.append(h("div", { class: "att" },
        h("span", { class: "fi" }, icon("file", 20)),
        h("div", { class: "info" }, h("div", { class: "fn" }, S.file.name), h("div", { class: "fs" }, fmtSize(S.file.size) + " · sent with every message")),
        h("button", { class: "x", title: "Remove file", onclick: () => { S.file = null; S.fileErr = ""; renderAll(); } }, icon("close", 16))));
    } else {
      const drop = h("button", { class: "drop", onclick: () => picker.click() },
        icon("upload", 20),
        h("span", {}, h("b", {}, "Attach a file"), h("br"), "Resume, PDF or image · up to 20 MB · or drop it here"));
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => setFile(e.dataTransfer && e.dataTransfer.files[0]));
      attBox.append(drop);
      if (S.fileErr) attBox.append(note("warn", "alert", S.fileErr));
    }

    const composer = h("div", { class: "composer" }, ta,
      h("div", { class: "tools" },
        h("button", { class: "tool", onclick: insert, title: "Insert the person's first name" }, icon("user", 14), "First name"),
        h("button", { class: "tool", onclick: () => picker.click(), title: "Attach a file" }, icon("paperclip", 14), "Attach"),
        h("span", { class: "sp" })));
    body.append(
      h("h2", {}, "Write your message"),
      h("p", { class: "sub" }, `The same message goes to ${S.sel.size} ${S.sel.size === 1 ? "person" : "people"}, personalised with their first name.`),
      composer,
      attBox,
      picker,
      h("div", { class: "prevhead" }, first ? avatar(first.name, true) : null, who),
      prev
    );
    if (S.file) body.append(h("div", { class: "att mini" }, h("span", { class: "fi" }, icon("paperclip", 15)), h("div", { class: "info" }, h("div", { class: "fn" }, S.file.name))));
    foot.append(
      h("button", { class: "btn sec", onclick: () => go(2) }, "Back"),
      h("button", { class: "btn grow", id: "cont3", onclick: () => go(4) }, "Continue")
    );
    paintPrev();
  }

  // ---------- Step 4: Send ----------
  function step4(body, foot) {
    if (S.finished) {
      body.append(h("div", { class: "donebox" },
        icon("ok", 48),
        h("h2", { style: "margin-top:12px" }, "All done"),
        h("p", { class: "sub" }, "You've gone through everyone on your list.")));
      foot.append(h("button", { class: "btn grow", onclick: () => { S.finished = false; S.sending = false; setSide("right"); go(1); } }, "Start a new batch"));
      return;
    }
    if (!S.sending) {
      const sel = selected();
      const faces = h("div", { class: "faces" });
      sel.slice(0, 7).forEach((p) => faces.appendChild(avatar(p.name, true)));
      if (sel.length > 7) faces.appendChild(h("div", { class: "av sm", style: "background:#e3e7eb;color:#4a545e" }, "+" + (sel.length - 7)));
      body.append(
        h("h2", {}, "Ready to send"),
        h("div", { class: "card", style: "margin-top:10px" },
          h("div", { class: "sumline", style: "margin:0" }, h("span", { class: "big" }, sel.length), h("span", { class: "sumtxt" }, sel.length === 1 ? "person selected" : "people selected")),
          faces),
        h("ul", { class: "steps" },
          h("li", {}, h("span", { class: "n" }, "1"), h("span", {}, S.file ? `We open each person's chat, fill in your message and attach ${S.file.name}.` : "We open each person's chat and fill in your message.")),
          h("li", {}, h("span", { class: "n" }, "2"), h("span", {}, "You review it (optional) and click Send & Next here.")),
          h("li", {}, h("span", { class: "n" }, "3"), h("span", {}, "We press Send in LinkedIn for you and open the next chat.")))
      );
      if (sel.length > DAILY_SOFT_LIMIT) {
        body.append(note("warn", "alert",
          `You selected ${sel.length} people. Sending too many messages in a day can get your LinkedIn account restricted. Aim for about ${DAILY_SOFT_LIMIT} per day.`));
      }
      foot.append(
        h("button", { class: "btn sec", onclick: () => go(3) }, "Back"),
        h("button", { class: "btn grow", onclick: startSend }, "Start messaging", icon("send", 15))
      );
      return;
    }

    const p = S.queue[S.idx];
    const up = S.queue.slice(S.idx + 1, S.idx + 4);
    const st = S.sendState === "ready"
      ? (S.attachWarn
        ? h("div", { class: "state bad" }, icon("alert", 18), "Message ready, but the file may not have attached. Check the chat, click Send in LinkedIn yourself, then Next.")
        : h("div", { class: "state ok" }, icon("ok", 18), S.file ? "Message and file ready. Click Send & Next to send it." : "Message ready. Click Send & Next to send it."))
      : S.sendState === "failed"
      ? h("div", {},
          h("div", { class: "state bad" }, icon("alert", 18), "Couldn't fill this chat automatically."),
          h("div", { class: "sub", style: "margin:8px 0 10px" }, "Click Copy message, paste it into the open chat with Ctrl+V, send it, then click Next."),
          h("button", { class: "btn sec", onclick: (e) => {
            const done = () => { e.target.closest("button").textContent = "Copied \u2713"; };
            navigator.clipboard.writeText(S.copyText || "").then(done, () => {
              const t = document.createElement("textarea"); t.value = S.copyText || ""; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); done();
            });
          } }, "Copy message"))
      : S.sendState === "recent"
      ? h("div", { class: "state bad" }, icon("alert", 18), S.recentNote)
      : S.sendState === "sendfail"
      ? h("div", { class: "state bad" }, icon("alert", 18), "Couldn't press Send automatically. Click Send in LinkedIn yourself, then Next.")
      : h("div", { class: "state wait" }, icon("loader", 18, "spin"), S.sendState === "sending" ? "Sending message" : "Opening chat");
    const autoSend = S.sendState === "ready" && !S.attachWarn;
    body.append(
      h("div", { class: "prog" }, h("span", {}, `Person ${S.idx + 1} of ${S.queue.length}`), h("span", {}, `${Math.round((S.idx / S.queue.length) * 100)}%`)),
      h("div", { class: "bar" }, h("div", { style: `width:${(S.idx / S.queue.length) * 100}%` })),
      h("div", { class: "card" },
        h("div", { class: "who" }, avatar(p.name),
          h("div", { class: "info" }, h("div", { class: "nm" }, h("span", { class: "t" }, p.name)), h("div", { class: "hl" }, p.headline))),
        st),
      up.length ? h("div", { class: "upl" }, "Up next", up.map((u) => h("div", { class: "next" }, avatar(u.name, true), u.name))) : "",
      h("div", { class: "upl" }, "Tip: drag the header if this panel covers the chat box.")
    );
    foot.append(
      h("button", { class: "btn danger", onclick: stopSend }, "Stop"),
      h("button", { class: "btn sec", onclick: advance }, "Skip"),
      h("button", { class: "btn grow", disabled: !["ready", "failed", "sendfail"].includes(S.sendState), onclick: autoSend ? sendAndNext : () => { markSent(S.queue[S.idx].key); advance(); } }, autoSend ? "Send & Next" : "Next", icon(autoSend ? "send" : "right", 15))
    );
  }

  // ================= Open chat + prefill =================
  function liveCard(p) {
    if (p.el && p.el.isConnected) return p.el;
    const a = [...document.querySelectorAll('a[href*="/in/"]')].find((x) => profileKey(x) === p.key);
    if (a) { p.el = findCard(a); return p.el; }
    return null;
  }

  // querySelectorAll that also looks inside open shadow roots (LinkedIn hosts messaging in one)
  function deepAll(sel, node = document, out = []) {
    node.querySelectorAll(sel).forEach((e) => out.push(e));
    node.querySelectorAll("*").forEach((e) => { if (e.shadowRoot && e !== host) deepAll(sel, e.shadowRoot, out); });
    return out;
  }
  const isVisible = (e) => e.getClientRects().length > 0;

  async function closeChats() {
    const btns = deepAll("button").filter((b) =>
      /close your conversation/i.test(b.getAttribute("aria-label") || ""));
    btns.forEach((b) => b.click());
    if (btns.length) await sleep(400);
  }

  const BOX_SEL = [
    '.msg-form__contenteditable[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    '.msg-form [contenteditable]:not([contenteditable="false"])',
    '.msg-overlay-conversation-bubble [contenteditable]:not([contenteditable="false"])',
    '[contenteditable]:not([contenteditable="false"])[aria-label*="message" i]',
    '[contenteditable]:not([contenteditable="false"])[data-placeholder*="message" i]',
    'textarea[placeholder*="message" i]',
    'textarea[aria-label*="message" i]',
    '.msg-form textarea',
  ].join(",");

  function fillBox(box, text) {
    box.focus();
    if (box.tagName === "TEXTAREA" || box.tagName === "INPUT") {
      const proto = box.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(box, text);
    } else {
      document.execCommand("selectAll", false, null);
      const ok = document.execCommand("insertText", false, text);
      if (!ok || !(box.innerText || "").trim()) box.textContent = text;
    }
    box.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
  }

  // Newest date heading in the open chat ("Today" / "Yesterday" / "OCT 22"): returns it only if recent.
  function chatRecent() {
    const heads = deepAll('[class*="time-heading"], [class*="date-heading"], time').filter(isVisible)
      .map((e) => (e.innerText || "").trim()).filter((t) => /^(today|yesterday|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?|[a-z]{3,9}\.? \d{1,2}(, \d{4})?)$/i.test(t));
    const last = heads[heads.length - 1];
    return last && /^(today|yesterday)$/i.test(last) ? last.toLowerCase() : "";
  }

  async function openMessage(p) {
    S.copyText = S.tpl.replaceAll("{firstName}", p.first);
    const card = liveCard(p);
    if (!card) return false;
    await closeChats();
    card.scrollIntoView({ block: "center" });
    const btn = [...card.querySelectorAll("button, a")].find((b) =>
      /message/i.test((b.innerText || "") + " " + (b.getAttribute("aria-label") || "")));
    if (!btn) return false;
    btn.click();
    let box = null;
    for (let i = 0; i < 60 && !box; i++) {          // wait up to ~15s (long chat histories load slowly)
      await sleep(250);
      const boxes = deepAll(BOX_SEL).filter(isVisible);
      box = boxes[boxes.length - 1] || null;
    }
    if (!box) {
      console.warn("[HireReach] message box not found. Editable elements on page:",
        deepAll('[contenteditable], textarea, [role="textbox"]').map((e) => e.outerHTML.slice(0, 200)));
      return false;
    }
    await sleep(1200);                                // let the chat history load
    const seen = chatRecent();
    if (seen) { S.recentNote = `Skipped: this chat already has messages from ${seen}.`; return "recent"; }
    fillBox(box, S.copyText);
    S.attachWarn = false;
    if (S.file) S.attachWarn = !(await attachFile(box));
    return true;
  }

  // Put the chosen file into this chat's hidden LinkedIn file input (same as clicking the paperclip).
  async function attachFile(box) {
    const near = box.getRootNode();
    let inputs = (near.querySelectorAll ? [...near.querySelectorAll('input[type="file"]')] : []);
    if (!inputs.length) inputs = deepAll('input[type="file"]').filter((i) => !root.contains(i));
    const input = inputs[inputs.length - 1] || null;
    const dt = new DataTransfer();
    dt.items.add(S.file);
    if (input) {
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(700);
      return true;
    }
    // fallback: simulate dropping the file on the chat box (cannot be confirmed)
    try {
      const target = box.closest(".msg-form, form") || box;
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      await sleep(700);
    } catch (e) {}
    return false;
  }

  // Click LinkedIn's own Send button in the open chat (waits while a file is still uploading).
  async function sendCurrent() {
    const find = () => deepAll("button").filter((b) =>
      isVisible(b) && /^send$/i.test((b.innerText || "").trim()) && !b.closest("[class*='send-via']"));
    let btn = null;
    for (let i = 0; i < 50 && !btn; i++) {              // up to ~12s
      const b = find().pop();
      if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") btn = b; else await sleep(250);
    }
    if (!btn) return false;
    btn.click();
    await sleep(900);
    return true;
  }

  async function sendAndNext() {
    S.sendState = "sending"; renderAll();
    const ok = await sendCurrent();
    if (!ok) { S.sendState = "sendfail"; renderAll(); return; }
    markSent(S.queue[S.idx].key);
    advance();
  }

  async function skipRecent(p) {
    S.sendState = "recent"; renderAll();
    await sleep(2200);
    if (S.sending && S.queue[S.idx] === p) advance();
  }

  async function openCurrent() {
    const p = S.queue[S.idx];
    S.sendState = "opening";
    renderAll();
    const log = sentAgo(p.key);
    if (log) { S.recentNote = `Skipped: ${log.toLowerCase().replace("messaged", "you messaged them")}.`; return skipRecent(p); }
    const ok = await openMessage(p);
    if (ok === "recent") return skipRecent(p);
    S.sendState = ok ? "ready" : "failed";
    renderAll();
  }

  function startSend() {
    S.queue = selected();
    if (!S.queue.length) return;
    S.idx = 0; S.sending = true; S.finished = false;
    setSide("left");
    openCurrent();
  }

  function advance() {
    S.idx++;
    if (S.idx >= S.queue.length) {
      S.sending = false; S.finished = true; setSide("right");
      return renderAll();
    }
    openCurrent();
  }

  function stopSend() {
    S.sending = false; S.queue = []; S.idx = 0; setSide("right");
    renderAll();
  }

  renderAll();
})();
