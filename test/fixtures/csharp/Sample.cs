namespace CsharpProbe;

// Canonical conformance fixture for CsharpAdapter
// (test/fixtures/csharp/Sample.cs). Mirrors test/fixtures/ruby/sample.rb
// + test/fixtures/python/sample.py + test/fixtures/go/sample/sample.go
// in role: a small standalone source file providing the symbols the
// shared conformance harness probes (src/adapters/conformance.ts
// runConformanceSuite).
//
// Conformance harness contract:
//   - classSymbol      = "Greeter"         -> kind "class"
//   - functionSymbol   = "FormatGreeting"  -> kind "method" (C# has no
//                                            free functions; all
//                                            callables are methods.
//                                            Conformance accepts
//                                            ["function","method"] per
//                                            ADR-21 Path beta + Ruby
//                                            kind-6-uniform precedent.)
//   - referencedSymbol = "Greeter"         -> Consumer.cs instantiates
//                                            and calls Greeter methods;
//                                            findReferences returns a
//                                            cross-file hit.
//
// Plain C# (no DI / ASP.NET). Rich probe substrate exercising records,
// interfaces, async, properties, XML doc parsing, enums, and pull-model
// diagnostics is preserved at Models/, Services/, Lib/, and Broken.cs
// as secondary substrate-record (Path B substrate-continuity precedent
// per ADR-21 c54ff7c + Substep 4.1 6f9ae29).

/// <summary>Canonical greeter for the cross-adapter conformance suite.</summary>
public class Greeter
{
    public const string DefaultGreeting = "Hello";

    /// <summary>Salutation prefix; defaults to <see cref="DefaultGreeting"/>.</summary>
    public string Salutation { get; init; } = DefaultGreeting;

    /// <summary>Returns a formatted greeting for the given name.</summary>
    /// <param name="name">The name to greet.</param>
    public string FormatGreeting(string name)
    {
        return $"{Salutation}, {name}!";
    }

    /// <summary>Returns an uppercase greeting.</summary>
    public string Shout(string name)
    {
        return FormatGreeting(name).ToUpperInvariant();
    }
}
