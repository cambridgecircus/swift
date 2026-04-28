import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type LinkedInJobEmail = {
  subject: string;
  from: string;
  date: string;
  text: string;
};

export async function fetchLinkedInJobAlertEmails(): Promise<LinkedInJobEmail[]> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const label = process.env.GMAIL_LINKEDIN_LABEL || "SWIFT";

  if (!user || !pass) {
    console.warn("Gmail credentials are missing. Skipping LinkedIn job alert fetch.");
    return [];
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  const results: LinkedInJobEmail[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock(label);

    try {
      const messages = client.fetch(
        {
          since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
        },
        {
          envelope: true,
          source: true,
        }
      );

      for await (const message of messages) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);

        results.push({
          subject: parsed.subject || "No subject",
          from: parsed.from?.text || "Unknown sender",
          date: parsed.date?.toISOString() || new Date().toISOString(),
          text: parsed.text?.slice(0, 4000) || "",
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return results.slice(0, 10);
  } catch (error) {
    console.error("Failed to fetch LinkedIn job alert emails:", error);

    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }

    return [];
  }
}