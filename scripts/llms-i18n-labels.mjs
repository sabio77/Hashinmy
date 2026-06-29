export const LLMS_HOME_LABELS_BY_LANGUAGE = Object.freeze({
  es: 'Inicio',
  en: 'Home',
  zh: '首页',
  hi: 'होम',
  ar: 'الرئيسية',
  fr: 'Accueil',
  bn: 'হোম',
  pt: 'Início',
  ru: 'Главная',
  id: 'Beranda',
  ur: 'ہوم',
  de: 'Startseite',
  ja: 'ホーム',
  sw: 'Nyumbani',
  mr: 'मुख्यपृष्ठ',
  te: 'హోమ్',
  tr: 'Ana sayfa',
  ta: 'முகப்பு',
  vi: 'Trang chủ',
  ko: '홈',
  it: 'Pagina iniziale',
  fa: 'خانه',
  pl: 'Strona główna',
  uk: 'Головна',
  nl: 'Startpagina',
  th: 'หน้าแรก',
  gu: 'હોમ',
  ro: 'Acasă',
  ms: 'Laman utama',
  ha: 'Gida',
  pa: 'ਘਰ',
  fil: 'Pangunahing pahina',
  jv: 'Kaca ngarep',
  am: 'መነሻ',
  my: 'မူလစာမျက်နှာ',
  kn: 'ಮುಖಪುಟ',
  ml: 'ഹോം',
  or: 'ମୂଳ ପୃଷ୍ଠା',
  as: 'মুখ্যপৃষ্ঠা',
  ne: 'गृहपृष्ठ',
  si: 'මුල් පිටුව',
  el: 'Αρχική',
  cs: 'Domů',
  sv: 'Startsida',
  hu: 'Kezdőlap',
  he: 'דף הבית',
  da: 'Forside',
  fi: 'Etusivu',
  no: 'Hjem',
  ca: 'Inici'
});

export function getLlmsHomeLabel(code = 'es') {
  const normalized = String(code || 'es').trim().toLowerCase();
  return LLMS_HOME_LABELS_BY_LANGUAGE[normalized] || LLMS_HOME_LABELS_BY_LANGUAGE.es;
}

export function getLlmsHubLabel(bundle = {}) {
  return String(
    bundle?.entryLabel
    || bundle?.uiLabels?.productsLabel
    || bundle?.hubTitle
    || 'Hashinmy'
  ).replace(/\s+/g, ' ').trim() || 'Hashinmy';
}
