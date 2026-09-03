import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AyahWheel } from '../AyahWheel';
import { SurahDto } from '../../../../shared/api/quran.client';
import { buildSurahIndex } from '../../utils/ayahRange';

describe('AyahWheel Component', () => {
  const mockSurahs: SurahDto[] = [
    { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
    { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
  ];

  const surahIndex = buildSurahIndex(mockSurahs);
  const onSelectAyahMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders exactly 1..ayah_count items inside the Figma WheelCard with the "الآية" label', () => {
    render(
      <AyahWheel
        surah={mockSurahs[0]} // Al-Fatiha, 7 ayahs
        surahIndex={surahIndex}
        selectedAyah={1}
        onSelectAyah={onSelectAyahMock}
        testID="ayah-wheel"
      />,
    );

    expect(screen.getByText('الآية')).toBeTruthy();
    expect(screen.getByTestId('ayah-wheel').props.accessibilityLabel).toBe(
      'سورة الفاتحة، عدد الآيات 7',
    );

    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`ayah-wheel-picker-item-${i}`)).toBeTruthy();
    }
  });

  it('allows selection of any ayah when fromPosition is undefined', () => {
    render(
      <AyahWheel
        surah={mockSurahs[0]}
        surahIndex={surahIndex}
        selectedAyah={1}
        onSelectAyah={onSelectAyahMock}
        testID="ayah-wheel"
      />,
    );

    const ayah4 = screen.getByTestId('ayah-wheel-picker-item-4');
    fireEvent.press(ayah4);

    expect(onSelectAyahMock).toHaveBeenCalledWith(4);
  });

  it('disables ayahs before fromPosition within the same surah (VR-14a)', () => {
    render(
      <AyahWheel
        surah={mockSurahs[0]} // Al-Fatiha
        surahIndex={surahIndex}
        fromPosition={{ surah: 1, ayah: 4 }}
        selectedAyah={4}
        onSelectAyah={onSelectAyahMock}
        testID="ayah-wheel"
      />,
    );

    // Ayah 1, 2, 3 should be disabled
    const ayah2 = screen.getByTestId('ayah-wheel-picker-item-2');
    expect(ayah2.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(ayah2);
    expect(onSelectAyahMock).not.toHaveBeenCalled();

    // Ayah 4 (same) and Ayah 5 (after) should be enabled
    const ayah4 = screen.getByTestId('ayah-wheel-picker-item-4');
    expect(ayah4.props.accessibilityState.disabled).toBe(false);

    const ayah5 = screen.getByTestId('ayah-wheel-picker-item-5');
    expect(ayah5.props.accessibilityState.disabled).toBe(false);

    fireEvent.press(ayah5);
    expect(onSelectAyahMock).toHaveBeenCalledWith(5);
  });
});
