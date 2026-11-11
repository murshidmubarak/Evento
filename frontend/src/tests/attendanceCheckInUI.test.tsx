/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ManagerEventDetails } from '../pages/manager/ManagerEventDetails';
import { managerApi } from '../features/manager/managerApi';
import { attendanceApi } from '../features/attendance/attendanceApi';
import type { AttendanceRosterResponse, AttendanceSession } from '../features/attendance/attendance.types';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEventById: vi.fn(),
  },
}));

// Mock attendanceApi
vi.mock('../features/attendance/attendanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/attendance/attendanceApi')>();
  return {
    ...actual,
    attendanceApi: {
      getSession: vi.fn(),
      getRoster: vi.fn(),
      finalizeCheckIn: vi.fn(),
    },
  };
});

// Mock ReadOnlyMap
vi.mock('../components/common/ReadOnlyMap', () => ({
  ReadOnlyMap: () => <div data-testid="readonly-map" />,
}));

describe('Milestone 4 — Phase 4.3: Event Manager Check-in Frontend Integration', { timeout: 15000 }, () => {
  const mockEvent = {
    _id: 'ev_att_101',
    title: 'Grand Royal Wedding 2026',
    eventType: 'Wedding',
    date: '2026-11-20T00:00:00.000Z',
    startTime: '08:00',
    endTime: '22:00',
    guestCount: 500,
    status: 'confirmed',
    location: {
      address: 'Royal Palace Convention Center',
      lat: 12.9716,
      lng: 77.5946,
    },
    clientId: {
      _id: 'cli_1',
      name: 'Mr. Khan',
      email: 'khan@example.com',
      phone: '+91 9988776655',
    },
    selectedServices: [],
  };

  const mockSessionInitial: AttendanceSession = {
    _id: 'sess_101',
    eventId: 'ev_att_101',
    lifecycleStatus: 'checkin_in_progress',
    checkInFinalized: false,
    checkOutFinalized: false,
  };

  const mockRosterEligible: AttendanceRosterResponse = {
    eventId: 'ev_att_101',
    eventTitle: 'Grand Royal Wedding 2026',
    eventDate: '2026-11-20T00:00:00.000Z',
    session: {
      checkInFinalized: false,
      checkOutFinalized: false,
      lifecycleStatus: 'checkin_in_progress',
    },
    latestReportingTime: '09:30 AM',
    latestReportingTimestamp: '2026-11-20T04:00:00.000Z',
    canFinalizeCheckIn: true,
    totalAssigned: 3,
    roster: [
      {
        workerId: 'w_1',
        workerName: 'Ahmed Raza',
        workerEmail: 'ahmed@eventops.local',
        workerPhone: '+91 9111111111',
        businessId: 'W-2001',
        workerType: 'Catering Boy',
        requirementId: 'req_cat_1',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
      {
        workerId: 'w_2',
        workerName: 'Bilal Hassan',
        workerEmail: 'bilal@eventops.local',
        workerPhone: '+91 9222222222',
        businessId: 'W-2002',
        workerType: 'Catering Boy',
        requirementId: 'req_cat_1',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
      {
        workerId: 'w_3',
        workerName: 'Zubair Qureshi',
        workerEmail: 'zubair@eventops.local',
        workerPhone: '+91 9333333333',
        businessId: 'W-5001',
        workerType: 'Cameraman / Photographer',
        requirementId: 'req_photo_1',
        reportingTime: '09:30 AM',
        reportingTimeSnapshot: '09:30 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  const renderManagerDetails = (
    initialTab = 'attendance',
    customSession: AttendanceSession = mockSessionInitial,
    customRoster: AttendanceRosterResponse = mockRosterEligible
  ) => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValue(mockEvent as any);
    vi.mocked(attendanceApi.getSession).mockResolvedValue(customSession);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(customRoster);

    return render(
      <MemoryRouter initialEntries={[`/manager/events/ev_att_101?tab=${initialTab}`]}>
        <Routes>
          <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  // -------------------------------------------------------------------------
  // 1. Navigation & Attendance Tab Integration
  // -------------------------------------------------------------------------
  describe('Tab Integration in ManagerEventDetails', () => {
    it('renders the Attendance tab button in the header', async () => {
      renderManagerDetails('overview');

      await waitFor(() => {
        expect(screen.getByText('Grand Royal Wedding 2026')).toBeDefined();
      });

      // Look for the exact Attendance tab button
      const attendanceTabBtn = screen.getByRole('button', { name: /^Attendance$/i });
      expect(attendanceTabBtn).toBeDefined();

      // Click on Attendance tab
      fireEvent.click(attendanceTabBtn);

      await waitFor(() => {
        expect(screen.getByText('Check-in Exceptions Workspace')).toBeDefined();
      });
    });

    it('renders Quick Attendance banner in overview tab for confirmed events', async () => {
      renderManagerDetails('overview');

      await waitFor(() => {
        expect(screen.getByText('Exception-Based Attendance & Check-in')).toBeDefined();
      });

      const jumpBtn = screen.getByRole('button', { name: /Manage Attendance & Check-in/i });
      fireEvent.click(jumpBtn);

      await waitFor(() => {
        expect(screen.getByText('Check-in Exceptions Workspace')).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Initial Roster Loading & Summary Metrics
  // -------------------------------------------------------------------------
  describe('Initial Roster Loading & Assigned Workers', () => {
    it('loads session and roster, displaying assigned workers and status filters', async () => {
      renderManagerDetails('attendance');

      await waitFor(() => {
        // Roster header and filter tabs
        expect(screen.getByText(/Assigned Worker/i)).toBeDefined();
        expect(screen.getAllByText(/On Time/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Late/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Absent/i).length).toBeGreaterThan(0);

        // Worker rows
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
        expect(screen.getByText('W-2001')).toBeDefined();
        expect(screen.getByText('Bilal Hassan')).toBeDefined();
        expect(screen.getByText('W-2002')).toBeDefined();
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
        expect(screen.getByText('W-5001')).toBeDefined();

        // Default On Time presence for unrecorded workers
        expect(screen.getAllByText(/Present/i).length).toBeGreaterThan(0);
      });
    });

    it('displays error notice and retry button if API fails to load', async () => {
      vi.mocked(managerApi.getManagerEventById).mockResolvedValue(mockEvent as any);
      vi.mocked(attendanceApi.getSession).mockRejectedValue(new Error('Network error loading session'));
      vi.mocked(attendanceApi.getRoster).mockRejectedValue(new Error('Network error loading roster'));

      render(
        <MemoryRouter initialEntries={['/manager/events/ev_att_101?tab=attendance']}>
          <Routes>
            <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Attendance')).toBeDefined();
        expect(screen.getByText(/Network error loading/)).toBeDefined();
        expect(screen.getByRole('button', { name: /Retry Loading/i })).toBeDefined();
      });
    });

    it('displays inactive notice when event is cancelled', async () => {
      const cancelledEvent = { ...mockEvent, status: 'cancelled' };
      vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(cancelledEvent as any);

      render(
        <MemoryRouter initialEntries={['/manager/events/ev_att_101?tab=attendance']}>
          <Routes>
            <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Attendance Inactive')).toBeDefined();
        expect(screen.getByText(/Attendance check-in and roster operations cannot be performed on cancelled events/i)).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Search & Filter
  // -------------------------------------------------------------------------
  describe('Search & Filter', () => {
    it('filters workers using quick search and category filter chips', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionInitial);
      vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterEligible);

      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
      });

      // Search for Cameraman
      const searchInput = screen.getByPlaceholderText(/Search by name, type, ID\.\.\./i);
      fireEvent.change(searchInput, { target: { value: 'Zubair' } });

      await waitFor(() => {
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
        expect(screen.queryByText('Ahmed Raza')).toBeNull();
      });

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
      });
    });
  });
});
