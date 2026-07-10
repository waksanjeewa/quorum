// Secret storage now lives in @quorum/daemon (so the dashboard can save keys too). Re-exported here
// for the CLI's existing call sites.
export {
  setSecret,
  getSecret,
  deleteSecret,
  keychainAvailable,
  knownKeyEnvs,
  resolveSecretsEnv,
} from "@quorum/daemon";
