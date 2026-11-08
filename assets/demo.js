/* Live demo deal — one booking that really moves through every stage, shared by the Buyer, Seller and Admin
   sites of the same option (state in localStorage). Pages opt in with:
     <main data-live-page="buyer-slot|buyer-deal|seller-deal">   whole page drawn from the state
     <div data-live-slot="buyer-inbox|seller-deals|admin-deals|admin-decisions|admin-audit|admin-funds">   one live block
   and window.NASHR_LIVE (written by _build/build.py) describes the deal: outlet, placement, currency, fee, VAT, bids.
   The product rules are the real ones: publisher accepts before anything is charged, buyers are never charged
   automatically, buyers never see the fee, money is held by Stripe through Nashr until the placement is verified. */
(function () {
  const C = window.NASHR_LIVE;
  if (!C) return;
  const AR = document.documentElement.lang === 'ar';
  const T = (en, ar) => (AR && ar ? ar : en);
  const KEY = 'nashr_design_demo_v1_' + C.option;
  // screenshot mode for _build/video.py: #shot hides the demo panel and saves nothing; #shot=awaiting|pay starts from that stage
  const SHOT = /^#shot\b/.test(location.hash) ? location.hash.split('=')[1] || '' : null;
  const ROLE = C.role;
  const LK = Object.assign({ slot: 'slot.html', buyerDeal: 'deal.html', sellerDeal: 'deal.html', market: 'market.html' }, C.links || {});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const money = n => `<span class="num">${C.cur} ${fmt(n)}</span>`;
  const round100 = n => Math.ceil(n / 100) * 100;
  const breakdown = amt => { const fee = Math.round(amt * C.fee), vat = Math.round(fee * C.vat); return { fee, vat, net: amt - fee - vat }; };

  /* ---------- clock: the demo starts on Sat 31 Oct 2026, 14:00; skip buttons move it forward ---------- */
  const BASE = new Date(2026, 9, 31, 14, 0).getTime(), H = 3600000;
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const day = t => { const d = new Date(t); return `${d.getDate()} ${(AR ? MON_AR : MON_EN)[d.getMonth()]}`; };
  const stamp = t => { const d = new Date(t); return `${day(t)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const WEEKEND = C.market === 'KSA' ? [5, 6] : [6, 0];
  const addWorkdays = (t, n) => { let d = new Date(t); while (n > 0) { d = new Date(d.getTime() + 24 * H); if (!WEEKEND.includes(d.getDay())) n--; } return d.getTime(); };

  /* ---------- state ---------- */
  const fresh = () => ({ stage: 'bidding', clock: 0, bids: C.bids.map(([who, amt]) => ({ who, amt })), mine: null, ceiling: null,
    closedAt: null, acceptedAt: null, paidAt: null, provedAt: null, releasedAt: null, io: null, payRef: null, card: 'saved', payFail: false, needAuth: false,
    creative: null, proof: null, dispute: null, outcome: null, events: [] });
  let S;
  try { S = (SHOT === null && JSON.parse(localStorage.getItem(KEY))) || fresh(); } catch (e) { S = fresh(); }
  const save = () => { if (SHOT !== null) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const now = () => BASE + S.clock * H;
  const log = (who, en, ar, ref) => S.events.unshift({ t: now(), who, en, ar, ref: ref || '' });
  const top = () => S.bids.reduce((a, b) => (b.amt > a.amt ? b : a), S.bids[0]);
  const minNext = () => round100(top().amt * 1.03);
  const amount = () => (S.mine ? S.mine : top().amt);
  const youLead = () => S.mine && top().who === 'you';

  const STAGE = {
    bidding: [T('Bidding', 'المزايدة'), 'info'], awaiting: [T('Publisher deciding', 'قرار الناشر'), 'info'], pay: [T('Pay now', 'ادفع الآن'), 'warn'],
    secured: [T('Secured', 'مضمون'), 'ok'], proof: [T('Proof review', 'مراجعة الإثبات'), 'warn'], released: [T('Released', 'تم الإفراج'), 'ok'],
    paid: [T('Paid out', 'تم التحويل'), 'dark'], disputed: [T('Disputed', 'نزاع'), 'bad'], refunded: [T('Refunded', 'مسترد'), 'bad'],
    declined: [T('Declined', 'مرفوض'), ''], lapsed: [T('Lapsed', 'انتهت المهلة'), ''], lost: [T('Lost', 'لم يفز'), ''], cancelled: [T('Cancelled', 'ملغى'), ''],
  };
  const stageIndex = { bidding: 0, awaiting: 1, pay: 2, secured: 3, proof: 4, disputed: 4, released: 6, paid: 6 };
  const chip = st => `<span class="chip ${STAGE[st][1]}">${STAGE[st][0]}</span>`;
  const stagesBar = () => {
    const names = [T('Bidding', 'المزايدة'), T('Publisher deciding', 'قرار الناشر'), T('Pay now', 'الدفع'), T('Secured', 'مضمون'), T('Proof review', 'الإثبات'), T('Released', 'الإفراج')];
    const at = stageIndex[S.stage] ?? -1;
    return `<ol class="stages">${names.map((n, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}">${n}</li>`).join('')}</ol>`;
  };
  const what = `${C.outlet} · ${C.place}`;
  const btn = (label, act, cls = '', extra = '') => `<button type="button" class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;
  const panel = (title, body, cls = '') => `<section class="panel ${cls}">${title ? `<div class="panel-h"><h2>${title}</h2></div>` : ''}<div class="panel-b">${body}</div></section>`;
  const head = (title, sub, crumb) => `<div class="page-head"><div class="t">${crumb ? `<span class="crumb">${crumb}</span>` : ''}<h1 class="page-title">${title}</h1><p class="page-sub">${sub}</p></div></div>`;
  const evText = e => e.kind === 'payout'
    ? (ROLE === 'buyer' ? T('Paid out to the publisher.', 'تم التحويل إلى الناشر.') : T(`Paid out ${C.cur} ${fmt(breakdown(e.amt).net)} to ${C.bank}.`, `حُوّل ${fmt(breakdown(e.amt).net)} ${C.cur} إلى ${C.bank}.`))
    : T(e.en, e.ar);
  const history = () => `<ul class="timeline">${S.events.length ? S.events.map(e => `<li><b>${stamp(e.t)} · ${esc(e.who)}</b>${esc(evText(e))}${e.ref ? ` <span class="num muted">${esc(e.ref)}</span>` : ''}</li>`).join('') : `<li>${T('Nothing yet.', 'لا شيء بعد.')}</li>`}</ul>`;
  const reviewBy = () => addWorkdays(S.provedAt || now(), 5);
  const payoutOn = () => addWorkdays(S.releasedAt || now(), 3);
  const B = T('Buyer', 'المشتري'), P = T('Publisher', 'الناشر'), A = T('Nashr admin', 'إدارة نشر'), SYS = T('System', 'النظام');

  /* ---------- actions ---------- */
  const ACT = {
    placeBid(el) {
      const box = document.getElementById('liveBid'), val = Math.round(Number(String(box && box.value).replace(/[^\d.]/g, '')));
      const ceil = document.getElementById('liveCeil'), on = document.getElementById('liveAuto');
      if (!val || val < minNext()) { flash(T(`Your bid must be at least ${C.cur} ${fmt(minNext())} (3% above the top bid).`, `يجب ألا يقل عرضك عن ${fmt(minNext())} ${C.cur} (أعلى بـ 3% من أعلى عرض).`)); return; }
      S.mine = val; S.ceiling = on && on.checked ? Math.max(val, Math.round(Number(String(ceil.value).replace(/[^\d.]/g, '')) || 0)) : null;
      S.bids = S.bids.filter(b => b.who !== 'you'); S.bids.push({ who: 'you', amt: val });
      log(C.buyer, `Bid ${C.cur} ${fmt(val)}${S.ceiling ? ` (auto-raise up to ${fmt(S.ceiling)})` : ''}`, `عرض ${fmt(val)} ${C.cur}${S.ceiling ? ` (رفع تلقائي حتى ${fmt(S.ceiling)})` : ''}`);
    },
    preset(el) { const box = document.getElementById('liveBid'); if (box) box.value = fmt(Number(el.dataset.v)); return 'noop'; },
    rival() {
      const r = round100(top().amt * 1.03), L = 'GHIJKLMNOP'[Math.max(0, S.bids.filter(b => b.who !== 'you').length - C.bids.length) % 10];
      S.bids = S.bids.filter(b => b.who !== T(`Bidder ${L}`, `المزايد ${L}`));
      S.bids.push({ who: T(`Bidder ${L}`, `المزايد ${L}`), amt: r }); log(T(`Bidder ${L}`, `المزايد ${L}`), `Bid ${C.cur} ${fmt(r)}`, `عرض ${fmt(r)} ${C.cur}`);
      if (S.ceiling && S.ceiling >= round100(r * 1.03)) {
        S.mine = round100(r * 1.03); S.bids = S.bids.filter(b => b.who !== 'you'); S.bids.push({ who: 'you', amt: S.mine });
        log(SYS, `Auto-raised your bid to ${C.cur} ${fmt(S.mine)}`, `رُفع عرضك تلقائياً إلى ${fmt(S.mine)} ${C.cur}`);
      }
    },
    close() {
      S.clock += 6; S.closedAt = now();
      if (youLead()) { S.stage = 'awaiting'; log(SYS, `Auction closed. ${C.buyer} won at ${C.cur} ${fmt(S.mine)}. ${C.outlet} has 24h to decide.`, `أُغلق المزاد. فاز ${C.buyer} بـ ${fmt(S.mine)} ${C.cur}. أمام ${C.outlet} 24 ساعة للقرار.`); }
      else { S.stage = 'lost'; log(SYS, `Auction closed. Won by another bidder at ${C.cur} ${fmt(top().amt)}.`, `أُغلق المزاد. فاز مزايد آخر بـ ${fmt(top().amt)} ${C.cur}.`); }
    },
    accept() {
      S.stage = 'pay'; S.clock += 3; S.acceptedAt = now(); S.io = `NSH-2026-000${C.ioSeq}`;
      log(C.publisher, `Accepted ${C.cur} ${fmt(S.mine)}. Insertion order created.`, `قبول ${fmt(S.mine)} ${C.cur}. أُنشئ أمر النشر.`, S.io);
    },
    decline() {
      const r = document.getElementById('liveReason'); S.stage = 'declined'; S.clock += 3;
      log(C.publisher, `Declined: ${r ? r.selectedOptions[0].text : 'no reason'}. The slot is offered to the next bidder.`, `رفض: ${r ? r.selectedOptions[0].text : ''}. عُرضت المساحة على المزايد التالي.`);
    },
    skip24() { S.clock += 24; S.stage = 'declined'; log(SYS, 'No answer within 24h, so the bid was treated as declined. Counts against the acceptance rate.', 'لم يرد الناشر خلال 24 ساعة فاعتُبر العرض مرفوضاً. يؤثر على نسبة القبول.'); },
    card(el) { S.card = el.value; S.payFail = false; S.needAuth = false; },
    pay() {
      if (S.card === 'decline') { S.payFail = true; S.clock += 1; log(SYS, 'Payment failed: the bank declined the card.', 'فشل الدفع: رفض البنك البطاقة.'); return; }
      if (S.card === 'auth' && !S.needAuth) { S.needAuth = true; return; }
      S.needAuth = false; S.payFail = false; S.stage = 'secured'; S.clock += 2; S.paidAt = now(); S.payRef = `PAY-2026-000${C.ioSeq}`;
      log(C.buyer, `Payment secured: ${C.cur} ${fmt(S.mine)}, held by Stripe through Nashr until the placement is verified.`, `تم ضمان الدفع: ${fmt(S.mine)} ${C.cur}، لدى Stripe عبر نشر حتى التحقق من النشر.`, S.payRef);
    },
    skip48() { S.clock += 48; S.stage = 'lapsed'; log(SYS, 'No payment within 48h. The deal lapsed and the runner-up is offered the slot for 48h.', 'لم يتم الدفع خلال 48 ساعة. انتهت الصفقة وعُرضت على المزايد التالي.'); },
    cancelUnpaid() { S.stage = 'cancelled'; log(C.buyer, 'Cancelled before paying. Nothing was charged.', 'أُلغي قبل الدفع. لم يُخصم شيء.'); },
    cancelPaid() {
      const free = now() - S.paidAt <= 24 * H, back = free ? S.mine : Math.round(S.mine * 0.85);
      S.stage = 'refunded'; S.outcome = { refund: back, keep: S.mine - back };
      log(C.buyer, free ? `Cancelled within 24h of paying. Full refund of ${C.cur} ${fmt(back)} initiated.` : `Cancelled. Refund of ${C.cur} ${fmt(back)}; the publisher keeps 15%.`,
          free ? `إلغاء خلال 24 ساعة من الدفع. استرداد كامل ${fmt(back)} ${C.cur}.` : `إلغاء. استرداد ${fmt(back)} ${C.cur}، ويحتفظ الناشر بـ 15%.`, S.payRef);
    },
    sendCreative() {
      const f = document.getElementById('liveFile'), name = (f && f.files[0] && f.files[0].name) || `northwind-${C.slug}-v${(S.creative ? S.creative.round : 0) + 1}.pdf`;
      const round = S.creative ? S.creative.round + (S.creative.status === 'changes' ? 1 : 0) : 1;
      S.creative = { file: name, status: 'sent', round, feedback: S.creative && S.creative.feedback }; S.clock += 4;
      log(C.buyer, `Creative sent: ${name} (round ${round} of 2)`, `أُرسل التصميم: ${name} (الجولة ${round} من 2)`);
    },
    approveCreative() { S.creative.status = 'approved'; S.clock += 5; log(C.publisher, 'Creative approved. Run it.', 'تمت الموافقة على التصميم. يمكن نشره.'); },
    changes() {
      const fb = (document.getElementById('liveFeedback') || {}).value || T('Please use the brand-approved logo lockup.', 'يرجى استخدام الشعار المعتمد.');
      if (S.creative.round >= 2) { S.stage = 'disputed'; S.dispute = { by: 'publisher', reason: fb }; log(C.publisher, `Creative still not right after 2 rounds. Sent to Nashr: ${fb}`, `التصميم غير مناسب بعد جولتين. أُحيل إلى نشر: ${fb}`); return; }
      S.creative.status = 'changes'; S.creative.feedback = fb; S.clock += 5; log(C.publisher, `Changes requested: ${fb}`, `طُلبت تعديلات: ${fb}`);
    },
    sendProof() {
      const f = document.getElementById('liveProofFile'), name = (f && f.files[0] && f.files[0].name) || `tearsheet-${C.slug}.pdf`;
      const note = (document.getElementById('liveProofNote') || {}).value || '';
      S.proof = { file: name, note }; S.stage = 'proof';
      S.clock = C.runEnd ? Math.max(S.clock + 4, (new Date(C.runEnd).getTime() - BASE) / H + 20) : S.clock + 24 * 8; S.provedAt = now();
      log(C.publisher, `Proof submitted: ${name}${note ? ` (“${note}”)` : ''}`, `رُفع الإثبات: ${name}`);
    },
    approveProof() { S.stage = 'released'; S.clock += 20; S.releasedAt = now(); log(C.buyer, `Approved the proof. ${C.cur} ${fmt(S.mine)} released to ${C.publisher}.`, `وافق على الإثبات. تم الإفراج عن ${fmt(S.mine)} ${C.cur} لـ ${C.publisher}.`, S.payRef); },
    raise() {
      const r = document.getElementById('liveIssue'), note = (document.getElementById('liveIssueNote') || {}).value || '';
      S.stage = 'disputed'; S.dispute = { by: 'buyer', reason: (r ? r.selectedOptions[0].text : '') + (note ? `: ${note}` : '') }; S.clock += 20;
      log(C.buyer, `Raised an issue: ${S.dispute.reason}`, `فتح نزاعاً: ${S.dispute.reason}`, S.io);
    },
    skip5() { S.clock = Math.max(S.clock, (reviewBy() - BASE) / H + 1); S.stage = 'released'; S.releasedAt = now(); log(SYS, 'Review window ended (5 working days). Released automatically.', 'انتهت مهلة المراجعة (5 أيام عمل). تم الإفراج تلقائياً.', S.payRef); },
    skip3() { S.clock = Math.max(S.clock, (payoutOn() - BASE) / H + 1); S.stage = 'paid'; S.events.unshift({ t: now(), who: 'Stripe', kind: 'payout', amt: S.outcome && S.outcome.partial ? S.outcome.keep : S.mine }); },
    resolve(el) {
      const how = el.dataset.how; S.clock += 30;
      if (how === 'release') { S.stage = 'released'; S.releasedAt = now(); log(A, 'Dispute settled: released to the publisher.', 'حُسم النزاع: الإفراج للناشر.', S.io); }
      if (how === 'refund') { S.stage = 'refunded'; S.outcome = { refund: S.mine, keep: 0 }; log(A, `Dispute settled: full refund of ${C.cur} ${fmt(S.mine)}.`, `حُسم النزاع: استرداد كامل ${fmt(S.mine)} ${C.cur}.`, S.io); }
      if (how === 'partial') { const back = Math.round(S.mine / 2); S.stage = 'refunded'; S.outcome = { refund: back, keep: S.mine - back, partial: true }; log(A, `Dispute settled: partial refund of ${C.cur} ${fmt(back)}; the rest goes to the publisher.`, `حُسم النزاع: استرداد جزئي ${fmt(back)} ${C.cur} والباقي للناشر.`, S.io); }
      if (how === 'makegood') { S.stage = 'secured'; S.creative = Object.assign({}, S.creative || { file: 'creative.pdf', round: 1 }, { status: 'approved' }); S.proof = null; S.dispute = null; log(A, 'Dispute settled: make-good. The publisher reruns the ad and sends new proof.', 'حُسم النزاع: إعادة النشر وإرسال إثبات جديد.', S.io); }
    },
    reset() { S = fresh(); },
    toggle() { document.getElementById('liveBar').classList.toggle('min'); return 'noop'; },
  };
  function flash(msg) { const f = document.getElementById('liveFlash'); if (f) { f.textContent = msg; f.hidden = false; } }
  if (SHOT === 'awaiting' || SHOT === 'pay') {
    S.mine = minNext(); S.bids.push({ who: 'you', amt: S.mine }); log(C.buyer, `Bid ${C.cur} ${fmt(S.mine)}`, `عرض ${fmt(S.mine)} ${C.cur}`);
    ACT.close();
    if (SHOT === 'pay') ACT.accept();
  }

  /* ---------- buyer: slot page ---------- */
  function buyerSlot() {
    const t = top(), lead = youLead();
    const rows = S.bids.slice().sort((a, b) => b.amt - a.amt).map((b, i) => `<tr><td>${b.who === 'you' ? `<b>${T('You', 'أنت')}</b>` : esc(b.who)} ${i === 0 ? `<span class="chip ${b.who === 'you' ? 'ok' : 'dark'}">${T('top', 'الأعلى')}</span>` : ''}</td><td class="r num">${fmt(b.amt)}</td></tr>`).join('');
    let form;
    if (S.stage !== 'bidding') {
      form = `<div class="callout"><b>${T('Bidding has closed.', 'أُغلق المزاد.')}</b>${chip(S.stage)}</div><a class="btn primary block" href="${LK.buyerDeal}">${T('Open the deal room', 'افتح غرفة الصفقة')}</a>`;
    } else {
      const m = minNext();
      form = `${lead ? `<div class="callout" style="background:var(--ok-bg)"><b style="color:var(--ok)">${T(`You're the top bid at ${C.cur} ${fmt(S.mine)}`, `عرضك هو الأعلى: ${fmt(S.mine)} ${C.cur}`)}</b>${S.ceiling ? `<span class="small">${T(`Auto-raise is on, up to ${fmt(S.ceiling)}.`, `الرفع التلقائي مفعّل حتى ${fmt(S.ceiling)}.`)}</span>` : ''}</div>`
        : S.mine ? `<div class="callout" style="background:var(--bad-bg)"><b style="color:var(--bad)">${T(`You were outbid. The top bid is ${C.cur} ${fmt(t.amt)}.`, `تم تجاوز عرضك. الأعلى الآن ${fmt(t.amt)} ${C.cur}.`)}</b></div>` : ''}
        <p class="note" id="liveFlash" hidden style="color:var(--bad);font-weight:600"></p>
        <label class="field">${T(`Your bid · ${C.cur}, VAT included · at least ${fmt(m)}`, `عرضك · ${C.cur} شامل الضريبة · ${fmt(m)} على الأقل`)}<input id="liveBid" class="num" dir="ltr" value="${fmt(m)}"></label>
        <div class="pills">${[1.03, 1.05, 1.1].map(f => `<button type="button" data-act="preset" data-v="${round100(t.amt * f)}">+${Math.round((f - 1) * 100)}% · ${fmt(round100(t.amt * f))}</button>`).join('')}</div>
        <label class="check"><input id="liveAuto" type="checkbox"> ${T('Raise automatically up to', 'ارفع تلقائياً حتى')} <input id="liveCeil" class="num" dir="ltr" value="${fmt(C.ceiling || round100(t.amt * 1.12))}" style="width:110px;font:inherit;border:1px solid var(--line-2);border-radius:6px;padding:4px 6px"></label>
        <div class="callout"><span class="eyebrow">${C.campaign ? T(`Advertiser · from ${C.campaign}`, `المعلن · من ${C.campaign}`) : T('Advertiser · from your campaign', 'المعلن · من حملتك')}</span><b>${esc(C.buyer)} · ${T('Financial services', 'خدمات مالية')}</b><span class="small muted">${T(`The full brief and creative are asked for after ${C.outlet} accepts.`, `يُطلب الملخص الكامل والتصميم بعد قبول ${C.outlet}.`)}</span></div>
        ${btn(lead ? T('Raise my bid', 'ارفع عرضي') : T('Place bid', 'قدّم العرض'), 'placeBid', 'primary lg block')}
        <p class="note">${T('Bids are binding, but nothing is charged when you bid or win.', 'العروض ملزمة، لكن لا يُخصم شيء عند تقديم العرض أو الفوز.')}</p>
        <div class="callout"><span class="eyebrow">${T('Demo controls', 'أدوات العرض التجريبي')}</span><div class="btns">${btn(T('A rival bids', 'مزايد آخر يرفع'), 'rival', 'sm')}${S.mine ? btn(T('Close the auction now', 'أغلق المزاد الآن'), 'close', 'sm') : ''}</div></div>`;
    }
    return head(what, `${C.week} · ${S.bids.length} ${T('bidders', 'مزايدين')} · ${T('top bid', 'أعلى عرض')} ${C.cur} ${fmt(t.amt)}`, `<a href="${LK.market}">${T('Calendar', 'التقويم')}</a> / ${esc(C.outlet)}`)
      + `<div class="cols"><div class="main">${panel(T('About this slot', 'عن هذه المساحة'), `<dl class="kv"><dt>${T('Publisher', 'الناشر')}</dt><dd>${esc(C.publisher)}</dd><dt>${T('Runs', 'النشر')}</dt><dd>${esc(C.week)}</dd><dt>${T('Creative due', 'موعد التصميم')}</dt><dd>${esc(C.creativeDue)}</dd><dt>${T('Opening price', 'سعر الافتتاح')}</dt><dd>${money(C.opening)}</dd></dl>`)}
        <section class="panel"><div class="panel-h"><h2>${T('Bids so far', 'العروض حتى الآن')}</h2><span class="r">${T('Bidders stay anonymous', 'هوية المزايدين مخفية')}</span></div><div class="scroll"><table class="tbl" style="min-width:0"><thead><tr><th>${T('Bidder', 'المزايد')}</th><th class="r">${C.cur}</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>
        <div class="side">${panel(T('Your bid', 'عرضك'), form)}${panel(T('History', 'السجل'), history())}</div></div>`;
  }

  /* ---------- buyer: deal room ---------- */
  function buyerDeal() {
    let main;
    const st = S.stage;
    if (st === 'bidding') main = panel(T('No deal yet', 'لا توجد صفقة بعد'), `<p>${T("You haven't won this slot yet.", 'لم تفز بهذه المساحة بعد.')}</p><a class="btn primary" href="${LK.slot}">${T('Go to the slot and bid', 'اذهب إلى المساحة وقدّم عرضاً')}</a>`);
    else if (st === 'awaiting') main = panel(T('Waiting for the publisher', 'بانتظار الناشر'), `<p>${T(`You won at ${C.cur} ${fmt(S.mine)}. ${C.outlet} has 24 hours to accept. Nothing is charged until you confirm payment.`, `فزت بـ ${fmt(S.mine)} ${C.cur}. أمام ${C.outlet} 24 ساعة للقبول. لا يُخصم شيء قبل تأكيدك.`)}</p>`, 'hot');
    else if (st === 'pay') {
      const opt = (v, en, ar) => `<label class="check"><input type="radio" name="card" value="${v}" data-act="card" ${S.card === v ? 'checked' : ''}> ${T(en, ar)}</label>`;
      main = panel(T('Next step · confirm payment', 'الخطوة التالية · تأكيد الدفع'), `
        <span class="muted">${T(`${C.outlet} accepted your bid on ${stamp(S.acceptedAt)}.`, `قبلت ${C.outlet} عرضك في ${stamp(S.acceptedAt)}.`)}</span>
        <span class="big">${C.cur} ${fmt(S.mine)}</span><span class="muted small">${T('VAT included', 'شامل الضريبة')}</span>
        ${S.payFail ? `<div class="callout" style="background:var(--bad-bg)"><b style="color:var(--bad)">${T(`Payment failed: the bank declined the card. Update your card by ${stamp(S.acceptedAt + 48 * H)}.`, `فشل الدفع: رفض البنك البطاقة. حدّث بطاقتك قبل ${stamp(S.acceptedAt + 48 * H)}.`)}</b></div>` : ''}
        ${S.needAuth ? `<div class="callout" style="background:var(--warn-bg)"><b>${T('Authenticate with your bank', 'المصادقة مع البنك')}</b><span class="small">${T('Your bank asks you to approve this payment (3-D Secure).', 'يطلب بنكك الموافقة على هذه العملية (3-D Secure).')}</span>${btn(T('Approve in my banking app', 'الموافقة في تطبيق البنك'), 'pay', 'primary')}</div>` : ''}
        <fieldset style="border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 12px;display:flex;flex-direction:column;gap:6px"><legend class="small muted">${T('Pay with', 'الدفع بـ')}</legend>
          ${opt('saved', 'Saved card · Corporate Visa •••• 5310', 'البطاقة المحفوظة · فيزا •••• 5310')}${opt('decline', 'Test card 4000 0000 0000 0002 (will be declined)', 'بطاقة تجريبية 4000 0000 0000 0002 (ستُرفض)')}${opt('auth', 'Test card 4000 0025 0000 3155 (bank asks to authenticate)', 'بطاقة تجريبية 4000 0025 0000 3155 (تطلب مصادقة)')}</fieldset>
        ${S.needAuth ? '' : btn(T(`Confirm payment · ${C.cur} ${fmt(S.mine)}`, `تأكيد الدفع · ${fmt(S.mine)} ${C.cur}`), 'pay', 'primary lg block')}
        <p class="note" style="color:var(--warn);font-weight:600">${T(`Pay by ${stamp(S.acceptedAt + 48 * H)}. After that the slot goes to the next bidder.`, `ادفع قبل ${stamp(S.acceptedAt + 48 * H)}. بعدها تُعرض المساحة على المزايد التالي.`)}</p>
        <p class="note">${T('Held by Stripe through Nashr until the placement is verified. Nashr never holds your funds.', 'يحتفظ Stripe بالمبلغ عبر نشر حتى التحقق من النشر. نشر لا تحتفظ بأموالك أبداً.')}</p>
        <div class="btns">${btn(T('Cancel (nothing is charged)', 'إلغاء (لا يُخصم شيء)'), 'cancelUnpaid', 'danger sm')}</div>`, 'hot');
    } else if (st === 'secured') {
      const c = S.creative;
      let body;
      if (!c || c.status === 'changes') body = `${c ? `<div class="callout" style="background:var(--warn-bg)"><b>${T('The publisher asked for changes', 'طلب الناشر تعديلات')}</b><span class="small">“${esc(c.feedback)}”</span></div>` : ''}
        <p>${T(`Payment secured. Send your creative by ${C.creativeDue}.`, `الدفع مضمون. أرسل التصميم قبل ${C.creativeDue}.`)} ${c ? T(`This is round ${c.round + 1} of 2.`, `هذه الجولة ${c.round + 1} من 2.`) : ''}</p>
        <div class="drop"><b>${T('Upload creative', 'رفع التصميم')}</b><input id="liveFile" type="file" accept=".pdf,.jpg,.png"><span class="small">${T('PDF, JPG or PNG. If you skip the file, a sample name is used.', 'PDF أو JPG أو PNG. إذا لم تختر ملفاً يُستخدم اسم تجريبي.')}</span></div>${btn(T('Send creative', 'إرسال التصميم'), 'sendCreative', 'primary lg')}`;
      else if (c.status === 'sent') body = `<p>${T(`${esc(c.file)} sent. Waiting for ${C.outlet} to review it (round ${c.round} of 2).`, `أُرسل ${esc(c.file)}. بانتظار مراجعة ${C.outlet} (الجولة ${c.round} من 2).`)}</p>`;
      else body = `<p><b>${T('Creative approved.', 'تمت الموافقة على التصميم.')}</b> ${T(`${C.outlet} will run it in ${C.week} and send proof within 3 days of the run.`, `ستنشره ${C.outlet} في ${C.week} وترسل الإثبات خلال 3 أيام من النشر.`)}</p>`;
      const free = now() - S.paidAt <= 24 * H;
      main = panel(T('Secured · creative and run', 'مضمون · التصميم والنشر'), body + `<div class="btns">${btn(free ? T('Cancel (free within 24h of paying)', 'إلغاء (مجاني خلال 24 ساعة من الدفع)') : T('Cancel (refund minus 15%)', 'إلغاء (استرداد ناقص 15%)'), 'cancelPaid', 'danger sm')}</div>`, 'hot');
    } else if (st === 'proof') main = panel(T('Next step · review the proof', 'الخطوة التالية · مراجعة الإثبات'), `
        <div style="display:flex;gap:14px;align-items:center"><span class="thumb" aria-hidden="true"></span><span><b>${esc(S.proof.file)}</b><br><span class="small muted">${esc(S.proof.note || T('Ran as booked.', 'نُشر كما هو محجوز.'))}</span></span></div>
        <b>${T(`Approve or raise an issue by ${day(reviewBy())}.`, `وافق أو افتح نزاعاً قبل ${day(reviewBy())}.`)}</b><span class="small muted">${T('If you do nothing, the payment releases to the publisher that day.', 'إذا لم تفعل شيئاً، يُفرج عن المبلغ للناشر في ذلك اليوم.')}</span>
        ${btn(T(`Approve and release · ${C.cur} ${fmt(S.mine)}`, `الموافقة والإفراج · ${fmt(S.mine)} ${C.cur}`), 'approveProof', 'primary lg block')}
        <details><summary class="btn">${T('Raise an issue', 'فتح نزاع')}</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <label class="field">${T('What went wrong?', 'ما المشكلة؟')}<select id="liveIssue"><option>${T('It did not run as booked', 'لم يُنشر كما هو محجوز')}</option><option>${T('Wrong position or size', 'موضع أو مقاس خاطئ')}</option><option>${T('Wrong creative was used', 'استُخدم تصميم خاطئ')}</option><option>${T('Other', 'أخرى')}</option></select></label>
          <label class="field">${T('Details', 'التفاصيل')}<textarea id="liveIssueNote" rows="2"></textarea></label>${btn(T('Send to Nashr', 'إرسال إلى نشر'), 'raise', 'danger')}</div></details>`, 'hot');
    else if (st === 'disputed') main = panel(T('Disputed · Nashr is reviewing', 'نزاع · نشر تراجع'), `<p>${esc(S.dispute.reason)}</p><p class="note">${T('Nashr aims to settle within 10 days, and always within 60 days of payment. The money stays held by Stripe until then.', 'تهدف نشر للحسم خلال 10 أيام، وخلال 60 يوماً من الدفع كحد أقصى. يبقى المبلغ لدى Stripe حتى ذلك.')}</p><a class="btn" href="../admin/decisions.html">${T('See it as admin', 'اعرضه كمسؤول')}</a>`, 'hot');
    else if (st === 'released' || st === 'paid') main = panel(st === 'paid' ? T('Complete', 'مكتملة') : T('Released', 'تم الإفراج'), `<p>${T(`Payment released to ${C.publisher}${st === 'paid' ? ' and paid out.' : `. It reaches their bank by ${day(payoutOn())}.`}`, `تم الإفراج عن المبلغ لـ ${C.publisher}${st === 'paid' ? ' وتحويله.' : `، ويصل إلى بنكهم قبل ${day(payoutOn())}.`}`)}</p>${btn(T('Start the demo again', 'ابدأ العرض من جديد'), 'reset')}`);
    else if (st === 'refunded') main = panel(T('Refunded', 'مسترد'), `<p>${T(`Refund initiated: ${C.cur} ${fmt(S.outcome.refund)}. It arrives in 5–10 business days.`, `بدأ الاسترداد: ${fmt(S.outcome.refund)} ${C.cur}. يصل خلال 5–10 أيام عمل.`)}${S.outcome.keep ? T(` The publisher keeps ${C.cur} ${fmt(S.outcome.keep)}.`, ` يحتفظ الناشر بـ ${fmt(S.outcome.keep)} ${C.cur}.`) : ''}</p>${btn(T('Start the demo again', 'ابدأ العرض من جديد'), 'reset')}`);
    else main = panel(STAGE[st][0], `<p>${esc(T(S.events[0] ? S.events[0].en : '', S.events[0] ? S.events[0].ar : ''))}</p>${btn(T('Start the demo again', 'ابدأ العرض من جديد'), 'reset', 'primary')}`);
    const docs = `<dl class="kv"><dt>${T('Amount', 'المبلغ')}</dt><dd>${S.mine ? money(S.mine) : '—'}</dd><dt>${T('Insertion order', 'أمر النشر')}</dt><dd class="num">${S.io || '—'}</dd><dt>${T('Payment', 'الدفع')}</dt><dd class="num">${S.payRef || '—'}</dd><dt>${T('Status', 'الحالة')}</dt><dd>${chip(st)}</dd></dl>`;
    return head(what, `${C.week} · ${T('deal room', 'غرفة الصفقة')}`, `<a href="inbox.html">${T('Inbox', 'الوارد')}</a> / ${T('Deal', 'الصفقة')}`) + stagesBar()
      + `<div class="cols"><div class="main">${main}</div><div class="side">${panel(T('This deal', 'هذه الصفقة'), docs)}${panel(T('History', 'السجل'), history())}</div></div>`;
  }

  /* ---------- seller: deal room ---------- */
  function sellerDeal() {
    const st = S.stage, amt = amount(), b = breakdown(amt);
    let main;
    if (st === 'bidding') main = panel(T('Auction still open', 'المزاد ما زال مفتوحاً'), `<p>${T(`${S.bids.length} bids, top ${C.cur} ${fmt(top().amt)}. You decide when it closes.`, `${S.bids.length} عروض، الأعلى ${fmt(top().amt)} ${C.cur}. تقرر عند الإغلاق.`)}</p><a class="btn" href="../buyer/${LK.slot}">${T('Bid as the buyer', 'قدّم عرضاً كمشترٍ')}</a>${S.mine ? btn(T('Close the auction now', 'أغلق المزاد الآن'), 'close') : ''}`);
    else if (st === 'awaiting') {
      const left = Math.max(0, 24 - (now() - S.closedAt) / H);
      main = panel(T('Your decision', 'قرارك'), `<span class="big">${left >= 24 ? `${Math.floor(left / 24)}d ${Math.floor(left % 24)}h` : left >= 1 ? `${Math.floor(left)}h ${String(Math.floor((left % 1) * 60)).padStart(2, '0')}m` : `${Math.round(left * 60)}m`}</span><span class="small muted">${T('left to accept or decline. No answer counts against your acceptance rate.', 'متبقٍ للقبول أو الرفض. عدم الرد يؤثر على نسبة القبول.')}</span>
        <p><b>${esc(C.buyer)}</b> · ${T('Financial services', 'خدمات مالية')} ${T('won', 'فاز')} ${money(amt)}</p>
        <div class="btns">${btn(T(`Accept · you receive ${C.cur} ${fmt(b.net)}`, `قبول · يصلك ${fmt(b.net)} ${C.cur}`), 'accept', 'primary lg')}</div>
        <details><summary class="btn">${T('Decline', 'رفض')}</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px"><label class="field">${T('Reason (required)', 'السبب (مطلوب)')}<select id="liveReason"><option>${T('Brand conflict', 'تعارض مع علامة تجارية')}</option><option>${T('Advertiser category conflict', 'تعارض فئة المعلن')}</option><option>${T('Slot unavailable', 'المساحة غير متاحة')}</option><option>${T('Price too low', 'السعر منخفض')}</option><option>${T('Other', 'أخرى')}</option></select></label>${btn(T('Decline and offer to the next bidder', 'رفض وعرضها على المزايد التالي'), 'decline', 'danger')}</div></details>`, 'hot');
    } else if (st === 'pay') main = panel(T('Accepted · waiting for buyer payment', 'مقبول · بانتظار دفع المشتري'), `<p>${T(`The buyer has until ${stamp(S.acceptedAt + 48 * H)} to pay. <b>Don't run the ad yet.</b>`, `أمام المشتري حتى ${stamp(S.acceptedAt + 48 * H)} للدفع. <b>لا تنشر بعد.</b>`)}</p>${S.payFail ? `<p class="chip warn">${T('Buyer payment pending (card issue)', 'دفع المشتري معلق (مشكلة في البطاقة)')}</p>` : ''}<p class="small muted">${T('Insertion order', 'أمر النشر')} <span class="num">${S.io}</span></p>`);
    else if (st === 'secured') {
      const c = S.creative;
      if (!c) main = panel(T('Payment secured · waiting for creative', 'الدفع مضمون · بانتظار التصميم'), `<p>${T(`The buyer sends creative by ${C.creativeDue}. Don't run anything yet.`, `يرسل المشتري التصميم قبل ${C.creativeDue}. لا تنشر شيئاً بعد.`)}</p>`);
      else if (c.status === 'sent') main = panel(T('Payment secured · review the creative', 'الدفع مضمون · راجع التصميم'), `<div style="display:flex;gap:14px;align-items:center"><span class="thumb" aria-hidden="true"></span><span><b>${esc(c.file)}</b><br><span class="small muted">${T(`Round ${c.round} of 2`, `الجولة ${c.round} من 2`)}</span></span></div>
        <div class="btns">${btn(T('Approve creative', 'الموافقة على التصميم'), 'approveCreative', 'primary lg')}</div>
        <details><summary class="btn">${T('Ask for changes', 'طلب تعديلات')}</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px"><label class="field">${T('What should change?', 'ما المطلوب تعديله؟')}<textarea id="liveFeedback" rows="2">${T('Please use the brand-approved logo lockup.', 'يرجى استخدام الشعار المعتمد.')}</textarea></label>${btn(c.round >= 2 ? T('Send to Nashr (2 rounds used)', 'إحالة إلى نشر (استُخدمت جولتان)') : T('Send feedback', 'إرسال الملاحظات'), 'changes', '')}</div></details>`, 'hot');
      else if (c.status === 'changes') main = panel(T("Waiting for the buyer's revised creative", 'بانتظار التصميم المعدّل من المشتري'), `<p>“${esc(c.feedback)}”</p>`);
      else main = panel(T('Creative approved · run it', 'تمت الموافقة على التصميم · انشره'), `<p>${T(`Run it in ${C.week}, then upload proof within 3 days of the run.`, `انشره في ${C.week}، ثم ارفع الإثبات خلال 3 أيام من النشر.`)}</p>
        <div class="drop"><b>${T('Upload proof (tearsheet, screenshot or airing log)', 'رفع الإثبات (صفحة مطبوعة أو لقطة أو سجل بث)')}</b><input id="liveProofFile" type="file"></div>
        <label class="field">${T('Note for the buyer', 'ملاحظة للمشتري')}<input id="liveProofNote" value="${T('Ran on page 5, news section, as booked.', 'نُشر في الصفحة 5، قسم الأخبار، كما هو محجوز.')}"></label>${btn(T('Submit proof', 'إرسال الإثبات'), 'sendProof', 'primary lg')}`, 'hot');
    } else if (st === 'proof') main = panel(T('Proof sent · waiting for buyer approval', 'أُرسل الإثبات · بانتظار موافقة المشتري'), `<p>${T(`The buyer has until ${day(reviewBy())} (5 working days). If they do nothing, the payment releases automatically.`, `أمام المشتري حتى ${day(reviewBy())} (5 أيام عمل). إذا لم يفعل شيئاً يُفرج عن المبلغ تلقائياً.`)}</p>`);
    else if (st === 'released') main = panel(T('Released · payout scheduled', 'تم الإفراج · التحويل مجدول'), `<p>${T(`${C.cur} ${fmt(b.net)} reaches ${C.bank} by ${day(payoutOn())}.`, `يصل ${fmt(b.net)} ${C.cur} إلى ${C.bank} قبل ${day(payoutOn())}.`)}</p>`);
    else if (st === 'paid') main = panel(T('Paid out', 'تم التحويل'), `<p>${T(`${C.cur} ${fmt(b.net)} paid to ${C.bank}.`, `حُوّل ${fmt(b.net)} ${C.cur} إلى ${C.bank}.`)}</p>`);
    else if (st === 'disputed') main = panel(T('Disputed · Nashr is reviewing', 'نزاع · نشر تراجع'), `<p>${esc(S.dispute.reason)}</p><p class="note">${T('You can add your side in messages. Nashr may release, refund in part or in full, or ask for a make-good.', 'يمكنك إضافة روايتك في الرسائل. قد تفرج نشر عن المبلغ أو تسترده جزئياً أو كلياً أو تطلب إعادة النشر.')}</p>`, 'hot');
    else main = panel(STAGE[st][0], `<p>${esc(T(S.events[0] ? S.events[0].en : '', S.events[0] ? S.events[0].ar : ''))}</p>${btn(T('Start the demo again', 'ابدأ العرض من جديد'), 'reset')}`);
    const sold = ['pay', 'secured', 'proof', 'released', 'paid', 'disputed', 'refunded'].includes(st);
    const m = `<dl class="money"><dt>${sold ? T('Sale', 'البيع') : T('Top bid', 'أعلى عرض')}</dt><dd>${fmt(amt)}</dd><dt>${T('Nashr fee', 'رسوم نشر')} ${Math.round(C.fee * 100)}%</dt><dd>− ${fmt(b.fee)}</dd><dt>${T('VAT on fee', 'ضريبة على الرسوم')} ${Math.round(C.vat * 100)}%</dt><dd>− ${fmt(b.vat)}</dd><dt class="tot">${sold ? T('You receive', 'يصلك') : T('You would receive', 'سيصلك')}</dt><dd class="tot">${C.cur} ${fmt(b.net)}</dd></dl>`;
    return head(`${esc(C.buyer)} · ${what}`, `${C.week} · ${T('deal room', 'غرفة الصفقة')} · ${chip(st)}`, `<a href="deals.html">${T('Deals', 'الصفقات')}</a> / ${T('Deal', 'الصفقة')}`) + stagesBar()
      + `<div class="cols"><div class="main">${main}</div><div class="side">${panel(T('Money', 'المال'), m)}${panel(T('History', 'السجل'), history())}</div></div>`;
  }

  /* ---------- live blocks on list pages ---------- */
  const NEXT = () => ({
    bidding: S.mine ? (youLead() ? [T("You're the top bid", 'عرضك هو الأعلى'), B, `../buyer/${LK.slot}`] : [T('You were outbid · raise your bid', 'تم تجاوزك · ارفع عرضك'), B, `../buyer/${LK.slot}`]) : [T('Place a bid on the slot', 'قدّم عرضاً على المساحة'), B, `../buyer/${LK.slot}`],
    awaiting: [T('Accept or decline within 24h', 'اقبل أو ارفض خلال 24 ساعة'), P, `../seller/${LK.sellerDeal}`],
    pay: [T('Confirm payment within 48h', 'أكّد الدفع خلال 48 ساعة'), B, `../buyer/${LK.buyerDeal}`],
    secured: !S.creative || S.creative.status === 'changes' ? [T('Upload the creative', 'ارفع التصميم'), B, `../buyer/${LK.buyerDeal}`] : S.creative.status === 'sent' ? [T('Review the creative', 'راجع التصميم'), P, `../seller/${LK.sellerDeal}`] : [T('Run the ad and upload proof', 'انشر الإعلان وارفع الإثبات'), P, `../seller/${LK.sellerDeal}`],
    proof: [T(`Approve the proof by ${day(reviewBy())}`, `وافق على الإثبات قبل ${day(reviewBy())}`), B, `../buyer/${LK.buyerDeal}`],
    disputed: [T('Settle the dispute', 'احسم النزاع'), A, '../admin/decisions.html'],
    released: [T(`Payout by ${day(payoutOn())}`, `التحويل قبل ${day(payoutOn())}`), 'Stripe', '../admin/funds.html'],
  }[S.stage] || [T('Finished · reset to start again', 'انتهى · أعد البدء'), '—', `../buyer/${LK.slot}`]);
  const liveRow = () => { const [txt, who, href] = NEXT(); return `<div class="row"><span class="grow"><span class="eyebrow warn">${T('Live demo deal', 'صفقة العرض الحي')} · ${chip(S.stage)}</span><b>${esc(C.buyer)} · ${what}</b><span class="small muted">${C.week} · ${S.mine ? money(S.mine) : T('no bid yet', 'لا عرض بعد')} · ${T('next', 'التالي')}: ${esc(who)}: ${txt}</span></span><a class="btn sm" href="${href}">${T('Open', 'فتح')}</a></div>`; };
  const BLOCK = {
    'buyer-inbox': () => `<section class="panel hot"><div class="rows">${liveRow()}</div></section>`,
    'seller-deals': () => `<section class="panel hot"><div class="rows">${liveRow()}</div></section>`,
    'admin-deals': () => `<section class="panel hot"><div class="rows">${liveRow()}</div></section>`,
    'admin-decisions': () => S.stage === 'disputed'
      ? `<section class="panel hot"><div class="panel-h"><h2>${T('Live dispute', 'نزاع حي')}</h2></div><div class="panel-b"><span><span class="chip bad">${T('Dispute', 'نزاع')}</span> <b>${esc(C.buyer)} ${T('vs', 'ضد')} ${esc(C.outlet)}</b> ${money(S.mine)}</span><p>${esc(S.dispute.reason)} <span class="muted small">(${T('raised by the', 'فتحه')} ${S.dispute.by === 'buyer' ? B : P})</span></p>${S.proof ? `<p class="small muted">${T('Proof', 'الإثبات')}: ${esc(S.proof.file)} · ${esc(S.proof.note)}</p>` : ''}<div class="btns">${btn(T('Release to publisher', 'الإفراج للناشر'), 'resolve', '', 'data-how="release"')}${btn(T('Full refund', 'استرداد كامل'), 'resolve', '', 'data-how="refund"')}${btn(T('Partial refund (50%)', 'استرداد جزئي (50%)'), 'resolve', '', 'data-how="partial"')}${btn(T('Agree a make-good', 'إعادة النشر'), 'resolve', '', 'data-how="makegood"')}</div></div></section>`
      : `<section class="panel"><div class="rows">${liveRow()}</div><div class="panel-b"><p class="note">${T("No live dispute. To try one: take the demo deal to the proof stage, then choose “Raise an issue” in the buyer's deal room.", 'لا يوجد نزاع حي. لتجربته: أوصل صفقة العرض إلى مرحلة الإثبات ثم اختر "فتح نزاع" في غرفة صفقة المشتري.')}</p></div></section>`,
    'admin-audit': () => `<section class="panel hot"><div class="panel-h"><h2>${T('Live demo deal · events', 'صفقة العرض الحي · الأحداث')}</h2></div><div class="panel-b">${history()}</div></section>`,
    'admin-funds': () => { const bucket = { secured: T('Secured', 'مضمون'), proof: T('In buyer review', 'قيد المراجعة'), disputed: T('Secured (disputed)', 'مضمون (نزاع)'), released: T('Released, awaiting payout', 'تم الإفراج بانتظار التحويل'), paid: T('Paid out', 'تم التحويل'), refunded: T('Refunded', 'مسترد') }[S.stage];
      const where = S.stage === 'refunded' && S.outcome && S.outcome.keep
        ? T(`Split: ${C.cur} ${fmt(S.outcome.refund)} refunded to the buyer, ${C.cur} ${fmt(S.outcome.keep)} to the publisher`, `مقسّم: ${fmt(S.outcome.refund)} ${C.cur} للمشتري و${fmt(S.outcome.keep)} ${C.cur} للناشر`)
        : bucket ? T(`Its money is in: ${bucket}`, `أمواله في: ${bucket}`) : T('Not paid yet, so no money is held.', 'لم يُدفع بعد، فلا أموال محتجزة.');
      return `<section class="panel hot"><div class="rows"><div class="row"><span class="grow"><span class="eyebrow warn">${T('Live demo deal', 'صفقة العرض الحي')}</span><b>${esc(C.buyer)} · ${what}</b><span class="small muted">${where}</span></span>${S.mine ? money(S.mine) : ''}</div></div></section>`; },
  };

  /* ---------- the floating demo bar ---------- */
  function bar() {
    const [txt, who, href] = NEXT();
    const skip = { awaiting: ['skip24', T('Skip 24h (publisher silent)', 'تخطَّ 24 ساعة')], pay: ['skip48', T('Skip 48h (buyer silent)', 'تخطَّ 48 ساعة')], proof: ['skip5', T('Skip 5 working days', 'تخطَّ 5 أيام عمل')], released: ['skip3', T('Skip 3 business days', 'تخطَّ 3 أيام عمل')] }[S.stage];
    const close = S.stage === 'bidding' && S.mine ? btn(T('Close the auction', 'أغلق المزاد'), 'close', 'sm') : '';
    return `<div class="lb-h"><b>${T('Live demo deal', 'صفقة العرض الحي')}</b> ${chip(S.stage)}<button type="button" class="lb-x" data-act="toggle" aria-label="${T('Minimise', 'تصغير')}">–</button></div>
      <div class="lb-b"><span class="small">${esc(C.outlet)} · ${esc(C.place)} · ${esc(C.week)}</span>
      <span>${T('Next', 'التالي')}: <b>${esc(who)}</b>: ${txt}</span>
      <div class="btns"><a class="btn sm" href="${href}">${T('Go there', 'اذهب')}</a>${close}${skip ? btn(skip[1], skip[0], 'sm') : ''}${btn(T('Reset', 'إعادة'), 'reset', 'sm')}</div>
      <span class="small muted">${T('Demo clock', 'ساعة العرض')}: ${stamp(now())}</span></div>`;
  }
  const CSS = `#liveBar{position:fixed;inset-inline-start:14px;bottom:70px;z-index:998;width:320px;max-width:calc(100% - 28px);background:#fff;color:#111;border:1px solid #ccc;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font-family:system-ui,sans-serif;font-size:13px}
    #liveBar .lb-h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eee}#liveBar .lb-x{margin-inline-start:auto;border:none;background:#f0f0f0;border-radius:6px;width:28px;height:24px;cursor:pointer;font-size:16px}
    #liveBar .lb-b{padding:10px 12px;display:flex;flex-direction:column;gap:8px}#liveBar.min .lb-b{display:none}#liveBar .chip{display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;border-radius:999px;padding:1px 8px;background:#eee;color:#333}
    #liveBar .btns{display:flex;flex-wrap:wrap;gap:6px}#liveBar .btn{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#111;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
    #liveBar .btn.primary{background:#111;color:#fff;border-color:#111}#liveBar .small{font-size:12px}#liveBar .muted{color:#666}`;

  /* ---------- render + events ---------- */
  function render() {
    const page = document.querySelector('[data-live-page]');
    if (page) page.innerHTML = { 'buyer-slot': buyerSlot, 'buyer-deal': buyerDeal, 'seller-deal': sellerDeal }[page.dataset.livePage]();
    document.querySelectorAll('[data-live-slot]').forEach(el => { const f = BLOCK[el.dataset.liveSlot]; if (f) el.innerHTML = f(); });
    if (SHOT !== null || C.bar === false) return;   // bar: false (option G) turns the floating box off; the pages still run the deal
    let b = document.getElementById('liveBar');
    if (!b) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); b = document.createElement('aside'); b.id = 'liveBar'; b.setAttribute('aria-label', 'Live demo deal'); document.body.appendChild(b); if (window.innerWidth < 700) b.classList.add('min'); }
    const min = b.classList.contains('min'); b.innerHTML = bar(); if (min) b.classList.add('min');
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const r = ACT[el.dataset.act] && ACT[el.dataset.act](el);
    if (r === 'noop') return;
    save(); render();
  });
  document.addEventListener('change', e => { const el = e.target; if (el.matches('input[data-act="card"]')) { ACT.card(el); save(); render(); } });
  window.addEventListener('storage', ev => { if (ev.key === KEY) { try { S = JSON.parse(ev.newValue) || fresh(); } catch (x) { S = fresh(); } render(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
