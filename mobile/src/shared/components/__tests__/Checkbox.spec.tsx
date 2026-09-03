import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Checkbox } from '../Checkbox';

describe('Checkbox (Figma 9:28)', () => {
  it('toggles and exposes checkbox semantics with a 48dp row', () => {
    const onChange = jest.fn();
    render(
      <Checkbox checked={false} onChange={onChange} label="أوافق على الرسوم" />,
    );

    const box = screen.getByRole('checkbox');
    expect(box.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });
    expect(box.props.className).toContain('min-h-[48px]');
    expect(
      screen.queryByTestId('checkbox-check', { includeHiddenElements: true }),
    ).toBeNull();
    fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('checked = brand fill with the check glyph', () => {
    render(<Checkbox checked onChange={jest.fn()} accessibilityLabel="x" />);
    expect(screen.getByTestId('checkbox-box').props.className).toContain(
      'bg-primary',
    );
    expect(
      screen.getByTestId('checkbox-check', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
