// واجهة تداوي — JavaScript / ES6
(() => {
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');
  const $lb = document.getElementById('lightbox');

  let subs = [];
  let routeToken = 0;
  let adminTab = 'overview';
  let flash = ''; // رسالة تظهر في شاشة الدخول

  const track = u => { subs.push(u); return u; };
  const cleanup = () => { subs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); subs = []; };

  // ---------- أدوات ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = ts => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = ts => new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
  const fmtDate = ts => new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
  const money = n => `${Number(n || 0).toLocaleString('ar-EG')} ${APP_CONFIG.currency}`;
  const dept = k => APP_CONFIG.departments[k] || { name: '-', icon: '🩺', desc: '' };
  const go = h => { if (location.hash === h) route(); else location.hash = h; };

  const toast = msg => {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
  };

  const avatar = (u, size = '') => u && u.photo
    ? `<img class="avatar ${size}" src="${esc(u.photo)}" alt="">`
    : `<span class="avatar ph ${size}">${esc((u?.name || '?').replace('د. ', '').trim().charAt(0))}</span>`;

  const withBusy = async (btn, fn) => {
    if (btn) btn.disabled = true;
    try { await fn(); }
    catch (e) { toast(e.message || 'حصلت مشكلة، حاول تاني.'); }
    finally { if (btn) btn.disabled = false; }
  };

  const resizeImage = (file, max = 256, q = 0.85) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r);
        cv.height = Math.round(img.height * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', q));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // معاينة الصور بحجم كبير
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-zoom]');
    if (t) { $lb.querySelector('img').src = t.getAttribute('data-zoom'); $lb.hidden = false; }
    else if (e.target.closest('#lightbox')) $lb.hidden = true;
  });

  // ---------- حالات ----------
  const PAY = {
    pending_payment: ['قيد مراجعة الدفع', 'warn'],
    open: ['مفتوحة', 'ok'],
    closed: ['منتهية', 'off'],
    rejected: ['الدفع مرفوض', 'bad']
  };
  const DOC_STATUS = {
    pending: ['قيد المراجعة', 'warn'], approved: ['معتمد', 'ok'],
    rejected: ['مرفوض', 'bad'], suspended: ['موقوف', 'bad'], active: ['نشط', 'ok']
  };
  const badge = (map, k) => { const [t, c] = map[k] || [k, 'off']; return `<span class="badge ${c}">${t}</span>`; };

  // ---------- الهيكل ----------
  const shell = (me, body, active) => {
    const nav = me.role === 'admin'
      ? `<a href="#/admin" class="${active === 'admin' ? 'on' : ''}">لوحة التحكم</a>`
      : `<a href="#/home" class="${active === 'home' ? 'on' : ''}">الرئيسية</a>
         <a href="#/chats" class="${active === 'chats' ? 'on' : ''}">استشاراتي</a>`;
    return `
      <header class="topbar">
        <a class="brand" href="#/${me.role === 'admin' ? 'admin' : 'home'}"><span class="brand-ico">✚</span> ${APP_CONFIG.appName}</a>
        <nav>
          ${nav}
          <a href="#/profile" class="${active === 'profile' ? 'on' : ''}">${avatar(me, 'xs')}<span>حسابي</span></a>
        </nav>
      </header>
      ${DB.mode === 'demo' ? '<div class="demo-bar">وضع تجريبي — البيانات محفوظة في متصفحك فقط. اربط Supabase من ملف config.js للتشغيل الحقيقي.</div>' : ''}
      <main class="container ${me.role === 'admin' && active === 'admin' ? 'wide' : ''}">${body}</main>
      <footer class="foot">تداوي لا تغني عن الطوارئ. في الحالات الحرجة توجّه لأقرب مستشفى فورًا.</footer>`;
  };

  const emptyBox = t => `<div class="card empty">${t}</div>`;

  // ======================================================
  //  الدخول / التسجيل
  // ======================================================
  const viewAuth = () => {
    const msg = flash; flash = '';
    $app.innerHTML = `
      <div class="auth">
        <section class="auth-hero">
          <div class="brand light"><span class="brand-ico">✚</span> ${APP_CONFIG.appName}</div>
          <h1>استشارات طبية متخصصة<br>في المخ والأعصاب والعناية المركزة</h1>
          <p>احجز استشارتك مع أطباء معتمدين وتواصل معهم مباشرة في شات خاص وآمن.</p>
          <ul class="points">
            <li><b>أطباء معتمدون</b><span>كل طبيب بيتراجع ويتعتمد من الإدارة قبل ظهوره.</span></li>
            <li><b>دفع بسيط عبر فوري</b><span>حوّل واكتب رقم العملية، ويتفعّل الشات بعد التأكيد.</span></li>
            <li><b>خصوصية كاملة</b><span>محادثتك مرئية لك وللطبيب بس.</span></li>
          </ul>
        </section>

        <section class="auth-card card">
          <div class="tabs" id="authTabs">
            <button class="on" data-tab="login">تسجيل الدخول</button>
            <button data-tab="register">حساب جديد</button>
          </div>
          ${msg ? `<div class="alert bad">${esc(msg)}</div>` : ''}

          <button type="button" class="btn google block" id="googleBtn">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            <span>المتابعة بحساب جوجل</span>
          </button>
          <div class="or"><span>أو بالرقم وكلمة المرور</span></div>

          <form id="loginForm">
            <label class="field">رقم الموبايل<input name="phone" type="tel" inputmode="tel" placeholder="01xxxxxxxxx" required></label>
            <label class="field">كلمة المرور<input name="password" type="password" placeholder="••••••" required></label>
            <button class="btn primary block">دخول</button>
          </form>

          <form id="regForm" hidden>
            <div class="seg">
              <label><input type="radio" name="role" value="patient" checked><span>أنا مريض</span></label>
              <label><input type="radio" name="role" value="doctor"><span>أنا طبيب</span></label>
            </div>
            <label class="field">الاسم بالكامل<input name="name" required></label>
            <label class="field">رقم الموبايل<input name="phone" type="tel" inputmode="tel" placeholder="01xxxxxxxxx" required></label>
            <label class="field">كلمة المرور (6 أحرف على الأقل)<input name="password" type="password" minlength="6" required></label>
            <div id="docFields" hidden>
              <div class="two">
                <label class="field">القسم
                  <select name="dept">${Object.entries(APP_CONFIG.departments).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('')}</select>
                </label>
                <label class="field">سعر الاستشارة (${APP_CONFIG.currency})<input name="fee" type="number" min="0" value="300"></label>
              </div>
              <div class="two">
                <label class="field">سنوات الخبرة<input name="years" type="number" min="0" value="5"></label>
                <label class="field">رقم القيد / الترخيص<input name="license"></label>
              </div>
              <p class="hint">حسابك هيظهر للمرضى بعد مراجعة الإدارة واعتماده.</p>
            </div>
            <button class="btn primary block">إنشاء الحساب</button>
          </form>

          ${DB.mode === 'demo' ? `
            <div class="demo-note">
              <b>حسابات التجربة</b>
              <div>أدمن: <code>admin</code> / <code>admin123</code></div>
              <div>طبيب: <code>01000000001</code> / <code>123456</code></div>
              <div>مريض: سجّل حساب جديد</div>
            </div>` : ''}
        </section>
      </div>`;

    const $login = document.getElementById('loginForm');
    const $reg = document.getElementById('regForm');
    document.getElementById('authTabs').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      document.querySelectorAll('#authTabs button').forEach(x => x.classList.toggle('on', x === b));
      $login.hidden = b.dataset.tab !== 'login';
      $reg.hidden = b.dataset.tab !== 'register';
    });
    $reg.addEventListener('change', e => {
      if (e.target.name === 'role') document.getElementById('docFields').hidden = e.target.value !== 'doctor';
    });

    document.getElementById('googleBtn').addEventListener('click', e => {
      withBusy(e.currentTarget, () => DB.loginWithGoogle());
    });

    $login.addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData($login));
      withBusy($login.querySelector('button'), async () => {
        await DB.login(f.phone, f.password);
        go(DB.me().role === 'admin' ? '#/admin' : '#/home');
      });
    });

    $reg.addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData($reg));
      const digits = String(f.phone).replace(/\D/g, '');
      if (digits.length < 10) return toast('اكتب رقم موبايل صحيح.');
      withBusy($reg.querySelector('button.primary'), async () => {
        await DB.register({ ...f, name: f.name.trim() });
        toast(f.role === 'doctor' ? 'تم إنشاء حسابك. في انتظار اعتماد الإدارة.' : 'أهلاً بيك في تداوي!');
        go('#/home');
      });
    });
  };

  // ======================================================
  //  إكمال الحساب (أول دخول بجوجل)
  // ======================================================
  const viewComplete = () => {
    const p = DB.pending();
    $app.innerHTML = `
      <div class="auth single">
        <section class="auth-card card">
          <h2>أهلاً ${esc(p.name || '')} 👋</h2>
          <p class="muted">كمّل بياناتك عشان نفتحلك حسابك.</p>
          <form id="compForm">
            <div class="seg">
              <label><input type="radio" name="role" value="patient" checked><span>أنا مريض</span></label>
              <label><input type="radio" name="role" value="doctor"><span>أنا طبيب</span></label>
            </div>
            <label class="field">الاسم بالكامل<input name="name" value="${esc(p.name || '')}" required></label>
            <label class="field">رقم الموبايل (اختياري)<input name="phone" type="tel" inputmode="tel" placeholder="01xxxxxxxxx"></label>
            <div id="docFields" hidden>
              <div class="two">
                <label class="field">القسم
                  <select name="dept">${Object.entries(APP_CONFIG.departments).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('')}</select>
                </label>
                <label class="field">سعر الاستشارة (${APP_CONFIG.currency})<input name="fee" type="number" min="0" value="300"></label>
              </div>
              <div class="two">
                <label class="field">سنوات الخبرة<input name="years" type="number" min="0" value="5"></label>
                <label class="field">رقم القيد / الترخيص<input name="license"></label>
              </div>
              <p class="hint">حسابك هيظهر للمرضى بعد مراجعة الإدارة واعتماده.</p>
            </div>
            <button class="btn primary block">متابعة</button>
            <button type="button" class="btn link sm" id="compOut">استخدم حساب تاني</button>
          </form>
        </section>
      </div>`;
    const f = document.getElementById('compForm');
    f.addEventListener('change', e => { if (e.target.name === 'role') document.getElementById('docFields').hidden = e.target.value !== 'doctor'; });
    document.getElementById('compOut').addEventListener('click', async () => { await DB.logout(); go('#/auth'); route(); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      withBusy(f.querySelector('button.primary'), async () => {
        await DB.completeProfile({ ...d, name: d.name.trim() });
        toast(d.role === 'doctor' ? 'تم إنشاء حسابك. في انتظار اعتماد الإدارة.' : 'أهلاً بيك في تداوي!');
        go('#/home'); route();
      });
    });
  };

  // ======================================================
  //  الرئيسية
  // ======================================================
  const consultRow = (c, me) => {
    const other = me.role === 'doctor' ? c.patient : c.doctor;
    return `
      <a class="item" href="#/chat/${c.id}">
        ${avatar(other)}
        <div class="grow">
          <div class="row-between"><b>${esc(other?.name || '')}</b><span class="muted sm">${fmtDate(c.createdAt)}</span></div>
          <div class="muted sm clip">${esc(c.complaint || '')}</div>
        </div>
        ${badge(PAY, c.status)}
      </a>`;
  };

  const viewHome = me => {
    if (me.role === 'doctor') return viewDoctorHome(me);
    const render = (docs, cons) => {
      $app.innerHTML = shell(me, `
        <section class="hero">
          <h2>أهلاً ${esc(me.name)} 👋</h2>
          <p>اختر القسم المناسب واحجز استشارتك مع طبيب متخصص.</p>
        </section>
        <h3>الأقسام</h3>
        <div class="grid">
          ${Object.entries(APP_CONFIG.departments).map(([k, d]) => `
            <a class="card dept" href="#/dept/${k}">
              <div class="dept-ico">${d.icon}</div>
              <h4>${d.name}</h4>
              <p class="muted sm">${d.desc}</p>
              <span class="chip">${docs.filter(x => x.dept === k).length} طبيب متاح ←</span>
            </a>`).join('')}
        </div>
        <h3>استشاراتك الأخيرة</h3>
        ${cons.length ? `<div class="list card">${cons.slice(0, 5).map(c => consultRow(c, me)).join('')}</div>` : emptyBox('لسه ماحجزتش أي استشارة.')}`, 'home');
    };
    let docs = [], cons = [];
    track(DB.watchDoctors(d => { docs = d; render(docs, cons); }));
    track(DB.watchConsultations(c => { cons = c; render(docs, cons); }));
  };

  const viewDoctorHome = me => {
    track(DB.watchConsultations(cons => {
      const open = cons.filter(c => c.status === 'open').length;
      const waiting = cons.filter(c => c.status === 'pending_payment').length;
      const visible = cons.filter(c => c.status !== 'rejected');
      const notice = me.status === 'approved' ? '' :
        `<div class="alert ${me.status === 'pending' ? 'warn' : 'bad'}">
          ${me.status === 'pending' ? 'حسابك قيد المراجعة. هتظهر للمرضى فور اعتماد الإدارة.' : 'حسابك غير معتمد حاليًا. تواصل مع الإدارة.'}
        </div>`;
      $app.innerHTML = shell(me, `
        ${notice}
        <section class="hero">
          <h2>أهلاً ${esc(me.name)} 👋</h2>
          <p>قسم ${dept(me.dept).name} — سعر الاستشارة ${money(me.fee)}</p>
        </section>
        <div class="stats">
          <div class="card stat"><b>${cons.filter(c => c.status !== 'rejected').length}</b><span>إجمالي الاستشارات</span></div>
          <div class="card stat"><b>${open}</b><span>مفتوحة</span></div>
          <div class="card stat"><b>${waiting}</b><span>بانتظار الدفع</span></div>
        </div>
        <h3>الاستشارات الواردة</h3>
        ${visible.length ? `<div class="list card">${visible.map(c => consultRow(c, me)).join('')}</div>` : emptyBox('مفيش استشارات واردة لسه.')}`, 'home');
    }));
  };

  // ======================================================
  //  أطباء القسم
  // ======================================================
  const viewDept = (me, key) => {
    track(DB.watchDoctors(all => {
      const docs = all.filter(d => d.dept === key);
      const d = dept(key);
      $app.innerHTML = shell(me, `
        <a class="back" href="#/home">← رجوع</a>
        <div class="page-title"><span class="dept-ico sm">${d.icon}</span><h2>${d.name}</h2></div>
        <div class="stack">
          ${docs.map(doc => `
            <div class="card doc">
              ${avatar(doc, 'lg')}
              <div class="grow">
                <h4>${esc(doc.name)} <span class="verified" title="طبيب معتمد">✔ معتمد</span></h4>
                <p class="muted sm">خبرة ${esc(doc.years || '-')} سنة</p>
                <p class="sm">${esc(doc.bio || '')}</p>
              </div>
              <div class="doc-side">
                <div class="price">${Number(doc.fee).toLocaleString('ar-EG')} <small>${APP_CONFIG.currency}</small></div>
                ${me.role === 'patient' ? `<a class="btn primary" href="#/book/${doc.id}">احجز استشارة</a>` : ''}
              </div>
            </div>`).join('') || emptyBox('مفيش أطباء معتمدين في القسم ده حاليًا.')}
        </div>`, 'home');
    }));
  };

  // ======================================================
  //  الحجز والدفع (فوري)
  // ======================================================
  const viewBook = (me, doctorId) => {
    if (me.role !== 'patient') return go('#/home');
    const tk = routeToken;
    $app.innerHTML = shell(me, '<div class="boot"><div class="spinner"></div></div>', 'home');

    Promise.all([DB.getDoctor(doctorId), DB.getSettings()]).then(([doc, st]) => {
      if (tk !== routeToken) return;
      if (!doc) { toast('الطبيب غير متاح.'); return go('#/home'); }
      let receipt = '';

      $app.innerHTML = shell(me, `
        <a class="back" href="#/dept/${doc.dept}">← رجوع</a>
        <form id="payForm" class="card pay">
          <h2>حجز استشارة</h2>
          <div class="summary">
            ${avatar(doc)}
            <div class="grow"><b>${esc(doc.name)}</b><div class="muted sm">${dept(doc.dept).name}</div></div>
            <div class="price">${Number(doc.fee).toLocaleString('ar-EG')} <small>${APP_CONFIG.currency}</small></div>
          </div>

          <label class="field">اوصف حالتك باختصار
            <textarea name="complaint" rows="4" required minlength="5" placeholder="مثال: صداع شديد من 3 أيام مع دوخة..."></textarea>
          </label>

          <div class="fawry">
            <div class="fawry-head"><span class="fawry-logo">فوري</span> الدفع عن طريق فوري</div>
            <ol>
              <li>ادفع مبلغ <b>${Number(doc.fee).toLocaleString('ar-EG')} ${APP_CONFIG.currency}</b> على رقم فوري:</li>
            </ol>
            <div class="fawry-num">${esc(st.fawryNumber)}</div>
            <button type="button" class="btn ghost sm" id="copyNum">نسخ الرقم</button>
            <ol start="2"><li>اكتب رقم العملية (Reference) من الإيصال، وارفع صورة الإيصال لو متاحة.</li></ol>
          </div>

          <label class="field">رقم العملية (Reference)
            <input name="ref" required placeholder="مثال: 123456789">
          </label>
          <label class="field">صورة الإيصال (اختياري)
            <input type="file" id="receiptInput" accept="image/*">
          </label>
          <img id="receiptPrev" class="receipt-prev" alt="" hidden>

          <button class="btn primary block">إرسال الطلب</button>
          <p class="hint">بعد تأكيد الإدارة للدفع بيتفتح الشات مع الطبيب تلقائيًا، وهتشوف حالة الطلب في "استشاراتي".</p>
        </form>`, 'home');

      document.getElementById('copyNum').addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(st.fawryNumber).catch(() => {});
        toast('تم نسخ الرقم');
      });
      document.getElementById('receiptInput').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          receipt = await resizeImage(file, 900, 0.6);
          const p = document.getElementById('receiptPrev'); p.src = receipt; p.hidden = false;
        } catch (err) { toast('تعذر قراءة الصورة'); }
      });

      const form = document.getElementById('payForm');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        withBusy(form.querySelector('button.primary'), async () => {
          const id = await DB.createConsultation({
            doctorId: doc.id,
            complaint: f.complaint.trim(),
            fee: Number(doc.fee),
            patient: { name: me.name, photo: me.photo || '', age: me.age || '', gender: me.gender || '', notes: me.notes || '' },
            doctor: { name: doc.name, photo: doc.photo || '', dept: doc.dept },
            payment: { method: 'fawry', amount: Number(doc.fee), to: st.fawryNumber, ref: f.ref.trim(), receipt, status: 'pending' }
          });
          toast('تم إرسال طلبك. في انتظار تأكيد الدفع.');
          go('#/chat/' + id);
        });
      });
    }).catch(e => { toast(e.message); go('#/home'); });
  };

  // ======================================================
  //  قائمة الاستشارات
  // ======================================================
  const viewChats = me => {
    track(DB.watchConsultations(cons => {
      const list = cons.filter(c => me.role === 'patient' || c.status !== 'rejected');
      $app.innerHTML = shell(me, `
        <div class="page-title"><h2>استشاراتي</h2></div>
        ${list.length ? `<div class="list card">${list.map(c => consultRow(c, me)).join('')}</div>`
          : emptyBox(me.role === 'patient' ? 'مفيش استشارات. احجز استشارة وابدأ.' : 'مفيش استشارات لسه.')}`, 'chats');
    }));
  };

  // ======================================================
  //  الشات
  // ======================================================
  const DEMO_REPLIES = [
    'أهلاً بحضرتك، شكراً لتواصلك. ممكن توضحلي أكتر مدة الأعراض وهل في أدوية بتاخدها حالياً؟',
    'تمام. هل في أمراض مزمنة (سكر، ضغط، قلب) أو حساسية من أدوية؟',
    'شكراً على المعلومات. أنصحك بعمل الفحوصات اللازمة وإرسال نتائجها، وهراجع حالتك وأرد عليك.'
  ];

  const viewChat = (me, cid) => {
    const isDoc = me.role === 'doctor';
    let cons = null, msgs = [];
    $app.innerHTML = shell(me, '<div class="boot"><div class="spinner"></div></div>', 'chats');
    let built = false;
    let $msgs, $input, $send, $note;

    const build = () => {
      const other = isDoc ? cons.patient : cons.doctor;
      $app.innerHTML = shell(me, `
        <div class="chat card">
          <div class="chat-head">
            <a class="back-ico" href="#/chats" aria-label="رجوع">→</a>
            ${avatar(other)}
            <div class="grow">
              <b>${esc(other?.name || '')}</b>
              <div class="muted sm">${isDoc ? 'مريض' : dept(cons.doctor?.dept).name}</div>
            </div>
            <span id="stBadge"></span>
            ${isDoc ? '<button class="btn ghost sm" id="closeBtn">إنهاء الاستشارة</button>' : ''}
          </div>
          <div class="msgs" id="msgs"></div>
          <div id="note"></div>
          <form class="composer" id="composer">
            <textarea id="msgInput" rows="1" placeholder="اكتب رسالتك..."></textarea>
            <button class="btn primary" id="sendBtn">إرسال</button>
          </form>
        </div>`, 'chats');
      $msgs = document.getElementById('msgs');
      $input = document.getElementById('msgInput');
      $send = document.getElementById('sendBtn');
      $note = document.getElementById('note');

      const send = () => {
        const text = $input.value.trim();
        if (!text) return;
        $input.value = ''; $input.style.height = 'auto';
        DB.sendMessage(cid, text).then(() => {
          const doctorId = cons.doctorId;
          if (!isDoc && DB.isSeedDoctor(doctorId)) {
            const n = msgs.filter(m => m.from === doctorId).length;
            setTimeout(() => DB.demoReply(cid, doctorId, DEMO_REPLIES[Math.min(n, DEMO_REPLIES.length - 1)]), 1400);
          }
        }).catch(e => toast(e.message));
      };
      document.getElementById('composer').addEventListener('submit', e => { e.preventDefault(); send(); });
      $input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      $input.addEventListener('input', () => { $input.style.height = 'auto'; $input.style.height = Math.min($input.scrollHeight, 120) + 'px'; });
      const cb = document.getElementById('closeBtn');
      if (cb) cb.addEventListener('click', () => {
        if (confirm('إنهاء الاستشارة؟ مش هيقدر المريض يبعت رسائل بعد كده.')) DB.closeConsultation(cid).catch(e => toast(e.message));
      });
      built = true;
    };

    const draw = () => {
      if (!cons) { toast('الاستشارة غير متاحة.'); return go('#/chats'); }
      if (!built) build();

      const st = cons.status;
      document.getElementById('stBadge').outerHTML = `<span id="stBadge">${badge(PAY, st)}</span>`;
      const cb = document.getElementById('closeBtn'); if (cb) cb.hidden = st !== 'open';

      const info = isDoc && cons.patient ? `
        <details class="pinfo"><summary>بيانات المريض</summary>
          <div class="sm">السن: ${esc(cons.patient.age || '-')} · النوع: ${cons.patient.gender === 'male' ? 'ذكر' : cons.patient.gender === 'female' ? 'أنثى' : '-'}</div>
          <div class="sm">ملاحظات طبية: ${esc(cons.patient.notes || 'لا يوجد')}</div>
        </details>` : '';

      const near = $msgs.scrollHeight - $msgs.scrollTop - $msgs.clientHeight < 80;
      let last = '';
      $msgs.innerHTML = `
        <div class="complaint"><b>الشكوى</b><p>${esc(cons.complaint)}</p>${info}</div>` +
        msgs.map(m => {
          const d = fmtDay(m.at), sep = d !== last ? `<div class="daysep">${d}</div>` : ''; last = d;
          return `${sep}<div class="bubble ${m.from === me.id ? 'mine' : 'theirs'}">${esc(m.text)}<span class="time">${fmtTime(m.at)}</span></div>`;
        }).join('');
      if (near || msgs.length <= 1) $msgs.scrollTop = $msgs.scrollHeight;

      const open = st === 'open';
      $input.disabled = !open; $send.disabled = !open;
      $input.placeholder = open ? 'اكتب رسالتك...' : 'الشات مغلق';
      $note.innerHTML =
        st === 'pending_payment' ? '<div class="alert warn m">في انتظار تأكيد الإدارة للدفع. الشات هيتفتح تلقائيًا بمجرد التأكيد.</div>' :
        st === 'rejected' ? `<div class="alert bad m">تم رفض الدفع${cons.payment?.reason ? ': ' + esc(cons.payment.reason) : ''}. تقدر تحجز من جديد.</div>` :
        st === 'closed' ? '<div class="alert m">تم إنهاء الاستشارة.</div>' : '';
    };

    track(DB.watchConsultation(cid, c => {
      cons = c;
      if (c) draw();
      else { toast('الاستشارة غير متاحة.'); go('#/chats'); }
    }));
    track(DB.watchMessages(cid, m => { msgs = m; if (cons) draw(); }));
  };

  // ======================================================
  //  البروفايل
  // ======================================================
  const viewProfile = me => {
    let photo = me.photo || '';
    const isDoc = me.role === 'doctor', isAdmin = me.role === 'admin';
    const roleName = { patient: 'مريض', doctor: 'طبيب', admin: 'مدير' }[me.role];

    $app.innerHTML = shell(me, `
      <form id="profForm" class="card prof">
        <div class="row-between"><h2>حسابي</h2><span class="badge off">${roleName}</span></div>
        ${isDoc ? `<div class="alert ${me.status === 'approved' ? 'ok' : 'warn'} m">حالة الحساب: ${DOC_STATUS[me.status]?.[0] || me.status}${me.status === 'pending' ? ' — هيظهر للمرضى بعد الاعتماد' : ''}</div>` : ''}
        <div class="photo-row">
          <div id="photoBox">${avatar({ ...me, photo }, 'xl')}</div>
          <div>
            <label class="btn ghost sm">تغيير الصورة<input type="file" id="photoInput" accept="image/*" hidden></label>
            <button type="button" class="btn link sm" id="photoDel">حذف الصورة</button>
          </div>
        </div>
        <label class="field">الاسم<input name="name" value="${esc(me.name)}" required></label>
        <label class="field">رقم الموبايل<input value="${esc(me.phone)}" disabled></label>
        ${isAdmin ? '' : `
        <div class="two">
          <label class="field">النوع
            <select name="gender">
              <option value="" ${!me.gender ? 'selected' : ''}>-</option>
              <option value="male" ${me.gender === 'male' ? 'selected' : ''}>ذكر</option>
              <option value="female" ${me.gender === 'female' ? 'selected' : ''}>أنثى</option>
            </select>
          </label>
          ${isDoc ? `<label class="field">سنوات الخبرة<input name="years" type="number" min="0" value="${esc(me.years)}"></label>`
                  : `<label class="field">السن<input name="age" type="number" min="0" value="${esc(me.age)}"></label>`}
        </div>`}
        ${isDoc ? `
          <div class="two">
            <label class="field">القسم
              <select name="dept">${Object.entries(APP_CONFIG.departments).map(([k, d]) => `<option value="${k}" ${me.dept === k ? 'selected' : ''}>${d.name}</option>`).join('')}</select>
            </label>
            <label class="field">سعر الاستشارة (${APP_CONFIG.currency})<input name="fee" type="number" min="0" value="${esc(me.fee)}"></label>
          </div>
          <label class="field">رقم القيد / الترخيص<input name="license" value="${esc(me.license)}"></label>
          <label class="field">نبذة عنك<textarea name="bio" rows="3">${esc(me.bio)}</textarea></label>`
        : isAdmin ? '' : `<label class="field">ملاحظات طبية (أمراض مزمنة، حساسية، أدوية)<textarea name="notes" rows="3">${esc(me.notes)}</textarea></label>`}
        <button class="btn primary block">حفظ التعديلات</button>
        <button type="button" class="btn danger block" id="logoutBtn">تسجيل الخروج</button>
        ${DB.mode === 'demo' ? '<button type="button" class="btn link sm" id="resetBtn">مسح بيانات التجربة</button>' : ''}
      </form>`, 'profile');

    const refresh = () => {
      document.getElementById('photoBox').innerHTML = avatar({ ...me, name: document.querySelector('[name=name]').value || me.name, photo }, 'xl');
    };
    document.getElementById('photoInput').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try { photo = await resizeImage(file); refresh(); } catch (err) { toast('تعذر قراءة الصورة'); }
    });
    document.getElementById('photoDel').addEventListener('click', () => { photo = ''; refresh(); });

    const form = document.getElementById('profForm');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const patch = { name: (f.name || '').trim() || me.name, photo };
      if (!isAdmin) patch.gender = f.gender || '';
      if (isDoc) Object.assign(patch, { years: Number(f.years) || 0, dept: f.dept, fee: Number(f.fee) || 0, license: (f.license || '').trim(), bio: (f.bio || '').trim() });
      else if (!isAdmin) Object.assign(patch, { age: f.age || '', notes: (f.notes || '').trim() });
      withBusy(form.querySelector('button.primary'), async () => {
        await DB.updateMe(patch);
        toast('تم حفظ التعديلات');
        route();
      });
    });
    document.getElementById('logoutBtn').addEventListener('click', async () => { await DB.logout(); go('#/auth'); });
    const rb = document.getElementById('resetBtn');
    if (rb) rb.addEventListener('click', async () => {
      if (confirm('هتتمسح كل بيانات التجربة. متأكد؟')) { await DB.resetAll(); go('#/auth'); }
    });
  };

  // ======================================================
  //  لوحة الأدمن
  // ======================================================
  const viewAdmin = me => {
    if (me.role !== 'admin') return go('#/home');
    let users = [], cons = [], settings = null;
    let gotUsers = false, gotCons = false;

    const tabs = [['overview', 'نظرة عامة'], ['doctors', 'الأطباء'], ['payments', 'المدفوعات'], ['users', 'المستخدمون'], ['settings', 'الإعدادات']];

    const stat = (n, label, cls = '') => `<div class="card stat ${cls}"><b>${n}</b><span>${label}</span></div>`;

    const tabOverview = () => {
      const patients = users.filter(u => u.role === 'patient').length;
      const docsOk = users.filter(u => u.role === 'doctor' && u.status === 'approved').length;
      const docsPending = users.filter(u => u.role === 'doctor' && u.status === 'pending').length;
      const payPending = cons.filter(c => c.payment?.status === 'pending').length;
      const revenue = cons.filter(c => c.payment?.status === 'confirmed').reduce((s, c) => s + Number(c.payment.amount || 0), 0);
      return `
        <div class="stats big">
          ${stat(patients, 'مرضى')}
          ${stat(docsOk, 'أطباء معتمدون')}
          ${stat(docsPending, 'أطباء بانتظار الاعتماد', docsPending ? 'alert-stat' : '')}
          ${stat(cons.length, 'إجمالي الاستشارات')}
          ${stat(cons.filter(c => c.status === 'open').length, 'استشارات مفتوحة')}
          ${stat(payPending, 'مدفوعات بانتظار التأكيد', payPending ? 'alert-stat' : '')}
          ${stat(money(revenue), 'إجمالي المدفوعات المؤكدة')}
        </div>
        ${(docsPending || payPending) ? `<div class="alert warn m">عندك ${docsPending} طبيب و${payPending} دفعة محتاجين مراجعة.</div>` : ''}`;
    };

    const tabDoctors = () => {
      const docs = users.filter(u => u.role === 'doctor');
      const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
      docs.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
      return `<div class="card tablecard"><table>
        <thead><tr><th>الطبيب</th><th>القسم</th><th>السعر</th><th>الترخيص</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${docs.map(d => `
          <tr>
            <td><div class="who">${avatar(d, 'xs')}<div><b>${esc(d.name)}</b><div class="muted sm">${esc(d.phone)}</div></div></div></td>
            <td>${dept(d.dept).name}</td>
            <td>${money(d.fee)}</td>
            <td>${esc(d.license || '-')}</td>
            <td>${badge(DOC_STATUS, d.status)}</td>
            <td class="acts">
              ${d.status !== 'approved' ? `<button class="btn primary sm" data-act="user" data-id="${d.id}" data-st="approved">اعتماد</button>` : ''}
              ${d.status === 'pending' ? `<button class="btn danger sm" data-act="user" data-id="${d.id}" data-st="rejected">رفض</button>` : ''}
              ${d.status === 'approved' ? `<button class="btn danger sm" data-act="user" data-id="${d.id}" data-st="suspended">إيقاف</button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty">مفيش أطباء مسجلين.</td></tr>'}
        </tbody></table></div>`;
    };

    const tabPayments = () => {
      const list = cons.slice().sort((a, b) => {
        const pa = a.payment?.status === 'pending' ? 0 : 1, pb = b.payment?.status === 'pending' ? 0 : 1;
        return pa - pb || (b.createdAt - a.createdAt);
      });
      return `<div class="stack">${list.map(c => {
        const p = c.payment || {}, pend = p.status === 'pending';
        return `
        <div class="card pay-card">
          <div class="row-between">
            <b>${esc(c.patient?.name)} ← ${esc(c.doctor?.name)}</b>
            ${p.status === 'confirmed' ? '<span class="badge ok">مؤكد</span>' : p.status === 'rejected' ? '<span class="badge bad">مرفوض</span>' : '<span class="badge warn">بانتظار التأكيد</span>'}
          </div>
          <div class="kv">
            <span>المبلغ</span><b>${money(p.amount)}</b>
            <span>رقم العملية</span><b dir="ltr">${esc(p.ref)}</b>
            <span>الدفع على</span><b dir="ltr">${esc(p.to)}</b>
            <span>التاريخ</span><b>${fmtDate(c.createdAt)} ${fmtTime(c.createdAt)}</b>
          </div>
          ${p.receipt ? `<img class="receipt-th" src="${esc(p.receipt)}" data-zoom="${esc(p.receipt)}" alt="إيصال">` : '<div class="muted sm">بدون صورة إيصال</div>'}
          ${p.reason ? `<div class="muted sm">سبب الرفض: ${esc(p.reason)}</div>` : ''}
          ${pend ? `<div class="acts">
            <button class="btn primary sm" data-act="pay" data-id="${c.id}" data-d="confirmed">تأكيد الدفع</button>
            <button class="btn danger sm" data-act="pay" data-id="${c.id}" data-d="rejected">رفض</button>
          </div>` : ''}
        </div>`;
      }).join('') || emptyBox('مفيش طلبات دفع لسه.')}</div>`;
    };

    const tabUsers = () => `
      <div class="card tablecard"><table>
        <thead><tr><th>المستخدم</th><th>الدور</th><th>الموبايل</th><th>التسجيل</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td><div class="who">${avatar(u, 'xs')}<b>${esc(u.name)}</b></div></td>
            <td>${{ patient: 'مريض', doctor: 'طبيب', admin: 'مدير' }[u.role]}</td>
            <td dir="ltr">${esc(u.phone)}</td>
            <td>${u.createdAt ? fmtDate(u.createdAt) : '-'}</td>
            <td>${badge(DOC_STATUS, u.status)}</td>
            <td class="acts">${u.role === 'admin' ? '' : u.status === 'suspended'
              ? `<button class="btn ghost sm" data-act="user" data-id="${u.id}" data-st="${u.role === 'doctor' ? 'approved' : 'active'}">تفعيل</button>`
              : `<button class="btn danger sm" data-act="user" data-id="${u.id}" data-st="suspended">إيقاف</button>`}</td>
          </tr>`).join('')}
        </tbody></table></div>`;

    const tabSettings = () => `
      <form class="card prof" id="setForm">
        <h3 style="margin-top:0">إعدادات الدفع</h3>
        <label class="field">رقم فوري (اللي المرضى هيدفعوا عليه)
          <input name="fawryNumber" dir="ltr" value="${esc(settings?.fawryNumber || '')}" required>
        </label>
        <button class="btn primary block">حفظ</button>
      </form>`;

    const render = () => {
      if (!gotUsers || !gotCons) return;
      const views = { overview: tabOverview, doctors: tabDoctors, payments: tabPayments, users: tabUsers, settings: tabSettings };
      const badgeN = {
        doctors: users.filter(u => u.role === 'doctor' && u.status === 'pending').length,
        payments: cons.filter(c => c.payment?.status === 'pending').length
      };
      $app.innerHTML = shell(me, `
        <div class="page-title"><h2>لوحة التحكم</h2></div>
        <div class="admin-tabs" id="adminTabs">
          ${tabs.map(([k, l]) => `<button class="${k === adminTab ? 'on' : ''}" data-tab="${k}">${l}${badgeN[k] ? `<i>${badgeN[k]}</i>` : ''}</button>`).join('')}
        </div>
        <div id="adminBody">${views[adminTab]()}</div>`, 'admin');

      document.getElementById('adminTabs').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        adminTab = b.dataset.tab; render();
      });
      const body = document.getElementById('adminBody');
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        withBusy(b, async () => {
          if (b.dataset.act === 'user') {
            await DB.setUserStatus(b.dataset.id, b.dataset.st);
            toast('تم التحديث');
          } else if (b.dataset.d === 'confirmed') {
            await DB.setPayment(b.dataset.id, 'confirmed');
            toast('تم تأكيد الدفع وفتح الشات');
          } else {
            const reason = prompt('سبب الرفض (اختياري):') ;
            if (reason === null) return;
            await DB.setPayment(b.dataset.id, 'rejected', reason.trim());
            toast('تم رفض الدفع');
          }
        });
      });
      const sf = document.getElementById('setForm');
      if (sf) sf.addEventListener('submit', e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(sf));
        withBusy(sf.querySelector('button'), async () => {
          await DB.saveSettings({ fawryNumber: f.fawryNumber.trim() });
          settings = { ...settings, fawryNumber: f.fawryNumber.trim() };
          toast('تم حفظ رقم فوري');
        });
      });
    };

    $app.innerHTML = shell(me, '<div class="boot"><div class="spinner"></div></div>', 'admin');
    const tk = routeToken;
    DB.getSettings().then(s => { if (tk === routeToken) { settings = s; render(); } });
    track(DB.watchUsers(u => { users = u; gotUsers = true; render(); }));
    track(DB.watchConsultations(c => { cons = c; gotCons = true; render(); }));
  };

  // ======================================================
  //  الراوتر
  // ======================================================
  const routes = [
    [/^#\/home$/, viewHome],
    [/^#\/admin$/, viewAdmin],
    [/^#\/dept\/(\w+)$/, viewDept],
    [/^#\/book\/([\w-]+)$/, viewBook],
    [/^#\/chats$/, viewChats],
    [/^#\/chat\/([\w-]+)$/, viewChat],
    [/^#\/profile$/, viewProfile]
  ];

  const route = () => {
    cleanup();
    routeToken++;
    const me = DB.me();
    const hash = location.hash || '#/home';

    if (!me && DB.pending && DB.pending()) { viewComplete(); return; }
    if (!me) { viewAuth(); if (hash !== '#/auth') history.replaceState(null, '', '#/auth'); return; }
    if (me.status === 'suspended') {
      flash = 'الحساب موقوف. تواصل مع الإدارة.';
      DB.logout().then(() => go('#/auth'));
      return;
    }
    if (hash === '#/auth') return go(me.role === 'admin' ? '#/admin' : '#/home');
    if (me.role === 'admin' && hash === '#/home') return go('#/admin');

    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) { fn(me, ...m.slice(1)); window.scrollTo(0, 0); return; }
    }
    go(me.role === 'admin' ? '#/admin' : '#/home');
  };

  // ---------- تشغيل ----------
  const start = async () => {
    if (DB.mode === 'supabase' && location.protocol === 'file:') {
      $app.innerHTML = `<div class="fatal card"><h2>شغّل الموقع عبر سيرفر</h2>
        <p>تسجيل الدخول بجوجل مبيشتغلش لما تفتح الملف مباشرة. جرّب:</p>
        <pre dir="ltr">npx serve public</pre><p>أو انشره على Vercel / Netlify / Cloudflare Pages.</p></div>`;
      return;
    }
    try { await DB.init(); }
    catch (e) { $app.innerHTML = `<div class="fatal card"><h2>تعذر التشغيل</h2><p>${esc(e.message)}</p></div>`; return; }
    window.addEventListener('hashchange', route);
    window.addEventListener('tadawi:auth', route);
    route();
  };
  start();
})();
