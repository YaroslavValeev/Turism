"use client";

import { useState } from "react";
import Link from "next/link";
import { getOrganizerVerificationStatusLabel } from "@mywave/shared-types";
import { adminJson } from "../../../lib/admin";
import type { OrganizerOption, Program } from "./programModel";

type Props = {
  program: Program;
  onChanged: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
};

/** «Организатор: X · статус → открыть · сменить» at the top of the card editor. */
export function ProgramOrganizerRow({ program, onChanged, onError }: Props) {
  const [options, setOptions] = useState<OrganizerOption[] | null>(null);
  const [selected, setSelected] = useState(program.organizer?.id ?? "");
  const [saving, setSaving] = useState(false);

  const startChange = async () => {
    try {
      const list = await adminJson<OrganizerOption[]>("/organizers");
      setOptions([...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось загрузить организаторов");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminJson(`/programs/${program.id}/organizer`, { method: "PUT", body: JSON.stringify({ organizerId: selected }) });
      const name = options?.find((o) => o.id === selected)?.displayName ?? "";
      setOptions(null);
      await onChanged(`Организатор программы изменён на «${name}».`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось сменить организатора");
    } finally {
      setSaving(false);
    }
  };

  const organizer = program.organizer;
  return (
    <div className="mw-admin-inline-form" style={{ flexWrap: "wrap", gap: 8 }}>
      <span className="mw-admin-caption">Организатор:</span>
      {organizer ? (
        <>
          <strong>{organizer.displayName}</strong>
          <span className="mw-admin-caption">· {getOrganizerVerificationStatusLabel(organizer.verificationStatus)}</span>
          <Link className="mw-admin-btn mw-admin-btn--ghost" href={`/organizers/${organizer.id}`}>
            Открыть организатора
          </Link>
        </>
      ) : (
        <span className="mw-admin-caption">не указан</span>
      )}
      {options === null ? (
        <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void startChange()}>
          Сменить
        </button>
      ) : (
        <>
          <select className="mw-admin-input" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: 240 }}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName} · {getOrganizerVerificationStatusLabel(o.verificationStatus)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mw-admin-btn"
            onClick={() => void save()}
            disabled={saving || !selected || selected === organizer?.id}
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
          <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => setOptions(null)} disabled={saving}>
            Отмена
          </button>
        </>
      )}
    </div>
  );
}
