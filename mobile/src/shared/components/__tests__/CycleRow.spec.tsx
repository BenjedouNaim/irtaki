import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CycleRow, CYCLE_STATUS_BADGE, MARK_PAID_LABEL } from '../CycleRow';

const title = 'الدورة 3 · 1 أوت — 30 أوت 2026';

describe('CycleRow (Figma 19:158)', () => {
  it.each(['paid', 'dueSoon', 'unpaid'] as const)(
    'Student × %s: title, subtitle and the status badge',
    (status) => {
      render(
        <CycleRow
          role="student"
          status={status}
          title={title}
          subtitle="30 دينار"
        />,
      );
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(CYCLE_STATUS_BADGE[status].label)).toBeTruthy();
      expect(screen.queryByTestId('cycle-row-mark-paid')).toBeNull();
    },
  );

  it('Assistant × Paid keeps the badge; DueSoon/Unpaid show the small outline "تسجيل الدفع"', () => {
    const onMarkPaid = jest.fn();
    const { rerender } = render(
      <CycleRow role="assistant" status="paid" title={title} />,
    );
    expect(screen.getByText('مدفوع')).toBeTruthy();

    rerender(
      <CycleRow
        role="assistant"
        status="unpaid"
        title={title}
        onMarkPaid={onMarkPaid}
      />,
    );
    fireEvent.press(screen.getByText(MARK_PAID_LABEL));
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cycle-row-mark-paid').props.className).toContain(
      'h-10',
    );

    rerender(
      <CycleRow
        role="assistant"
        status="dueSoon"
        title={title}
        onMarkPaid={onMarkPaid}
      />,
    );
    expect(screen.getByText(MARK_PAID_LABEL)).toBeTruthy();
  });
});
