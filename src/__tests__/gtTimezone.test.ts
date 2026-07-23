import { describe, it, expect } from 'vitest';
import { gtDateToMs, msToGtDateStr } from '../utils/gtTimezone';

describe('gtDateToMs', () => {
  it('parses YYYY-MM-DD as Guatemala midnight (06:00 UTC)', () => {
    const ms = gtDateToMs('2026-05-01');
    const d = new Date(ms);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(6);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('parses end-of-day flag (23:59:59.999 GT = 05:59:59.999 next day UTC)', () => {
    // 2026-05-01 GT 23:59:59.999 = 2026-05-02T05:59:59.999Z
    const ms = gtDateToMs('2026-05-01', true);
    const d = new Date(ms);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(2); // overflows to next day in UTC
    expect(d.getUTCHours()).toBe(5);
    expect(d.getUTCMinutes()).toBe(59);
    expect(d.getUTCSeconds()).toBe(59);
  });

  it('returns 0 for invalid input', () => {
    expect(gtDateToMs('')).toBe(0);
    expect(gtDateToMs('not-a-date')).toBe(0);
  });
});

describe('msToGtDateStr', () => {
  it('converts Guatemala midnight back to YYYY-MM-DD', () => {
    // 2026-05-01 GT midnight = 2026-05-01T06:00:00Z
    const ms = Date.UTC(2026, 4, 1, 6, 0, 0);
    expect(msToGtDateStr(ms)).toBe('2026-05-01');
  });

  it('handles end-of-day conversion', () => {
    // 2026-05-01 GT 23:59:59.999 = 2026-05-02T05:59:59.999Z → still 2026-05-01 in GT
    const ms = Date.UTC(2026, 4, 2, 5, 59, 59, 999);
    expect(msToGtDateStr(ms)).toBe('2026-05-01');
  });

  it('returns empty string for 0', () => {
    expect(msToGtDateStr(0)).toBe('');
  });
});

describe('round-trip', () => {
  it('preserves dates when converting ms -> str -> ms', () => {
    const original = '2026-05-15';
    const ms = gtDateToMs(original);
    const str = msToGtDateStr(ms);
    expect(str).toBe(original);
  });

  it('preserves end-of-day dates when converting ms -> str -> ms', () => {
    const original = '2026-05-31';
    const ms = gtDateToMs(original, true);
    // endOfDay overflows to next day in UTC, so msToGtDateStr brings it back
    const str = msToGtDateStr(ms);
    expect(str).toBe(original);
  });
});
