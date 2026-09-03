import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Banner } from '../Banner';

describe('Banner (Figma 11:121)', () => {
  it('Error: alert role, icon + message, retry action when onRetry is given', () => {
    const onRetry = jest.fn();
    render(<Banner message="تعذّر الاتصال بالخادم" onRetry={onRetry} />);

    const banner = screen.getByTestId('banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.className).toContain('bg-error-subtle');
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(screen.getByText('تعذّر الاتصال بالخادم')).toBeTruthy();

    fireEvent.press(screen.getByTestId('banner-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('إعادة المحاولة')).toBeTruthy();
  });

  it('omits the retry action without onRetry', () => {
    render(<Banner message="x" tone="warning" />);
    expect(screen.queryByTestId('banner-retry-button')).toBeNull();
    expect(screen.getByTestId('banner').props.className).toContain(
      'bg-warning-subtle',
    );
  });

  it('Info is a plain notice on the info ground', () => {
    render(<Banner message="لا يمكن تعديل التقرير بعد إرساله" tone="info" />);
    const banner = screen.getByTestId('banner');
    expect(banner.props.accessibilityRole).toBe('text');
    expect(banner.props.className).toContain('bg-info-subtle');
  });
});
