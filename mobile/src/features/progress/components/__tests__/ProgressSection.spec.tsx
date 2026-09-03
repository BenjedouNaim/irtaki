import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressSection } from '../ProgressSection';
import * as progressApi from '@/shared/api/progress.client';
import * as quranApi from '@/shared/api/quran.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { METRIC_MAX_FONT_SIZE_MULTIPLIER } from '@/shared/components/CompletionRing';

jest.mock('@/shared/api/progress.client');
jest.mock('@/shared/api/quran.client');

const mockSurahs: quranApi.SurahDto[] = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
];

const mockProgress: progressApi.ProgressDto = {
  ahzab_completed: 23,
  coverage_percent: 38.5,
  last_memorized_position: { surah: 2, ayah: 142, ordinal: 149 },
  is_activity_pointer_only: true,
};

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل بيانات التقدم';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

let queryClient: QueryClient;

function renderSection() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgressSection />
    </QueryClientProvider>,
  );
}

describe('ProgressSection (SCR-13 — تقدّم الحفظ card, F-PRG-02, Figma 30:603)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(quranApi, 'listSurahs').mockResolvedValue(mockSurahs);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a ring-shaped layout skeleton on first load (UF §22)', () => {
    jest.spyOn(progressApi, 'getMyProgress').mockImplementation(NEVER);

    renderSection();

    expect(screen.getByTestId('progress-section-skeleton')).toBeTruthy();
    expect(screen.getByTestId('progress-section-skeleton-loader')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-circle')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-line-0')).toBeTruthy();
    expect(screen.queryByTestId('progress-section')).toBeNull();
    expect(screen.queryByTestId('progress-section-error')).toBeNull();
  });

  it('fetches via getMyProgress and renders the completion ring as a real count "23" over "من 60 حزبًا"', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    renderSection();

    expect(await screen.findByTestId('progress-section')).toBeTruthy();
    expect(progressApi.getMyProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('تقدّم الحفظ')).toBeTruthy();
    expect(screen.getByText('الأحزاب المكتملة')).toBeTruthy();
    expect(screen.getByTestId('progress-section-count').props.children).toBe(
      '23 من 60',
    );

    const ring = screen.getByTestId('progress-section-ring');
    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 60, now: 23 });
    expect(
      screen.getByTestId('progress-section-ring-value').props.children,
    ).toBe('23');
    expect(
      screen.getByTestId('progress-section-ring').props.accessibilityLabel,
    ).toBe('حزباً مكتملاً: 23 من 60');
  });

  it('renders last_memorized_position as plain text with the surah name and an info disclaimer — never as a progress bar (DEC-D02)', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    renderSection();

    expect(await screen.findByTestId('progress-section-pointer')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('آخر موضع: البقرة 142')).toBeTruthy(),
    );
    // Figma: an info glyph carries the DEC-D02 disclaimer for assistive tech.
    expect(
      screen.getByTestId('progress-section-pointer-disclaimer').props
        .accessibilityLabel,
    ).toBe('يشير هذا الموضع إلى آخر نشاط حفظ فقط، ولا يعبّر عن نسبة التقدم.');

    // Exactly one progressbar exists (the ahzab ring); the pointer carries none.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(
      screen.getByTestId('progress-section-pointer').props.accessibilityRole,
    ).toBeUndefined();
    expect(
      screen.getByTestId('progress-section-pointer-text').props
        .accessibilityValue,
    ).toBeUndefined();
  });

  it('does not gate the pointer on is_activity_pointer_only (always true per APIS §10.10) — it is plain text whenever a position exists', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue({
      ...mockProgress,
      // Simulate a payload that drops the flag: rendering must not change.
      is_activity_pointer_only: undefined,
    } as unknown as progressApi.ProgressDto);

    renderSection();

    expect(await screen.findByTestId('progress-section-pointer')).toBeTruthy();
    expect(screen.getByTestId('progress-section-pointer-text')).toBeTruthy();
    expect(
      screen.getByTestId('progress-section-pointer-disclaimer'),
    ).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('caps OS text scaling on the pointer metric text (UF §32)', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    renderSection();

    const pointer = await screen.findByTestId('progress-section-pointer-text');
    expect(pointer.props.maxFontSizeMultiplier).toBe(
      METRIC_MAX_FONT_SIZE_MULTIPLIER,
    );
  });

  it('falls back to the surah number while reference data is unavailable', async () => {
    jest.spyOn(quranApi, 'listSurahs').mockImplementation(NEVER);
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    renderSection();

    expect(await screen.findByText('آخر موضع: سورة 2 142')).toBeTruthy();
  });

  it('renders a factual statement when no position has been recorded yet (UF §23)', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue({
      ...mockProgress,
      ahzab_completed: 0,
      coverage_percent: 0,
      last_memorized_position: null,
    });

    renderSection();

    expect(
      await screen.findByTestId('progress-section-pointer-empty'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('progress-section-ring-value').props.children,
    ).toBe('0');
    expect(screen.getByText('لم يُسجَّل أي موضع حفظ بعد')).toBeTruthy();
    expect(screen.queryByTestId('progress-section-pointer-text')).toBeNull();
    expect(
      screen.queryByTestId('progress-section-pointer-disclaimer'),
    ).toBeNull();
  });

  it.each([500, 503])(
    'shows the generic retry message on a %i and never the server string (UF §24, TS §29)',
    async (statusCode) => {
      const serverMessage =
        'FATAL: relation "memorization_coverage" does not exist';
      jest.spyOn(progressApi, 'getMyProgress').mockRejectedValue(
        new ApiError({
          statusCode,
          error: statusCode === 500 ? 'INTERNAL_ERROR' : 'SERVICE_UNAVAILABLE',
          message: serverMessage,
        }),
      );

      renderSection();

      expect(await screen.findByTestId('progress-section-error')).toBeTruthy();
      expect(
        screen.getByTestId('progress-section-error-message').props.children,
      ).toBe(GENERIC_SERVER_MESSAGE);
      expect(screen.queryByText(serverMessage)).toBeNull();
      expect(screen.queryByText(/relation/)).toBeNull();
      expect(screen.queryByTestId('progress-section-ring')).toBeNull();
    },
  );

  it('pairs the error text with an accessible icon — never color-only (UF §32)', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'boom',
      }),
    );

    renderSection();

    const banner = await screen.findByTestId('progress-section-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    const icon = screen.getByTestId('progress-section-error-icon');
    expect(icon.props.accessibilityLabel).toBe('تنبيه');
    expect(icon.props.accessibilityRole).toBe('image');
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
  });

  it('retries the fetch when the retry action is pressed', async () => {
    const spy = jest
      .spyOn(progressApi, 'getMyProgress')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'boom',
        }),
      )
      .mockResolvedValueOnce(mockProgress);

    renderSection();

    await screen.findByTestId('progress-section-error');
    fireEvent.press(screen.getByTestId('progress-section-error-retry-button'));

    expect(await screen.findByTestId('progress-section')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('renders a generic connectivity message on network failure, with no internal detail', async () => {
    jest
      .spyOn(progressApi, 'getMyProgress')
      .mockRejectedValue(new NetworkError('TypeError: Network request failed'));

    renderSection();

    expect(await screen.findByTestId('progress-section-error')).toBeTruthy();
    expect(screen.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId('progress-section-error-icon')).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});
