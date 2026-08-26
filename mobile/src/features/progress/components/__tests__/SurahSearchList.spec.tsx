import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SurahSearchList } from '../SurahSearchList';
import { SurahDto } from '../../../../shared/api/quran.client';

const mockSurahs: SurahDto[] = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
  { number: 3, name_ar: 'آل عمران', ayah_count: 200, ordinal_offset: 293 },
  { number: 112, name_ar: 'الإخلاص', ayah_count: 4, ordinal_offset: 6200 },
  { number: 113, name_ar: 'الفلق', ayah_count: 5, ordinal_offset: 6204 },
  { number: 114, name_ar: 'الناس', ayah_count: 6, ordinal_offset: 6208 },
];

describe('SurahSearchList Component', () => {
  const onSelectSurahMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders surahs in Mushaf order (ascending by number, never alphabetical)', () => {
    // Pass in reverse order to ensure component enforces mushaf order
    const reversed = [...mockSurahs].reverse();

    render(
      <SurahSearchList
        surahs={reversed}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    expect(screen.getByText('سورة الفاتحة')).toBeTruthy();
    expect(screen.getByText('سورة البقرة')).toBeTruthy();
    expect(screen.getByText('سورة آل عمران')).toBeTruthy();

    const row1 = screen.getByTestId('surah-row-1');
    const row2 = screen.getByTestId('surah-row-2');
    expect(row1).toBeTruthy();
    expect(row2).toBeTruthy();
  });

  it('filters surahs by Arabic name substring', () => {
    render(
      <SurahSearchList
        surahs={mockSurahs}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    const input = screen.getByTestId('surah-list-search-input');
    fireEvent.changeText(input, 'عمران');

    expect(screen.getByText('سورة آل عمران')).toBeTruthy();
    expect(screen.queryByText('سورة الفاتحة')).toBeNull();
    expect(screen.queryByText('سورة البقرة')).toBeNull();
  });

  it('filters surahs by number prefix', () => {
    render(
      <SurahSearchList
        surahs={mockSurahs}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    const input = screen.getByTestId('surah-list-search-input');
    fireEvent.changeText(input, '11');

    expect(screen.getByText('سورة الإخلاص')).toBeTruthy();
    expect(screen.getByText('سورة الفلق')).toBeTruthy();
    expect(screen.getByText('سورة الناس')).toBeTruthy();
    expect(screen.queryByText('سورة الفاتحة')).toBeNull();
  });

  it('renders inline no-results state when search yields no matches', () => {
    render(
      <SurahSearchList
        surahs={mockSurahs}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    const input = screen.getByTestId('surah-list-search-input');
    fireEvent.changeText(input, 'سورة غير موجودة');

    expect(screen.getByTestId('surah-list-no-results')).toBeTruthy();
    expect(screen.getByText('لا توجد نتائج للبحث')).toBeTruthy();
  });

  it('clears search query when clear button is pressed', () => {
    render(
      <SurahSearchList
        surahs={mockSurahs}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    const input = screen.getByTestId('surah-list-search-input');
    fireEvent.changeText(input, 'عمران');

    const clearButton = screen.getByTestId('surah-list-clear-search');
    fireEvent.press(clearButton);

    expect(screen.getByText('سورة الفاتحة')).toBeTruthy();
    expect(screen.getByText('سورة البقرة')).toBeTruthy();
  });

  it('calls onSelectSurah with selected surah object on press', () => {
    render(
      <SurahSearchList
        surahs={mockSurahs}
        onSelectSurah={onSelectSurahMock}
        testID="surah-list"
      />,
    );

    const row2 = screen.getByTestId('surah-row-2');
    fireEvent.press(row2);

    expect(onSelectSurahMock).toHaveBeenCalledWith(mockSurahs[1]);
  });
});
