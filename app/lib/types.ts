export interface StandardEntry {
  code: string;
  desc: string;
  priority: boolean;
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
