import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RangeTrigger, RANGE_TRIGGER_PLACEHOLDER } from '../RangeTrigger';

describe('RangeTrigger (Figma 19:117)', () => {
  it('Empty: placeholder in text/tertiary, opens on press', () => {
    const onPress = jest.fn();
    render(<RangeTrigger value={null} onPress={onPress} />);

    const trigger = screen.getByRole('button');
    expect(
      screen.getByText(RANGE_TRIGGER_PLACEHOLDER).props.className,
    ).toContain('text-fg-tertiary');
    fireEvent.press(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Filled: summary in text/primary and as the accessibility value', () => {
    render(
      <RangeTrigger value="البقرة 1 ← البقرة 25" onPress={jest.fn()} error />,
    );
    const trigger = screen.getByRole('button');
    expect(trigger.props.accessibilityValue).toEqual({
      text: 'البقرة 1 ← البقرة 25',
    });
    expect(screen.getByTestId('range-trigger-value').props.className).toContain(
      'text-fg ',
    );
    expect(trigger.props.className).toContain('border-line-error');
  });
});
