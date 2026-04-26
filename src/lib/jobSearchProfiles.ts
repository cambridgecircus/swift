/**
 * Job Search Profile v1 — static definition for job ingestion and Settings Boolean preview.
 */

export type JobSearchProfile = {
  id: string;
  name: string;
  /** Boolean search string for job boards / LinkedIn-style queries. */
  query: string;
  targetIndustries: string[];
  targetLocations: string[];
  targetRoles: string[];
  enabled: boolean;
  notes: string;
};

const BOOLEAN_QUERY = `(("web3" OR crypto OR blockchain OR "digital assets" OR "digital asset" OR "virtual assets" OR fintech OR AI OR "artificial intelligence" OR "generative AI")
AND ("HR Business Partner" OR HRBP OR "Senior HRBP" OR "People Partner" OR "Senior People Partner" OR "People Business Partner" OR "Head of People" OR "Head of HR" OR "HR Lead" OR "People Lead" OR "HR Director" OR "People Director" OR "Director of People" OR "VP People" OR "VP of People" OR "Chief People Officer" OR CPO OR "Head of Talent" OR "Talent Lead" OR "People Operations Lead" OR "People Ops Lead" OR "HR Operations Lead" OR "Head of People Operations" OR "People & Culture Lead" OR "Head of People & Culture" OR "Employee Experience Lead")
AND (UAE OR "United Arab Emirates" OR Dubai OR "Abu Dhabi" OR Saudi OR "Saudi Arabia" OR Riyadh OR Qatar OR Doha OR Kuwait OR Bahrain OR Oman OR Muscat OR GCC OR UK OR "United Kingdom" OR London OR Europe OR European OR Remote)
AND (job OR jobs OR hiring OR vacancy OR vacancies OR careers OR "open role" OR apply))`;

/** Primary SWIFT job search profile (v1). */
export const swiftPrimaryJobSearchProfile: JobSearchProfile = {
  id: "swift_hrbp_web3_gcc_uk_eu_v1",
  name: "Senior HRBP / People Leader — Web3 GCC UK Europe",
  query: BOOLEAN_QUERY,
  targetIndustries: [
    "Web3",
    "Blockchain",
    "Crypto",
    "Digital assets",
    "Virtual assets",
    "Fintech",
    "AI",
    "Artificial intelligence",
    "Generative AI",
  ],
  targetLocations: [
    "GCC",
    "UAE",
    "United Arab Emirates",
    "Dubai",
    "Abu Dhabi",
    "Saudi Arabia",
    "Riyadh",
    "Qatar",
    "Doha",
    "Kuwait",
    "Bahrain",
    "Oman",
    "Muscat",
    "UK",
    "United Kingdom",
    "London",
    "Europe",
    "European",
    "Remote",
  ],
  targetRoles: [
    "HR Business Partner",
    "HRBP",
    "Senior HRBP",
    "People Partner",
    "Senior People Partner",
    "People Business Partner",
    "Head of People",
    "Head of HR",
    "HR Lead",
    "People Lead",
    "HR Director",
    "People Director",
    "Director of People",
    "VP People",
    "VP of People",
    "Chief People Officer",
    "CPO",
    "Head of Talent",
    "Talent Lead",
    "People Operations Lead",
    "People Ops Lead",
    "HR Operations Lead",
    "Head of People Operations",
    "People & Culture Lead",
    "Head of People & Culture",
    "Employee Experience Lead",
  ],
  enabled: true,
  notes:
    "Senior HR and People leadership roles in Web3, crypto, blockchain, digital assets, fintech and AI across GCC, UK, Europe and remote.",
};

/** All configured profiles (extend when adding v2+). */
export const jobSearchProfiles: JobSearchProfile[] = [swiftPrimaryJobSearchProfile];
