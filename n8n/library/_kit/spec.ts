import type { N8nNode, Const } from './n';

/**
 * [from, to]                 main output 0 -> to
 * [from, outputIndex, to]    main output n -> to (IF: 0 true, 1 false; Switch: one per value, then 'other')
 * [from, to, 'ai_languageModel' | 'ai_outputParser' | 'ai_tool' | 'ai_memory']
 * [from, outputIndex, to, toInputIndex]   for Merge inputs other than 0
 */
export type Edge = [string, string] | [string, number, string] | [string, string, string] | [string, number, string, number];

export type Group = {
  /** 3-6 words, sentence case. Becomes '## n. title' on the section sticky. */
  title: string;
  /** Why the step is shaped this way. Name nodes in backticks. 25-60 words. */
  why: string;
  nodes: string[];
};

export type Mock = any[] | ((input: any[], ctx: { cfg: any }) => any[]);

export type Scenario = {
  name: string;
  /** trigger node the run starts from */
  start: string;
  /** json objects the trigger emits (default: one empty item) */
  input?: any[];
  /** config const overrides by UPPER_SNAKE name */
  overrides?: Record<string, any>;
  /** canned output for nodes that call a service, by node name */
  mocks?: Record<string, Mock>;
  expect: {
    reached?: string[];
    notReached?: string[];
    /** 'none' = no outward node may run; 'some' = at least one must */
    outward?: 'none' | 'some';
  };
  /** extra assertions over node outputs; return failure messages */
  check?: (out: Record<string, any[]>) => string[];
};

export type Spec = {
  slug: string;
  /** verb + thing + to/from/in/with + where, sentence case */
  title: string;
  /** one line for the library index */
  summary: string;
  category: string;
  description: {
    who: string;
    how: string[];
    setup: string[];
    requirements: string[];
    customize: string[];
  };
  config: { intro: string[]; consts: Const[]; flags?: Record<string, string>; safety: 'test_run' | 'dry_run'; extra?: string };
  nodes: (N8nNode | N8nNode[])[];
  edges: Edge[];
  groups: Group[];
  /** first scenario must use the shipped config and reach no service; at least one must exercise the live path */
  scenarios: Scenario[];
};

export const defineSpec = (s: Spec) => s;
