namespace CsharpProbe;

using CsharpProbe.Lib;
using CsharpProbe.Models;
using CsharpProbe.Services;

// Cross-file consumer for the CsharpAdapter conformance test substrate
// (v1.1 Phase 4 Substep 4.1). The canonical Greeter reference below
// satisfies the shared conformance harness findReferences cross-file
// assertion against Sample.cs. The remaining User / IUserService /
// Analytics expressions preserve the substrate originally authored at
// v1.1 Phase 0-3 for probe + adapter capability exercise (Path B
// substrate-continuity precedent per ADR-21 c54ff7c + Substep 4.1
// 6f9ae29). Probe findings archived at docs/adr/csharp-roslyn-probe/.

/// <summary>Consumer exercises cross-file resolution for the probe.</summary>
public class Consumer
{
    private readonly IUserService _service;

    public Consumer(IUserService service)
    {
        _service = service;
    }

    // --- Canonical conformance reference: Greeter from Sample.cs ---

    /// <summary>Cross-file reference site for the canonical Greeter substrate.</summary>
    public string GreetUser(string name)
    {
        var greeter = new Greeter();
        return greeter.FormatGreeting(name);
    }

    // --- Secondary probe-substrate references (preserved from Phase 0-3) ---

    /// <summary>Demonstrates typed-variable + cross-namespace usage.</summary>
    public async Task UseUserAsync()
    {
        User? user = await _service.GetByIdAsync(1);
        if (user is not null)
        {
            Analytics.Track(user.DisplayName);
            UserRole role = user.Role;
        }
    }

    /// <summary>Static method reference site.</summary>
    public User? FindByEmail(string email)
    {
        return User.FindByEmail(email);
    }
}
