export type OwnerNotifyUi = {
  ownerNotifyStatus: "sent" | "pending" | "failed";
  /** ISO время последней попытки доставки owner-Telegram (или успеха). */
  ownerNotifyLastAttemptAt: string | null;
  /** Обрезка текста ошибки. */
  ownerNotifyErrorSnippet: string | null;
};

type DraftNotifyFields = {
  ownerNotifiedAt: Date | null;
  ownerNotifyLastAttemptAt: Date | null;
  ownerNotifyLastError: string | null;
};

/** Представление для admin UI без изменения бизнес-статуса черновика. */
export function buildOwnerNotifyUi(d: DraftNotifyFields): OwnerNotifyUi {
  if (d.ownerNotifiedAt) {
    return {
      ownerNotifyStatus: "sent",
      ownerNotifyLastAttemptAt: (d.ownerNotifyLastAttemptAt ?? d.ownerNotifiedAt).toISOString(),
      ownerNotifyErrorSnippet: null,
    };
  }
  if (d.ownerNotifyLastError) {
    return {
      ownerNotifyStatus: "failed",
      ownerNotifyLastAttemptAt: d.ownerNotifyLastAttemptAt?.toISOString() ?? null,
      ownerNotifyErrorSnippet: d.ownerNotifyLastError.slice(0, 200),
    };
  }
  return {
    ownerNotifyStatus: "pending",
    ownerNotifyLastAttemptAt: d.ownerNotifyLastAttemptAt?.toISOString() ?? null,
    ownerNotifyErrorSnippet: null,
  };
}
