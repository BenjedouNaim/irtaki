import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { AdminSummaryTiles } from '../AdminSummaryTiles';

describe('AdminSummaryTiles (SCR-26 tiles, Figma 39:36)', () => {
  it('renders the four Admin dashboard tiles in the frame order', () => {
    render(<AdminSummaryTiles />);

    expect(screen.getByTestId('admin-summary-tiles')).toBeTruthy();
    expect(
      screen.getByTestId('admin-summary-tiles-groups-label').props.children,
    ).toBe('المجموعات');
    expect(
      screen.getByTestId('admin-summary-tiles-staff-label').props.children,
    ).toBe('أعضاء الطاقم');
    expect(
      screen.getByTestId('admin-summary-tiles-students-label').props.children,
    ).toBe('الطلاب');
    expect(
      screen.getByTestId('admin-summary-tiles-recoveries-label').props.children,
    ).toBe('استرجاعات معلّقة');
  });

  it('renders every tile in the Null state while the dashboard is unwired', () => {
    render(<AdminSummaryTiles />);

    for (const key of ['groups', 'staff', 'students', 'recoveries']) {
      expect(
        screen.getByTestId(`admin-summary-tiles-${key}-value`).props.children,
      ).toBe(METRIC_TILE_NULL_VALUE);
      expect(
        screen.getByTestId(`admin-summary-tiles-${key}-caption`).props.children,
      ).toBe(METRIC_NULL_PLACEHOLDER);
    }
  });

  it('renders the dashboard counts and captions once they are supplied', () => {
    render(
      <AdminSummaryTiles
        groupCount={5}
        staffCount={7}
        studentCount={61}
        pendingRecoveryCount={1}
      />,
    );

    expect(
      screen.getByTestId('admin-summary-tiles-groups-value').props.children,
    ).toBe('5');
    expect(
      screen.getByTestId('admin-summary-tiles-staff-value').props.children,
    ).toBe('7');
    expect(
      screen.getByTestId('admin-summary-tiles-students-value').props.children,
    ).toBe('61');
    expect(
      screen.getByTestId('admin-summary-tiles-recoveries-value').props.children,
    ).toBe('1');

    expect(
      screen.getByTestId('admin-summary-tiles-staff-caption').props.children,
    ).toBe('معلّمون ومساعدون');
    expect(
      screen.getByTestId('admin-summary-tiles-students-caption').props.children,
    ).toBe('عبر كل المجموعات');
    expect(
      screen.getByTestId('admin-summary-tiles-recoveries-caption').props
        .children,
    ).toBe('عبر قوائم المجموعات');
    // The frame's "4 نشطة · 1 مؤرشفة" is not in the Admin payload.
    expect(
      screen.queryByTestId('admin-summary-tiles-groups-caption'),
    ).toBeNull();
  });

  it('keeps a zero count as zero, never as the Null state (DEC-B04)', () => {
    render(<AdminSummaryTiles groupCount={0} />);

    expect(
      screen.getByTestId('admin-summary-tiles-groups-value').props.children,
    ).toBe('0');
  });
});
