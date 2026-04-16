import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const titles = {
  "a-week-at-the-edge-of-the-world": "Камчатка за неделю",
  "killer-whales-and-bears": "Косатки и медведи",
  "kosatki-avachinskogo-zaliva": "Тайны Авачинского залива",
  "osennyaya-kamchatka": "Осенняя Камчатка",
  "secrets-of-the-ocean": "Тайны океана и Авачинского залива",
  "sailing-kamchatka": "Ski&Sail тур на Камчатке",
  "ski-and-sail-kamchatka": "Ski&Sail тур на Камчатке",
  "ski-tur-v-antarktide": "Ски-тур в Антарктиде",
  "space-kamchatka": "Космическая Камчатка",
  "volcanic-horizons-of-tolbachik": "Вулканические горизонты Толбачика",
};

const disciplines = {
  "a-week-at-the-edge-of-the-world": "Экспедиция",
  "killer-whales-and-bears": "Экспедиция / дикая природа",
  "kosatki-avachinskogo-zaliva": "Экспедиция / дикая природа",
  "osennyaya-kamchatka": "Экспедиция",
  "secrets-of-the-ocean": "Экспедиция / дикая природа",
  "sailing-kamchatka": "Фрирайд / яхтинг",
  "ski-and-sail-kamchatka": "Ски-тур / яхтинг",
  "ski-tur-v-antarktide": "Ски-тур / бэккантри",
  "space-kamchatka": "Экспедиция",
  "volcanic-horizons-of-tolbachik": "Экспедиция / трекинг",
};

const descriptions = {
  "a-week-at-the-edge-of-the-world":
    "Недельная экспедиционная программа по Камчатке: природные локации, морские выходы, наблюдение за сивучами, китами и косатками по погоде и сопровождение команды организатора.",
  "killer-whales-and-bears":
    "Морская экспедиция по Камчатке с катамараном, каякингом, вулканическими локациями и наблюдением за косатками, медведями и природой Тихого океана.",
  "kosatki-avachinskogo-zaliva":
    "Исследовательско-приключенческая программа по Авачинскому заливу: морской маршрут, наблюдение за флорой и фауной, остановки в бухтах и сопровождение команды.",
  "osennyaya-kamchatka":
    "Осенняя программа по Камчатке с морским выходом, джип-маршрутами, вулканическими локациями и наблюдением за дикой природой в спокойном сезонном формате.",
  "secrets-of-the-ocean":
    "Морская экспедиция вдоль восточного побережья Камчатки: Авачинский залив, бухты, наблюдение за океаном и дикой природой, участие малой группы.",
  "sailing-kamchatka":
    "Фрирайд-путешествие на катамаране по Авачинскому заливу и бухте Русская: морские переходы, выходы на берег, катание на лыжах или сноуборде, каякинг по погоде и сопровождение команды организатора.",
  "ski-and-sail-kamchatka":
    "Ски-тур с проживанием на парусном катамаране: морские переходы, каякинг, наблюдение за сивучами и катание в районе Авачинского залива.",
  "ski-tur-v-antarktide":
    "Экспедиционный ски-тур в Антарктиде для подготовленных участников: удаленная локация, бэккантри-формат и участие только после уточнения условий с организатором.",
  "space-kamchatka":
    "Экспедиционная программа по Камчатке: океан, вулканы, Долина гейзеров, каякинг, восхождения и наблюдение за природой в сопровождении команды организатора.",
  "volcanic-horizons-of-tolbachik":
    "Трекинговая экспедиция к вулканам Плоский и Острый Толбачик: лавовые поля, Мертвый лес, вулканические маршруты и выезд к ключевым природным точкам Камчатки.",
};

const itineraries = {
  "a-week-at-the-edge-of-the-world":
    "Маршрут на 7 дней. В программе: знакомство с природными локациями Камчатки, морские выходы по погоде, наблюдение за сивучами, китами и косатками, отдых в бухтах и сопровождение команды организатора.",
  "killer-whales-and-bears":
    "Маршрут на 10 дней. В программе: морское путешествие на катамаране, каякинг, вулканические локации, наблюдение за косатками и медведями по погоде, переходы и стоянки в бухтах.",
  "kosatki-avachinskogo-zaliva":
    "Маршрут по Авачинскому заливу. В программе: морской выход, наблюдение за флорой и фауной, остановки в бухтах, исследовательско-приключенческий формат для малой группы.",
  "osennyaya-kamchatka":
    "Осенняя программа на 7 дней. В программе: морской выход, джип-маршруты, вулканические и природные локации, наблюдение за дикой природой и сопровождение команды.",
  "secrets-of-the-ocean":
    "Маршрут на 10 дней вдоль восточного побережья Камчатки. В программе: Авачинский залив, остановки в бухтах, наблюдение за океаном и дикой природой, малый состав группы.",
  "sailing-kamchatka":
    "Программа рассчитана на 8 дней. На Камчатке заложено 6 полных дней, из них 4-5 дней группа проводит в бухте Русская. Организаторы выбирают погодное окно за неделю до старта: маршрут может включать морской трансфер на катамаране/катере и вертолетный трансфер минимум в одну сторону по погоде. На маршруте: фрирайд-выходы, спуски на лыжах или сноуборде, морские переходы, каякинг по погоде и посещение лежбища сивучей.",
  "ski-and-sail-kamchatka":
    "Программа рассчитана на 5 дней. В формате: проживание на парусном катамаране, морские переходы, каякинг, наблюдение за сивучами и катание в районе Авачинского залива. Точный план по дням зависит от погоды и подтверждается организатором.",
  "ski-tur-v-antarktide":
    "Экспедиционный маршрут. Точные даты, длительность, состав группы и требования к участникам оператор должен подтвердить по источнику перед передачей заявки организатору.",
  "space-kamchatka":
    "Маршрут на 9 дней. В программе: океан, каякинг, восхождения, вулканические локации, Долина гейзеров и наблюдение за природой по погоде и сезону.",
  "volcanic-horizons-of-tolbachik":
    "Маршрут на 8 дней. В программе: вулканы Плоский и Острый Толбачик, лавовые поля, Мертвый лес, трекинговые выходы и возможный вылет к Долине гейзеров по погоде и условиям организатора.",
};

