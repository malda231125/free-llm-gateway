import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceFromBottom, isNearBottom } from '../lib/scroll.mjs';

describe('scroll helpers', () => {
  it('calculates distance from the bottom of a scroll container', () => {
    assert.equal(distanceFromBottom({ scrollHeight: 1200, scrollTop: 700, clientHeight: 400 }), 100);
  });

  it('treats containers within threshold as sticky to bottom', () => {
    assert.equal(isNearBottom({ scrollHeight: 1200, scrollTop: 720, clientHeight: 400 }), true);
    assert.equal(isNearBottom({ scrollHeight: 1200, scrollTop: 650, clientHeight: 400 }), false);
  });

  it('treats a missing container as safe to auto-scroll', () => {
    assert.equal(isNearBottom(null), true);
  });
});
