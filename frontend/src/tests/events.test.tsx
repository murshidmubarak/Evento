/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import * as eventsApi from '../features/events/eventsApi';
import * as servicesApi from '../features/services/servicesApi';
import { MyEvents } from '../pages/client/MyEvents';
import { EventDetails } from '../pages/client/EventDetails';
import { CreateEventWizard } from '../features/events/components/CreateEventWizard';

// Mock the API calls
vi.mock('../features/events/eventsApi', () => ({
  getMyEvents: vi.fn(),
  getEventById: vi.fn(),
  createEvent: vi.fn(),
  uploadServiceReferenceImages: vi.fn(),
}));

vi.mock('../features/services/servicesApi', () => ({
  getActiveServices: vi.fn(),
}));

vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test_key');

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: class {
      on = vi.fn();
      remove = vi.fn();
      flyTo = vi.fn();
    },
    Marker: class {
      setLngLat = vi.fn().mockReturnThis();
      addTo = vi.fn().mockReturnThis();
      getElement = vi.fn(() => ({ parentNode: true }));
      on = vi.fn();
      getLngLat = vi.fn(() => ({ lat: 0, lng: 0 }));
    },
  },
}));

vi.mock('@mapbox/search-js-react', () => ({
  SearchBox: () => <div data-testid="mapbox-search-box" />,
}));

const renderWithProviders = (
  ui: React.ReactElement,
  { route = '/', store = configureStore({ reducer: { auth: authReducer } }) } = {}
) => {
  window.history.pushState({}, 'Test page', route);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </Provider>
  );
};

describe('MyEvents Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    (eventsApi.getMyEvents as any).mockImplementation(() => new Promise(() => {})); // Never resolves
    renderWithProviders(<MyEvents />);
    
    // The Loader2 component has animate-spin class
    expect(screen.getByText('My Events')).toBeDefined();
  });

  it('renders empty state when no events', async () => {
    (eventsApi.getMyEvents as any).mockResolvedValue([]);
    renderWithProviders(<MyEvents />);
    
    await waitFor(() => {
      expect(screen.getByText('No events requested yet')).toBeDefined();
    });
  });

  it('renders events correctly', async () => {
    (eventsApi.getMyEvents as any).mockResolvedValue([
      {
        _id: '1', title: 'Test Wedding', eventType: 'Wedding', status: 'requested',
        date: '2026-10-10', startTime: '10:00', endTime: '18:00', location: { address: 'Venue A' }, guestCount: 100
      }
    ]);
    renderWithProviders(<MyEvents />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Wedding')).toBeDefined();
      expect(screen.getAllByText(/requested/i).length).toBeGreaterThan(0);
    });
  });

  it('shows error message on failure', async () => {
    (eventsApi.getMyEvents as any).mockRejectedValue({ response: { data: { message: 'API failed' } } });
    renderWithProviders(<MyEvents />);
    
    await waitFor(() => {
      expect(screen.getByText('API failed')).toBeDefined();
    });
  });
});

describe('EventDetails Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event details correctly', async () => {
    (eventsApi.getEventById as any).mockResolvedValue({
      _id: '1', title: 'Test Details', eventType: 'Wedding', status: 'requested',
      date: '2026-10-10', startTime: '10:00', endTime: '18:00', location: { address: 'Venue B' }, 
      guestCount: 100, selectedServices: [], budget: 5000
    });
    
    render(
      <MemoryRouter initialEntries={['/events/1']}>
        <Routes>
          <Route path="/events/:id" element={<EventDetails />} />
        </Routes>
      </MemoryRouter>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Test Details')).toBeDefined();
      expect(screen.getByText(/Venue B/i)).toBeDefined();
      expect(screen.getByText(/5,000/)).toBeDefined();
    });
  });

  it('shows error on 404', async () => {
    (eventsApi.getEventById as any).mockRejectedValue({ response: { status: 404, data: { message: 'Event not found' } } });
    
    render(
      <MemoryRouter initialEntries={['/events/999']}>
        <Routes>
          <Route path="/events/:id" element={<EventDetails />} />
        </Routes>
      </MemoryRouter>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Event not found')).toBeDefined();
    });
  });
});

