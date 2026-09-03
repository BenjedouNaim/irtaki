/** One evaluator run, as the hosting job's INFO line reports it (TS §30/§31). */
export interface EvaluationOutcome {
  /** Rows the sweep considered. */
  candidates: number;
  /** Rows whose trigger condition held and were handed to `dispatch`. */
  triggered: number;
  /** Of those, the ones `dispatch` answered `Sent` for. */
  sent: number;
}

export const EMPTY_EVALUATION: EvaluationOutcome = {
  candidates: 0,
  triggered: 0,
  sent: 0,
};
