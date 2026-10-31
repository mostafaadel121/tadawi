// ============================================================
//  إعدادات تداوي
//  1) سيب SUPABASE_CONFIG فاضي = وضع تجريبي (بيانات في المتصفح فقط)
//  2) املاه ببيانات مشروعك من Supabase = وضع حقيقي
//     (Project Settings > API: انسخ Project URL و anon public key)
//  الـ anon key مصمم يكون علني في الفرونت اند، والحماية الحقيقية في سياسات RLS.
//  متحطش service_role key هنا أبدًا.
// ============================================================
const SUPABASE_CONFIG = {
  url: 'https://rhkynoflgbcoimnfmycm.supabase.co',
  anonKey: 'sb_publishable_omRGt6gl_8HHI3fOczOnMQ_5DJ8HMUz'  // publishable key (آمن في الفرونت اند)
};

const APP_CONFIG = {
  appName: 'تداوي',
  currency: 'ج.م',
  // رقم فوري الافتراضي — بيتغير بعد كده من لوحة الأدمن > الإعدادات
  defaultFawryNumber: '01000000000',
  departments: {
    neuro: { name: 'المخ والأعصاب', icon: '🧠', desc: 'الصداع، الصرع، السكتات الدماغية، أمراض الأعصاب والحركة' },
    icu: { name: 'العناية المركزة', icon: '🫀', desc: 'متابعة الحالات الحرجة والاستشارات العاجلة للرعاية المركزة' }
  }
};