const exactLocations = {
  "a-week-at-the-edge-of-the-world": "Камчатка",
  "killer-whales-and-bears": "Авачинский залив",
  "kosatki-avachinskogo-zaliva": "Авачинский залив",
  "osennyaya-kamchatka": "Камчатка",
  "secrets-of-the-ocean": "Авачинский залив",
  "sailing-kamchatka": "Бухта Русская / Авачинский залив",
  "ski-and-sail-kamchatka": "Авачинский залив / Камчатка",
  "ski-tur-v-antarktide": "Антарктида",
  "space-kamchatka": "Камчатка",
  "volcanic-horizons-of-tolbachik": "Толбачик",
};

const levels = {
  "a-week-at-the-edge-of-the-world": "all_levels",
  "killer-whales-and-bears": "all_levels",
  "kosatki-avachinskogo-zaliva": "all_levels",
  "osennyaya-kamchatka": "all_levels",
  "secrets-of-the-ocean": "all_levels",
  "sailing-kamchatka": "beginner",
  "ski-and-sail-kamchatka": "intermediate",
  "ski-tur-v-antarktide": "expert",
  "space-kamchatka": "intermediate",
  "volcanic-horizons-of-tolbachik": "intermediate",
};

const eventTypes = {
  "sailing-kamchatka": "trip",
  "ski-and-sail-kamchatka": "trip",
};

const defaultInclusions =
  "Базовая программа и сопровождение организатора. Детальный состав включенного оператор уточняет по источнику перед передачей заявки.";

const inclusions = {
  "sailing-kamchatka":
    "Размещение, питание, трансферы и сопровождение по программе организатора; морские переходы и катание по погодному окну.",
  "ski-and-sail-kamchatka":
    "Проживание на катамаране, морские переходы и сопровождение по программе организатора; детали включенного уточняются перед заявкой.",
};

function getSlug(url) {
  return /\/programs\/([^/?#]+)/i.exec(url ?? "")?.[1]?.toLowerCase() ?? null;
}

const programs = await prisma.program.findMany({
  where: { cta: { contains: "allaboutkamchatka.ru", mode: "insensitive" } },
  include: {
    publishedPrograms: {
      include: { candidate: { include: { normalizedItem: true } } },
    },
  },
});

let updated = 0;
const changed = [];

for (const program of programs) {
  const slug = getSlug(program.cta);
  if (!slug || !titles[slug]) continue;

  const data = {
    title: titles[slug],
    discipline: disciplines[slug],
    exactLocation: exactLocations[slug] ?? program.exactLocation,
    audienceFit: descriptions[slug],
    itineraryDayByDay: itineraries[slug],
    inclusions: inclusions[slug] ?? defaultInclusions,
    levelRequired: levels[slug] ?? program.levelRequired,
    formatType: eventTypes[slug] ?? "expedition",
  };

  await prisma.program.update({ where: { id: program.id }, data });

  for (const link of program.publishedPrograms) {
    const normalizedItemId = link.candidate?.normalizedItem?.id;
    if (!normalizedItemId) continue;
    await prisma.normalizedItem.update({
      where: { id: normalizedItemId },
      data: {
        title: data.title,
        discipline: data.discipline,
        descriptionShort: data.audienceFit,
        descriptionFull: data.itineraryDayByDay,
        city: data.exactLocation,
        venue: data.exactLocation,
        level: data.levelRequired,
        eventType: data.formatType,
        parseVersion: "v1_rules_kamchatka_freeride_community_ru",
      },
    });
  }

  updated += 1;
  changed.push({ id: program.id, slug, title: data.title, discipline: data.discipline });
}

console.log(JSON.stringify({ updated, changed }, null, 2));
await prisma.$disconnect();
