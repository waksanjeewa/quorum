import { describe, expect, it } from "vitest";
import { platform } from "node:os";
import { deleteSecret, getSecret, keychainAvailable, resolveSecretsEnv, setSecret } from "./keychain.js";

const onMac = platform() === "darwin";

describe("keychain", () => {
  it.runIf(onMac)("round-trips a secret through the macOS Keychain", async () => {
    const account = "QUORUM_TEST_KEY_DO_NOT_USE";
    try {
      expect(await setSecret(account, "s3cr3t-value")).toBe(true);
      expect(await getSecret(account)).toBe("s3cr3t-value");
    } finally {
      await deleteSecret(account);
    }
    expect(await getSecret(account)).toBeUndefined();
  });

  it("reports availability by platform", () => {
    expect(keychainAvailable()).toBe(onMac);
  });

  it("resolveSecretsEnv lets a real env var win over stored secrets", async () => {
    process.env["QUORUM_TEST_ENVWIN"] = "from-env";
    const env = await resolveSecretsEnv(["QUORUM_TEST_ENVWIN"]);
    expect(env["QUORUM_TEST_ENVWIN"]).toBe("from-env");
    delete process.env["QUORUM_TEST_ENVWIN"];
  });
});
