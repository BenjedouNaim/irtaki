import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QuranRangePickerSheet } from '../QuranRangePickerSheet';
import { useSurahs } from '../../hooks/useSurahs';
import { SurahDto } from '../../../../shared/api/quran.client';

jest.mock('../../hooks/useSurahs');

const mockSurahs: SurahDto[] = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
  { number: 3, name_ar: 'آل عمران', ayah_count: 200, ordinal_offset: 293 },
];

describe('QuranRangePickerSheet (SCR-11)', () => {
  const onConfirmMock = jest.fn();
  const onCancelMock = jest.fn();
  const refetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useSurahs as jest.Mock).mockReturnValue({
      data: mockSurahs,
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    });
  });

  it('renders nothing / is hidden when visible is false', () => {
    render(
      <QuranRangePickerSheet
        visible={false}
        rangeType="memorization"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    // Modal with visible=false renders null in test renderer
    expect(screen.queryByTestId('quran-range-picker-sheet')).toBeNull();
  });

  it('renders skeleton loader on first load when isLoading=true and data is undefined', () => {
    (useSurahs as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: refetchMock,
    });

    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="memorization"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    expect(screen.getByTestId('quran-range-picker-sheet-skeleton')).toBeTruthy();
  });

  it('renders error banner when isError=true and allows retry', () => {
    (useSurahs as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    });

    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="revision"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    expect(screen.getByTestId('quran-range-picker-sheet-error')).toBeTruthy();
    expect(screen.getByText('حدث خطأ أثناء تحميل بيانات السور')).toBeTruthy();

    const retryBtn = screen.getByTestId('quran-range-picker-sheet-retry-button');
    fireEvent.press(retryBtn);

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('walks through the 4 stages of range selection and confirms the exact AyahRange shape', () => {
    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="memorization"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    // Header title
    expect(screen.getByText('نطاق الحفظ')).toBeTruthy();

    // Stage 1: from-surah
    expect(screen.getByText('من: اختر السورة (1/4)')).toBeTruthy();
    const fromSurah1 = screen.getByTestId('surah-row-1'); // Al-Fatiha
    fireEvent.press(fromSurah1);

    // Stage 2: from-ayah
    expect(screen.getByText('من: سورة الفاتحة (2/4)')).toBeTruthy();
    const ayah3 = screen.getByTestId(
      'quran-range-picker-sheet-from-ayah-wheel-picker-item-3',
    );
    fireEvent.press(ayah3);

    const nextBtn = screen.getByTestId('quran-range-picker-sheet-next-button');
    fireEvent.press(nextBtn);

    // Stage 3: to-surah
    expect(screen.getByText('إلى: اختر السورة (3/4)')).toBeTruthy();
    const toSurah2 = screen.getByTestId('surah-row-2'); // Al-Baqara
    fireEvent.press(toSurah2);

    // Stage 4: to-ayah
    expect(screen.getByText('إلى: سورة البقرة (4/4)')).toBeTruthy();
    const toAyah20 = screen.getByTestId(
      'quran-range-picker-sheet-to-ayah-wheel-picker-item-20',
    );
    fireEvent.press(toAyah20);

    const confirmBtn = screen.getByTestId(
      'quran-range-picker-sheet-confirm-button',
    );
    expect(confirmBtn.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(confirmBtn);

    expect(onConfirmMock).toHaveBeenCalledWith({
      from: { surah: 1, ayah: 3 },
      to: { surah: 2, ayah: 20 },
    });
  });

  it('handles back navigation through each stage and cancellation at stage 1', () => {
    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="revision"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    expect(screen.getByText('نطاق المراجعة')).toBeTruthy();

    // Stage 1 -> Back calls onCancel
    const backBtn = screen.getByTestId('quran-range-picker-sheet-back-button');
    fireEvent.press(backBtn);
    expect(onCancelMock).toHaveBeenCalledTimes(1);

    // Move to stage 2
    const fromSurah2 = screen.getByTestId('surah-row-2');
    fireEvent.press(fromSurah2);
    expect(screen.getByText('من: سورة البقرة (2/4)')).toBeTruthy();

    // Stage 2 -> Back returns to stage 1
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-back-button'));
    expect(screen.getByText('من: اختر السورة (1/4)')).toBeTruthy();

    // Move to stage 3
    fireEvent.press(screen.getByTestId('surah-row-2'));
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-next-button'));
    expect(screen.getByText('إلى: اختر السورة (3/4)')).toBeTruthy();

    // Stage 3 -> Back returns to stage 2
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-back-button'));
    expect(screen.getByText('من: سورة البقرة (2/4)')).toBeTruthy();

    // Move to stage 4
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-next-button'));
    fireEvent.press(screen.getByTestId('surah-row-3')); // Aal Imran
    expect(screen.getByText('إلى: سورة آل عمران (4/4)')).toBeTruthy();

    // Stage 4 -> Back returns to stage 3
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-back-button'));
    expect(screen.getByText('إلى: اختر السورة (3/4)')).toBeTruthy();
  });

  it('calls onCancel when close button (✕) is pressed', () => {
    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="memorization"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    const closeBtn = screen.getByTestId('quran-range-picker-sheet-close-button');
    fireEvent.press(closeBtn);

    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('enforces VR-14a: disables confirm button when TO surah is before FROM surah', () => {
    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="memorization"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    // FROM: Surah 2 (Al-Baqara), Ayah 10
    fireEvent.press(screen.getByTestId('surah-row-2'));
    fireEvent.press(
      screen.getByTestId('quran-range-picker-sheet-from-ayah-wheel-picker-item-10'),
    );
    fireEvent.press(screen.getByTestId('quran-range-picker-sheet-next-button'));

    // TO: Surah 1 (Al-Fatiha) -> before Surah 2
    fireEvent.press(screen.getByTestId('surah-row-1'));

    // In stage 4: warning text shown and confirm button disabled
    expect(
      screen.getByText('يجب أن تكون نهاية النطاق بعد بدايته في ترتيب المصحف'),
    ).toBeTruthy();

    const confirmBtn = screen.getByTestId(
      'quran-range-picker-sheet-confirm-button',
    );
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(confirmBtn);
    expect(onConfirmMock).not.toHaveBeenCalled();
  });

  it('seeds draft from initialValue when provided', () => {
    render(
      <QuranRangePickerSheet
        visible={true}
        rangeType="memorization"
        initialValue={{
          from: { surah: 2, ayah: 15 },
          to: { surah: 3, ayah: 50 },
        }}
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    expect(
      screen.getByTestId('quran-range-picker-sheet-summary-from'),
    ).toHaveTextContent('سورة البقرة (آية 15)');
  });
});
