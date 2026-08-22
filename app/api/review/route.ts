import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../lib/db";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on this deployment" }, { status: 500 });
  }
  const { context, unitId } = await req.json();

  const prompt = `You are a curriculum expert reviewing a K-12 unit for quality, grounded specifically in Larry Ainsworth's Rigorous Curriculum Design (RCD) methodology and Marzano's Guaranteed and Viable Curriculum framework. This district's template implements RCD directly: priority standard deconstruction (type marking, nouns/verbs), four learning-target categories (Knowledge/Reasoning/Performance Skill/Product), pre/post assessment with scoring agreements, and a curriculum map logging instructional strategies.

${context}

Give a tight, specific, constructive review (not generic praise) covering exactly these six things, each 2-3 sentences:
1. Template completeness - react to the completeness check above. Is the team on track, or are there real gaps to close?
2. Deconstruction quality - are targets genuinely teachable concepts/skills, or vague?
3. External alignment - react to the Projection Map vs Unit Map alignment findings above; what should the team fix?
4. Internal alignment - react to the internal Unit Map alignment findings above (standards dropped between deconstruction and the curriculum map, or type/target mismatches); what should the team fix?
5. Instructional strategy fit - are logged strategies matched to the specific targets, or generic? Note if any look like just "read the book" vs research-based (Marzano high-yield categories: comparing/classifying, summarizing/note-taking, nonlinguistic representation, cooperative learning, cues/questions, feedback, hypothesis generation, practice, reinforcing effort).
6. One concrete, prioritized next action for the teacher/team.

Be direct and specific to the actual data provided, not generic advice. Keep the total response under 600 words.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Anthropic API error: ${errText.slice(0, 300)}` }, { status: 500 });
    }
    const data = await response.json();
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");

    if (unitId) {
      try {
        await ensureSchema();
        await sql`INSERT INTO ai_reviews (unit_id, review_text) VALUES (${unitId}, ${text})`;
      } catch (dbErr) {
        // Review still returns to the user even if persistence fails
        console.error("Failed to save review:", dbErr);
      }
    }

    return NextResponse.json({ text: text || "(no response text)" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}
