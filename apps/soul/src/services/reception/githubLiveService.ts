import { customerRepos, type DbClient } from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";

/**
 * The live state of the customer's repositories (ADR-054): open PRs and last
 * commits, asked of the GitHub API at the moment the question is asked —
 * never indexed, never cached beyond a short memo. GET only: the gosino has
 * eyes here, not hands (tool calling stays in the backlog, rule 8).
 *
 * The Vexa precedent: a plain-fetch adapter, active only when the repo's
 * remote actually points at GitHub. The PAT is decrypted per call and never
 * logged.
 */

const MEMO_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

interface GithubRef {
  owner: string;
  repo: string;
}

/** https://github.com/o/r(.git) or git@github.com:o/r.git → {o, r} */
export function parseGithubRemote(remoteUrl: string): GithubRef | undefined {
  const match =
    /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remoteUrl) ??
    /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(remoteUrl);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { owner: match[1], repo: match[2] };
}

interface PullSummary {
  number: number;
  title: string;
}
interface CommitSummary {
  sha: string;
  message: string;
  date: string;
}

export interface GithubLiveOptions {
  db: DbClient;
  /** ADR-098: la connessione della casa del cliente; assente = `db` */
  dbFor?: (accountId: string) => DbClient;
  dataKey: Buffer;
  /** override for network-level test stubs */
  baseUrl?: string;
}

export class GithubLiveService {
  private readonly baseUrl: string;
  private readonly memo = new Map<string, { at: number; block: string }>();

  public constructor(private readonly options: GithubLiveOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
  }

  /**
   * An Italian prose block for `dynamicSystem`, or undefined when the
   * customer has no GitHub repos. Unreachable repos are named as such —
   * saying nothing would read as "nothing is happening", which is false.
   */
  public async liveBlock(
    customerId: string,
    at: Date = new Date(),
    accountId?: string,
  ): Promise<string | undefined> {
    const db =
      accountId !== undefined && this.options.dbFor !== undefined
        ? this.options.dbFor(accountId)
        : this.options.db;
    const repos = await db
      .select({
        id: customerRepos.id,
        remoteUrl: customerRepos.remoteUrl,
        pat: customerRepos.pat,
      })
      .from(customerRepos)
      .where(eq(customerRepos.customerId, customerId));
    const lines: string[] = [];
    for (const repo of repos) {
      const ref = parseGithubRemote(repo.remoteUrl);
      if (ref === undefined) continue;
      lines.push(await this.repoBlock(repo.id, ref, repo.pat, at));
    }
    if (lines.length === 0) return undefined;
    return `Stato vivo dei repository (adesso):\n${lines.join("\n")}`;
  }

  private async repoBlock(
    repoId: string,
    ref: GithubRef,
    encryptedPat: string | null,
    at: Date,
  ): Promise<string> {
    const hit = this.memo.get(repoId);
    if (hit !== undefined && at.getTime() - hit.at < MEMO_TTL_MS) return hit.block;

    const name = `${ref.owner}/${ref.repo}`;
    let block: string;
    try {
      const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "user-agent": "ugo-reception",
      };
      if (encryptedPat !== null && encryptedPat !== "") {
        headers.authorization = `Bearer ${decryptText(encryptedPat, this.options.dataKey)}`;
      }
      const [pulls, commits] = await Promise.all([
        this.get<{ number: number; title: string }[]>(
          `/repos/${name}/pulls?state=open&per_page=5`,
          headers,
        ),
        this.get<{ sha: string; commit: { message: string; author?: { date?: string } } }[]>(
          `/repos/${name}/commits?per_page=3`,
          headers,
        ),
      ]);
      const openPulls: PullSummary[] = pulls.map((pull) => ({
        number: pull.number,
        title: pull.title,
      }));
      const lastCommits: CommitSummary[] = commits.map((commit) => ({
        sha: commit.sha.slice(0, 7),
        message: commit.commit.message.split("\n", 1)[0] ?? "",
        date: commit.commit.author?.date ?? "",
      }));
      const pullLines =
        openPulls.length === 0
          ? "  nessuna PR aperta"
          : openPulls.map((pull) => `  PR #${String(pull.number)}: ${pull.title}`).join("\n");
      const commitLines = lastCommits
        .map((commit) => `  ${commit.sha} ${commit.message}`)
        .join("\n");
      block = `- ${name}:\n${pullLines}\n  ultimi commit:\n${commitLines}`;
    } catch {
      // status only in logs upstream; here the gosino just says it plainly
      block = `- ${name}: stato non raggiungibile in questo momento`;
    }
    this.memo.set(repoId, { at: at.getTime(), block });
    return block;
  }

  private async get<T>(path: string, headers: Record<string, string>): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`github status ${String(response.status)}`);
    return (await response.json()) as T;
  }
}
