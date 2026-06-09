/**
 * Phase 3.1 + 3.2 smoke verification — spawns CsharpAdapter against
 * test/fixtures/csharp and verifies initialize + listSymbols + shutdown
 * lifecycle.
 *
 * Throwaway substrate; re-runs at each substep close to confirm work
 * compounds correctly against real csharp-ls.
 */

import { resolve as pathResolve } from "node:path";

import { CsharpAdapter } from "../../../src/adapters/csharp.js";

async function main(): Promise<void> {
  const root = pathResolve("test/fixtures/csharp");
  console.log(`[smoke] CsharpAdapter against ${root}`);

  const adapter = new CsharpAdapter();
  try {
    console.log("[smoke] initialize...");
    await adapter.initialize(root);
    console.log("[smoke] initialize OK");

    // Phase 3.2 — listSymbols smoke verification against Models/User.cs.
    console.log("[smoke] listSymbols(Models/User.cs)...");
    const userSymbols = await adapter.listSymbols("Models/User.cs");
    console.log(`[smoke] listSymbols returned ${userSymbols.length} symbols`);
    for (const sym of userSymbols) {
      console.log(
        `  - ${sym.name} (${sym.kind}, line ${sym.line}, parent=${sym.parentId ?? "none"})`,
      );
    }

    // Verify expected symbols from probe findings.
    const names = new Set(userSymbols.map((s) => s.name));
    const expected = [
      "Models", // namespace
      "User", // record (mapped to class)
      "UserRole", // enum
      "PremiumTierLimit", // const field
      "DisplayName", // property
      "Role", // property
      "SendWelcomeEmailAsync()", // method (with paren list)
      "FindByEmail(string email)", // static method (with paren list)
    ];
    const missing = expected.filter((e) => !names.has(e));
    if (missing.length > 0) {
      console.error(`[smoke] FAIL: missing symbols: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log("[smoke] listSymbols(Models/User.cs) all expected symbols present");

    // Cross-file verification — Consumer.cs.
    console.log("[smoke] listSymbols(Consumer.cs)...");
    const consumerSymbols = await adapter.listSymbols("Consumer.cs");
    console.log(
      `[smoke] listSymbols(Consumer.cs) returned ${consumerSymbols.length} symbols`,
    );
    const consumerNames = new Set(consumerSymbols.map((s) => s.name));
    if (!consumerNames.has("Consumer")) {
      console.error("[smoke] FAIL: Consumer class not surfaced");
      process.exit(1);
    }
    if (!consumerNames.has("UseUserAsync()")) {
      console.error("[smoke] FAIL: UseUserAsync method not surfaced");
      process.exit(1);
    }
    console.log("[smoke] listSymbols(Consumer.cs) cross-file OK");

    // Parent-pointer verification — pick a method and verify parent chain.
    const findByEmailSym = userSymbols.find(
      (s) => s.name === "FindByEmail(string email)",
    );
    if (!findByEmailSym?.parentId) {
      console.error("[smoke] FAIL: FindByEmail missing parentId");
      process.exit(1);
    }
    const parentSym = userSymbols.find((s) => s.id === findByEmailSym.parentId);
    if (parentSym?.name !== "User") {
      console.error(
        `[smoke] FAIL: FindByEmail parent should be User; got ${parentSym?.name}`,
      );
      process.exit(1);
    }
    console.log("[smoke] parentId chain verified (FindByEmail → User → Models)");

    // Signature surfacing verification.
    const premiumSym = userSymbols.find((s) => s.name === "PremiumTierLimit");
    if (!premiumSym?.signature?.includes("int User.PremiumTierLimit")) {
      console.error(
        `[smoke] FAIL: PremiumTierLimit signature unexpected: ${premiumSym?.signature}`,
      );
      process.exit(1);
    }
    console.log(
      `[smoke] signature surfacing OK (PremiumTierLimit: "${premiumSym.signature}")`,
    );

    // Phase 3.3 — getSymbolDetails verification.
    console.log("[smoke] getSymbolDetails(User record)...");
    const userDetails = await adapter.getSymbolDetails(
      "sym:cs:Models/User.cs:User",
    );
    if (!userDetails) {
      console.error("[smoke] FAIL: getSymbolDetails returned null for User");
      process.exit(1);
    }
    console.log(`  - id=${userDetails.id}`);
    console.log(`  - kind=${userDetails.kind}`);
    console.log(`  - signature=${userDetails.signature}`);
    if (userDetails.kind !== "class") {
      console.error(
        `[smoke] FAIL: User kind should be 'class' (record→class); got ${userDetails.kind}`,
      );
      process.exit(1);
    }

    console.log("[smoke] getSymbolDetails(FindByEmail static method)...");
    const findByEmail = await adapter.getSymbolDetails(
      "sym:cs:Models/User.cs:FindByEmail(string email)",
    );
    if (!findByEmail) {
      console.error("[smoke] FAIL: getSymbolDetails returned null for FindByEmail");
      process.exit(1);
    }
    console.log(`  - signature=${findByEmail.signature}`);
    if (!findByEmail.signature?.includes("FindByEmail")) {
      console.error(
        `[smoke] FAIL: FindByEmail signature should contain method name; got ${findByEmail.signature}`,
      );
      process.exit(1);
    }
    console.log("[smoke] getSymbolDetails surfaces hover-refined signatures OK");

    // Verify unknown symbol returns null.
    const noSuch = await adapter.getSymbolDetails(
      "sym:cs:Models/User.cs:DoesNotExist",
    );
    if (noSuch !== null) {
      console.error("[smoke] FAIL: getSymbolDetails should return null for unknown");
      process.exit(1);
    }
    console.log("[smoke] getSymbolDetails returns null for unknown symbols OK");

    // Phase 3.4 — findReferences verification.
    console.log("[smoke] findReferences(User record)...");
    const userRefs = await adapter.findReferences(
      "sym:cs:Models/User.cs:User",
    );
    console.log(`[smoke] findReferences returned ${userRefs.length} refs`);
    for (const ref of userRefs) {
      console.log(`  - ${ref.path}:${ref.line} (id=${ref.id})`);
    }
    // Expect at least one cross-file reference in Consumer.cs (User
    // type used at `User? user = await ...` + `User.FindByEmail`).
    const consumerRefs = userRefs.filter((r) => r.path === "Consumer.cs");
    if (consumerRefs.length === 0) {
      console.error("[smoke] FAIL: no User references found in Consumer.cs");
      process.exit(1);
    }
    console.log(
      `[smoke] findReferences cross-file OK (${consumerRefs.length} refs in Consumer.cs)`,
    );

    // Verify reference ID format per ADR-01: ref:cs:<path>:<line>
    if (!userRefs[0]!.id.startsWith("ref:cs:")) {
      console.error(
        `[smoke] FAIL: reference ID format wrong; got ${userRefs[0]!.id}`,
      );
      process.exit(1);
    }
    console.log("[smoke] reference ID format (ref:cs:<path>:<line>) OK");

    // Verify unknown symbol returns empty array (not error).
    const noRefs = await adapter.findReferences(
      "sym:cs:Models/User.cs:DoesNotExist",
    );
    if (noRefs.length !== 0) {
      console.error("[smoke] FAIL: unknown symbol should return empty refs");
      process.exit(1);
    }
    console.log("[smoke] findReferences returns empty array for unknown symbols OK");

    // Phase 3.5 — getDiagnostics verification (pull-model).
    console.log("[smoke] getDiagnostics(Broken.cs)...");
    const brokenDiags = await adapter.getDiagnostics("Broken.cs");
    console.log(`[smoke] getDiagnostics returned ${brokenDiags.length} diagnostics`);
    for (const d of brokenDiags) {
      console.log(`  - [${d.severity}] ${d.path}:${d.line}: ${d.message}`);
    }
    if (brokenDiags.length === 0) {
      console.error("[smoke] FAIL: Broken.cs should produce diagnostics");
      process.exit(1);
    }
    if (!brokenDiags.some((d) => d.severity === "error")) {
      console.error("[smoke] FAIL: Broken.cs should have at least one error");
      process.exit(1);
    }
    console.log("[smoke] getDiagnostics pull-model OK (errors surfaced for Broken.cs)");

    // Verify clean file returns empty diagnostics.
    console.log("[smoke] getDiagnostics(Models/User.cs) — clean file...");
    const userDiags = await adapter.getDiagnostics("Models/User.cs");
    console.log(`[smoke] getDiagnostics(User.cs) returned ${userDiags.length} diagnostics`);
    // Clean User.cs may still have informational diagnostics; just verify
    // no errors.
    if (userDiags.some((d) => d.severity === "error")) {
      console.error("[smoke] FAIL: clean User.cs should not have errors");
      process.exit(1);
    }
    console.log("[smoke] getDiagnostics clean-file OK");

    // Phase 3.6 — getTypeInfo verification.
    console.log("[smoke] getTypeInfo(UserService class)...");
    const userServiceTypeInfo = await adapter.getTypeInfo(
      "sym:cs:Services/UserService.cs:UserService",
    );
    console.log(`  - extends=${JSON.stringify(userServiceTypeInfo.extends)}`);
    console.log(
      `  - implements=${JSON.stringify(userServiceTypeInfo.implements)}`,
    );
    console.log(
      `  - usedByTypes=${JSON.stringify(userServiceTypeInfo.usedByTypes)}`,
    );
    if (!userServiceTypeInfo.implements.includes("IUserService")) {
      console.error(
        "[smoke] FAIL: UserService should implement IUserService",
      );
      process.exit(1);
    }
    console.log("[smoke] getTypeInfo(UserService) implements interface OK");

    console.log("[smoke] getTypeInfo(IUserService interface)...");
    const interfaceTypeInfo = await adapter.getTypeInfo(
      "sym:cs:Services/IUserService.cs:IUserService",
    );
    console.log(`  - extends=${JSON.stringify(interfaceTypeInfo.extends)}`);
    console.log(
      `  - implements=${JSON.stringify(interfaceTypeInfo.implements)}`,
    );
    console.log(
      `  - usedByTypes=${JSON.stringify(interfaceTypeInfo.usedByTypes)}`,
    );
    if (!interfaceTypeInfo.usedByTypes.includes("UserService")) {
      console.error(
        "[smoke] FAIL: IUserService usedByTypes should include UserService",
      );
      process.exit(1);
    }
    console.log("[smoke] getTypeInfo(IUserService) usedByTypes via implementation query OK");

    // Verify non-type symbol returns empty TypeInfo (per ADR-07 contract).
    const methodTypeInfo = await adapter.getTypeInfo(
      "sym:cs:Models/User.cs:FindByEmail(string email)",
    );
    if (
      methodTypeInfo.extends.length !== 0 ||
      methodTypeInfo.implements.length !== 0 ||
      methodTypeInfo.usedByTypes.length !== 0
    ) {
      console.error("[smoke] FAIL: method should return empty TypeInfo");
      process.exit(1);
    }
    console.log("[smoke] getTypeInfo(method) returns empty TypeInfo OK");

    // Phase 3.7 — getDocstring verification (forward-composition with
    // parseCsharpHoverContent from 3.3).
    console.log("[smoke] getDocstring(FindByEmail with XML doc + <param>)...");
    const findByEmailDoc = await adapter.getDocstring(
      "sym:cs:Models/User.cs:FindByEmail(string email)",
    );
    console.log(`  prose=${JSON.stringify(findByEmailDoc)}`);
    if (!findByEmailDoc) {
      console.error("[smoke] FAIL: FindByEmail should have XML doc prose");
      process.exit(1);
    }
    if (!findByEmailDoc.includes("Finds a user by email address")) {
      console.error(
        `[smoke] FAIL: FindByEmail docstring should contain summary; got ${findByEmailDoc}`,
      );
      process.exit(1);
    }
    if (!findByEmailDoc.includes("email")) {
      console.error(
        `[smoke] FAIL: FindByEmail docstring should contain parameter info; got ${findByEmailDoc}`,
      );
      process.exit(1);
    }
    console.log("[smoke] getDocstring(FindByEmail) summary + parameters OK");

    console.log("[smoke] getDocstring(DisplayName property)...");
    const displayNameDoc = await adapter.getDocstring(
      "sym:cs:Models/User.cs:DisplayName",
    );
    console.log(`  prose=${JSON.stringify(displayNameDoc)}`);
    if (!displayNameDoc?.includes("Display name shown in UI")) {
      console.error(
        `[smoke] FAIL: DisplayName docstring missing/wrong; got ${displayNameDoc}`,
      );
      process.exit(1);
    }
    console.log("[smoke] getDocstring(DisplayName) property doc OK");

    // Verify unknown symbol returns null.
    const noDoc = await adapter.getDocstring(
      "sym:cs:Models/User.cs:DoesNotExist",
    );
    if (noDoc !== null) {
      console.error("[smoke] FAIL: unknown symbol should return null docstring");
      process.exit(1);
    }
    console.log("[smoke] getDocstring returns null for unknown symbol OK");

    // All 6 LanguageAdapter capabilities now implemented at v1.1.0
    // Phase 3.7 close.
    console.log("[smoke] ALL 6 LanguageAdapter capabilities implemented:");
    console.log("  ✓ listSymbols (3.2)");
    console.log("  ✓ getSymbolDetails (3.3)");
    console.log("  ✓ findReferences (3.4)");
    console.log("  ✓ getDiagnostics (3.5)");
    console.log("  ✓ getTypeInfo (3.6)");
    console.log("  ✓ getDocstring (3.7)");

    console.log("[smoke] shutdown...");
    await adapter.shutdown();
    console.log("[smoke] shutdown OK");

    console.log("[smoke] PASS — Phase 3.1 + 3.2 verified");
  } catch (err) {
    console.error(`[smoke] FAIL: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke] PROBE FAILED:", err);
  process.exit(1);
});
