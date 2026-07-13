// @quorum/daemon — session manager, supervisor, injection queue, HTTP+SSE API. See SPEC.md §7.
export const DAEMON_PACKAGE = "@quorum/daemon";
export { Daemon, type DaemonOpts } from "./daemon.js";
export { RunningSession, type SessionStatus, type SessionState, type RunningSessionOpts } from "./session-runner.js";
export { QuorumHttpServer, type HttpServerOpts, type ListenInfo } from "./http-server.js";
export { buildAdapterRegistry, buildExecutorFactory, buildTriageRunner, buildReviewFn, executorModelIds, type BuildRegistryOpts, type BuiltRegistry } from "./registry.js";
export { loadConfig, DEFAULT_CONFIG_YAML } from "./config.js";
export { doctorReport, liveTurnCheck, type SeatCheck, type TurnCheck } from "./doctor.js";
export { setSecret, getSecret, deleteSecret, keychainAvailable, knownKeyEnvs, resolveSecretsEnv } from "./secrets.js";
export { MODEL_CATALOG, configToYaml, keyStatus, type StructuredConfig } from "./settings.js";
export { PauseGate, gatedRunner } from "./pause-gate.js";
