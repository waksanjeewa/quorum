import { describe, expect, it } from "vitest";
import { QUORUM_ASCII_WORD, QUORUM_TERMINAL_LOCKUP, quorumLogo } from "./theme.js";

describe("terminal launch logo", () => {
  it("combines the compact logo-v2 mark with the correct ASCII QUORUM word", () => {
    const logo = quorumLogo();
    expect(logo).toContain("many models, working together");
    expect(logo).toContain("the session never dies");
    expect(logo).toContain("◢◣");
    expect(logo).toContain("●");
    expect(logo).toContain(QUORUM_ASCII_WORD[0]);
    expect(logo).toContain(String.raw`| |_| | |_| | |_| |  _ <| |_| | |  | |`);
    expect(logo).toContain(String.raw` \__\_\\___/ \___/|_| \_\\___/|_|  |_|`);
    expect(logo).not.toContain("QUBBUM");
    expect(logo).not.toContain("o-----o");
    expect(QUORUM_TERMINAL_LOCKUP).toHaveLength(7);
    expect(QUORUM_TERMINAL_LOCKUP.every((line) => line.length < 80)).toBe(true);
    expect(QUORUM_TERMINAL_LOCKUP[0].indexOf(QUORUM_ASCII_WORD[0])).toBeLessThan(18);
  });
});
