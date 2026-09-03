import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TabBar, TAB_BAR_ITEMS } from '../TabBar';

describe('TabBar (Figma 10:151)', () => {
  it('Student set: Home · Progress · Payment, first item first (rightmost)', () => {
    const onSelect = jest.fn();
    render(<TabBar role="student" activeKey="home" onSelect={onSelect} />);

    expect(TAB_BAR_ITEMS.student.map((t) => t.label)).toEqual([
      'الرئيسية',
      'التقدّم',
      'الدفع',
    ]);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].props.accessibilityLabel).toBe('الرئيسية');
    expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
    expect(tabs[1].props.accessibilityState).toEqual({ selected: false });

    fireEvent.press(screen.getByTestId('tab-bar-progress'));
    expect(onSelect).toHaveBeenCalledWith('progress');
  });

  it('Assistant set: Home · Join Requests · Payments', () => {
    render(
      <TabBar role="assistant" activeKey="payments" onSelect={jest.fn()} />,
    );

    expect(screen.getByText('طلبات الانضمام')).toBeTruthy();
    expect(screen.getByText('المدفوعات')).toBeTruthy();
    expect(
      screen.getByTestId('tab-bar-payments').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('paints the active label text/brand semibold and the rest tertiary', () => {
    render(<TabBar role="student" activeKey="payment" onSelect={jest.fn()} />);

    expect(screen.getByText('الدفع').props.className).toContain('text-brand');
    expect(screen.getByText('الدفع').props.className).toContain(
      'font-sans-semibold',
    );
    expect(screen.getByText('الرئيسية').props.className).toContain(
      'text-fg-tertiary',
    );
  });
});
