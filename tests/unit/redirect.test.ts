import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("accetta percorsi interni", () => {
    expect(safeRedirectPath("/clienti?q=rossi")).toBe("/clienti?q=rossi");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login", "", undefined, 42])(
    "rifiuta %s",
    (value) => {
      expect(safeRedirectPath(value)).toBe("/dashboard");
    },
  );
});
