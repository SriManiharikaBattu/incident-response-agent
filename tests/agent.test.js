const agent = require('../src/agent');

describe('agent.detectRootCausePattern', () => {
  it('returns null for 0 or 1 matches', () => {
    const incs = [{ rootCause: 'A', serviceAffected: 'svc1' }];
    expect(agent.detectRootCausePattern([])).toBeNull();
    expect(agent.detectRootCausePattern(incs)).toBeNull();
  });

  it('returns pattern with confidenceScore=60 for exactly 2 matches', () => {
    const incs = [
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc2' }
    ];
    const result = agent.detectRootCausePattern(incs);
    expect(result).not.toBeNull();
    expect(result.confidenceScore).toBe(60);
  });

  it('returns pattern with confidenceScore=75 for 3 matches', () => {
    const incs = [
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc2' },
      { rootCause: 'db', serviceAffected: 'svc3' }
    ];
    expect(agent.detectRootCausePattern(incs).confidenceScore).toBe(75);
  });

  it('returns pattern with confidenceScore=85 for 4 matches', () => {
    const incs = [
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc2' },
      { rootCause: 'db', serviceAffected: 'svc3' },
      { rootCause: 'db', serviceAffected: 'svc4' }
    ];
    expect(agent.detectRootCausePattern(incs).confidenceScore).toBe(85);
  });

  it('returns pattern with confidenceScore=95 for 5 matches', () => {
    const incs = [
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc2' },
      { rootCause: 'db', serviceAffected: 'svc3' },
      { rootCause: 'db', serviceAffected: 'svc4' },
      { rootCause: 'db', serviceAffected: 'svc5' }
    ];
    expect(agent.detectRootCausePattern(incs).confidenceScore).toBe(95);
  });

  it('affectedServices contains distinct services', () => {
    const incs = [
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc1' },
      { rootCause: 'db', serviceAffected: 'svc2' }
    ];
    const result = agent.detectRootCausePattern(incs);
    expect(result.affectedServices).toEqual(['svc1', 'svc2']);
  });
});
