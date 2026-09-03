import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { Icon } from '../Icon';
import { ICONS, ICON_NAMES } from '../icons';
import { lightColors } from '@/shared/theme/colors';

/** The `Image` element's own props (the native host normalises source/tint). */
function imageProps() {
  return screen.UNSAFE_getByType(Image).props;
}

describe('Icon (Figma 🔷 Icons, rendered with expo-image)', () => {
  it('registers all 44 Figma icons with a static asset each', () => {
    expect(ICON_NAMES).toHaveLength(44);
    for (const name of ICON_NAMES) {
      expect(ICONS[name]).toBeTruthy();
    }
  });

  it('renders the named asset at 24dp, tinted text/primary, and hidden from a11y when decorative', () => {
    render(<Icon name="chevron-right" testID="icon" />);

    const icon = imageProps();
    expect(icon.source).toBe(ICONS['chevron-right']);
    expect(icon.tintColor).toBe(lightColors.textPrimary);
    expect(icon.contentFit).toBe('contain');
    expect(icon.style).toEqual(
      expect.arrayContaining([{ width: 24, height: 24 }]),
    );
    expect(icon.accessible).toBe(false);
    expect(icon.accessibilityElementsHidden).toBe(true);
    expect(
      screen.getByTestId('icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('honours size, tone and an explicit tintColor', () => {
    const { rerender } = render(
      <Icon name="alert" size={16} tone="error" testID="icon" />,
    );
    let icon = imageProps();
    expect(icon.tintColor).toBe(lightColors.textError);
    expect(icon.style).toEqual(
      expect.arrayContaining([{ width: 16, height: 16 }]),
    );

    rerender(
      <Icon name="alert" tone="error" tintColor="#123456" testID="icon" />,
    );
    icon = imageProps();
    expect(icon.tintColor).toBe('#123456');
  });

  it('becomes an accessible image when it carries a label (UF §32 icon-only controls)', () => {
    render(<Icon name="bell" accessibilityLabel="الإشعارات" testID="icon" />);

    expect(screen.getByLabelText('الإشعارات')).toBeTruthy();
    const icon = imageProps();
    expect(icon.accessible).toBe(true);
    expect(icon.accessibilityRole).toBe('image');
    expect(icon.accessibilityElementsHidden).toBe(false);
  });
});
