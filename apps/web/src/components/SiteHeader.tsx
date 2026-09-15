import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="mw-skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <header className="mw-header">
        <div className="mw-container mw-header__inner">
          <Link
            href="/"
            aria-label="MyWaveTour — на главную"
            className="mw-header__brand"
          >
            <img
              src="/brand/mywavetour-logo-human.png"
              alt="MyWaveTour"
              width="180"
              height="64"
            />
          </Link>
          <nav aria-label="Основная навигация">
            <Link href="/#programs">Выезды</Link>
            <Link href="/#role-traveler">Как это работает</Link>
            <Link href="/organizers/program">Организаторам</Link>
          </nav>
        </div>
      </header>
    </>
  );
}
