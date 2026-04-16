"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrCreateSessionId, trackProductEvent } from "../../lib/analytics/client";

const CONTRACT_COMPONENT = "ContractDownloadBlock";
const PDF_HREF = "/docs/MyWave_Dogovor_s_Organizatorom_v1.pdf";
const DOCX_HREF = "/docs/MyWave_Dogovor_s_Organizatorom_v1.docx";

export type ContractPageContext = "program" | "verification";

type ContractDownloadBlockProps = {
  /** Логическая зона воронки (каноническое значение для analytics). */
  area?: string;
  /** Страница воронки: program | verification — одинаковое поведение блока. */
  page: ContractPageContext;
  contractVersion?: string;
  versionLabel?: string;
  userRole?: string;
  organizerId?: string | null;
};

function viewStorageKey(page: string, version: string) {
  return `mw_contract_view_block:${page}:${version}`;
}

function ackStorageKey(page: string, version: string) {
  return `mw_contract_acknowledged:${page}:${version}`;
}

export function ContractDownloadBlock({
  area = "organizers",
  page,
  contractVersion = "v1",
  versionLabel = "Версия договора: v1",
  userRole = "organizer",
  organizerId = null,
}: ContractDownloadBlockProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const viewTrackedRef = useRef(false);
  const clickBusyRef = useRef(false);
  const [ackSent, setAckSent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAckSent(sessionStorage.getItem(ackStorageKey(page, contractVersion)) === "1");
  }, [page, contractVersion]);

  const basePayload = useCallback(
    (extra: Record<string, unknown>) => ({
      user_role: userRole,
      ...(organizerId ? { organizer_id: organizerId } : {}),
      ...extra,
    }),
    [organizerId, userRole]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const storageKey = viewStorageKey(page, contractVersion);
    if (sessionStorage.getItem(storageKey) === "1") {
      viewTrackedRef.current = true;
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.4);
        if (!hit || viewTrackedRef.current) return;
        viewTrackedRef.current = true;
        sessionStorage.setItem(storageKey, "1");
        const sid = getOrCreateSessionId();
        const idem = `fe:contract_view_block:${sid}:${page}:${contractVersion}`;
        void trackProductEvent(
          "contract_view_block",
          basePayload({
            area,
            page,
            file_type: "none",
            component: CONTRACT_COMPONENT,
          }),
          {
            idempotencyKey: idem,
            contract_version: contractVersion,
          }
        );
      },
      { threshold: [0, 0.25, 0.4, 0.6] }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [area, basePayload, contractVersion, page]);

  const triggerDownload = useCallback(
    async (fileType: "pdf" | "docx", href: string) => {
      if (clickBusyRef.current) return;
      clickBusyRef.current = true;
      try {
        const eventName = fileType === "pdf" ? "contract_download_pdf" : "contract_download_docx";
        const idem = `fe:${eventName}:${crypto.randomUUID()}`;
        await trackProductEvent(
          eventName,
          basePayload({
            area,
            page,
            file_type: fileType,
            component: CONTRACT_COMPONENT,
          }),
          { idempotencyKey: idem, contract_version: contractVersion }
        );
        const a = document.createElement("a");
        a.href = href;
        a.rel = "noopener";
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        clickBusyRef.current = false;
      }
    },
    [area, basePayload, contractVersion, page]
  );

  const onAcknowledge = useCallback(async () => {
    if (typeof window === "undefined") return;
    const key = ackStorageKey(page, contractVersion);
    if (sessionStorage.getItem(key) === "1") return;
    const idem = `fe:contract_acknowledged:${page}:${contractVersion}:${crypto.randomUUID()}`;
    await trackProductEvent(
      "contract_acknowledged",
      basePayload({
        area,
        page,
        file_type: "none",
        component: CONTRACT_COMPONENT,
      }),
      { idempotencyKey: idem, contract_version: contractVersion }
    );
    sessionStorage.setItem(key, "1");
    setAckSent(true);
  }, [area, basePayload, contractVersion, page]);

  return (
    <section
      ref={rootRef}
      className="mw-content-section"
      style={{ marginBottom: "2rem" }}
    >
      <h2 className="mw-h2">Договор с организатором</h2>
      <p style={{ marginTop: 0, color: "var(--mw-muted)", lineHeight: 1.6, maxWidth: "62ch" }}>
        Для ознакомления используйте PDF как основной формат. DOCX доступен как дополнительная версия.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="mw-btn mw-btn--primary"
          onClick={() => void triggerDownload("pdf", PDF_HREF)}
        >
          Скачать договор PDF
        </button>
        <button
          type="button"
          className="mw-btn mw-btn--ghost"
          onClick={() => void triggerDownload("docx", DOCX_HREF)}
        >
          Скачать договор DOCX
        </button>
        <button
          type="button"
          className="mw-btn mw-btn--ghost"
          onClick={() => void onAcknowledge()}
          disabled={ackSent}
          style={{ opacity: ackSent ? 0.65 : 1 }}
        >
          {ackSent ? "Ознакомление зафиксировано" : "Ознакомился с условиями"}
        </button>
      </div>
      <p style={{ marginTop: 12, color: "var(--mw-muted)", lineHeight: 1.6, maxWidth: "62ch" }}>
        Скачивая договор, вы можете заранее ознакомиться с условиями работы платформы. Финальная версия
        договора может быть дополнена реквизитами и индивидуальными коммерческими условиями.
      </p>
      <p style={{ marginTop: 8, color: "var(--mw-muted)" }}>{versionLabel}</p>
    </section>
  );
}
