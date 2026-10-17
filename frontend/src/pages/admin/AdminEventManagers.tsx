import React, { useState, useEffect } from 'react';
import { usersApi } from '../../features/users/usersApi';
import type { User } from '../../types/auth';
import { 
  UserPlus, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ShieldCheck, 
  Phone, 
  Mail, 
  User as UserIcon, 
  Loader2,
  Users,
  Send
} from 'lucide-react';

export const AdminEventManagers: React.FC = () => {
  const [managers, setManagers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Resend state
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSuccessUser, setCreatedSuccessUser] = useState<User | null>(null);

  // Form fields (No password - Event Manager sets password via invitation email)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const fetchManagers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await usersApi.getEventManagers();
      setManagers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load Event Managers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const handleOpenModal = () => {
    setName('');
    setEmail('');
    setPhone('');
    setFormError(null);
    setCreatedSuccessUser(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setFormError(null);
    setCreatedSuccessUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!name.trim()) {
      setFormError('Full name is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setFormError('A valid email address is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const newUser = await usersApi.createEventManager({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() ? phone.trim() : undefined,
      });

      setCreatedSuccessUser(newUser);
      // Immediately refresh list
      await fetchManagers();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0] || 'Failed to create Event Manager';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (manager: User) => {
    try {
      setResendingId(manager.id);
      setActionFeedback(null);
      const res = await usersApi.resendInvitation(manager.id);
      setActionFeedback({
        type: 'success',
        message: res.message || `Invitation successfully resent to ${manager.email}`
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.message || `Failed to resend invitation to ${manager.email}`
      });
    } finally {
      setResendingId(null);
    }
  };

  const filteredManagers = managers.filter((m) => {
    const q = searchTerm.toLowerCase();
    const matchesName = m.name?.toLowerCase().includes(q);
    const matchesEmail = m.email?.toLowerCase().includes(q);
    const matchesId = m.businessId?.toLowerCase().includes(q);
    return matchesName || matchesEmail || matchesId;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-50 text-[#0051e5] rounded-lg">
              <ShieldCheck size={20} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#0051e5]">
              Operations Staff
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight mt-1">
            Event Managers
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Create and manage authorized Event Manager accounts. Managers set their password via secure email invitations.
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0051e5] hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all text-sm shrink-0"
        >
          <UserPlus size={18} />
          Create Event Manager
        </button>
      </div>

      {/* Main Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-semibold">Error:</span> {error}
          </div>
          <button
            onClick={fetchManagers}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Action Feedback Banner (e.g., Resend Success/Error) */}
      {actionFeedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs font-semibold opacity-75 hover:opacity-100 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-200 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0051e5]/20 focus:border-[#0051e5]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={fetchManagers}
            disabled={isLoading}
            className="p-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
            title="Refresh list"
            aria-label="Refresh list"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-[#0051e5]' : ''} />
          </button>
          <span className="text-xs font-medium text-gray-500">
            {filteredManagers.length} {filteredManagers.length === 1 ? 'manager' : 'managers'}
          </span>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#0051e5] animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-600">Loading Event Managers...</p>
          </div>
        ) : filteredManagers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4">
              <Users size={28} />
            </div>
            <h3 className="text-base font-bold text-gray-900">No Event Managers Found</h3>
            <p className="text-sm text-gray-500 mt-1.5 mb-5">
              {searchTerm
                ? 'No managers matched your search criteria. Try a different query.'
                : 'No Event Managers have been created yet. Click below to invite your first manager.'}
            </p>
            {!searchTerm && (
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-[#0051e5] hover:bg-blue-100 font-semibold text-sm rounded-lg transition-colors"
              >
                <UserPlus size={16} />
                Create Event Manager
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Manager ID</th>
                  <th className="py-3 px-4">Name & Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Actions</th>
                  <th className="py-3 px-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredManagers.map((manager) => (
                  <tr key={manager.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-gray-800 text-xs">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                        {manager.businessId ? `EM-${manager.businessId}` : '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0051e5] flex items-center justify-center font-bold text-xs shrink-0">
                          {manager.name?.charAt(0)?.toUpperCase() || 'M'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{manager.name}</p>
                          <p className="text-xs text-gray-500">{manager.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs">
                      {manager.phone || <span className="text-gray-400 italic">Not provided</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200/80">
                        <ShieldCheck size={12} />
                        Event Manager
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {manager.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200/80">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : !manager.invitationAcceptedAt ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200/80" title="Invitation sent, awaiting password setup">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Pending Invitation
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {!manager.isActive && !manager.invitationAcceptedAt ? (
                        <button
                          type="button"
                          onClick={() => handleResendInvitation(manager)}
                          disabled={resendingId === manager.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                          title="Resend invitation email"
                        >
                          {resendingId === manager.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-amber-700" />
                              <span>Resending...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} className="text-amber-700" />
                              <span>Resend Invitation</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No action needed</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">
                      {manager.createdAt ? new Date(manager.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Event Manager Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-[#0051e5] rounded-lg">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Create Event Manager</h2>
                  <p className="text-xs text-gray-500">Generates a secure email invitation for password setup</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {createdSuccessUser ? (
                /* Success State */
                <div className="space-y-5 text-center">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Event Manager Created & Invitation Sent!</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      A secure invitation email has been dispatched. The account remains pending until the manager accepts the invitation and establishes their password.
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Business ID:</span>
                      <span className="font-mono font-bold text-gray-800">
                        {createdSuccessUser.businessId ? `EM-${createdSuccessUser.businessId}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Full Name:</span>
                      <span className="font-semibold text-gray-900">{createdSuccessUser.name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Email:</span>
                      <span className="text-gray-900 font-medium">{createdSuccessUser.email}</span>
                    </div>
                    {createdSuccessUser.phone && (
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Phone:</span>
                        <span className="text-gray-800">{createdSuccessUser.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">Status:</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Pending Invitation
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="w-full py-2.5 px-4 bg-[#0051e5] hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Creation Form */
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0051e5]/20 focus:border-[#0051e5]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. rahul@eventops.com"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0051e5]/20 focus:border-[#0051e5]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Phone Number <span className="text-gray-400 font-normal lowercase">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0051e5]/20 focus:border-[#0051e5]"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 leading-relaxed">
                    <span className="font-semibold block mb-0.5">Automated Invitation Flow:</span>
                    An invitation email containing a cryptographically secure, one-time link (valid for 24 hours) will be automatically sent to the email address. The Event Manager will set their password upon opening the link.
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-[#0051e5] hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Creating & Sending Invitation...
                        </>
                      ) : (
                        'Create & Send Invitation'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
