import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Inspect assembled literal SQL fragments, including count routes not exercised
// against SQL Server by the isolated router fixtures.
test('task and work-order role queues join adjacent ownership predicates', () => {
  for (const file of ['tasks', 'workOrders']) {
    const source = ts.createSourceFile(file, fs.readFileSync(new URL(`../../backend/src/routes/${file}.ts`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let checked = 0;
    function visit(node) {
      if (ts.isArrayLiteralExpression(node)) {
        const lines = node.elements.filter(ts.isStringLiteral).map(n => n.text.trim());
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^(?:AND )?t\.AssignedToUserId IS NULL$/.test(lines[i]) && lines[i + 1].includes('t.AssignedToRoleId IS NOT NULL')) {
            assert.equal(lines[i + 1], 'AND t.AssignedToRoleId IS NOT NULL', `${file}: missing ownership conjunction`);
            checked++;
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert(checked >= (file === 'tasks' ? 3 : 1), `${file}: expected role queue queries`);
  }
});
