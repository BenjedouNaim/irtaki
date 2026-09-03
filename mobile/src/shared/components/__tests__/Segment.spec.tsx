import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Segment } from '../Segment';
import { SegmentedControl } from '../SegmentedControl';

describe('Segment + SegmentedControl (Figma 7:6, 7:28)', () => {
  it('Segment: radio semantics, selected pill, 48dp via hit slop', () => {
    const onPress = jest.fn();
    render(<Segment label="نعم" selected onPress={onPress} testID="seg" />);

    const seg = screen.getByTestId('seg');
    expect(seg.props.accessibilityRole).toBe('radio');
    expect(seg.props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(seg.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
    expect(seg.props.className).toContain('bg-surface');
    fireEvent.press(seg);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('SegmentedControl: no default selection, question folded into option labels (UF §32)', () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        accessibilityLabel="هل حفظت آيات جديدة اليوم؟"
        options={[
          { label: 'نعم', value: true },
          { label: 'لا', value: false },
        ]}
        value={null}
        onChange={onChange}
        testID="gate"
      />,
    );

    expect(screen.getByTestId('gate').props.accessibilityRole).toBe(
      'radiogroup',
    );
    const yes = screen.getByLabelText('هل حفظت آيات جديدة اليوم؟ نعم');
    const no = screen.getByLabelText('هل حفظت آيات جديدة اليوم؟ لا');
    expect(yes.props.accessibilityState.selected).toBe(false);
    expect(no.props.accessibilityState.selected).toBe(false);

    fireEvent.press(no);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders 3 and 4 segments and marks the current value', () => {
    render(
      <SegmentedControl
        options={[
          { label: 'أسبوع', value: 'week' },
          { label: 'شهر', value: 'month' },
          { label: '3 أشهر', value: 'quarter' },
          { label: 'مخصص', value: 'custom' },
        ]}
        value="month"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      screen.getByTestId('segmented-control-month').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('marks a single option disabled and never selects it (SCR-13 مخصص)', () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        options={[
          { label: 'أسبوع', value: 'week' },
          { label: 'مخصص', value: 'custom', disabled: true },
        ]}
        value="week"
        onChange={onChange}
      />,
    );

    const custom = screen.getByTestId('segmented-control-custom');
    expect(custom.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(custom);
    expect(onChange).not.toHaveBeenCalled();

    // The rest of the control stays live.
    const week = screen.getByTestId('segmented-control-week');
    expect(week.props.accessibilityState.disabled).toBe(false);
  });
});
