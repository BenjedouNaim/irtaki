import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { StudentPaymentDto } from '@/shared/api/dashboard.client';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { StudentSummaryTiles } from '../StudentSummaryTiles';

const payment: StudentPaymentDto = {
  status: 'Due Soon',
  next_due_date: '2026-09-30',
  arrears_count: 0,
};

describe('StudentSummaryTiles (SCR-08, Figma 24:105)', () => {
  it('renders the score as a rounded percentage with its caption', () => {
    render(<StudentSummaryTiles commitmentScore={86.4} payment={payment} />);

    expect(
      screen.getByTestId('student-summary-tiles-score-label').props.children,
    ).toBe('نسبة الالتزام');
    expect(
      screen.getByTestId('student-summary-tiles-score-value').props.children,
    ).toBe('86%');
    expect(
      screen.getByTestId('student-summary-tiles-score-caption').props.children,
    ).toBe('الأسبوع الحالي');
  });

  it('renders a null score as "not enough data", never 0% (DEC-B04, UF §10)', () => {
    render(<StudentSummaryTiles commitmentScore={null} payment={payment} />);

    expect(
      screen.getByTestId('student-summary-tiles-score-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('student-summary-tiles-score-caption').props.children,
    ).toBe('بيانات غير كافية');
  });

  it('renders the current cycle as a StatusBadge, not colour alone (UF §32)', () => {
    render(<StudentSummaryTiles commitmentScore={80} payment={payment} />);

    expect(
      screen.getByTestId('student-summary-tiles-payment-badge'),
    ).toHaveTextContent('يستحق قريبًا');
    expect(
      screen.getByTestId('student-summary-tiles-payment-caption').props
        .children,
    ).toBe('الاستحقاق 30 سبتمبر');
  });

  it('prefers the arrears count over the due date when a student is behind', () => {
    render(
      <StudentSummaryTiles
        commitmentScore={80}
        payment={{
          status: 'Unpaid',
          next_due_date: '2026-06-30',
          arrears_count: 2,
        }}
      />,
    );

    expect(
      screen.getByTestId('student-summary-tiles-payment-badge'),
    ).toHaveTextContent('غير مدفوع');
    expect(
      screen.getByTestId('student-summary-tiles-payment-caption').props
        .children,
    ).toBe('دورتان متأخرتان');
  });

  it('renders the chip null state when there is no Active membership', () => {
    render(<StudentSummaryTiles commitmentScore={null} payment={null} />);

    expect(
      screen.queryByTestId('student-summary-tiles-payment-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId('student-summary-tiles-payment-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('student-summary-tiles-payment-caption').props
        .children,
    ).toBe('بيانات غير كافية');
  });

  it('taps the chip through to the Payment tab (UF §10)', () => {
    const onOpenPayments = jest.fn();
    render(
      <StudentSummaryTiles
        commitmentScore={80}
        payment={payment}
        onOpenPayments={onOpenPayments}
      />,
    );

    const chip = screen.getByTestId('student-summary-tiles-payment');
    expect(chip.props.accessibilityRole).toBe('button');
    fireEvent.press(chip);
    expect(onOpenPayments).toHaveBeenCalledTimes(1);
  });

  it('is not a control when no destination is given', () => {
    render(<StudentSummaryTiles commitmentScore={80} payment={payment} />);

    expect(
      screen.getByTestId('student-summary-tiles-payment').props
        .accessibilityRole,
    ).toBe('text');
  });
});
