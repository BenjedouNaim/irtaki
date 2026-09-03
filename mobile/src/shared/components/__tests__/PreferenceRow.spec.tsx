import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PreferenceRow } from '../PreferenceRow';

describe('PreferenceRow (Figma 19:159)', () => {
  it('renders title + description with a mute toggle labelled by the title', () => {
    const onChange = jest.fn();
    render(
      <PreferenceRow
        title="تذكير التقرير اليومي"
        subtitle="إشعار مسائي إن لم تُرسل تقرير اليوم"
        value={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('تذكير التقرير اليومي')).toBeTruthy();
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityLabel).toBe('تذكير التقرير اليومي');
    fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('account-critical rows render without a toggle', () => {
    render(<PreferenceRow title="قبول الطلب" subtitle="x" />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
