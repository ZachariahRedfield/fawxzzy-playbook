import { knowledgeList } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';

export const runKnowledgeList = (cwd: string, args: string[]) => knowledgeList(cwd, parseKnowledgeFilters(args));
