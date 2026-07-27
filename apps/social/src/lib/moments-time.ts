/**
 * WeChat Moments–style relative time (meaningful, not full datetime).
 *
 * Rules (local calendar):
 * - < 1 min → Just now
 * - < 60 min → N minutes ago
 * - same day → N hours ago
 * - yesterday → Yesterday HH:mm
 * - within 7 days → N days ago
 * - same year → M月D日 / Apr 3
 * - else → YYYY年M月D日 / Apr 3, 2024
 */

export interface MomentsTimeLabels {
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  yesterday: (hm: string) => string;
  daysAgo: (n: number) => string;
}

const EN_LABELS: MomentsTimeLabels = {
  justNow: "Just now",
  minutesAgo: (n) => (n === 1 ? "1 minute ago" : `${n} minutes ago`),
  hoursAgo: (n) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
  yesterday: (hm) => `Yesterday ${hm}`,
  daysAgo: (n) => (n === 1 ? "1 day ago" : `${n} days ago`),
};

const ZH_LABELS: MomentsTimeLabels = {
  justNow: "刚刚",
  minutesAgo: (n) => `${n}分钟前`,
  hoursAgo: (n) => `${n}小时前`,
  yesterday: (hm) => `昨天 ${hm}`,
  daysAgo: (n) => `${n}天前`,
};

const KO_LABELS: MomentsTimeLabels = {
  justNow: "방금 전",
  minutesAgo: (n) => `${n}분 전`,
  hoursAgo: (n) => `${n}시간 전`,
  yesterday: (hm) => `어제 ${hm}`,
  daysAgo: (n) => `${n}일 전`,
};

const JA_LABELS: MomentsTimeLabels = {
  justNow: "たった今",
  minutesAgo: (n) => `${n}分前`,
  hoursAgo: (n) => `${n}時間前`,
  yesterday: (hm) => `昨日 ${hm}`,
  daysAgo: (n) => `${n}日前`,
};

function isZhLocale(locale: string): boolean {
  return /^zh\b/i.test(locale.trim());
}

function isKoLocale(locale: string): boolean {
  return /^ko\b/i.test(locale.trim());
}

function isJaLocale(locale: string): boolean {
  return /^ja\b/i.test(locale.trim());
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatSameYearDate(d: Date, zh: boolean, locale: string): string {
  if (zh) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatFullDate(d: Date, zh: boolean, locale: string): string {
  if (zh) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export function momentsTimeLabelsForLocale(locale: string): MomentsTimeLabels {
  if (isZhLocale(locale)) return ZH_LABELS;
  if (isKoLocale(locale)) return KO_LABELS;
  if (isJaLocale(locale)) return JA_LABELS;
  return EN_LABELS;
}

export function formatMomentsTime(
  iso: string,
  locale = "en",
  nowMs = Date.now(),
  labels: MomentsTimeLabels = momentsTimeLabelsForLocale(locale),
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const now = new Date(nowMs);
  const diffMs = now.getTime() - d.getTime();
  // Future timestamps: show Just now rather than negative phrasing.
  if (diffMs < 0) return labels.justNow;

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return labels.justNow;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return labels.minutesAgo(diffMin);

  const dayStartNow = startOfLocalDay(now);
  const dayStartThen = startOfLocalDay(d);
  const dayDiff = Math.round((dayStartNow.getTime() - dayStartThen.getTime()) / 86_400_000);

  if (dayDiff === 0) {
    const diffHour = Math.max(1, Math.floor(diffMin / 60));
    return labels.hoursAgo(diffHour);
  }

  if (dayDiff === 1) return labels.yesterday(formatHm(d));

  if (dayDiff >= 2 && dayDiff < 7) return labels.daysAgo(dayDiff);

  const zh = isZhLocale(locale);
  if (d.getFullYear() === now.getFullYear()) {
    return formatSameYearDate(d, zh, locale);
  }
  return formatFullDate(d, zh, locale);
}
