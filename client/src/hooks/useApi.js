import useSWR from 'swr';
import { swrFetcher } from '../lib/api.js';

/**
 * Data hooks for the dashboard. SWR dedupes identical requests across components
 * and keeps the previous data on screen while a new range loads, so the layout
 * never jumps back to a skeleton on a refetch.
 */
const options = { keepPreviousData: true, revalidateOnFocus: false };

const useApi = (path) => useSWR(path, swrFetcher, options);

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const useOverview = (range) => useApi(`/api/stats/overview?range=${range}`);

export const useTimeseries = (range, metric) =>
  useApi(
    `/api/stats/timeseries?range=${range}&metric=${metric}&tz=${encodeURIComponent(timeZone)}`,
  );

export const useByModel = (range) => useApi(`/api/stats/by-model?range=${range}`);

export const useModels = () => useApi('/api/models');

export const useKeys = () => useApi('/api/keys');

export function useLogs(filters) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) params.set(name, String(value));
  }
  return useApi(`/api/logs?${params}`);
}

export const useLog = (id) => useApi(id ? `/api/logs/${id}` : null);
