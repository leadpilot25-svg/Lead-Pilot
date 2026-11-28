import React from 'react';
import {
  Phone,
  MessageSquare,
  Mail,
  Send,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { LeadItem } from '../types';
import { formatDisplayPhone } from '../utils/phoneUtils';

interface CrmFollowUpsViewProps {
  overdueFollowUps: LeadItem[];
  todayFollowUps: LeadItem[];
  upcomingFollowUps: LeadItem[];
  selectedCountryCode: string;
  formatFollowUpDisplay: (isoOrDateStr: string | undefined) => string | null;
  onSelectLead: (lead: LeadItem) => void;
  onCall: (lead: LeadItem, e?: React.MouseEvent) => void;
  onWhatsApp: (lead: LeadItem, e?: React.MouseEvent) => void;
  onSms: (lead: LeadItem, e?: React.MouseEvent) => void;
  onEmail: (lead: LeadItem, e?: React.MouseEvent) => void;
  onBackToLeads: () => void;
}

export const CrmFollowUpsView: React.FC<CrmFollowUpsViewProps> = ({
  overdueFollowUps,
  todayFollowUps,
  upcomingFollowUps,
  selectedCountryCode,
  formatFollowUpDisplay,
  onSelectLead,
  onCall,
  onWhatsApp,
  onSms,
  onEmail,
  onBackToLeads,
}) => {
  const totalDue = overdueFollowUps.length + todayFollowUps.length;
  const hasAnyFollowUps = totalDue > 0 || upcomingFollowUps.length > 0;

  const renderLeadCard = (
    lead: LeadItem,
    urgency: 'overdue' | 'today' | 'upcoming',
    idx: number
  ) => {
    const formattedDate = formatFollowUpDisplay(lead.followUpDate);
    const formattedPhone = formatDisplayPhone(lead.phone, selectedCountryCode);

    return (
      <div
        key={`${lead.id}-${urgency}-${idx}`}
        onClick={() => onSelectLead(lead)}
        className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors cursor-pointer"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-3 lg:justify-start">
              <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                {lead.name}
              </h3>
              <span
                className={`text-xs font-semibold inline-flex items-center gap-1 shrink-0 ${
                  urgency === 'overdue'
                    ? 'text-rose-400'
                    : urgency === 'today'
                    ? 'text-amber-300'
                    : 'text-sky-300'
                }`}
              >
                {urgency === 'overdue' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : urgency === 'today' ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                <span className="tabular-nums">
                  {urgency === 'overdue' ? 'Overdue' : urgency === 'today' ? 'Today' : 'Scheduled'}
                  {formattedDate ? ` · ${formattedDate}` : ''}
                </span>
              </span>
            </div>

            <div className="text-xs text-slate-300 font-medium truncate">
              {lead.service || 'General enquiry'}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 tabular-nums">
              <span className="font-mono text-slate-300">{formattedPhone}</span>
              {lead.address && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[220px]">{lead.address}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{lead.status}</span>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => onCall(lead, e)}
              className="min-h-[44px] sm:min-h-[36px] flex-1 sm:flex-initial px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-sky-400" />
              <span>Call</span>
            </button>
            <button
              type="button"
              onClick={(e) => onWhatsApp(lead, e)}
              className="min-h-[44px] sm:min-h-[36px] flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={(e) => onSms(lead, e)}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              title="Send SMS"
            >
              <Send className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">SMS</span>
            </button>
            {lead.email && (
              <button
                type="button"
                onClick={(e) => onEmail(lead, e)}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                title="Send Email"
              >
                <Mail className="w-3.5 h-3.5 text-slate-300" />
                <span className="hidden sm:inline">Email</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectLead(lead)}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Reschedule</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Follow-ups</h2>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">
            {totalDue > 0 ? (
              <>
                {overdueFollowUps.length} overdue <span aria-hidden="true">·</span> {todayFollowUps.length} due today{' '}
                <span aria-hidden="true">·</span> {upcomingFollowUps.length} upcoming
              </>
            ) : (
              <>No follow-ups due today · {upcomingFollowUps.length} upcoming</>
            )}
          </p>
        </div>
      </div>

      {!hasAnyFollowUps ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">You are caught up on follow-ups</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Open any lead to schedule a callback date and time. Due reminders will show up here automatically.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onBackToLeads}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Browse Leads
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue Section */}
          {overdueFollowUps.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Overdue ({overdueFollowUps.length})</span>
                </h3>
              </div>
              <div className="space-y-3">
                {overdueFollowUps.map((lead, idx) => renderLeadCard(lead, 'overdue', idx))}
              </div>
            </section>
          )}

          {/* Due Today Section */}
          {todayFollowUps.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Due Today ({todayFollowUps.length})</span>
                </h3>
              </div>
              <div className="space-y-3">
                {todayFollowUps.map((lead, idx) => renderLeadCard(lead, 'today', idx))}
              </div>
            </section>
          )}

          {/* Upcoming Section */}
          {upcomingFollowUps.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Upcoming ({upcomingFollowUps.length})</span>
                </h3>
              </div>
              <div className="space-y-3">
                {upcomingFollowUps.map((lead, idx) => renderLeadCard(lead, 'upcoming', idx))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
