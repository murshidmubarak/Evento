import { apiClient } from '../../services/apiClient';
import type { Service } from './service.types';

export const getActiveServices = async (): Promise<Service[]> => {
  const response = await apiClient.get<{ data: { services: Service[] } }>('/services');
  // Backend might return all services; we'll filter on frontend just in case, though ideally the endpoint would support ?isActive=true
  return response.data.data.services.filter((s: Service) => s.isActive);
};
