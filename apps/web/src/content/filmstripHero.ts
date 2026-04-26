/**
 * Кадры hero-filmstrip: web-ready JPEG в `public/media/filmstrip/`.
 * Пересборка: `pnpm --filter web run filmstrip:build-assets` (см. scripts/build_filmstrip_web_images.mjs, README в каталоге filmstrip).
 */

export type FilmstripEmphasis = "pilot" | "breadth";

export type FilmstripFrame = {
  id: string;
  /** Путь относительно `public/` */
  imageSrc: string;
  kicker: string;
  title: string;
  caption: string;
  emphasis: FilmstripEmphasis;
  href?: string;
};

export const filmstripFrames: FilmstripFrame[] = [
  {
    id: "ws-krasnodar",
    imageSrc: "/media/filmstrip/wakesurf/wasurf_1.jpg",
    kicker: "Фокус сезона · Wakesurf / вейксерф · Краснодар",
    title: "Главное направление каталога",
    caption: "Старт сезона и прогресс в дисциплине с понятным форматом, ритмом и сопровождением.",
    emphasis: "pilot",
  },
  {
    id: "ws-camp",
    imageSrc: "/media/filmstrip/wakesurf/wasurf_2.jpg",
    kicker: "Каталог · Wakesurf / вейксерф",
    title: "Кэмп на прогресс",
    caption: "Уикенды и короткие кэмпы для осознанного прогресса — не разовая поездка, а понятный шаг в технике.",
    emphasis: "pilot",
  },
  {
    id: "mtb",
    imageSrc: "/media/filmstrip/mtb/mtbdh_1.jpg",
    kicker: "Платформа · MTB / маунтинбайк",
    title: "Гравити-формат",
    caption: "Гравити и техника — сигнал будущей ширины платформы вне воды.",
    emphasis: "breadth",
  },
  {
    id: "ski-snow",
    imageSrc: "/media/filmstrip/ski/ski_kids_1.jpg",
    kicker: "Платформа · лыжи и снег",
    title: "Горные программы",
    caption: "Семейные и детские форматы — часть долгой дорожной карты MyWave.",
    emphasis: "breadth",
  },
  {
    id: "kite-wind",
    imageSrc: "/media/filmstrip/kite/kite_1.jpg",
    kicker: "Платформа · кайт / винд / винг",
    title: "Ветер и вода",
    caption: "Кайт, винд и винг — направления, которые логично лягут в экосистему выездов.",
    emphasis: "breadth",
  },
];
