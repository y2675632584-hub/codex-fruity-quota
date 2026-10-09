import test from 'node:test';
import assert from 'node:assert/strict';
import { remaining, litPoints, resetCount } from '../web/quota-model.js';

test('only fully consumed quarters turn a weekly point grey', () => {
  for (const [used, lit] of [[0,4],[1,4],[24.99,4],[25,3],[49.99,3],[50,2],[74.99,2],[75,1],[99.99,1],[100,0]]) {
    assert.equal(litPoints(used), lit, `used ${used}`);
  }
});
test('unavailable quota is distinct from zero and clamps outliers', () => {
  for (const value of [null, undefined, NaN, Infinity, true, '25']) {
    assert.equal(remaining(value), null);
    assert.equal(litPoints(value), null);
  }
  assert.equal(remaining(-3), 100);
  assert.equal(remaining(101), 0);
  assert.equal(remaining(26), 74);
});
test('reset count distinguishes missing from zero and supports numbers beyond four', () => {
  assert.equal(resetCount(0), 0);
  assert.equal(resetCount(5), 5);
  for (const value of [null, -1, 1.5, '2', NaN]) assert.equal(resetCount(value), null);
});
