import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  Search,
  Filter,
  FileText,
  Eye,
  Edit3,
  Calendar,
  X,
  AlertCircle,
  ArrowUpDown,
  History,
} from 'lucide-react';

interface QuotationThread {
  quotationNumber: string;
  eventId: string;
  latestQuotation: Quotation;
  revisions: Quotation[];
  totalRevisions: number;
}

export const AdminQuotations = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        setIsLoading(true);
        const data = await getQuotations();
        setQuotations(data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load quotations');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
  }, []);

  // Consolidate revisions by quotation thread (quotationNumber or eventId)
  // Each quotation thread represents a single row displaying its latest active revision.
  const threads = useMemo<QuotationThread[]>(() => {
    const map = new Map<string, Quotation[]>();
    for (const q of quotations) {
      const key = q.quotationNumber || q.eventId || q._id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(q);
    }

    const result: QuotationThread[] = [];
    map.forEach((revs, key) => {
      // Sort descending by revision, fallback to createdAt
      revs.sort((a, b) => {
        if (b.revision !== a.revision) return b.revision - a.revision;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      const latest = revs[0];
      result.push({
        quotationNumber: latest.quotationNumber || key,
        eventId: latest.eventId,
        latestQuotation: latest,
        revisions: revs,
        totalRevisions: revs.length,
      });
    });

    // Sort threads by latest quotation creation time descending
    result.sort((a, b) => {
      return (
        new Date(b.latestQuotation.createdAt).getTime() -
        new Date(a.latestQuotation.createdAt).getTime()
      );
    });

    return result;
  }, [quotations]);

  // Compute metrics across threads for quick KPI filters
  const metrics = useMemo(() => {
    let all = threads.length;
    let changesRequested = 0;
    let awaitingApproval = 0;
    let drafts = 0;
    let accepted = 0;

    for (const t of threads) {
      const status = t.latestQuotation.status;
      if (status === 'changes_requested') changesRequested++;
      else if (status === 'sent' || status === 'awaiting_approval') awaitingApproval++;
      else if (status === 'draft') drafts++;
      else if (status === 'accepted') accepted++;
    }

    return { all, changesRequested, awaitingApproval, drafts, accepted };
  }, [threads]);

  // Filter threads based on search term and status
  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return threads.filter((thread) => {
      const qtn = thread.latestQuotation;
      const clientName = qtn.eventSnapshot?.clientName || '';
      const eventTitle = qtn.eventSnapshot?.title || '';
      const qtnId = thread.quotationNumber || '';

      const matchesSearch =
        !query ||
        qtnId.toLowerCase().includes(query) ||
        clientName.toLowerCase().includes(query) ||
        eventTitle.toLowerCase().includes(query);

      let matchesStatus = true;
      if (statusFilter) {
        if (statusFilter === 'sent') {
          matchesStatus = qtn.status === 'sent' || qtn.status === 'awaiting_approval';
        } else {
          matchesStatus = qtn.status === statusFilter;
        }
      }

      return matchesSearch && matchesStatus;
    });
  }, [threads, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredThreads.length / itemsPerPage);
  const paginatedThreads = filteredThreads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Draft
          </span>
        );
      case 'sent':
      case 'awaiting_approval':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
            Awaiting Approval
          </span>
        );
      case 'changes_requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Changes Requested
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Rejected
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {status.replace('_', ' ')}
          </span>
        );
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
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

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage proposals, client feedback, and review complete revision history.
          </p>
        </div>
        <Link
          to="/admin/events"
          className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-xs self-start sm:self-auto"
        >
          <FileText className="w-4 h-4" />
          Draft from Event
        </Link>
      </div>

      {/* KPI Quick Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => {
            setStatusFilter('');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === ''
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Quotations
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
              statusFilter === '' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.all}
          </span>
        </button>

        {metrics.changesRequested > 0 && (
          <button
            onClick={() => {
              setStatusFilter('changes_requested');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
              statusFilter === 'changes_requested'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Action Required
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                statusFilter === 'changes_requested'
                  ? 'bg-amber-700 text-amber-100'
                  : 'bg-amber-200/80 text-amber-900'
              }`}
            >
              {metrics.changesRequested}
            </span>
          </button>
        )}

        <button
          onClick={() => {
            setStatusFilter('sent');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === 'sent'
              ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Awaiting Approval
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
              statusFilter === 'sent' ? 'bg-sky-700 text-sky-100' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.awaitingApproval}
          </span>
        </button>

        <button
          onClick={() => {
            setStatusFilter('draft');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === 'draft'
              ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Drafts
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
              statusFilter === 'draft' ? 'bg-slate-600 text-slate-100' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.drafts}
          </span>
        </button>

        <button
          onClick={() => {
            setStatusFilter('accepted');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === 'accepted'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Accepted
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
              statusFilter === 'accepted'
                ? 'bg-emerald-700 text-emerald-100'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.accepted}
          </span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-8 py-2 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
            placeholder="Search by quotation number, client name, or event title..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-8 pr-8 py-2 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="sent">Awaiting Approval</option>
              <option value="draft">Draft</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center min-h-[360px] bg-white rounded-xl border border-slate-200 shadow-xs">
          <Loader2 className="w-7 h-7 animate-spin text-slate-600 mb-2" />
          <span className="text-xs text-slate-500 font-medium">Loading quotations...</span>
        </div>
      ) : error ? (
        <div className="bg-rose-50 text-rose-700 p-6 rounded-xl border border-rose-200 shadow-xs">
          <p className="font-medium text-sm">{error}</p>
        </div>
      ) : filteredThreads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center shadow-xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 border border-slate-200/60">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No quotations found</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-4">
            {searchTerm || statusFilter
              ? 'No quotations match your current search and filter criteria.'
              : 'No quotations have been generated yet.'}
          </p>
          {(searchTerm || statusFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
              }}
              className="text-xs font-medium text-slate-900 hover:text-slate-700 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                    Quotation
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600">Client & Event</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                    Event Date
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-right whitespace-nowrap">
                    Total Amount
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-center whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-right whitespace-nowrap">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {paginatedThreads.map((thread) => {
                  const qtn = thread.latestQuotation;
                  const isChangesRequested = qtn.status === 'changes_requested';
                  const isDraft = qtn.status === 'draft';
                  const totalRevs = thread.totalRevisions;

                  return (
                    <tr
                      key={thread.quotationNumber}
                      onClick={() => navigate(`/admin/quotations/${qtn._id}`)}
                      className={`group cursor-pointer transition-colors ${
                        isChangesRequested
                          ? 'bg-amber-50/30 hover:bg-amber-50/60 border-l-2 border-l-amber-500'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Quotation Number & Date */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {thread.quotationNumber}
                            </span>
                            {totalRevs > 1 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <History className="w-3 h-3 text-slate-400" />
                                {totalRevs} revisions
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 mt-0.5">
                            Updated {formatDate(qtn.updatedAt || qtn.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* Client & Event */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col max-w-[260px]">
                          <span className="font-medium text-slate-900 truncate">
                            {qtn.eventSnapshot?.clientName || 'Unknown Client'}
                          </span>
                          <span className="text-xs text-slate-500 truncate mt-0.5">
                            {qtn.eventSnapshot?.title || 'Unknown Event'}
                          </span>
                        </div>
                      </td>

                      {/* Event Date */}
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600 text-xs font-medium">
                        {formatDate(qtn.eventSnapshot?.date)}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(qtn.finalAmount)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(qtn.status)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isChangesRequested ? (
                            <Link
                              to={`/admin/quotations/${qtn._id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs"
                              title="Review client changes requested"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Review Request
                            </Link>
                          ) : isDraft ? (
                            <Link
                              to={`/admin/events/${qtn.eventId}/quotation/create?draftId=${qtn._id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
                              title="Continue editing draft"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              Edit Draft
                            </Link>
                          ) : (
                            <Link
                              to={`/admin/quotations/${qtn._id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
                              title="View quotation details and revision history"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              View
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(
                  (currentPage - 1) * itemsPerPage + 1,
                  filteredThreads.length
                )}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(currentPage * itemsPerPage, filteredThreads.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{filteredThreads.length}</span>{' '}
              quotations
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
                >
                  Previous
                </button>
                <span className="px-2 font-medium text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
