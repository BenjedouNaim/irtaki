import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  JoinRequestStatusCard,
  NoJoinRequestCard,
} from '../JoinRequestStatusCard';

describe('JoinRequestStatusCard (Figma SCR-05 status cards)', () => {
  it('renders the Pending card: warning badge, title, notice, no apply-again button', () => {
    render(<JoinRequestStatusCard status="Pending" />);

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByTestId('join-request-status-badge')).toBeTruthy();
    expect(screen.getByText('قيد المراجعة')).toBeTruthy();
    expect(screen.getByText('طلبك قيد المراجعة')).toBeTruthy();
    expect(
      screen.getByText(
        'سيصلك إشعار فور البتّ في طلبك. لا يمكن تقديم طلب آخر حتى ذلك الحين.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('apply-again-button')).toBeNull();
  });

  it('renders the Rejected card with a neutral badge and an immediate "apply again" CTA (DEC-C09: no reason)', () => {
    const handleApplyAgain = jest.fn();
    render(
      <JoinRequestStatusCard
        status="Rejected"
        onApplyAgain={handleApplyAgain}
      />,
    );

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('لم يُقبل')).toBeTruthy();
    expect(screen.getByText('لم يُقبل طلبك هذه المرة')).toBeTruthy();
    expect(
      screen.getByText('يمكنك التقديم مجددًا فورًا على أي مجموعة متاحة.'),
    ).toBeTruthy();

    const applyButton = screen.getByTestId('apply-again-button');
    expect(applyButton).toBeTruthy();
    expect(screen.getByText('التقديم مجددًا')).toBeTruthy();

    fireEvent.press(applyButton);
    expect(handleApplyAgain).toHaveBeenCalledTimes(1);
  });

  it('renders the Accepted card with a success badge', () => {
    render(<JoinRequestStatusCard status="Accepted" />);

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('تم القبول')).toBeTruthy();
    expect(screen.getByText('تم قبول طلبك')).toBeTruthy();
    expect(screen.queryByTestId('apply-again-button')).toBeNull();
  });
});

describe('NoJoinRequestCard (Figma SCR-05 · no request)', () => {
  it('renders the browse-groups CTA card', () => {
    const handleBrowse = jest.fn();
    render(<NoJoinRequestCard onBrowseGroups={handleBrowse} />);

    expect(screen.getByTestId('no-join-request-card')).toBeTruthy();
    expect(screen.getByText('لم تنضم إلى مجموعة بعد')).toBeTruthy();
    expect(
      screen.getByText('تصفّح المجموعات المتاحة وقدّم طلب انضمام واحد.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('browse-groups-button'));
    expect(handleBrowse).toHaveBeenCalledTimes(1);
  });
});
