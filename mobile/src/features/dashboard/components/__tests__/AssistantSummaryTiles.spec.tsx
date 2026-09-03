import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { AssistantSummaryTiles } from '../AssistantSummaryTiles';

describe('AssistantSummaryTiles (SCR-17, Figma 34:36)', () => {
  it('renders exactly the two tiles of the frame', () => {
    render(
      <AssistantSummaryTiles
        pendingRequestCount={4}
        paymentFollowUpCount={6}
      />,
    );

    expect(
      screen.getByTestId('assistant-summary-tiles-pending-label').props
        .children,
    ).toBe('طلبات معلّقة');
    expect(
      screen.getByTestId('assistant-summary-tiles-pending-value').props
        .children,
    ).toBe('4');
    expect(
      screen.getByTestId('assistant-summary-tiles-follow-ups-label').props
        .children,
    ).toBe('متابعات الدفع');
    expect(
      screen.getByTestId('assistant-summary-tiles-follow-ups-value').props
        .children,
    ).toBe('6');
  });

  it('prints a genuine zero as zero, not the null state', () => {
    render(
      <AssistantSummaryTiles
        pendingRequestCount={0}
        paymentFollowUpCount={0}
      />,
    );

    expect(
      screen.getByTestId('assistant-summary-tiles-pending-value').props
        .children,
    ).toBe('0');
    expect(
      screen.getByTestId('assistant-summary-tiles-follow-ups-value').props
        .children,
    ).not.toBe(METRIC_TILE_NULL_VALUE);
  });

  it('routes each tile to the view it summarises (UF §10)', () => {
    const onOpenJoinRequests = jest.fn();
    const onOpenPayments = jest.fn();
    render(
      <AssistantSummaryTiles
        pendingRequestCount={4}
        paymentFollowUpCount={6}
        onOpenJoinRequests={onOpenJoinRequests}
        onOpenPayments={onOpenPayments}
      />,
    );

    fireEvent.press(screen.getByTestId('assistant-summary-tiles-pending'));
    expect(onOpenJoinRequests).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('assistant-summary-tiles-follow-ups'));
    expect(onOpenPayments).toHaveBeenCalledTimes(1);
  });

  /**
   * DEC-B09 / UF §10: "No commitment/at-risk/submission-rate figure, ever,
   * even disabled" — the exclusion is invisible, so there is no third tile
   * and no greyed-out one.
   */
  it('renders no performance tile, disabled or otherwise (DEC-B09)', () => {
    render(
      <AssistantSummaryTiles
        pendingRequestCount={4}
        paymentFollowUpCount={6}
      />,
    );

    for (const forbidden of [
      /نسبة الالتزام/,
      /متوسط الالتزام/,
      /نسبة الإرسال/,
      /معرّضون للخطر/,
    ]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
    // Exactly two tiles, no third slot.
    expect(
      screen.getAllByTestId(/^assistant-summary-tiles-[a-z-]+-value$/),
    ).toHaveLength(2);
  });
});
