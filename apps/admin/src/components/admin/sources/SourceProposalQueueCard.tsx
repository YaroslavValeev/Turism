"use client";

import { AdminSectionCard } from "../AdminSectionCard";
import { formatDate, type SourceProposal } from "./sourceTypes";

type Props = { proposals: SourceProposal[]; rejectingId: string; onReject: (id: string) => Promise<void> };

export function SourceProposalQueueCard({ proposals, rejectingId, onReject }: Props) {
  return (
    <AdminSectionCard title="Очередь заявок на источники">
      {proposals.length === 0 ? <p className="mw-admin-muted">Заявок пока нет.</p> : (
        <div className="mw-admin-table-wrap"><table className="mw-admin-table"><thead><tr><th>Источник</th><th>Тип / откуда</th><th>Организатор</th><th>Статус</th><th>Действие</th></tr></thead><tbody>
          {proposals.map((proposal) => <tr key={proposal.id}><td><strong>{proposal.displayName || proposal.normalizedUrl}</strong><br /><span className="mw-admin-muted">{proposal.normalizedUrl}<br />{formatDate(proposal.createdAt)}</span></td><td>{proposal.detectedType}<br /><span className="mw-admin-muted">{proposal.submittedVia}</span></td><td>{proposal.organizerName || "—"}<br /><span className="mw-admin-muted">{proposal.notes || ""}</span></td><td>{proposal.status === "pending" ? "Ожидает проверки" : "Отклонена"}</td><td>{proposal.status === "pending" ? <button type="button" className="mw-admin-btn-secondary" disabled={rejectingId === proposal.id} onClick={() => void onReject(proposal.id)}>{rejectingId === proposal.id ? "..." : "Отклонить"}</button> : proposal.rejectionReason || "—"}</td></tr>)}
        </tbody></table></div>
      )}
    </AdminSectionCard>
  );
}
