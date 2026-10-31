// طبقة البيانات: نفس الواجهة (DB) بتشتغل بـ Supabase أو بوضع تجريبي محلي.
const DB = (() => {
  const hasSupabase = !!(SUPABASE_CONFIG && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);

  // ---------- أدوات ----------
  const norm = p => String(p || '').trim()
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[\s+\-()]/g, '').toLowerCase();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const emitAuth = () => window.dispatchEvent(new Event('tadawi:auth'));

  const buildUser = d => ({
    role: d.role,
    status: d.role === 'doctor' ? 'pending' : 'active',
    name: d.name, phone: norm(d.phone),
    photo: '', gender: '', age: '', notes: '', bio: '',
    ...(d.role === 'doctor'
      ? { dept: d.dept || 'neuro', fee: Number(d.fee) || 0, years: Number(d.years) || 0, license: d.license || '' }
      : {}),
    createdAt: Date.now()
  });

  const defaults = () => ({ fawryNumber: APP_CONFIG.defaultFawryNumber });
  const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

  // =========================================================
  //  الوضع التجريبي (localStorage)
  // =========================================================
  const demo = (() => {
    const KEY = 'tadawi_demo_v2', SES = 'tadawi_demo_session_v2';
    const subs = new Set();
    let current = null;

    const seed = () => {
      const mk = o => ({
        id: uid(), role: 'doctor', status: 'approved', photo: '', gender: '', age: '', notes: '',
        seed: true, password: '123456', createdAt: Date.now(), ...o
      });
      return {
        users: [
          { id: uid(), role: 'admin', status: 'active', name: 'مدير المنصة', phone: 'admin', password: 'admin123',
            photo: '', gender: '', age: '', notes: '', createdAt: Date.now() },
          mk({ name: 'د. أحمد سمير', phone: '01000000001', dept: 'neuro', fee: 300, years: 15, license: 'EG-1001',
            bio: 'استشاري المخ والأعصاب، متخصص في الصداع النصفي والصرع والسكتات الدماغية.' }),
          mk({ name: 'د. منى عبد الرحمن', phone: '01000000002', dept: 'neuro', fee: 250, years: 10, license: 'EG-1002',
            bio: 'أخصائية أمراض الأعصاب، اهتمامها الأساسي اضطرابات الحركة والأعصاب الطرفية.' }),
          mk({ name: 'د. كريم فاروق', phone: '01000000003', dept: 'icu', fee: 400, years: 18, license: 'EG-1003',
            bio: 'استشاري الرعاية المركزة، خبرة في الفشل التنفسي والصدمات ومتابعة الحالات الحرجة.' }),
          mk({ name: 'د. هالة مصطفى', phone: '01000000004', dept: 'icu', fee: 350, years: 12, license: 'EG-1004',
            bio: 'أخصائية الرعاية المركزة وإدارة التنفس الصناعي والدعم الدوائي للحالات الحرجة.' }),
          mk({ name: 'د. ياسمين عادل', phone: '01000000005', dept: 'neuro', fee: 280, years: 6, license: 'EG-1005',
            status: 'pending', bio: 'طبيبة جديدة تنتظر موافقة الإدارة (مثال لعملية الاعتماد).' })
        ],
        consultations: [], messages: [], settings: defaults()
      };
    };

    const load = () => {
      try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.users) return s; } catch (e) { /* ignore */ }
      const s = seed();
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
      return s;
    };
    let state = load();

    const strip = u => { const { password, ...r } = u; return r; };
    const byId = id => state.users.find(u => u.id === id);

    const refreshCurrent = () => {
      if (!current) return;
      const u = byId(current.id);
      const next = u ? strip(u) : null;
      const changed = !next || next.status !== current.status || next.role !== current.role;
      current = next;
      if (changed) emitAuth();
    };
    const notify = () => { refreshCurrent(); subs.forEach(f => f()); };
    const save = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { throw fail('quota', 'مساحة التخزين ممتلئة. جرّب صورة أصغر.'); }
      notify();
    };
    window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); notify(); } });

    const watch = (fn, cb) => {
      const run = () => cb(fn());
      subs.add(run); run();
      return () => subs.delete(run);
    };
    const mine = () => {
      if (!current) return [];
      const all = state.consultations;
      if (current.role === 'admin') return all.slice();
      const key = current.role === 'doctor' ? 'doctorId' : 'patientId';
      return all.filter(c => c[key] === current.id);
    };

    return {
      mode: 'demo',
      async init() {
        const u = byId(sessionStorage.getItem(SES));
        current = u && u.status !== 'suspended' ? strip(u) : null;
      },
      me: () => current,

      async register(d) {
        const phone = norm(d.phone);
        if (state.users.some(u => u.phone === phone)) throw fail('exists', 'الرقم ده مسجل بالفعل، سجّل دخول.');
        const u = { id: uid(), ...buildUser(d), password: d.password };
        state.users.push(u);
        save();
        sessionStorage.setItem(SES, u.id);
        current = strip(u);
        return current;
      },
      async login(phone, password) {
        const u = state.users.find(x => x.phone === norm(phone) && x.password === password);
        if (!u) throw fail('bad', 'الرقم أو كلمة المرور غير صحيحة.');
        if (u.status === 'suspended') throw fail('suspended', 'الحساب موقوف. تواصل مع الإدارة.');
        sessionStorage.setItem(SES, u.id);
        current = strip(u);
        return current;
      },
      pending: () => null,
      async loginWithGoogle() { throw fail('demo', 'الدخول بجوجل متاح بعد ربط Supabase (في الوضع التجريبي استخدم الرقم والباسورد).'); },
      async logout() { sessionStorage.removeItem(SES); current = null; },
      async updateMe(patch) {
        const u = byId(current.id);
        const { role, status, id, password, ...safe } = patch;
        Object.assign(u, safe);
        save();
        return current;
      },

      async getDoctor(id) {
        const u = byId(id);
        return u && u.role === 'doctor' && u.status === 'approved' ? strip(u) : null;
      },
      watchDoctors: cb => watch(() => state.users.filter(u => u.role === 'doctor' && u.status === 'approved').map(strip), cb),

      async getSettings() { return { ...defaults(), ...state.settings }; },
      async saveSettings(s) { state.settings = { ...state.settings, ...s }; save(); },

      watchConsultations: cb => watch(() => mine().sort(byNewest), cb),
      watchConsultation: (cid, cb) => watch(() => state.consultations.find(c => c.id === cid) || null, cb),
      watchMessages: (cid, cb) => watch(() => state.messages.filter(m => m.cid === cid).sort((a, b) => a.at - b.at), cb),

      async createConsultation(data) {
        const c = { id: uid(), ...data, patientId: current.id, status: 'pending_payment', createdAt: Date.now() };
        state.consultations.push(c);
        save();
        return c.id;
      },
      async sendMessage(cid, text) {
        text = (text || '').trim();
        const c = state.consultations.find(x => x.id === cid);
        if (!text || !c || c.status !== 'open') return;
        if (c.patientId !== current.id && c.doctorId !== current.id) return;
        state.messages.push({ id: uid(), cid, from: current.id, text, at: Date.now() });
        save();
      },
      async closeConsultation(cid) {
        const c = state.consultations.find(x => x.id === cid);
        if (c && c.doctorId === current.id && c.status === 'open') { c.status = 'closed'; save(); }
      },

      // ---- الأدمن ----
      watchUsers: cb => watch(() => state.users.map(strip).sort(byNewest), cb),
      async setUserStatus(id, status) { const u = byId(id); if (u) { u.status = status; save(); } },
      async setPayment(cid, decision, reason) {
        const c = state.consultations.find(x => x.id === cid);
        if (!c) return;
        if (decision === 'confirmed') { c.status = 'open'; c.payment.status = 'confirmed'; }
        else { c.status = 'rejected'; c.payment.status = 'rejected'; c.payment.reason = reason || ''; }
        save();
      },
      async resetAll() { state = seed(); sessionStorage.removeItem(SES); current = null; save(); },

      // رد تجريبي للأطباء الافتراضيين (عشان تجرب الشات بحساب واحد)
      demoReply(cid, doctorId, text) {
        const c = state.consultations.find(x => x.id === cid);
        if (!c || c.status !== 'open') return;
        state.messages.push({ id: uid(), cid, from: doctorId, text, at: Date.now() });
        save();
      },
      isSeedDoctor: id => !!(byId(id) && byId(id).seed)
    };
  })();

  // =========================================================
  //  وضع Supabase
  // =========================================================
  const sb = (() => {
    let client, current = null, pendingAuth = null, meChannel = null, busy = false;
    const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
    const emailOf = p => norm(p) + '@tadawi.app';
    const loadScript = src => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('تعذر تحميل Supabase. تأكد من الاتصال بالإنترنت.'));
      document.head.appendChild(s);
    });

    const errMap = e => {
      const msg = String((e && e.message) || '');
      if (/already registered|already been registered/i.test(msg)) return fail('exists', 'الرقم ده مسجل بالفعل، سجّل دخول.');
      if (/invalid login credentials/i.test(msg)) return fail('bad', 'الرقم أو كلمة المرور غير صحيحة.');
      if (/password should be at least/i.test(msg)) return fail('weak', 'كلمة المرور لازم تكون 6 أحرف على الأقل.');
      if (/rate limit|too many/i.test(msg)) return fail('rate', 'محاولات كتير، استنى شوية وجرّب تاني.');
      if (/failed to fetch|network/i.test(msg)) return fail('net', 'مشكلة في الإنترنت.');
      if (/row-level security|permission denied|not allowed/i.test(msg)) return fail('perm', 'مفيش صلاحية لتنفيذ العملية دي.');
      if (/email.*not confirmed/i.test(msg)) return fail('unconfirmed', 'الإعداد غير مكتمل: اقفل "Confirm email" من Supabase > Authentication.');
      return e;
    };
    const ok = ({ data, error }) => { if (error) throw errMap(error); return data; };

    // ---- تحويل الصفوف إلى الشكل اللي الواجهة متعودة عليه ----
    const toUser = r => r && ({
      id: r.id, role: r.role, status: r.status, name: r.name, phone: r.phone, photo: r.photo,
      gender: r.gender, age: r.age, notes: r.notes, bio: r.bio, dept: r.dept,
      fee: Number(r.fee) || 0, years: r.years, license: r.license, createdAt: Number(r.created_at)
    });
    const toCons = r => ({
      id: r.id, patientId: r.patient_id, doctorId: r.doctor_id, complaint: r.complaint, fee: Number(r.fee),
      status: r.status, patient: r.patient, doctor: r.doctor, payment: r.payment, createdAt: Number(r.created_at)
    });
    const toMsg = r => ({ id: r.id, cid: r.cid, from: r.sender, text: r.text, at: Number(r.at) });

    // استعلام لحظي: بيجيب البيانات وبيعيد الجلب لما أي تغيير يحصل (RLS بيفلتر اللي المستخدم يشوفه)
    const live = (name, table, filter, fetcher, cb) => {
      let dead = false, timer = null;
      const run = async () => {
        try { const rows = await fetcher(); if (!dead) cb(rows); }
        catch (e) { console.error(e); }
      };
      const kick = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
      run();
      const cfg = { event: '*', schema: 'public', table };
      if (filter) cfg.filter = filter;
      const ch = client.channel(name + '-' + uid()).on('postgres_changes', cfg, kick).subscribe();
      return () => { dead = true; clearTimeout(timer); client.removeChannel(ch); };
    };

    const watchMe = id => {
      if (meChannel) client.removeChannel(meChannel);
      meChannel = client.channel('me-' + id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.' + id }, p => {
          const next = p.new && p.new.id ? toUser(p.new) : null;
          const changed = !current || !next || next.status !== current.status || next.role !== current.role;
          current = next;
          if (changed && !busy) emitAuth();
        }).subscribe();
    };

    const fetchProfile = async id => {
      const { data, error } = await client.from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) throw errMap(error);
      return toUser(data);
    };

    // بعد أي دخول: لو الحساب له بروفايل نكمل، ولو لأ (دخول بجوجل لأول مرة) نطلب إكمال البيانات
    const attach = async user => {
      const p = await fetchProfile(user.id);
      if (p) { current = p; pendingAuth = null; watchMe(user.id); }
      else {
        current = null;
        const meta = user.user_metadata || {};
        pendingAuth = { id: user.id, email: user.email || '', name: meta.full_name || meta.name || '', photo: meta.avatar_url || meta.picture || '' };
      }
      return current;
    };

    return {
      mode: 'supabase',
      async init() {
        await loadScript(SDK);
        client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        const { data } = await client.auth.getSession();
        if (data.session) { try { await attach(data.session.user); } catch (e) { current = null; } }
        client.auth.onAuthStateChange((evt, session) => {
          if (evt === 'SIGNED_OUT' && !busy) { current = null; pendingAuth = null; if (meChannel) client.removeChannel(meChannel); emitAuth(); }
        });
        // تنظيف رابط الدخول بعد الرجوع من جوجل
        if (/access_token|code=/.test(location.hash + location.search)) history.replaceState(null, '', location.pathname + '#/home');
      },
      me: () => current,
      pending: () => pendingAuth,

      // ---- حساب جديد بالرقم والباسورد (من غير أي تحقق ثنائي) ----
      async register(d) {
        busy = true;
        try {
          const res = await client.auth.signUp({ email: emailOf(d.phone), password: d.password });
          const data = ok(res);
          if (!data.session) throw fail('unconfirmed', 'الإعداد غير مكتمل: اقفل "Confirm email" من Supabase > Authentication > Sign In / Providers > Email.');
          const u = buildUser(d);
          const row = {
            id: data.user.id, role: u.role, status: u.status, name: u.name, phone: u.phone,
            dept: u.dept || null, fee: u.fee || 0, years: u.years || 0, license: u.license || ''
          };
          const ins = await client.from('profiles').insert(row);
          if (ins.error) { await client.auth.signOut().catch(() => {}); throw errMap(ins.error); }
          current = toUser({ ...row, photo: '', gender: '', age: '', notes: '', bio: '', created_at: Date.now() });
          watchMe(data.user.id);
          return current;
        } catch (e) { throw errMap(e); } finally { busy = false; }
      },

      // ---- دخول بالرقم والباسورد ----
      async login(phone, password) {
        busy = true;
        try {
          const data = ok(await client.auth.signInWithPassword({ email: emailOf(phone), password }));
          const u = await attach(data.user);
          if (!u) { await client.auth.signOut(); throw fail('nodoc', 'بيانات الحساب غير موجودة.'); }
          if (u.status === 'suspended') { await client.auth.signOut(); current = null; throw fail('suspended', 'الحساب موقوف. تواصل مع الإدارة.'); }
          return u;
        } catch (e) { throw errMap(e); } finally { busy = false; }
      },

      // ---- دخول بجوجل (مباشر) ----
      async loginWithGoogle() {
        const redirectTo = location.origin + location.pathname;
        ok(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }));
      },
      // أول مرة بجوجل: نكمّل بيانات الحساب (اسم + نوع الحساب)
      async completeProfile(d) {
        if (!pendingAuth) throw fail('nopending', 'لا يوجد حساب لإكماله.');
        busy = true;
        try {
          const u = buildUser({ ...d, phone: d.phone || '' });
          const row = {
            id: pendingAuth.id, role: u.role, status: u.status, name: u.name || pendingAuth.name, phone: u.phone,
            photo: pendingAuth.photo || '', dept: u.dept || null, fee: u.fee || 0, years: u.years || 0, license: u.license || ''
          };
          const ins = await client.from('profiles').insert(row);
          if (ins.error) throw errMap(ins.error);
          current = toUser({ ...row, gender: '', age: '', notes: '', bio: '', created_at: Date.now() });
          pendingAuth = null;
          watchMe(current.id);
          return current;
        } finally { busy = false; }
      },

      async logout() {
        busy = true;
        if (meChannel) { client.removeChannel(meChannel); meChannel = null; }
        current = null; pendingAuth = null;
        await client.auth.signOut();
        busy = false;
      },
      async updateMe(patch) {
        const allowed = ['name', 'photo', 'gender', 'age', 'notes', 'bio', 'dept', 'fee', 'years', 'license'];
        const row = {};
        allowed.forEach(k => { if (k in patch) row[k] = patch[k]; });
        ok(await client.from('profiles').update(row).eq('id', current.id));
        current = { ...current, ...patch, role: current.role, status: current.status, id: current.id };
        return current;
      },

      async getDoctor(id) {
        const { data, error } = await client.from('profiles').select('*').eq('id', id).eq('role', 'doctor').eq('status', 'approved').maybeSingle();
        if (error) throw errMap(error);
        return toUser(data);
      },
      watchDoctors: cb => live('doctors', 'profiles', null,
        async () => ok(await client.from('profiles').select('*').eq('role', 'doctor').eq('status', 'approved')).map(toUser), cb),

      async getSettings() {
        try {
          const { data } = await client.from('settings').select('value').eq('id', 'app').maybeSingle();
          return { ...defaults(), ...((data && data.value) || {}) };
        } catch (e) { return defaults(); }
      },
      async saveSettings(s) {
        const cur = await this.getSettings();
        ok(await client.from('settings').upsert({ id: 'app', value: { ...cur, ...s } }));
      },

      watchConsultations(cb) {
        const role = current.role;
        const col = role === 'doctor' ? 'doctor_id' : role === 'patient' ? 'patient_id' : null;
        return live('cons', 'consultations', col ? `${col}=eq.${current.id}` : null, async () => {
          let q = client.from('consultations').select('*');
          if (col) q = q.eq(col, current.id);
          return ok(await q).map(toCons).sort(byNewest);
        }, cb);
      },
      watchConsultation: (cid, cb) => live('con-' + cid, 'consultations', 'id=eq.' + cid,
        async () => { const { data, error } = await client.from('consultations').select('*').eq('id', cid).maybeSingle(); if (error) throw errMap(error); return data ? toCons(data) : null; }, cb),
      watchMessages: (cid, cb) => live('msg-' + cid, 'messages', 'cid=eq.' + cid,
        async () => ok(await client.from('messages').select('*').eq('cid', cid).order('at')).map(toMsg), cb),

      async createConsultation(d) {
        const row = {
          patient_id: current.id, doctor_id: d.doctorId, complaint: d.complaint, fee: d.fee,
          patient: d.patient, doctor: d.doctor, payment: d.payment, status: 'pending_payment'
        };
        const data = ok(await client.from('consultations').insert(row).select('id').single());
        return data.id;
      },
      async sendMessage(cid, text) {
        text = (text || '').trim();
        if (!text) return;
        ok(await client.from('messages').insert({ cid, sender: current.id, text }));
      },
      async closeConsultation(cid) {
        ok(await client.from('consultations').update({ status: 'closed' }).eq('id', cid));
      },

      watchUsers: cb => live('users', 'profiles', null,
        async () => ok(await client.from('profiles').select('*')).map(toUser).sort(byNewest), cb),
      async setUserStatus(id, status) { ok(await client.from('profiles').update({ status }).eq('id', id)); },
      async setPayment(cid, decision, reason) {
        const { data, error } = await client.from('consultations').select('payment').eq('id', cid).single();
        if (error) throw errMap(error);
        const payment = decision === 'confirmed'
          ? { ...data.payment, status: 'confirmed' }
          : { ...data.payment, status: 'rejected', reason: reason || '' };
        ok(await client.from('consultations').update({ status: decision === 'confirmed' ? 'open' : 'rejected', payment }).eq('id', cid));
      },
      demoReply() {},
      isSeedDoctor: () => false
    };
  })();

  const impl = hasSupabase ? sb : demo;
  return impl;
})();
