"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { bootThirdPartyTags, getAnalyticsConsent, setAnalyticsConsent } from "../lib/analytics/client";

export function AnalyticsRoot() {
  const [consent, setConsent] = useState<"unknown" | "accepted" | "rejected">("unknown");

  useEffect(() => {
    setConsent(getAnalyticsConsent());
    const onChange = () => setConsent(getAnalyticsConsent());
    window.addEventListener("mw_analytics_consent_changed", onChange);
    return () => window.removeEventListener("mw_analytics_consent_changed", onChange);
  }, []);

  useEffect(() => {
    if (consent === "accepted") {
      bootThirdPartyTags();
    }
  }, [consent]);

  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  const ymId = process.env.NEXT_PUBLIC_YM_ID;

  const showBanner = useMemo(() => consent === "unknown", [consent]);

  return (
    <>
      {consent === "accepted" && gaId ? (
        <>
          <Script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} />
          <Script id="mw-ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}

      {consent === "accepted" && ymId ? (
        <Script id="mw-ym-init" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${ymId}", "ym");
            ym(${Number(ymId)}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, defer: true });
          `}
        </Script>
      ) : null}

      {showBanner ? (
        <div
          className="mw-cookie-banner"
          style={{
            position: "fixed",
            right: 14,
            padding: 10,
            borderRadius: 12,
            background: "rgba(240, 247, 246, 0.92)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(22, 73, 67, 0.16)",
            color: "#163c38",
            zIndex: 9999,
            boxShadow: "0 6px 18px rgba(16, 44, 40, 0.14)",
            fontSize: 13,
            lineHeight: 1.35,
            maxWidth: 520,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            Мы используем cookies и обезличенную аналитику, чтобы сайт работал стабильнее и показывал более полезный контент.
            Персональные данные для рекламы не передаем.
            {" "}
            <a
              href="/privacy-and-consent"
              style={{ color: "#0b7f71", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Подробнее о конфиденциальности и согласии
            </a>
            .
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setAnalyticsConsent("accepted")}
              style={{
                padding: "6px 10px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                background: "#27c4a8",
                color: "#041b19",
                fontWeight: 600,
              }}
            >
              Принять и продолжить
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsConsent("rejected")}
              style={{
                padding: "6px 10px",
                borderRadius: 9,
                border: "1px solid rgba(22, 73, 67, 0.35)",
                background: "transparent",
                color: "#163c38",
                cursor: "pointer",
              }}
            >
              Только необходимые
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
