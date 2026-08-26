export type ReleaseIdentityEnv = {
  RELEASE_SHA?: string | null;
  GITHUB_SHA?: string | null;
  SOURCE_VERSION?: string | null;
  RELEASE_BUILT_AT?: string | null;
  GITHUB_RUN_ID?: string | null;
};

export type ReleaseIdentity = {
  releaseSha: string;
  releaseShaShort: string;
  builtAt: string | null;
  githubRunId: string | null;
};

const UNKNOWN_RELEASE_SHA = "unknown";

function clean(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getReleaseIdentity(env: ReleaseIdentityEnv = process.env): ReleaseIdentity {
  const releaseSha = clean(env.RELEASE_SHA) ?? clean(env.GITHUB_SHA) ?? clean(env.SOURCE_VERSION) ?? UNKNOWN_RELEASE_SHA;

  return {
    releaseSha,
    releaseShaShort: releaseSha === UNKNOWN_RELEASE_SHA ? UNKNOWN_RELEASE_SHA : releaseSha.slice(0, 12),
    builtAt: clean(env.RELEASE_BUILT_AT),
    githubRunId: clean(env.GITHUB_RUN_ID),
  };
}
