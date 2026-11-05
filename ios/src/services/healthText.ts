import type { HealthId, HealthItem, HealthKey } from './healthCheck';

export type HealthLanguage = 'en' | 'hi' | 'mr';

export interface HealthText {
  title: string;
  allOk: string;
  attention: (count: number) => string;
  labels: Record<HealthId, string>;
  // Texts may contain {n}, {when}, {tablet} and {version}.
  values: Record<HealthKey, string>;
  never: string;
  lessThanHour: string;
  hoursAgo: (hours: number) => string;
  daysAgo: (days: number) => string;
}

export const healthText: Record<HealthLanguage, HealthText> = {
  en: {
    title: 'Device check',
    allOk: 'All checks OK',
    attention: (count) => `${count} check(s) need attention`,
    labels: {
      offline: 'Works offline',
      homeScreen: 'Home Screen app',
      tablet: 'Tablet number',
      sharing: 'Can attach files',
      unexported: 'Not yet sent',
      clock: 'Date and time',
      storage: 'Storage protection',
      version: 'App version',
    },
    values: {
      'offline.ok': 'Ready',
      'offline.warn':
        'Not ready. Open the app with internet and wait 30 seconds.',
      'homeScreen.ok': 'Yes',
      'homeScreen.warn': 'No. Open the app from the Home Screen icon.',
      'tablet.ok': '{tablet}',
      'tablet.warn': 'Not chosen',
      'sharing.ok': 'Yes',
      'sharing.warn': 'No. Use Safari on the iPad.',
      'unexported.none': 'All guests sent',
      'unexported.recent': '{n} waiting. Last sent: {when}',
      'unexported.stale': '{n} not sent yet. Last sent: {when}',
      'clock.ok': 'Looks right',
      'clock.warn': 'Looks wrong. Check the iPad date and time.',
      'storage.ok': 'Protected',
      'storage.unknown': 'Unknown. Send the file every evening.',
      'version.info': '{version}',
    },
    never: 'never',
    lessThanHour: 'less than 1 hour ago',
    hoursAgo: (hours) => `${hours} hour(s) ago`,
    daysAgo: (days) => `${days} day(s) ago`,
  },

  hi: {
    title: 'डिवाइस जाँच',
    allOk: 'सब ठीक है',
    attention: (count) => `${count} जाँच पर ध्यान दें`,
    labels: {
      offline: 'ऑफ़लाइन काम',
      homeScreen: 'होम स्क्रीन ऐप',
      tablet: 'टैबलेट नंबर',
      sharing: 'फ़ाइल शेयर',
      unexported: 'अभी नहीं भेजे',
      clock: 'तारीख और समय',
      storage: 'स्टोरेज सुरक्षा',
      version: 'ऐप वर्शन',
    },
    values: {
      'offline.ok': 'तैयार',
      'offline.warn':
        'तैयार नहीं। इंटरनेट के साथ ऐप खोलें और 30 सेकंड रुकें।',
      'homeScreen.ok': 'हाँ',
      'homeScreen.warn': 'नहीं। होम स्क्रीन के आइकन से ऐप खोलें।',
      'tablet.ok': '{tablet}',
      'tablet.warn': 'चुना नहीं गया',
      'sharing.ok': 'हाँ',
      'sharing.warn': 'नहीं। iPad पर Safari इस्तेमाल करें।',
      'unexported.none': 'सभी रिकॉर्ड भेजे जा चुके हैं',
      'unexported.recent': '{n} बाकी। आखिरी बार भेजा: {when}',
      'unexported.stale': '{n} अभी नहीं भेजे। आखिरी बार भेजा: {when}',
      'clock.ok': 'सही दिख रहा है',
      'clock.warn': 'गलत लग रहा है। iPad की तारीख और समय जाँचें।',
      'storage.ok': 'सुरक्षित',
      'storage.unknown': 'पता नहीं। हर शाम फ़ाइल भेजें।',
      'version.info': '{version}',
    },
    never: 'कभी नहीं',
    lessThanHour: '1 घंटे से कम पहले',
    hoursAgo: (hours) => `${hours} घंटे पहले`,
    daysAgo: (days) => `${days} दिन पहले`,
  },

  mr: {
    title: 'डिव्हाइस तपासणी',
    allOk: 'सर्व ठीक आहे',
    attention: (count) => `${count} तपासणीकडे लक्ष द्या`,
    labels: {
      offline: 'ऑफलाइन काम',
      homeScreen: 'होम स्क्रीन अॅप',
      tablet: 'टॅबलेट नंबर',
      sharing: 'फाइल शेअर',
      unexported: 'अजून पाठवले नाहीत',
      clock: 'तारीख आणि वेळ',
      storage: 'स्टोरेज सुरक्षा',
      version: 'अॅप आवृत्ती',
    },
    values: {
      'offline.ok': 'तयार',
      'offline.warn':
        'तयार नाही. इंटरनेटसह अॅप उघडा आणि 30 सेकंद थांबा.',
      'homeScreen.ok': 'होय',
      'homeScreen.warn': 'नाही. होम स्क्रीनवरील आयकॉनवरून अॅप उघडा.',
      'tablet.ok': '{tablet}',
      'tablet.warn': 'निवडलेला नाही',
      'sharing.ok': 'होय',
      'sharing.warn': 'नाही. iPad वर Safari वापरा.',
      'unexported.none': 'सर्व नोंदी पाठवल्या आहेत',
      'unexported.recent': '{n} बाकी. शेवटचे पाठवले: {when}',
      'unexported.stale': '{n} अजून पाठवल्या नाहीत. शेवटचे पाठवले: {when}',
      'clock.ok': 'बरोबर दिसते',
      'clock.warn': 'चुकीची वाटते. iPad ची तारीख आणि वेळ तपासा.',
      'storage.ok': 'सुरक्षित',
      'storage.unknown': 'माहीत नाही. रोज संध्याकाळी फाइल पाठवा.',
      'version.info': '{version}',
    },
    never: 'कधीच नाही',
    lessThanHour: 'तासापेक्षा कमी वेळापूर्वी',
    hoursAgo: (hours) => `${hours} तासांपूर्वी`,
    daysAgo: (days) => `${days} दिवसांपूर्वी`,
  },
};

export function describeWhen(
  text: HealthText,
  hours: number | null | undefined,
): string {
  if (hours === null || hours === undefined) return text.never;
  if (hours < 1) return text.lessThanHour;
  if (hours < 48) return text.hoursAgo(hours);

  return text.daysAgo(Math.floor(hours / 24));
}

export function describeItem(text: HealthText, item: HealthItem): string {
  return text.values[item.key]
    .replace('{n}', String(item.params.n ?? 0))
    .replace('{when}', describeWhen(text, item.params.hours))
    .replace('{tablet}', item.params.tablet ?? '')
    .replace('{version}', item.params.version ?? '');
}
