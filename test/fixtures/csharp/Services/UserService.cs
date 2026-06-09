namespace CsharpProbe.Services;

using CsharpProbe.Models;

/// <summary>Default in-memory user service implementation.</summary>
public class UserService : IUserService
{
    private readonly List<User> _users = new();

    /// <inheritdoc />
    public async Task<User?> GetByIdAsync(int id)
    {
        await Task.Delay(1);
        return _users.FirstOrDefault(u => u.Id == id);
    }

    /// <inheritdoc />
    public IEnumerable<User> ListActive()
    {
        return _users.Where(u => u.Role != UserRole.Standard);
    }
}
