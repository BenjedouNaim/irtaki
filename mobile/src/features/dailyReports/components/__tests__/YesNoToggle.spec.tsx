import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { YesNoToggle } from '../YesNoToggle';

describe('YesNoToggle (UF §15 gate question, UF §32)', () => {
  it('renders no default selection and labels each option with the question', () => {
    const onChange = jest.fn();
    render(
      <YesNoToggle
        question="هل حفظت آيات جديدة اليوم؟"
        value={null}
        onChange={onChange}
        testID="memo-gate"
      />,
    );

    expect(screen.getByText('هل حفظت آيات جديدة اليوم؟')).toBeTruthy();
    expect(screen.getByLabelText('هل حفظت آيات جديدة اليوم؟ نعم')).toBeTruthy();
    expect(screen.getByLabelText('هل حفظت آيات جديدة اليوم؟ لا')).toBeTruthy();
    expect(
      screen.getByTestId('memo-gate-yes').props.accessibilityState.selected,
    ).toBe(false);
    expect(
      screen.getByTestId('memo-gate-no').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('reports the chosen answer and reflects the selected state', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <YesNoToggle question="س؟" value={null} onChange={onChange} testID="t" />,
    );

    fireEvent.press(screen.getByTestId('t-yes'));
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByTestId('t-no'));
    expect(onChange).toHaveBeenCalledWith(false);

    rerender(
      <YesNoToggle
        question="س؟"
        value={false}
        onChange={onChange}
        testID="t"
      />,
    );
    expect(screen.getByTestId('t-no').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('t-yes').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('shows an icon + text error, never colour only (UF §32), and a note when given', () => {
    render(
      <YesNoToggle
        question="س؟"
        value={null}
        onChange={jest.fn()}
        note="للمتابعة فقط"
        error="مطلوب"
        testID="t"
      />,
    );
    expect(screen.getByTestId('t-error')).toBeTruthy();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(screen.getByText('مطلوب')).toBeTruthy();
    expect(screen.getByText('للمتابعة فقط')).toBeTruthy();
  });

  it('ignores presses when disabled', () => {
    const onChange = jest.fn();
    render(
      <YesNoToggle
        question="س؟"
        value={null}
        onChange={onChange}
        disabled
        testID="t"
      />,
    );
    fireEvent.press(screen.getByTestId('t-yes'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
