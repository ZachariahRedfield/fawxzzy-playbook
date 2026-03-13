import { knowledgeTimeline } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';

export const runKnowledgeTimeline = (cwd: string, args: string[]) => knowledgeTimeline(cwd, parseKnowledgeFilters(args));
