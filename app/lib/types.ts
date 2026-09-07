export interface StandardEntry {
  code: string;
  desc: string;
  priority: boolean;
  priorityUnclear?: boolean;
  needsSupplement: boolean;
  partial: boolean;
}

export interface Unit {
  id: string;
  name: string;
  days: string;
  dates: string;
  cells: Record<string, StandardEntry[]>;
}

export interface LearningTargets {
  knowledge?: string;
  reasoning?: string;
  performanceSkill?: string;
  product?: string;
}

export interface PriorityStandardDeconstruction {
  code: string;
  type?: string;
  nouns?: string;
  verbs?: string;
  targets?: LearningTargets;
}

export interface Strategy {
  name: string;
  type: "curriculum" | "high-impact";
}

export interface CurriculumRow {
  standard: string;
  contentVocab: string;
  targetOrder: string;
  assessmentNote: string;
  strategies: Strategy[];
}

export interface SupportingStandard {
  code: string;
  desc: string;
}

export interface AssessmentQuestionTag {
  standardCode: string;
  categories: string[];
}

export interface AssessmentQuestion {
  number: string;
  text: string;
  choices: string[];
  tags: AssessmentQuestionTag[];
}

export interface AssessmentBlock {
  link?: string;
  scoring?: string;
  warmup?: string;
  questions?: AssessmentQuestion[];
}

export interface UnitMap {
  priorityStandards: PriorityStandardDeconstruction[];
  otherDeconstructedStandards?: PriorityStandardDeconstruction[];
  supportingStandards?: SupportingStandard[];
  preAssessment: AssessmentBlock;
  postAssessment: AssessmentBlock;
  commonAssessment?: AssessmentBlock;
  curriculumRows: CurriculumRow[];
  startDate?: string;
  endDate?: string;
  // Raw text of the "CHOOSE PRIORITY STANDARD(S)" cell, persisted
  // separately from priorityStandards - a real document can have this
  // field fully written out in narrative form with no CCSS/standard code
  // identifier anywhere in it (e.g. "Counting and Cardinality: Verbally
  // count in sequence to 10..."). That must not be conflated with the
  // field being left blank - they're different findings the app reports
  // distinctly (see computeTemplateCompleteness).
  chosenPriorityRawText?: string;
}

export interface SubjectMap {
  units: Unit[];
  unitMaps: Record<string, UnitMap>;
}

export interface SeedData {
  schools: string[];
  subjects: Record<string, { strands: string[] }>;
  maps: Record<string, SubjectMap>;
}
