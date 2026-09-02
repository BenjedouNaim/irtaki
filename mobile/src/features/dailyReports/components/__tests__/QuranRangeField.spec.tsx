import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QuranRangeField } from '../QuranRangeField';
import { useSurahs } from '@/features/progress/hooks/useSurahs';

jest.mock('@/features/progress/hooks/useSurahs');

const surahs = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
];

describe('QuranRangeField (UF §20 range selector → SCR-11 sheet)', () => {
  beforeEach(() => {
    (useSurahs as jest.Mock).mockReturnValue({
      data: surahs,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('renders a placeholder when empty and the sheet stays closed', () => {
    render(
      <QuranRangeField
        label="نطاق الحفظ"
        rangeType="memorization"
        value={null}
        onChange={jest.fn()}
        required
        testID="memo-range-field"
      />,
    );
    expect(screen.getByText(/نطاق الحفظ/)).toBeTruthy();
    expect(screen.getByText('اضغط لاختيار النطاق')).toBeTruthy();
    expect(screen.queryByTestId('memo-range-field-sheet')).toBeNull();
  });

  it('summarises a value with surah names (Western numerals, UF §19)', () => {
    render(
      <QuranRangeField
        label="نطاق الحفظ"
        rangeType="memorization"
        value={{ from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } }}
        onChange={jest.fn()}
        testID="memo-range-field"
      />,
    );
    expect(screen.getByTestId('memo-range-field-summary').props.children).toBe(
      'من سورة البقرة آية 1 إلى سورة البقرة آية 20',
    );
  });

  it('opens the shared Quran Range Picker and reports the confirmed range', () => {
    const onChange = jest.fn();
    render(
      <QuranRangeField
        label="نطاق المراجعة"
        rangeType="revision"
        value={null}
        onChange={onChange}
        testID="rev-range-field"
      />,
    );

    fireEvent.press(screen.getByTestId('rev-range-field-trigger'));
    expect(screen.getByTestId('rev-range-field-sheet')).toBeTruthy();
    expect(
      screen.getByTestId('rev-range-field-sheet-title').props.children,
    ).toBe('نطاق المراجعة');

    // FROM: surah 1, ayah 1 → TO: surah 1, ayah 7 (SCR-11 four steps).
    fireEvent.press(screen.getByTestId('surah-row-1'));
    fireEvent.press(screen.getByTestId('rev-range-field-sheet-next-button'));
    fireEvent.press(screen.getByTestId('surah-row-1'));
    fireEvent.press(
      screen.getByTestId('rev-range-field-sheet-to-ayah-wheel-picker-item-7'),
    );
    fireEvent.press(screen.getByTestId('rev-range-field-sheet-confirm-button'));

    expect(onChange).toHaveBeenCalledWith({
      from: { surah: 1, ayah: 1 },
      to: { surah: 1, ayah: 7 },
    });
    expect(screen.queryByTestId('rev-range-field-sheet')).toBeNull();
  });

  it('shows an icon + text error under the trigger', () => {
    render(
      <QuranRangeField
        label="نطاق الحفظ"
        rangeType="memorization"
        value={null}
        onChange={jest.fn()}
        error="نطاق الحفظ مطلوب"
        testID="memo-range-field"
      />,
    );
    expect(screen.getByText('نطاق الحفظ مطلوب')).toBeTruthy();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
  });
});
