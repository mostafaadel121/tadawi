# تداوي — منصة استشارات طبية (Supabase)

أقسام: **المخ والأعصاب** و **العناية المركزة**.
Frontend: HTML + CSS + JavaScript. البيانات والدخول: **Supabase** (Postgres + Auth + Realtime) مع سياسات أمان RLS.

## الدخول
- **جوجل** بضغطة واحدة. أول مرة بيطلب منك تكمّل الاسم ونوع الحساب (مريض/طبيب).
- **رقم الموبايل + باسورد**.
- **من غير أي تحقق ثنائي (2FA/OTP)**.

## 1) شغّله دلوقتي (وضع تجريبي)
افتح `public/index.html` (سيب `SUPABASE_CONFIG` فاضي). البيانات في متصفحك.
أدمن: `admin` / `admin123` — طبيب: `01000000001` / `123456`.

## 2) التشغيل الحقيقي على Supabase
1. [supabase.com](https://supabase.com) → **New project**.
2. **SQL Editor → New query** → الصق محتوى `supabase/schema.sql` كله → **Run**.
3. **Authentication → Sign In / Providers → Email**: خليه **Enabled** و**اقفل "Confirm email"** (مهم، لأن دخول الرقم بيستخدم إيميل داخلي `رقمك@tadawi.app`).
4. **Authentication → Sign In / Providers → Google → Enable**:
   - من [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
   - في **Authorized redirect URIs** حط الـ Callback URL اللي ظاهر في صفحة Google provider في Supabase (شكله `https://<project>.supabase.co/auth/v1/callback`).
   - انسخ **Client ID** و **Client Secret** في Supabase واحفظ.
5. **Authentication → URL Configuration**: حط رابط موقعك في **Site URL** وضيفه كمان في **Redirect URLs** (ومعاه `http://localhost:3000` للتجربة).
6. **Project Settings → API**: انسخ **Project URL** و **anon public key** وحطهم في `public/js/config.js`.
   (متحطش `service_role` في الفرونت أبدًا.)
7. اختبر محليًا: `npx serve public` (لازم سيرفر عشان جوجل). وبعدها انشر الفولدر `public` على Vercel / Netlify / Cloudflare Pages.
8. **أول أدمن:** سجّل حساب عادي من الموقع، وبعدين في SQL Editor:
   ```sql
   update public.profiles set role = 'admin', status = 'active' where phone = '01xxxxxxxxx';
   -- أو لو دخلت بجوجل:
   update public.profiles set role = 'admin', status = 'active'
   where id = (select id from auth.users where email = 'you@gmail.com');
   ```
9. من لوحة الأدمن → **الإعدادات** اكتب **رقم فوري** الحقيقي.

## الدورة
- **الطبيب** يسجل → `pending` → الأدمن يعتمده → يظهر للمرضى.
- **المريض** يختار طبيب → يوصف حالته → يدفع على فوري ويكتب رقم العملية.
- **الأدمن** يأكد الدفع (الشات يتفتح) أو يرفض بسبب.
- **الشات** لحظي (Supabase Realtime) بين المريض والطبيب فقط، والأدمن مش بيقرأ المحادثات.

## الأمان (RLS + تريجرز)
- محدش يقدر يغيّر `role` أو `status` بتاعه من الموقع (تريجر + سياسة).
- المريض يحجز بس بحالة `pending_payment` وعند طبيب معتمد.
- الدكتور يقدر ينهي الاستشارة المفتوحة بس، ومش بيعدل الدفع ولا السعر.
- الرسائل مقروءة للمريض والطبيب بس، وبتتبعت بس لو الاستشارة `open`.

## ملاحظات مهمة
- **الرقم مش متحقق منه:** بما إن مفيش OTP، أي حد يقدر يسجل بأي رقم. ده نتيجة طلب "من غير تحقق ثنائي"؛ لو عايز تحقق لاحقًا فعّل Phone Auth في Supabase.
- حساب جوجل وحساب الرقم **حسابين منفصلين** (إيميل جوجل ≠ رقم الموبايل).
- الصور (البروفايل والإيصالات) بتتصغّر وتتخزن كنص داخل الجدول (من غير Storage).
- تأكيد فوري **يدوي** من الأدمن.
- حذف حساب الدخول نفسه بيتم من Supabase → Authentication → Users.
- راجع الجانب القانوني للتطبيب عن بعد وحماية البيانات الطبية في مصر قبل الإطلاق.

## ملفات المشروع
```
public/index.html
public/css/style.css
public/js/config.js    إعدادات Supabase والأقسام
public/js/db.js        طبقة البيانات (Supabase + وضع تجريبي بنفس الواجهة)
public/js/app.js       الشاشات ولوحة الأدمن
supabase/schema.sql    الجداول + RLS + Realtime
```
