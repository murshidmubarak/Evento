import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { notificationsApi, type NotificationItem, type NotificationsResponse } from './notificationsApi';

export type { NotificationItem };

export interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  isConnected: boolean;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
  hasMore: false,
  isConnected: false,
};

export const fetchNotifications = createAsyncThunk<
  NotificationsResponse,
  { page?: number; limit?: number; unreadOnly?: boolean } | undefined,
  { rejectValue: string }
>('notifications/fetchNotifications', async (params, { rejectWithValue }) => {
  try {
    return await notificationsApi.getNotifications(params);
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch notifications');
  }
});

export const markNotificationAsRead = createAsyncThunk<
  NotificationItem,
  string,
  { rejectValue: string }
>('notifications/markNotificationAsRead', async (id, { rejectWithValue }) => {
  try {
    return await notificationsApi.markAsRead(id);
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Failed to mark notification as read');
  }
});

export const markAllNotificationsAsRead = createAsyncThunk<
  { modifiedCount: number },
  void,
  { rejectValue: string }
>('notifications/markAllNotificationsAsRead', async (_, { rejectWithValue }) => {
  try {
    return await notificationsApi.markAllAsRead();
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Failed to mark all as read');
  }
});

export const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    notificationReceived: (state, action: PayloadAction<NotificationItem>) => {
      const incoming = action.payload;
      const exists = state.items.some((item) => item._id === incoming._id);
      if (!exists) {
        state.items.unshift(incoming);
        state.total += 1;
        if (!incoming.isRead) {
          state.unreadCount += 1;
        }
      }
    },
    setSocketConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
    },
    clearNotifications: (state) => {
      state.items = [];
      state.unreadCount = 0;
      state.isLoading = false;
      state.error = null;
      state.page = 1;
      state.total = 0;
      state.totalPages = 1;
      state.hasMore = false;
      state.isConnected = false;
    },
  },
  extraReducers: (builder) => {
    // ── fetchNotifications ──
    builder.addCase(fetchNotifications.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(fetchNotifications.fulfilled, (state, action) => {
      state.isLoading = false;
      const { notifications, unreadCount, pagination } = action.payload;
      
      if (pagination.page === 1) {
        state.items = notifications;
      } else {
        // Append distinct
        const existingIds = new Set(state.items.map((i) => i._id));
        for (const item of notifications) {
          if (!existingIds.has(item._id)) {
            state.items.push(item);
          }
        }
      }

      state.unreadCount = unreadCount;
      state.page = pagination.page;
      state.limit = pagination.limit;
      state.total = pagination.total;
      state.totalPages = pagination.totalPages;
      state.hasMore = pagination.page < pagination.totalPages;
    });
    builder.addCase(fetchNotifications.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload || 'Failed to load notifications';
    });

    // ── markNotificationAsRead ──
    builder.addCase(markNotificationAsRead.fulfilled, (state, action) => {
      const updated = action.payload;
      const item = state.items.find((i) => i._id === updated._id);
      if (item && !item.isRead) {
        item.isRead = true;
        item.readAt = updated.readAt;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    });

    // ── markAllNotificationsAsRead ──
    builder.addCase(markAllNotificationsAsRead.fulfilled, (state) => {
      state.items.forEach((item) => {
        item.isRead = true;
      });
      state.unreadCount = 0;
    });
  },
});

export const { notificationReceived, setSocketConnected, clearNotifications } =
  notificationSlice.actions;

export default notificationSlice.reducer;
