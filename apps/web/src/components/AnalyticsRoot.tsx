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
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            padding: 14,
            borderRadius: 12,
            background: "rgba(10, 12, 18, 0.92)",
            color: "#fff",
            zIndex: 9999,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          <div style={{ marginBottom: 10 }}>
            Мы используем аналитику (GA4/Яндекс.Метрика) и серверные события <strong>без персональных данных</strong>, чтобы улучшать продукт.
            Подробности: <code>docs/analytics/PRIVACY_AND_CONSENT.md</code>.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setAnalyticsConsent("accepted")}
              style={{ padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer" }}
            >
              Принять
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsConsent("rejected")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Отклонить
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
