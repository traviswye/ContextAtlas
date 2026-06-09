namespace CsharpProbe;

using CsharpProbe.Lib;
using CsharpProbe.Models;
using CsharpProbe.Services;

/// <summary>Consumer exercises cross-file resolution for the probe.</summary>
public class Consumer
{
    private readonly IUserService _service;

    public Consumer(IUserService service)
    {
        _service = service;
    }

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
