"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, call } from "../../lib/api";

/**
 * I lavori (ADR-054): lo stato per repository — indice, ultimo commit, e lo
 * stato vivo chiesto a GitHub nel momento in cui apri la pagina. Da qui
 * «chiedi al gosino» porta in Parla: la pagina informa, la conversazione
 * approfondisce.
 */

interface Works {
  repos: {
    remoteUrl: string;
    defaultBranch: string;
    lastCommitSha: string | null;
    lastIndexedAt: string | null;
    status: "pending" | "ok" | "error";
  }[];
  documents: number;
  mailAccounts: number;
  live?: string;
}

const STATE_LABEL = { pending: "in attesa del primo giro", ok: "indicizzato", error: "in errore" };

function nameOf(remoteUrl: string): string {
  return remoteUrl.replace(/\.git$/, "").split("/").slice(-2).join("/");
}

export default function Lavori(): React.JSX.Element {
  const router = useRouter();
  const [works, setWorks] = useState<Works | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call<Works>("/works")
      .then(setWorks)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
        else setError("Non riesco a leggere lo stato dei lavori, riprova fra poco.");
      });
  }, [router]);

  return (
    <div>
      <p className="eyebrow">La reception</p>
      <h1>I lavori</h1>
      <p className="lede">
        Cosa conosce il gosino del tuo progetto, e cosa si muove adesso sui repository.
      </p>
      {error !== "" && <div className="msg err">{error}</div>}
      {works !== null && works.repos.length === 0 && (
        <div className="card">
          <p className="lede" style={{ margin: 0 }}>
            Nessun repository collegato per ora: chiedi allo studio di collegarne uno, e da lì il
            gosino potrà risponderti «repo alla mano».
          </p>
        </div>
      )}
      {works?.repos.map((repo) => (
        <div className="card" style={{ marginBottom: "0.8rem" }} key={repo.remoteUrl} data-testid="work-card">
          <strong>{nameOf(repo.remoteUrl)}</strong>{" "}
          <span className="gosino-meta" style={{ color: "var(--muted)" }}>
            · {repo.defaultBranch}
          </span>
          <p className="lede" style={{ margin: "0.3rem 0 0" }}>
            {STATE_LABEL[repo.status]}
            {repo.lastCommitSha !== null && ` · commit ${repo.lastCommitSha.slice(0, 7)}`}
            {repo.lastIndexedAt !== null && ` · letto il ${repo.lastIndexedAt.slice(0, 10)}`}
          </p>
        </div>
      ))}
      {works?.live !== undefined && (
        <div className="card" style={{ marginBottom: "0.8rem" }} data-testid="live-state">
          <strong>Adesso, sui repository</strong>
          <p className="lede" style={{ whiteSpace: "pre-wrap", margin: "0.3rem 0 0" }}>
            {works.live}
          </p>
        </div>
      )}
      {works !== null && (
        <p className="lede">
          In archivio anche {String(works.documents)} documenti e {String(works.mailAccounts)}{" "}
          caselle email collegate.
        </p>
      )}
      <button
        onClick={() => {
          router.push("/parla");
        }}
      >
        Chiedi al gosino
      </button>
    </div>
  );
}
