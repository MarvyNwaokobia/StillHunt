import assert from 'assert';
import { compilePrompt } from './generator.js';

let passed = 0;
let failed = 0;

function test(label, fn) {
    try {
        fn();
        console.log(`  \x1b[32m✓\x1b[0m  ${label}`);
        passed++;
    } catch (err) {
        console.log(`  \x1b[31m✗\x1b[0m  ${label}`);
        console.log(`       ${err.message}`);
        failed++;
    }
}

// ─── Suite 1: All 7 designs compile without returning null ────────────────────

console.log('\nSuite 1 — All designs compile');

for (let id = 1; id <= 7; id++) {
    test(`design ${id} returns a non-null string`, () => {
        const result = compilePrompt(String(id));
        assert.notStrictEqual(result, null,   `design ${id}: got null`);
        assert.strictEqual(typeof result, 'string', `design ${id}: expected string`);
        assert.ok(result.length > 0,          `design ${id}: empty string`);
    });
}

// ─── Suite 2: Invalid IDs return null (not a crash) ───────────────────────────

console.log('\nSuite 2 — Invalid IDs are handled safely');

test('id "0" returns null',    () => assert.strictEqual(compilePrompt('0'),    null));
test('id "8" returns null',    () => assert.strictEqual(compilePrompt('8'),    null));
test('id "" returns null',     () => assert.strictEqual(compilePrompt(''),     null));
test('id undefined returns null', () => assert.strictEqual(compilePrompt(undefined), null));

// ─── Suite 3: Output contains required Midjourney flags ───────────────────────

console.log('\nSuite 3 — Prompts contain required Midjourney params');

for (let id = 1; id <= 7; id++) {
    const prompt = compilePrompt(String(id));
    test(`design ${id} includes --ar flag`,  () => assert.ok(prompt.includes('--ar'),  `missing --ar`));
    test(`design ${id} includes --v flag`,   () => assert.ok(prompt.includes('--v'),   `missing --v`));
}

// ─── Suite 4: Prompt quality checks ──────────────────────────────────────────

console.log('\nSuite 4 — Prompt content quality');

for (let id = 1; id <= 7; id++) {
    const prompt = compilePrompt(String(id));
    test(`design ${id} is at least 80 chars`,  () => assert.ok(prompt.length >= 80,  `too short (${prompt.length} chars)`));
    test(`design ${id} contains "hyperrealistic"`, () => assert.ok(prompt.includes('hyperrealistic'), `missing style keyword`));
    test(`design ${id} has no [object Object]`, () => assert.ok(!prompt.includes('[object Object]'), `unserialised object leaked into prompt`));
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m${failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''}\n`);
if (failed > 0) process.exit(1);
