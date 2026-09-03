import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GroupStudentLedgerDto } from '@/shared/api/payments.client';
import {
  StudentLedgerRow,
  UNNAMED_STUDENT_LABEL,
  nameInitial,
} from '../StudentLedgerRow';

function ledger(
  overrides: Partial<GroupStudentLedgerDto> = {},
): GroupStudentLedgerDto {
  return {
    membership_id: 'm-1',
    full_name: 'أحمد الطرابلسي',
    cycles: [
      {
        index: 0,
        start_date: '2026-07-01',
        end_date: '2026-09-30',
        status: 'Unpaid',
      },
    ],
    next_due_date: '2026-09-30',
    arrears_count: 0,
    ...overrides,
  };
}

describe('StudentLedgerRow (SCR-20 row, Figma 36:450)', () => {
  it('renders the name, the current-cycle badge and the cycle end date', () => {
    render(<StudentLedgerRow ledger={ledger()} />);

    expect(screen.getByTestId('payment-ledger-row-m-1-name')).toHaveTextContent(
      'أحمد الطرابلسي',
    );
    expect(
      screen.getByTestId('payment-ledger-row-m-1-status'),
    ).toHaveTextContent('غير مدفوع');
    expect(
      screen.getByTestId('payment-ledger-row-m-1-current-cycle'),
    ).toHaveTextContent('الدورة الحالية · 30 سبتمبر');
  });

  it('takes the LAST cycle as the current one — DS-06 derives up to today', () => {
    render(
      <StudentLedgerRow
        ledger={ledger({
          cycles: [
            {
              index: 0,
              start_date: '2026-01-01',
              end_date: '2026-03-31',
              status: 'Paid',
              paid_at: '2026-01-05T09:00:00.000Z',
            },
            {
              index: 1,
              start_date: '2026-04-01',
              end_date: '2026-06-30',
              status: 'Due Soon',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByTestId('payment-ledger-row-m-1-status'),
    ).toHaveTextContent('يستحق قريبًا');
  });

  it('adds the arrears badge only above zero (UF §18)', () => {
    const { rerender } = render(<StudentLedgerRow ledger={ledger()} />);
    expect(screen.queryByTestId('payment-ledger-row-m-1-arrears')).toBeNull();

    rerender(<StudentLedgerRow ledger={ledger({ arrears_count: 3 })} />);
    expect(
      screen.getByTestId('payment-ledger-row-m-1-arrears'),
    ).toHaveTextContent('3 متأخرة');
  });

  it('states the badges in one accessible label, never colour alone (UF §32)', () => {
    render(<StudentLedgerRow ledger={ledger({ arrears_count: 2 })} />);

    expect(
      screen.getByTestId('payment-ledger-row-m-1').props.accessibilityLabel,
    ).toBe('أحمد الطرابلسي، غير مدفوع، 2 متأخرة');
  });

  it('names a null full_name rather than rendering an empty row (never defaulted server-side)', () => {
    render(<StudentLedgerRow ledger={ledger({ full_name: null })} />);

    expect(screen.getByTestId('payment-ledger-row-m-1-name')).toHaveTextContent(
      UNNAMED_STUDENT_LABEL,
    );
    expect(nameInitial(null)).toBe('؟');
    expect(nameInitial('  أحمد ')).toBe('أ');
  });

  it('renders no badge and no subtitle for a ledger with no derived cycle', () => {
    render(<StudentLedgerRow ledger={ledger({ cycles: [] })} />);

    expect(screen.queryByTestId('payment-ledger-row-m-1-status')).toBeNull();
    expect(
      screen.queryByTestId('payment-ledger-row-m-1-current-cycle'),
    ).toBeNull();
  });

  describe('the push into SCR-21 Payment Detail (UF §18)', () => {
    it('becomes a button with the trailing chevron once a destination exists', () => {
      const onPress = jest.fn();
      render(<StudentLedgerRow ledger={ledger()} onPress={onPress} />);

      const row = screen.getByTestId('payment-ledger-row-m-1');
      expect(row.props.accessibilityRole).toBe('button');
      expect(
        screen.getByTestId('payment-ledger-row-m-1-chevron', {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();

      fireEvent.press(row);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('stays inert text with no chevron without one — never a dead affordance', () => {
      render(<StudentLedgerRow ledger={ledger()} />);

      expect(
        screen.getByTestId('payment-ledger-row-m-1').props.accessibilityRole,
      ).toBe('text');
      expect(
        screen.queryByTestId('payment-ledger-row-m-1-chevron', {
          includeHiddenElements: true,
        }),
      ).toBeNull();
    });
  });
});
