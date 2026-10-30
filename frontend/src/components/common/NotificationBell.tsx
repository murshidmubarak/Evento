import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type NotificationState,
} from '../../features/notifications/notificationSlice';
import { initializeSocket } from '../../services/socketClient';
import {
  Bell,
  Check,
  CheckCheck,
  Briefcase,
  CheckCircle2,
  Users,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  Inbox,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export const formatTimeAgo = (timestamp?: string): string => {
  if (!timestamp) return '';
  const now = Date.now();
  const past = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - past) / 1000);

  if (isNaN(diffSec) || diffSec < 0) return 'Just now';
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'work_opportunity':
      return <Briefcase size={16} className="text-blue-600" />;
    case 'assignment_confirmed':
      return <CheckCircle2 size={16} className="text-emerald-600" />;
    case 'selection_summary':
      return <Users size={16} className="text-purple-600" />;
    case 'requirement_cancelled':
      return <XCircle size={16} className="text-rose-600" />;
    case 'requirement_updated':
      return <RefreshCw size={16} className="text-amber-600" />;
    case 'deadline_extended':
      return <Clock size={16} className="text-indigo-600" />;
    case 'staffing_unfilled':
      return <AlertTriangle size={16} className="text-amber-600" />;
    default:
      return <Bell size={16} className="text-amber-600" />;
  }
};

export interface NotificationBellProps {
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAppSelector((state) => state.auth);
  const { items, unreadCount, isLoading, error, hasMore, page } = useAppSelector(
    (state) => state.notifications as NotificationState
  );

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize Socket.IO connection and initial load
  useEffect(() => {
    if (isAuthenticated && token) {
      initializeSocket(token);
      dispatch(fetchNotifications({ page: 1, limit: 20 }));
    }
  }, [isAuthenticated, token, dispatch]);

  // Click outside to close panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    await dispatch(markAllNotificationsAsRead());
  };

  const handleNotificationClick = async (item: any) => {
    if (!item.isRead) {
      await dispatch(markNotificationAsRead(item._id));
    }
    if (item.destinationRoute && item.destinationRoute.startsWith('/')) {
      setIsOpen(false);
      navigate(item.destinationRoute);
    }
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await dispatch(markNotificationAsRead(id));
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      dispatch(fetchNotifications({ page: page + 1, limit: 20 }));
    }
  };

  const displayedItems = filter === 'unread' ? items.filter((i) => !i.isRead) : items;

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        aria-label="View notifications"
        aria-expanded={isOpen}
      >
        <Bell size={19} className="transition-transform group-hover:scale-105" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black text-white bg-red-600 rounded-full ring-2 ring-white animate-in zoom-in-50"
            data-testid="unread-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-200/80 z-50 overflow-hidden flex flex-col max-h-[520px] animate-in fade-in-50 slide-in-from-top-2 duration-150"
          data-testid="notification-panel"
        >
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-50 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-200/50">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-300 font-medium px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:cursor-not-allowed"
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-1.5 border-b border-gray-100 flex gap-2 text-xs bg-white">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-red-50 text-red-700 font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {isLoading && items.length === 0 ? (
              <div className="p-8 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-indigo-500" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : error && items.length === 0 ? (
              <div className="p-6 text-center text-gray-500 flex flex-col items-center gap-2">
                <AlertCircle size={24} className="text-red-500" />
                <span className="text-xs text-red-600 font-medium">{error}</span>
                <button
                  type="button"
                  onClick={() => dispatch(fetchNotifications({ page: 1 }))}
                  className="mt-1 text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                  <Inbox size={20} />
                </div>
                <p className="text-xs font-medium text-gray-600">No notifications yet</p>
                <p className="text-[11px] text-gray-400">
                  {filter === 'unread'
                    ? "You're all caught up with unread items!"
                    : "You'll be notified when assignments or opportunities arrive."}
                </p>
              </div>
            ) : (
              displayedItems.map((item) => (
                <div
                  key={item._id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 flex items-start gap-3 hover:bg-gray-50/80 transition-colors cursor-pointer group relative ${
                    !item.isRead ? 'bg-indigo-50/30' : 'bg-white'
                  }`}
                  data-testid="notification-item"
                >
                  {/* Icon */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    {getNotificationIcon(item.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-xs truncate ${
                          !item.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                    {item.destinationRoute && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 mt-1 hover:underline">
                        View details <ExternalLink size={10} />
                      </span>
                    )}
                  </div>

                  {/* Actions / Read Indicator */}
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    {!item.isRead ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleMarkSingleRead(e, item._id)}
                          className="w-5 h-5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-indigo-600 flex items-center justify-center transition-colors"
                          title="Mark as read"
                          aria-label="Mark as read"
                        >
                          <Check size={12} />
                        </button>
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer with Load More */}
          {hasMore && (
            <div className="p-2 border-t border-gray-100 bg-gray-50/50 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1 px-3 rounded hover:bg-indigo-50 transition-colors disabled:text-gray-400 flex items-center justify-center gap-1 mx-auto"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
