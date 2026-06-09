namespace CsharpProbe.Services;

using CsharpProbe.Models;

/// <summary>Service abstraction for user operations.</summary>
public interface IUserService
{
    /// <summary>Retrieves a user by id.</summary>
    Task<User?> GetByIdAsync(int id);

    /// <summary>Lists all active users.</summary>
    IEnumerable<User> ListActive();
}
