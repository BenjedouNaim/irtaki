import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { TeacherGroupDto } from '@/shared/api/dashboard.client';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { TeacherGroupCard } from '../TeacherGroupCard';

const group: TeacherGroupDto = {
  id: 'g-1',
  name: 'حلقة الفجر',
  commitment_average: 78.4,
  at_risk_count: 3,
  submission_rate: 83.2,
};

describe('TeacherGroupCard (SCR-22, Figma 37:37)', () => {
  it("renders the group's three figures, rounded", () => {
    render(<TeacherGroupCard group={group} />);

    expect(screen.getByText('حلقة الفجر')).toBeTruthy();
    expect(
      screen.getByTestId('teacher-group-card-average-value').props.children,
    ).toBe('78%');
    expect(
      screen.getByTestId('teacher-group-card-at-risk-value').props.children,
    ).toBe('3');
    expect(
      screen.getByTestId('teacher-group-card-submission-value').props.children,
    ).toBe('83%');
  });

  it('labels each cell so the three figures are never read by colour alone (UF §32)', () => {
    render(<TeacherGroupCard group={group} />);

    expect(
      screen.getByTestId('teacher-group-card-average-label').props.children,
    ).toBe('متوسط الالتزام');
    expect(
      screen.getByTestId('teacher-group-card-at-risk-label').props.children,
    ).toBe('معرّضون للخطر');
    expect(
      screen.getByTestId('teacher-group-card-submission-label').props.children,
    ).toBe('نسبة الإرسال');
  });

  it('renders a null rate as the null state and says so to a screen reader (DEC-B04)', () => {
    render(
      <TeacherGroupCard
        group={{
          ...group,
          commitment_average: null,
          submission_rate: null,
          at_risk_count: 0,
        }}
      />,
    );

    expect(
      screen.getByTestId('teacher-group-card-average-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('teacher-group-card-submission-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    // A count of zero is a real zero.
    expect(
      screen.getByTestId('teacher-group-card-at-risk-value').props.children,
    ).toBe('0');
    expect(
      screen.getByTestId('teacher-group-card').props.accessibilityLabel,
    ).toContain('بيانات غير كافية');
  });

  it('carries the whole card in one accessibility label', () => {
    render(<TeacherGroupCard group={group} meta="السبت" />);

    const label = screen.getByTestId('teacher-group-card').props
      .accessibilityLabel as string;
    expect(label).toContain('حلقة الفجر');
    expect(label).toContain('السبت');
    expect(label).toContain('متوسط الالتزام: 78%');
    expect(label).toContain('معرّضون للخطر: 3');
    expect(label).toContain('نسبة الإرسال: 83%');
  });

  it('drills into the group when a handler is given, and is inert otherwise', () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <TeacherGroupCard group={group} onPress={onPress} />,
    );

    fireEvent.press(screen.getByTestId('teacher-group-card'));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<TeacherGroupCard group={group} />);
    fireEvent.press(screen.getByTestId('teacher-group-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
