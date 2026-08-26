import { useQuery } from '@tanstack/react-query';
import { listSurahs, SurahDto } from '../../../shared/api/quran.client';

/**
 * Feature hook for fetching Quran Surah reference data.
 * Adheres to TS.md §10/§26/§37 ("screens/components consume hooks, never call the API client directly").
 * Inherits default QueryClient options (5m staleTime) from RootLayout.
 */
export function useSurahs() {
  return useQuery<SurahDto[], Error>({
    queryKey: ['quran', 'surahs'],
    queryFn: listSurahs,
  });
}
