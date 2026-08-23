import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { JoinRequestStatusCard } from '../JoinRequestStatusCard';

describe('JoinRequestStatusCard', () => {
  it('renders Pending status card correctly with badge and description (no apply again button)', () => {
    render(<JoinRequestStatusCard status="Pending" />);

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByTestId('join-request-status-badge')).toBeTruthy();
    expect(screen.getByText('قيد المراجعة')).toBeTruthy();
    expect(screen.getByText('طلب الانضمام قيد المراجعة')).toBeTruthy();
    expect(
      screen.getByText(
        'طلبك للانضمام إلى الحلقة قيد المراجعة من قبل المشرف. سيتم إشعارك بالنتيجة فور اتخاذ القرار.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('apply-again-button')).toBeNull();
  });

  it('renders Rejected status card with "لم يتم قبول الطلب هذه المرة" and "التقديم مجدداً" button', () => {
    const handleApplyAgain = jest.fn();
    render(
      <JoinRequestStatusCard
        status="Rejected"
        onApplyAgain={handleApplyAgain}
      />,
    );

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('لم يتم القبول')).toBeTruthy();
    expect(screen.getByText('لم يتم قبول الطلب هذه المرة')).toBeTruthy();
    expect(
      screen.getByText(
        'يمكنك إعادة التقديم واختيار حلقة أخرى تناسب جدولك ومستواك.',
      ),
    ).toBeTruthy();

    const applyButton = screen.getByTestId('apply-again-button');
    expect(applyButton).toBeTruthy();
    expect(screen.getByText('التقديم مجدداً')).toBeTruthy();

    fireEvent.press(applyButton);
    expect(handleApplyAgain).toHaveBeenCalledTimes(1);
  });

  it('renders Accepted status card correctly', () => {
    render(<JoinRequestStatusCard status="Accepted" />);

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('تم القبول')).toBeTruthy();
    expect(screen.getByText('تم قبول طلبك')).toBeTruthy();
    expect(screen.queryByTestId('apply-again-button')).toBeNull();
  });
});
