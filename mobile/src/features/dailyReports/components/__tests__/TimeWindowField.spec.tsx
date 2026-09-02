import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TimeWindowField } from '../TimeWindowField';

describe('TimeWindowField (VO-03 entry, UF §20 time wheel trigger)', () => {
  it('renders two placeholders and the required asterisk', () => {
    render(
      <TimeWindowField
        label="وقت الحفظ"
        value={{ from: null, to: null }}
        onChange={jest.fn()}
        required
        testID="memo-time-field"
      />,
    );
    expect(screen.getByText(/وقت الحفظ/)).toBeTruthy();
    expect(
      screen.getByTestId('memo-time-field-from-value').props.children,
    ).toBe('--:--');
    expect(screen.getByTestId('memo-time-field-to-value').props.children).toBe(
      '--:--',
    );
  });

  it('opens the wheel sheet for "from", confirms the default and reports HH:MM', () => {
    const onChange = jest.fn();
    render(
      <TimeWindowField
        label="وقت الحفظ"
        value={{ from: null, to: null }}
        onChange={onChange}
        testID="memo-time-field"
      />,
    );

    fireEvent.press(screen.getByTestId('memo-time-field-from'));
    expect(screen.getByTestId('memo-time-field-hour-wheel')).toBeTruthy();
    fireEvent.press(screen.getByTestId('memo-time-field-confirm-button'));

    expect(onChange).toHaveBeenCalledWith({ from: '18:00', to: null });
  });

  it('lets the wheels change hour and minute for "to"', () => {
    const onChange = jest.fn();
    render(
      <TimeWindowField
        label="وقت الحفظ"
        value={{ from: '18:00', to: null }}
        onChange={onChange}
        testID="memo-time-field"
      />,
    );

    fireEvent.press(screen.getByTestId('memo-time-field-to'));
    fireEvent.press(screen.getByTestId('memo-time-field-hour-wheel-item-19'));
    fireEvent.press(screen.getByTestId('memo-time-field-minute-wheel-item-5'));
    fireEvent.press(screen.getByTestId('memo-time-field-confirm-button'));

    expect(onChange).toHaveBeenCalledWith({ from: '18:00', to: '19:05' });
  });

  it('shows the current values and an icon + text error', () => {
    render(
      <TimeWindowField
        label="وقت المراجعة"
        value={{ from: '19:00', to: '18:00' }}
        onChange={jest.fn()}
        error="يجب أن يكون وقت الانتهاء بعد وقت البداية"
        testID="rev-time-field"
      />,
    );
    expect(screen.getByTestId('rev-time-field-from-value').props.children).toBe(
      '19:00',
    );
    expect(
      screen.getByText('يجب أن يكون وقت الانتهاء بعد وقت البداية'),
    ).toBeTruthy();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
  });
});
