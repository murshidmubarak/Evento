import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getQuotationById, getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  ArrowLeft,
  Printer,
  Download,
  Edit3,
  History,
  AlertCircle,
  Calendar,
  Clock,
  MapPin,
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const AdminViewQuotation = () => {
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [allRevisions, setAllRevisions] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const data = await getQuotationById(id);
          setQuotation(data);

          if (data.eventId) {
            try {
              const revs = await getQuotations(data.eventId);
              // Sort ascending by revision number
              setAllRevisions(revs.sort((a, b) => a.revision - b.revision));
            } catch (revErr) {
              console.error('Failed to load revision history', revErr);
            }
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load quotation');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotation();
  }, [id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const toTitleCase = (str?: string) => {
    if (!str) return '—';
    return str
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
      .join(' ');
  };

  const cleanRequirementText = (text?: string) => {
    if (!text) return '';
    return text
      .replace(/serviceMode:\s*/gi, 'Service Mode: ')
      .replace(/starters:\s*/gi, 'Starters: ')
      .replace(/mainDishes:\s*/gi, 'Main Courses: ')
      .replace(/desserts:\s*/gi, 'Desserts: ')
      .replace(/style:\s*/gi, 'Style: ')
      .replace(/coverage:\s*/gi, 'Coverage: ')
      .replace(/deliverables:\s*/gi, 'Deliverables: ')
      .replace(/package:\s*/gi, 'Package: ');
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="bg-rose-50 text-rose-700 p-6 rounded-xl border border-rose-200 max-w-2xl mx-auto mt-8 shadow-xs">
        <h2 className="text-lg font-bold mb-2">Error</h2>
        <p className="text-sm">{error || 'Quotation not found'}</p>
        <Link
          to="/admin/quotations"
          className="inline-flex items-center gap-1.5 mt-4 text-slate-900 hover:text-slate-700 font-medium text-sm underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Quotations
        </Link>
      </div>
    );
  }

  // Determine latest revision and whether editing is permitted
  const latestRevision =
    allRevisions.length > 0 ? allRevisions[allRevisions.length - 1] : quotation;
  const isLatestRevision = quotation._id === latestRevision?._id;
  const isHistorical = !isLatestRevision;

  // Editing is ONLY allowed on the latest revision when it is in draft or changes_requested.
  // Once issued ('sent' or 'awaiting_approval'), editing options are removed.
  const isChangesRequested = quotation.status === 'changes_requested';
  const isDraft = quotation.status === 'draft';
  const canReviewChanges = isLatestRevision && isChangesRequested;
  const canEditDraft = isLatestRevision && isDraft;

  return (
    <div className="max-w-[1020px] mx-auto space-y-6 pb-20 print:p-0 print:m-0 print:space-y-0">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden mb-2">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link
            to="/admin/quotations"
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs shrink-0 mt-0.5 sm:mt-0 text-slate-600 hover:text-slate-900"
            title="Back to Quotations list"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Quotation {quotation.quotationNumber}
              </h1>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md border border-slate-200">
                Rev {quotation.revision}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  quotation.status === 'draft'
                    ? 'bg-slate-100 text-slate-800 border border-slate-200'
                    : quotation.status === 'sent' || quotation.status === 'awaiting_approval'
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : quotation.status === 'changes_requested'
                    ? 'bg-amber-50 text-amber-800 border border-amber-300'
                    : quotation.status === 'accepted'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {quotation.status === 'sent' || quotation.status === 'awaiting_approval'
                  ? 'Issued · Awaiting Approval'
                  : quotation.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
          {/* Edit options only visible when permitted */}
          {canReviewChanges && (
            <Link
              to={`/admin/events/${quotation.eventId}/quotation/create?revise=${quotation._id}`}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs font-medium text-xs sm:text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Review & Edit Quotation
            </Link>
          )}

          {canEditDraft && (
            <Link
              to={`/admin/events/${quotation.eventId}/quotation/create?draftId=${quotation._id}`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs font-medium text-xs sm:text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Continue Editing Draft
            </Link>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs font-medium text-xs sm:text-sm"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs font-medium text-xs sm:text-sm"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Historical Revision Banner (if viewing an older revision) */}
      {isHistorical && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs print:hidden">
          <div className="flex items-center gap-2 text-slate-700">
            <History className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              You are viewing historical <strong>Revision {quotation.revision}</strong> (Read-only).
              Edits are locked because a newer revision exists.
            </span>
          </div>
          <Link
            to={`/admin/quotations/${latestRevision._id}`}
            className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
          >
            Switch to Active Revision (Rev {latestRevision.revision}) <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Client Change Request Panel (if changes_requested) */}
      {isChangesRequested && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-xl p-5 shadow-2xs print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 pb-4 border-b border-amber-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-200/70 text-amber-900 rounded-lg shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider bg-amber-200 px-2 py-0.5 rounded">
                    {canReviewChanges ? 'Action Required' : 'Historical Request'}
                  </span>
                  <span className="text-xs font-medium text-amber-800">
                    Revision {quotation.revision}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-1">Client Requested Changes</h2>
                <p className="text-xs text-slate-600">
                  Requested by{' '}
                  <strong className="text-slate-900">
                    {quotation.eventSnapshot?.clientName || 'Client'}
                  </strong>{' '}
                  on {formatDate(quotation.updatedAt)}
                </p>
              </div>
            </div>

            {canReviewChanges ? (
              <Link
                to={`/admin/events/${quotation.eventId}/quotation/create?revise=${quotation._id}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto shrink-0"
              >
                <Edit3 className="w-4 h-4" />
                Review & Edit Quotation
              </Link>
            ) : (
              <span className="text-xs font-medium text-amber-900 bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg shrink-0">
                Resolved in Rev {latestRevision.revision}
              </span>
            )}
          </div>

          <div className="bg-white rounded-lg border border-amber-200 p-3.5">
            <h4 className="text-xs font-semibold text-slate-600 mb-1">
              Client's Note / Request:
            </h4>
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
              {quotation.clientNotes || 'No specific note was provided by the client.'}
            </p>
          </div>
        </div>
      )}

      {/* Revision History Section (when multiple revisions exist) */}
      {allRevisions.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs print:hidden">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Quotation Revision History</h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {allRevisions.length} total revisions
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {allRevisions.map((rev, index) => {
              const isCurrent = rev._id === quotation._id;
              const isLatestInThread = index === allRevisions.length - 1;

              return (
                <Link
                  key={rev._id}
                  to={`/admin/quotations/${rev._id}`}
                  className={`p-3.5 rounded-lg border text-left transition-all relative ${
                    isCurrent
                      ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/60'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-slate-900">
                        Revision {rev.revision}
                      </span>
                      {isLatestInThread && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                        rev.status === 'draft'
                          ? 'bg-slate-100 text-slate-700'
                          : rev.status === 'sent' || rev.status === 'awaiting_approval'
                          ? 'bg-sky-50 text-sky-700'
                          : rev.status === 'changes_requested'
                          ? 'bg-amber-50 text-amber-800'
                          : rev.status === 'accepted'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {rev.status === 'sent' || rev.status === 'awaiting_approval'
                        ? 'Issued'
                        : rev.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-slate-800 tabular-nums">
                    {formatCurrency(rev.finalAmount)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatDate(rev.createdAt)}
                  </p>

                  {rev.clientNotes && (
                    <p className="text-[11px] text-amber-800 truncate mt-1 italic">
                      "{rev.clientNotes}"
                    </p>
                  )}

                  {isCurrent && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center gap-1 text-[11px] font-semibold text-slate-900">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                      Currently Viewing
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Professional Quotation Document Container (Printable A4) */}
      {/* ======================================================== */}
      <div className="bg-white shadow-sm rounded-xl border border-slate-200/90 print:border-none print:shadow-none print:rounded-none overflow-hidden text-slate-800 relative">
        <div className="p-8 sm:p-12 space-y-8">
          {/* Masthead Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                    EVENTO
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Bespoke Event Experiences & Production
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-0.5 pl-0.5">
                <p>Evento Events & Production Studio</p>
                <p>concierge@evento.com · +91 (800) 123-4567</p>
                {quotation.tax?.customerGstin && (
                  <p className="text-slate-600">Client GSTIN: {quotation.tax.customerGstin}</p>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right flex flex-col items-start sm:items-end w-full sm:w-auto">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
                QUOTATION
              </h1>
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 w-full sm:min-w-[260px] text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Quotation No</td>
                      <td className="py-1 font-bold text-slate-900 text-right">
                        {quotation.quotationNumber}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Revision</td>
                      <td className="py-1 font-semibold text-slate-800 text-right">
                        Rev {quotation.revision}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Date Issued</td>
                      <td className="py-1 font-medium text-slate-800 text-right">
                        {formatDate(quotation.createdAt)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Valid Until</td>
                      <td className="py-1 font-medium text-slate-800 text-right">
                        {formatDate(quotation.validUntil)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Client & Event Specifications Brief */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-200 pb-8">
            {/* Client Info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Prepared For
              </h3>
              <p className="text-lg font-bold text-slate-900">
                {toTitleCase(quotation.eventSnapshot?.clientName || 'Valued Client')}
              </p>
              <div className="flex items-start gap-1.5 text-xs text-slate-600 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>
                  {quotation.eventSnapshot?.location?.address ||
                    quotation.eventSnapshot?.location ||
                    'Venue details as specified in event plan'}
                </span>
              </div>
            </div>

            {/* Event Info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Event Specifications
              </h3>
              <p className="text-lg font-bold text-slate-900">
                {toTitleCase(quotation.eventSnapshot?.title || 'Private Event')}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Type: <strong className="text-slate-800">{toTitleCase(quotation.eventSnapshot?.eventType || 'Event')}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Date: <strong className="text-slate-800">{formatDate(quotation.eventSnapshot?.date)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Time: <strong className="text-slate-800">{quotation.eventSnapshot?.startTime || '—'} – {quotation.eventSnapshot?.endTime || '—'}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Guests: <strong className="text-slate-800">{quotation.eventSnapshot?.guestCount || '—'} Expected</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Scope of Services & Deliverables
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold text-slate-700 w-[50%]">
                      Service & Specifications
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-center w-[12%]">
                      Qty
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-right w-[18%]">
                      Unit Rate
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-right w-[20%]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quotation.items.map((item, idx) => {
                    const hasDetailed = item.detailedContent && item.detailedContent.length > 0;

                    return (
                      <tr key={idx} className="align-top hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm">
                              {item.name}
                            </span>
                            {item.scope && (
                              <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded border border-slate-200/60">
                                {item.scope}
                              </span>
                            )}
                          </div>

                          {/* Render structured detailed content if available (without raw duplicate text) */}
                          {hasDetailed ? (
                            <div className="mt-2 bg-slate-50/80 border border-slate-200/70 rounded-lg p-3 space-y-2.5">
                              <span className="text-[11px] font-semibold text-slate-600 block">
                                Inclusions & Deliverables:
                              </span>
                              <div
                                className={`grid gap-3 ${
                                  item.detailedContent!.length >= 3
                                    ? 'grid-cols-1 sm:grid-cols-3'
                                    : item.detailedContent!.length === 2
                                    ? 'grid-cols-1 sm:grid-cols-2'
                                    : 'grid-cols-1'
                                }`}
                              >
                                {item.detailedContent!.map((section, sidx) => (
                                  <div key={sidx} className="text-xs space-y-1">
                                    <p className="font-semibold text-slate-800 text-[11px]">
                                      {section.sectionName}
                                    </p>
                                    <ul className="space-y-0.5 text-slate-600">
                                      {section.items.map((it, lidx) => (
                                        <li key={lidx} className="flex items-start gap-1">
                                          <span className="text-slate-400">•</span>
                                          <span>{it}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : item.requirements ? (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200/50 leading-relaxed whitespace-pre-wrap">
                              {cleanRequirementText(item.requirements)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-slate-700 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-700 tabular-nums">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Plan & Commercial Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4 border-t border-slate-200">
            {/* Left Column: Payment Milestones & Terms (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Payment Schedule */}
              {quotation.paymentPlan && quotation.paymentPlan.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Milestone Payment Schedule
                  </h4>
                  <div className="space-y-2">
                    {quotation.paymentPlan.map((plan, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {plan.title}
                            </span>
                            {plan.percentage && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200/80 text-slate-700">
                                {plan.percentage}%
                              </span>
                            )}
                            {plan.status && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  plan.status === 'Paid'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : plan.status === 'Partially Paid'
                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {plan.status}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-slate-500 text-[11px]">
                            {plan.dueDate && (
                              <span className="inline-flex items-center gap-1 text-slate-700">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                Due: {new Date(plan.dueDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            {plan.expiryDate && (
                              <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                                <Clock className="w-3 h-3 text-rose-400" />
                                Expires: {new Date(plan.expiryDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            {plan.dueDateDescription && <span>• {plan.dueDateDescription}</span>}
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums text-sm shrink-0">
                          {formatCurrency(plan.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Terms & Conditions */}
              {quotation.structuredTerms && quotation.structuredTerms.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Commercial Terms & Conditions
                  </h4>
                  <div className="bg-slate-50/50 border border-slate-200/80 rounded-lg p-3.5 space-y-2 text-xs">
                    {quotation.structuredTerms.map((term, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-slate-400 font-semibold">{idx + 1}.</span>
                        <div className="leading-relaxed">
                          <strong className="text-slate-800">{term.title}: </strong>
                          <span className="text-slate-600">{term.content}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Financial Totals Breakdown (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Financial Summary
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(quotation.subtotal)}
                    </span>
                  </div>

                  {quotation.discount > 0 && (
                    <div className="flex justify-between items-center text-rose-600 font-medium">
                      <span>Applied Discount</span>
                      <span className="tabular-nums">
                        -{formatCurrency(quotation.discount)}
                      </span>
                    </div>
                  )}

                  {quotation.discount > 0 && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Taxable Subtotal</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(quotation.taxableAmount)}
                      </span>
                    </div>
                  )}

                  {quotation.tax?.taxType && quotation.tax.taxType !== 'none' && (
                    <div className="space-y-1 pt-1 border-t border-slate-200/70">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>
                          Tax ({quotation.tax.taxType.toUpperCase()} @ {quotation.tax.taxRate}%)
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(quotation.tax.taxAmount)}
                        </span>
                      </div>
                      {quotation.tax.gstTreatment === 'intra_state' && quotation.tax.cgst > 0 && (
                        <div className="flex justify-between items-center text-[11px] text-slate-500 pl-2">
                          <span>CGST ({(quotation.tax.taxRate / 2).toFixed(1)}%) + SGST ({(quotation.tax.taxRate / 2).toFixed(1)}%)</span>
                          <span>{formatCurrency(quotation.tax.cgst)} + {formatCurrency(quotation.tax.sgst)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Final Total Investment Box */}
                <div className="bg-slate-900 text-white rounded-lg p-3.5 space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-slate-300">
                      Total Quotation Value
                    </span>
                    <span className="text-xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(quotation.finalAmount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Inclusive of specified line items, services, and taxes.
                  </p>
                </div>

                {/* Retainer & Remaining Balance */}
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-700">Advance Deposit Due:</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatCurrency(quotation.advanceAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Balance Remaining:</span>
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {formatCurrency(quotation.remainingAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signatures & Execution Section */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs">
            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50/30">
              <p className="font-semibold text-slate-800">Client Acceptance</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Accepted by {toTitleCase(quotation.eventSnapshot?.clientName || 'Client')} in accordance with the specified deliverables and commercial milestones.
              </p>
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-slate-500">
                <span>Signature / Confirmation</span>
                <span>{quotation.status === 'accepted' ? 'Digitally Accepted' : 'Pending'}</span>
              </div>
            </div>

            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50/30">
              <p className="font-semibold text-slate-800">Evento Event Operations</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Issued by authorized production management for Evento. Confirmation is subject to milestone retainer payment.
              </p>
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-slate-500">
                <span>Authorized Signatory</span>
                <span>Evento Management</span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-4 text-center text-[11px] text-slate-400 border-t border-slate-100">
            <p>
              Thank you for trusting Evento with your event. For questions, adjustments, or concierge assistance, reach our team at concierge@evento.com.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
