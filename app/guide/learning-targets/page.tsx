import Breadcrumb from "../../components/Breadcrumb";

interface TargetCategory {
  name: string;
  color: string;
  colorSoft: string;
  focus: string;
  detail?: string;
  verbs: string[];
  examples: string[];
}

const CATEGORIES: TargetCategory[] = [
  {
    name: "Knowledge Target",
    color: "var(--teal)",
    colorSoft: "var(--teal-soft)",
    focus: "Recall, recognition, and understanding of information.",
    verbs: ["identify", "define", "list", "describe", "explain"],
    examples: [
      "Recalling definitions of vocabulary words.",
      "Identifying the main idea of a text.",
      "Understanding the steps in a mathematical algorithm.",
      "Knowing the parts of a cell.",
    ],
  },
  {
    name: "Reasoning Target",
    color: "var(--gold)",
    colorSoft: "var(--gold-soft)",
    focus: "Applying knowledge to solve problems, analyze information, and make judgments.",
    verbs: ["predict", "infer", "analyze", "evaluate", "compare", "contrast", "justify", "explain", "synthesize"],
    examples: [
      "Comparing and contrasting two different historical events.",
      "Analyzing the causes and effects of a social issue.",
      "Evaluating the strengths and weaknesses of an argument.",
      "Predicting the outcome of an experiment.",
    ],
  },
  {
    name: "Performance Skill Target",
    color: "var(--amber)",
    colorSoft: "var(--amber-soft)",
    focus: "Observable actions or behaviors students demonstrate as evidence of learning - behavioral or physical skills.",
    detail: "Includes: playing an instrument, reading aloud fluently, conversing in a second language, using psychomotor skills, applying knowledge, timing actions, organizing space and objects, adapting performance.",
    verbs: ["observe", "listen", "perform", "do", "question", "speak", "assemble", "operate", "use", "measure", "model", "demonstrate", "solve", "apply", "execute", "implement"],
    examples: [],
  },
  {
    name: "Product Target",
    color: "var(--rust)",
    colorSoft: "var(--rust-soft)",
    focus: "A tangible artifact or result students create to demonstrate their learning - the outcome of the learning process, not just the process itself.",
    detail: "Includes: completion of a project, a portfolio of work, graphs, models, scripted scenes, action plans, a research paper, a presentation, a piece of artwork, or a constructed object.",
    verbs: ["write", "generate", "design", "combine", "devise", "modify", "create", "produce", "construct", "develop", "formulate", "propose"],
    examples: [],
  },
];

export default function LearningTargetsGuidePage() {
  return (
    <div>
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Learning Target Rubric" }]} />
      <div style={{ borderBottom: "3px double var(--ink)", paddingBottom: 14, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Learning Target Rubric</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 4 }}>
          The district's source of truth for deconstructing a standard into Knowledge, Reasoning, Performance Skill, and Product targets.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Why this matters</h3></div>
        <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ marginTop: 0 }}>
            Deconstructing a standard into learning targets isn&apos;t a formality - it&apos;s the anchor that keeps everything downstream honest.
            The targets should stay true to what the standard is actually asking of students. Get that right, and it pays off twice:
          </p>
          <ul style={{ marginBottom: 0 }}>
            <li><strong>Assessments</strong> should ask questions that trace directly back to the standard - the targets are what make that traceable.</li>
            <li><strong>Instructional strategies</strong> should be chosen to teach the specific targets, not the standard in the abstract - vague targets produce generic, disconnected strategies.</li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            Knowledge targets in particular get written in kid-friendly &ldquo;I can&rdquo; language, since teachers use that language directly when delivering instruction.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Core principles</h3></div>
        <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>A standard maps to one or more categories - never assume all four.</strong>
            <div style={{ color: "var(--slate)", fontSize: 12.5 }}>Many standards genuinely only call for one or two of the four types of thinking/doing. Forcing all four onto a standard that doesn&apos;t ask for them dilutes the deconstruction.</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Stay on verb.</strong>
            <div style={{ color: "var(--slate)", fontSize: 12.5 }}>The target&apos;s category should trace back to what the standard&apos;s own verb is actually requiring. If a standard says &ldquo;describe,&rdquo; don&apos;t reach for a Product target that requires students to construct something - that&apos;s asking for more (or different) rigor than the standard calls for.</div>
          </div>
          <div>
            <strong>&ldquo;Explain&rdquo; can mean two different things.</strong>
            <div style={{ color: "var(--slate)", fontSize: 12.5 }}>It appears in both the Knowledge and Reasoning verb lists below. Explaining a definition is Knowledge-level; explaining <em>why</em> something causes something else is Reasoning-level. Context decides, not the word alone.</div>
          </div>
        </div>
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat.name} className="panel" style={{ borderColor: cat.color }}>
          <div className="panel-head" style={{ background: cat.colorSoft }}>
            <h3 style={{ color: cat.color }}>{cat.name}</h3>
          </div>
          <div className="panel-body">
            <div style={{ fontSize: 13, marginBottom: cat.detail ? 6 : 12 }}><strong>Focus:</strong> {cat.focus}</div>
            {cat.detail && <div style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>{cat.detail}</div>}
            {cat.examples.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--slate)", marginBottom: 6 }}>Examples</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                  {cat.examples.map((ex, i) => <li key={i} style={{ marginBottom: 3 }}>{ex}</li>)}
                </ul>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--slate)", marginBottom: 6 }}>Verbs typically inferred from</div>
              <div>
                {cat.verbs.map((v) => (
                  <span key={v} className="badge badge-support" style={{ marginRight: 5, marginBottom: 5, display: "inline-block" }}>{v}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="panel">
        <div className="panel-head"><h3>Worked example - staying on verb</h3></div>
        <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ marginTop: 0 }}>
            Take a standard whose own language reads: <em>&ldquo;Develop and use a model to describe the function of a cell.&rdquo;</em> Its verbs are
            {" "}<strong>develop</strong>, <strong>use</strong>, and <strong>describe</strong>.
          </p>
          <ul>
            <li><strong>describe</strong> → Knowledge (it&apos;s literally in the Knowledge verb list)</li>
            <li><strong>use</strong> → Performance Skill</li>
            <li><strong>develop</strong> → Product</li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            By staying on verb, this standard should genuinely produce Knowledge, Performance Skill, and Product targets. Nothing in its own language calls for a Reasoning target -
            so if one gets written anyway, that&apos;s worth a second look: either the standard demands more analytical thinking than its surface wording suggests
            (worth naming explicitly), or the Reasoning target was added out of habit rather than out of what the standard is actually asking for.
          </p>
        </div>
      </div>

      <div className="note-strip">
        <strong>Known coverage gap:</strong> some very common standard-leading verbs don&apos;t appear in any of the four lists above - most notably
        &ldquo;understand&rdquo; (as in &ldquo;Understand the concept of a ratio...&rdquo;), plus others like &ldquo;discuss,&rdquo; &ldquo;trace,&rdquo; and &ldquo;know.&rdquo; Any automated
        verb-to-target check in this app treats these as inconclusive rather than guessing - so a standard led entirely by an unmapped verb won&apos;t be flagged either way. That&apos;s a
        deliberate choice to avoid false positives, but it does mean real misalignments on those standards would currently go unnoticed by automation and still need a human read.
      </div>
    </div>
  );
}
