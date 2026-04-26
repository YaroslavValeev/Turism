"use client";

import type { FormEvent, Dispatch, SetStateAction } from "react";
import {
  PROGRAM_INTAKE_SOURCES,
  getOrganizerVerificationStatusLabel,
  getProgramIntakeSourceLabel,
  getProgramLevelLabel,
  getSeverityLabel,
} from "@mywave/shared-types";
import { AdminSectionCard } from "../AdminSectionCard";
import { LEVEL_OPTIONS, RISK_LEVEL_OPTIONS, type OrganizerOption, type ProgramForm } from "./programModel";

type Props = {
  createForm: ProgramForm;
  setCreateForm: Dispatch<SetStateAction<ProgramForm>>;
  organizers: OrganizerOption[];
  creating: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export function ProgramCreateFormCard({ createForm, setCreateForm, organizers, creating, onSubmit }: Props) {
  return (
    <AdminSectionCard title="Создать программу">
      <form className="mw-admin-form-create-program" onSubmit={onSubmit}>
        <select
          className="mw-admin-input"
          value={createForm.organizerId}
          onChange={(e) => setCreateForm((c) => ({ ...c, organizerId: e.target.value }))}
        >
          <option value="">Выберите организатора</option>
          {organizers.map((organizer) => (
            <option key={organizer.id} value={organizer.id}>
              {organizer.displayName} ({getOrganizerVerificationStatusLabel(organizer.verificationStatus)})
            </option>
          ))}
        </select>
        <select
          className="mw-admin-input"
          value={createForm.intakeSource}
          onChange={(e) => setCreateForm((c) => ({ ...c, intakeSource: e.target.value }))}
          title="Источник появления программы в каталоге (canonical intake)"
        >
          {PROGRAM_INTAKE_SOURCES.map((code) => (
            <option key={code} value={code}>
              {getProgramIntakeSourceLabel(code)}
            </option>
          ))}
        </select>
        <input
          className="mw-admin-input"
          value={createForm.title}
          onChange={(e) => setCreateForm((c) => ({ ...c, title: e.target.value }))}
          placeholder="Название программы"
        />
        <input
          className="mw-admin-input"
          value={createForm.discipline}
          onChange={(e) => setCreateForm((c) => ({ ...c, discipline: e.target.value }))}
          placeholder="Дисциплина"
        />
        <input
          className="mw-admin-input"
          value={createForm.region}
          onChange={(e) => setCreateForm((c) => ({ ...c, region: e.target.value }))}
          placeholder="Регион"
        />
        <input
          className="mw-admin-input"
          value={createForm.exactLocation}
          onChange={(e) => setCreateForm((c) => ({ ...c, exactLocation: e.target.value }))}
          placeholder="Точная локация"
        />
        <input
          className="mw-admin-input"
          type="date"
          value={createForm.startDate}
          onChange={(e) => setCreateForm((c) => ({ ...c, startDate: e.target.value }))}
        />
        <input
          className="mw-admin-input"
          type="date"
          value={createForm.endDate}
          onChange={(e) => setCreateForm((c) => ({ ...c, endDate: e.target.value }))}
        />
        <input
          className="mw-admin-input"
          value={createForm.durationDays}
          onChange={(e) => setCreateForm((c) => ({ ...c, durationDays: e.target.value }))}
          placeholder="Длительность, дней"
        />
        <select
          className="mw-admin-input"
          value={createForm.levelRequired}
          onChange={(e) => setCreateForm((c) => ({ ...c, levelRequired: e.target.value }))}
        >
          {LEVEL_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {getProgramLevelLabel(level)}
            </option>
          ))}
        </select>
        <select
          className="mw-admin-input"
          value={createForm.riskLevel}
          onChange={(e) => setCreateForm((c) => ({ ...c, riskLevel: e.target.value }))}
        >
          {RISK_LEVEL_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {getSeverityLabel(level)}
            </option>
          ))}
        </select>
        <input
          className="mw-admin-input"
          type="number"
          min="0"
          value={createForm.capacityTotal}
          onChange={(e) => setCreateForm((c) => ({ ...c, capacityTotal: e.target.value }))}
          placeholder="Лимит мест"
        />
        <input
          className="mw-admin-input"
          type="number"
          min="0"
          value={createForm.spotsAvailable}
          onChange={(e) => setCreateForm((c) => ({ ...c, spotsAvailable: e.target.value }))}
          placeholder="Мест осталось"
        />
        <label className="mw-admin-inline-form mw-admin-create-program-star">
          <input
            type="checkbox"
            checked={createForm.isStarred}
            onChange={(e) => setCreateForm((c) => ({ ...c, isStarred: e.target.checked }))}
          />
          ⭐ Горячее предложение
        </label>
        <input
          className="mw-admin-input"
          value={createForm.priceFromRub}
          onChange={(e) => setCreateForm((c) => ({ ...c, priceFromRub: e.target.value }))}
          placeholder="Цена от, ₽"
        />
        <textarea
          className="mw-admin-textarea"
          value={createForm.gearRequirements}
          onChange={(e) => setCreateForm((c) => ({ ...c, gearRequirements: e.target.value }))}
          placeholder="Требования к снаряжению"
          rows={3}
        />
        <textarea
          className="mw-admin-textarea"
          value={createForm.medicalLimitations}
          onChange={(e) => setCreateForm((c) => ({ ...c, medicalLimitations: e.target.value }))}
          placeholder="Медицинские ограничения (можно оставить пустым)"
          rows={3}
        />
        <textarea
          className="mw-admin-textarea"
          value={createForm.cancellationRules}
          onChange={(e) => setCreateForm((c) => ({ ...c, cancellationRules: e.target.value }))}
          placeholder="Правила отмены"
          rows={3}
        />
        <textarea
          className="mw-admin-textarea"
          value={createForm.itineraryDayByDay}
          onChange={(e) => setCreateForm((c) => ({ ...c, itineraryDayByDay: e.target.value }))}
          placeholder="Программа по дням"
          rows={3}
        />
        <textarea
          className="mw-admin-textarea"
          value={createForm.inclusions}
          onChange={(e) => setCreateForm((c) => ({ ...c, inclusions: e.target.value }))}
          placeholder="Что включено"
          rows={3}
        />
        <button
          type="submit"
          className="mw-admin-btn"
          disabled={creating || !createForm.organizerId || !createForm.title.trim() || !createForm.startDate || !createForm.endDate}
        >
          {creating ? "Создание..." : "Создать черновик"}
        </button>
      </form>
    </AdminSectionCard>
  );
}
