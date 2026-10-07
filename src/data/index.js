import a from './content-a.json' with { type: 'json' };
import b from './content-b.json' with { type: 'json' };
import c from './content-c.json' with { type: 'json' };
import d from './content-d.json' with { type: 'json' };
import e from './content-e.json' with { type: 'json' };
export const topics = [a,b,c,d,e].flatMap(bank => bank.topics);
export const questions = [a,b,c,d,e].flatMap(bank => bank.questions);
export const topicById = Object.fromEntries(topics.map(topic => [topic.id, topic]));
export const questionById = Object.fromEntries(questions.map(question => [question.id, question]));
