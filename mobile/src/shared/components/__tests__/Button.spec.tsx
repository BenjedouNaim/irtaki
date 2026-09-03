import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('renders label correctly', async () => {
    await render(<Button label="تسجيل الدخول" onPress={jest.fn()} />);
    expect(screen.getByText('تسجيل الدخول')).toBeTruthy();
  });

  it('triggers onPress when clicked', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="حفظ" onPress={onPressMock} />);
    fireEvent.press(screen.getByText('حفظ'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('shows ActivityIndicator and disables press when loading', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="تحميل" onPress={onPressMock} loading />);
    expect(screen.getByTestId('button-loading-indicator')).toBeTruthy();
    expect(screen.queryByText('تحميل')).toBeNull();
  });

  it('does not trigger onPress when disabled', async () => {
    const onPressMock = jest.fn();
    await render(<Button label="معطل" onPress={onPressMock} disabled />);
    fireEvent.press(screen.getByText('معطل'));
    expect(onPressMock).not.toHaveBeenCalled();
  });
});

describe('Button — Figma 5:45 variants, sizes and states', () => {
  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'bg-subtle'],
    ['outline', 'border-line-brand'],
    ['destructive', 'bg-error'],
    ['ghost', 'bg-transparent'],
  ] as const)('renders the %s variant', (variant, expected) => {
    render(
      <Button
        label="متابعة"
        variant={variant}
        onPress={jest.fn()}
        testID="b"
      />,
    );
    expect(screen.getByTestId('b').props.className).toContain(expected);
  });

  it('Large is 52px with label/lg; Small is 40px with label/md and a 48dp hit slop', () => {
    const { rerender } = render(
      <Button label="متابعة" onPress={jest.fn()} testID="b" />,
    );
    expect(screen.getByTestId('b').props.className).toContain('h-[52px]');
    expect(screen.getByText('متابعة').props.className).toContain(
      'text-label-lg',
    );

    rerender(
      <Button label="متابعة" size="small" onPress={jest.fn()} testID="b" />,
    );
    expect(screen.getByTestId('b').props.className).toContain('h-10');
    expect(screen.getByTestId('b').props.hitSlop).toEqual({
      top: 4,
      bottom: 4,
      left: 0,
      right: 0,
    });
    expect(screen.getByText('متابعة').props.className).toContain(
      'text-label-md',
    );
  });

  it('Disabled = muted fill + text/disabled; Loading keeps the fill and reports busy', () => {
    const { rerender } = render(
      <Button label="متابعة" onPress={jest.fn()} disabled testID="b" />,
    );
    expect(screen.getByTestId('b').props.className).toContain('bg-muted');
    expect(screen.getByText('متابعة').props.className).toContain(
      'text-fg-disabled',
    );
    expect(screen.getByTestId('b').props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });

    rerender(<Button label="متابعة" onPress={jest.fn()} loading testID="b" />);
    expect(screen.getByTestId('b').props.className).toContain('bg-primary');
    expect(screen.getByTestId('b').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });
});
