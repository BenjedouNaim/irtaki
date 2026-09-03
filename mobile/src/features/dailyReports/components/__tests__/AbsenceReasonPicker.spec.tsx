import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AbsenceReasonPicker } from '../AbsenceReasonPicker';

describe('AbsenceReasonPicker (UF §15 absence form)', () => {
  it('renders Sick/Studying as the excused group and Other apart with its missed-day note', () => {
    render(<AbsenceReasonPicker value={null} onChange={jest.fn()} />);

    expect(screen.getByText('غياب بعذر')).toBeTruthy();
    expect(screen.getByText('غير ذلك')).toBeTruthy();
    expect(screen.getByTestId('absence-reason-picker-sick')).toBeTruthy();
    expect(screen.getByTestId('absence-reason-picker-studying')).toBeTruthy();
    expect(screen.getByTestId('absence-reason-picker-other')).toBeTruthy();
    expect(screen.getByText('سيُحتسب هذا كيوم فائت')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/.+/)).toBeNull();
  });

  it('reports the selected reason and reflects selection', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <AbsenceReasonPicker value={null} onChange={onChange} />,
    );

    fireEvent.press(screen.getByTestId('absence-reason-picker-studying'));
    expect(onChange).toHaveBeenCalledWith('Studying');
    fireEvent.press(screen.getByTestId('absence-reason-picker-other'));
    expect(onChange).toHaveBeenCalledWith('Other');

    rerender(<AbsenceReasonPicker value="Sick" onChange={onChange} />);
    expect(
      screen.getByTestId('absence-reason-picker-sick').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('shows an icon + text error', () => {
    render(
      <AbsenceReasonPicker
        value={null}
        onChange={jest.fn()}
        error="سبب الغياب مطلوب"
      />,
    );
    expect(screen.getByTestId('absence-reason-picker-error')).toBeTruthy();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(screen.getByText('سبب الغياب مطلوب')).toBeTruthy();
  });
});
