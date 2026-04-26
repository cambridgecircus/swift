import { getLiveSkillsAndLearning } from "@/lib/skillsAndLearning";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getLiveSkillsAndLearning();
  return Response.json(payload);
}
