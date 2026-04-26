import {
  historicalJobLinks,
  jobApplicationChannels,
  needsManualReviewJobs,
  suggestedNewChannels,
} from "@/lib/jobSourceMemory";

export async function GET() {
  return Response.json({
    status: "ok",
    jobApplicationChannels,
    historicalJobLinks,
    suggestedNewChannels,
    needsManualReviewJobs,
  });
}

