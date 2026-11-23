import assert from 'node:assert';
import * as u from './usage_v2.mjs';

const e = u.parse('<header><a class="btn">x</a></header><main><header><a class="btn">y</a></header><div data-component-id="a:card"><div data-component-id="a:card"></div></div><div class="modal"><input type="text"><input type="hidden"></div><script>var s="<a class=btn>"</script><!-- <a class="btn"> --><a class="btn btn-close">z</a><a title="a > b" class="btn"></a></main>');
assert.deepEqual(u.countPage(e, { anyClass: ['btn'], tags: ['a'], exceptClass: ['btn-close'] }), { content: 2, chrome: 1, modal: 0 });
assert.deepEqual(u.countPage(e, { id: 'a:card' }), { content: 1, chrome: 0, modal: 0 });
assert.deepEqual(u.countPage(e, { types: ['text'], tags: ['input'] }), { content: 0, chrome: 0, modal: 1 });
assert.equal(u.openIssues('{"event":"opened","id":"1"}\n{"event":"opened","id":"2"}\n{"event":"resolved","id":"1"}').length, 1);
assert.deepEqual([0, 1, 5].map((n) => u.tier(n, 20)), ['None seen', 'Common', 'Widespread']);
const inst = (componentId, x = {}) => ({ type: 'INSTANCE', componentId, ...x });
const f = u.countFigma({
  components: { v1: { key: 'k1', componentSetId: 's' }, v2: { key: 'k2', componentSetId: 's' }, o: { key: 'ko' } },
  componentSets: { s: { key: 'SET' } },
  document: { type: 'DOCUMENT', children: [
    { type: 'FRAME', id: 'f', children: [inst('v1', { children: [inst('o')] }), inst('v2'), inst('v2', { visible: false })] },
    { type: 'COMPONENT', children: [inst('v1')] },
  ] },
});
assert.equal(f.SET.instances, 2);
assert.equal(f.SET.screens.size, 1);
assert.equal(f.ko, undefined);
const log = (...d) => [{ event: 'opened', id: '1' }, ...d.map((decision) => ({ event: 'reviewed', id: '1', decision }))].map((x) => JSON.stringify(x)).join('\n');
assert.equal(u.openIssues(log('approved')).length, 0);
assert.equal(u.openIssues(log('rejected')).length, 1);
assert.equal(u.openIssues(log('approved', 'rejected')).length, 1);
console.log('tests pass');
