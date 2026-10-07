import test from 'node:test';
import assert from 'node:assert/strict';
import { topics, questions } from '../src/data/index.js';
import { mergeProgress, emptyProgress, latestAttempts } from '../src/progress.js';

test('bank contains 250 complete unique questions and 25 substantive lessons', () => {
  assert.equal(questions.length,250); assert.equal(topics.length,25);
  assert.equal(new Set(questions.map(q=>q.id)).size,250);
  assert.equal(new Set(questions.map(q=>q.passage)).size,250);
  assert.equal(new Set(topics.map(t=>t.id)).size,25);
  for(const t of topics) {
    assert.equal(questions.filter(q=>q.topic===t.id).length,10,t.id);
    assert.ok(t.rule.length>120,t.id);assert.ok(t.steps.length>=3,t.id);
    assert.ok(t.examples.length>=2,t.id);assert.ok(t.traps.length>=3,t.id);
    for(const ex of t.examples) for(const key of ['incorrect','correct','why']) assert.ok(ex[key]?.length>10,`${t.id}:${key}`);
  }
  for(const q of questions) {
    assert.ok(topics.some(t=>t.id===q.topic),q.id);
    assert.equal(q.passage.split('___').length,2,q.id);
    assert.equal(q.choices.length,4,q.id);assert.equal(new Set(q.choices).size,4,q.id);
    assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,q.id);
    assert.equal(q.optionExplanations.length,4,q.id);
    assert.ok(q.explanation.length>=30,q.id);
    assert.ok(q.optionExplanations.every(x=>x.length>15),q.id);
    assert.ok(q.lessonTip.length>10,q.id);
    assert.ok(q.prompt.length>20,q.id);
  }
});
test('merging offline work retains distinct attempts without double counting',()=>{
  const attempt={id:'a',questionId:'a01',choice:0,correct:false,mode:'practice',answeredAt:'2026-01-01T00:00:00.000Z'};
  const second={...attempt,id:'b',correct:true,answeredAt:'2026-01-02T00:00:00.000Z'};
  const a={...emptyProgress(),attempts:[attempt],completedLessons:['boundaries']};
  const b={...emptyProgress(),attempts:[attempt,second],completedLessons:['boundaries','colons']};
  const merged=mergeProgress(a,b);
  assert.equal(merged.attempts.length,2);assert.equal(merged.completedLessons.length,2);
  assert.equal(latestAttempts(merged.attempts).length,1);assert.equal(latestAttempts(merged.attempts)[0].correct,true);
});
