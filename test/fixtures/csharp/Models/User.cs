namespace CsharpProbe.Models;

/// <summary>
/// User record representing a registered user.
/// </summary>
/// <param name="Id">Unique user identifier.</param>
/// <param name="Email">User's email address.</param>
public record User(int Id, string Email)
{
    public const int PremiumTierLimit = 100;

    /// <summary>Display name shown in UI surfaces.</summary>
    public string DisplayName { get; init; } = "Unknown";

    /// <summary>Role assignment for authorization checks.</summary>
    public UserRole Role { get; init; } = UserRole.Standard;

    /// <summary>Sends a welcome email asynchronously.</summary>
    public async Task SendWelcomeEmailAsync()
    {
        // placeholder for spike fixture
        await Task.Delay(1);
    }

    /// <summary>Finds a user by email address.</summary>
    /// <param name="email">The email to look up.</param>
    public static User? FindByEmail(string email)
    {
        return null;
    }
}

public enum UserRole
{
    Standard,
    Premium,
    Admin,
}
