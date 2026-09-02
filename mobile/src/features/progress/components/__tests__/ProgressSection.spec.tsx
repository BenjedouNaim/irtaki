import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ProgressSection } from '../ProgressSection';
import { useMyProgress } from '../../hooks/useMyProgress';
import { useSurahs } from '../../hooks/useSurahs';
import { ProgressDto } from '../../../../shared/api/progress.client';
import { SurahDto } from '../../../../shared/api/quran.client';
import { ApiError, NetworkError } from '../../../../shared/api/types';

jest.mock('../../hooks/useMyProgress');
jest.mock('../../hooks/useSurahs');

const mockSurahs: SurahDto[] = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
];

const mockProgress: ProgressDto = {
  ahzab_completed: 23,
  coverage_percent: 38.5,
  last_memorized_position: { surah: 2, ayah: 142, ordinal: 149 },
  is_activity_pointer_only: true,
};

function mockProgressQuery(overrides: Record<string, unknown>) {
  (useMyProgress as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
    ...overrides,
  });
}

const refetchMock = jest.fn();

describe('ProgressSection (SCR-13 — Memorization Progress, F-PRG-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSurahs as jest.Mock).mockReturnValue({
      data: mockSurahs,
      isLoading: false,
      isError: false,
    });
  });

  it('renders a layout skeleton on first load (UF §22)', () => {
    mockProgressQuery({ isLoading: true });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section-skeleton')).toBeTruthy();
    expect(screen.getByTestId('progress-section-skeleton-loader')).toBeTruthy();
    expect(screen.queryByTestId('progress-section')).toBeNull();
  });

  it('renders the completion ring as a real count "23 / 60" from ahzab_completed', () => {
    mockProgressQuery({ data: mockProgress });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section')).toBeTruthy();
    expect(screen.getByText('التقدم في الحفظ')).toBeTruthy();

    const ring = screen.getByTestId('progress-section-ring');
    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 60, now: 23 });
    expect(
      screen.getByTestId('progress-section-ring-value').props.children,
    ).toBe('23 / 60');
    expect(screen.getByText('حزباً مكتملاً')).toBeTruthy();
  });

  it('renders last_memorized_position as plain text with the surah name and an info disclaimer — never as a progress bar (DEC-D02)', () => {
    mockProgressQuery({ data: mockProgress });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section-pointer')).toBeTruthy();
    expect(
      screen.getByText('آخر موضع تم العمل عليه: سورة البقرة · الآية 142'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('progress-section-pointer-disclaimer'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'يشير هذا الموضع إلى آخر نشاط حفظ فقط، ولا يعبّر عن نسبة التقدم.',
      ),
    ).toBeTruthy();

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

  it('never renders the position block unless the payload carries is_activity_pointer_only: true', () => {
    mockProgressQuery({
      data: { ...mockProgress, is_activity_pointer_only: false },
    });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section-ring')).toBeTruthy();
    expect(screen.queryByTestId('progress-section-pointer')).toBeNull();
    expect(screen.queryByText(/آخر موضع تم العمل عليه/)).toBeNull();
  });

  it('falls back to the surah number while reference data is unavailable', () => {
    (useSurahs as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    mockProgressQuery({ data: mockProgress });

    render(<ProgressSection />);

    expect(
      screen.getByText('آخر موضع تم العمل عليه: السورة رقم 2 · الآية 142'),
    ).toBeTruthy();
  });

  it('renders a factual statement when no position has been recorded yet (UF §23)', () => {
    mockProgressQuery({
      data: {
        ...mockProgress,
        ahzab_completed: 0,
        coverage_percent: 0,
        last_memorized_position: null,
      },
    });

    render(<ProgressSection />);

    expect(
      screen.getByTestId('progress-section-ring-value').props.children,
    ).toBe('0 / 60');
    expect(screen.getByTestId('progress-section-pointer-empty')).toBeTruthy();
    expect(screen.getByText('لم يُسجَّل أي موضع حفظ بعد')).toBeTruthy();
    expect(screen.queryByTestId('progress-section-pointer-text')).toBeNull();
    expect(
      screen.getByTestId('progress-section-pointer-disclaimer'),
    ).toBeTruthy();
  });

  it('renders the server error message and a retry action on ApiError (UF §24)', () => {
    mockProgressQuery({
      isError: true,
      error: new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'حدث خطأ في الخادم',
      }),
    });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section-error')).toBeTruthy();
    expect(screen.getByText('خطأ في تحميل البيانات')).toBeTruthy();
    expect(screen.getByText('حدث خطأ في الخادم')).toBeTruthy();
    expect(screen.queryByTestId('progress-section-ring')).toBeNull();

    fireEvent.press(screen.getByTestId('progress-section-retry-button'));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders a generic connectivity message on network failure, with no internal detail', () => {
    mockProgressQuery({
      isError: true,
      error: new NetworkError('TypeError: Network request failed'),
    });

    render(<ProgressSection />);

    expect(screen.getByTestId('progress-section-error')).toBeTruthy();
    expect(
      screen.getByText(
        'تعذر الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});