describe('CreateEventWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (servicesApi.getActiveServices as any).mockResolvedValue([{ _id: 's1', name: 'Catering', description: 'Food' }]);
  });

  it('allows navigation and valid submission', async () => {
    const { container } = renderWithProviders(<CreateEventWizard />);
    
    // Step 1: Event Type
    await waitFor(() => screen.getByText('What type of event are you planning?'));
    fireEvent.click(screen.getByText('Wedding'));
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 2: Details
    await waitFor(() => screen.getByText('Event Name'));
    fireEvent.change(screen.getByPlaceholderText("e.g. Ameen & Fathima Wedding"), { target: { value: 'My Test Event' } });
    
    // Fill out date and time (using the specific inputs)
    const inputs = container.querySelectorAll('input');
    const dateInput = Array.from(inputs).find(input => input.type === 'date');
    const timeInputs = Array.from(inputs).filter(input => input.type === 'time');
    
    if (dateInput) fireEvent.change(dateInput, { target: { value: '2026-10-10' } });
    if (timeInputs.length >= 2) {
      fireEvent.change(timeInputs[0], { target: { value: '10:00' } });
      fireEvent.change(timeInputs[1], { target: { value: '18:00' } });
    }
    
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 3: Location
    await waitFor(() => screen.getByText('Event Location'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Grand Ballroom, XYZ Convention Centre, MG Road...'), { target: { value: '123 Main St' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 500'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 4: Services
    await waitFor(() => screen.getByText('Choose the services you need'));
    expect(servicesApi.getActiveServices).toHaveBeenCalled();
    
    // Check some catering option to populate preferences
    await waitFor(() => screen.getByText('Catering Service Configuration'));
    fireEvent.click(screen.getByText('Full Service Catering'));

    // Select custom item
    const mainDishInput = screen.getByPlaceholderText('Add custom main dish...');
    fireEvent.change(mainDishInput, { target: { value: 'Extra spicy custom dish' } });
    const addBtn = mainDishInput.parentElement?.querySelector('button');
    if (addBtn) fireEvent.click(addBtn);

    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 5: Budget
    await waitFor(() => screen.getByText('Allocated Budget (Optional)'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 6: Review & Submit
    await waitFor(() => screen.getAllByText('Review Your Event')[0]);
    expect(screen.getByText('Wedding')).toBeDefined();
    
    // Check confirmation checkbox
    fireEvent.click(screen.getByLabelText('I confirm that the above details are correct.'));

    (eventsApi.createEvent as any).mockResolvedValue({ _id: 'new-id', eventType: 'Wedding', date: '2026-10-12', status: 'requested' });
    fireEvent.click(screen.getByText('Submit Event Request'));
    
    await waitFor(() => {
      expect(eventsApi.createEvent).toHaveBeenCalledWith(expect.objectContaining({
        title: 'My Test Event',
        budget: 10000,
        selectedServices: [expect.objectContaining({
          serviceId: 's1',
          preferences: expect.objectContaining({
            serviceMode: ['Full Service Catering'],
            mainDishes: ['Extra spicy custom dish']
          })
        })]
      }));
    });
  });

  it('prevents navigating next if invalid', async () => {
    renderWithProviders(<CreateEventWizard />);
    
    // Step 1: Event Type (initially invalid since none selected)
    await waitFor(() => screen.getByText('What type of event are you planning?'));
    const nextBtn = screen.getByText('Next Step').closest('button') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
    
    fireEvent.click(screen.getByText('Wedding'));
    expect(nextBtn.disabled).toBe(false);
  });

  it('preserves Step 3 location state when navigating back and forth', async () => {
    const { container } = renderWithProviders(<CreateEventWizard />);
    
    // Step 1
    await waitFor(() => screen.getByText('What type of event are you planning?'));
    fireEvent.click(screen.getByText('Wedding'));
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 2
    await waitFor(() => screen.getByText('Event Name'));
    fireEvent.change(screen.getByPlaceholderText("e.g. Ameen & Fathima Wedding"), { target: { value: 'My Test Event' } });
    const inputs = container.querySelectorAll('input');
    const dateInput = Array.from(inputs).find(input => input.type === 'date');
    const timeInputs = Array.from(inputs).filter(input => input.type === 'time');
    if (dateInput) fireEvent.change(dateInput, { target: { value: '2026-10-10' } });
    if (timeInputs.length >= 2) {
      fireEvent.change(timeInputs[0], { target: { value: '10:00' } });
      fireEvent.change(timeInputs[1], { target: { value: '18:00' } });
    }
    fireEvent.click(screen.getByText('Next Step'));
    
    // Step 3
    await waitFor(() => screen.getByText('Event Location'));
    
    // Map should render
    expect(screen.getByTestId('map-container')).toBeDefined();
    
    // Enter location
    fireEvent.change(screen.getByPlaceholderText('e.g. Grand Ballroom, XYZ Convention Centre, MG Road...'), { target: { value: 'Saved Venue Address' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 500'), { target: { value: '150' } });
    
    // Go to Step 4
    fireEvent.click(screen.getByText('Next Step'));
    await waitFor(() => screen.getByText('Choose the services you need'));
    
    // Go back to Step 3
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => screen.getByText('Event Location'));
    
    // Verify values are preserved
    expect((screen.getByPlaceholderText('e.g. Grand Ballroom, XYZ Convention Centre, MG Road...') as HTMLTextAreaElement).value).toBe('Saved Venue Address');
    expect((screen.getByPlaceholderText('e.g. 500') as HTMLInputElement).value).toBe('150');
  });
});
